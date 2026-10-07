/**
 * Rendu des PDF des pièces jointes (pdf.js, paquet officiel `pdfjs-dist`, version FIGÉE dans
 * package.json — au minimum postérieure au correctif CVE-2024-4367, donc ≥ 4.2.67).
 *
 * Durcissement :
 * - `isEvalSupported: false` (aucune évaluation de code), `enableXfa: false` ;
 * - rendu canvas uniquement : pas de couche de texte, pas d'annotations (`AnnotationMode.DISABLE` :
 *   ni liens, ni formulaires interactifs), pas de scripts ;
 * - le document est donné en mémoire (`data`) : aucun chargement d'URL, aucun flux progressif ;
 * - worker et polices EMBARQUÉS localement (voir `public/pdfjs/`, copiés par
 *   `npm run pdfjs:assets`) : aucune requête réseau ;
 * - chargé à la demande : `import()` dynamique à la première ouverture d'un PDF.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfLib = typeof import('pdfjs-dist');

let libPromise: Promise<PdfLib> | null = null;

const assetBase = () => `${import.meta.env.BASE_URL ?? '/'}pdfjs/`.replace(/\/\/+/g, '/');

async function lib(): Promise<PdfLib> {
    libPromise ??= (async () => {
        const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
    })();
    return libPromise;
}

/** Options de sécurité passées à `getDocument` (exportées pour être testées). */
export const PDF_OPEN_OPTIONS = {
    isEvalSupported: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    useSystemFonts: false,
    verbosity: 0,
} as const;

export interface PdfPage { width: number; height: number }

export interface PdfDoc {
    numPages: number;
    /** Taille de la page à l'échelle 1 (points PDF). */
    pageSize(n: number): Promise<PdfPage>;
    /** Dessine la page `n` (1-based) sur `canvas` à l'échelle `scale` (pixels par point). */
    render(n: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;
    destroy(): Promise<void>;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
    const pdfjs = await lib();
    const base = assetBase();
    // pdf.js « consomme » le tampon (transfert au worker) : on lui donne une copie.
    const task = pdfjs.getDocument({
        ...PDF_OPEN_OPTIONS,
        data: bytes.slice(),
        standardFontDataUrl: `${base}standard_fonts/`,
        cMapUrl: `${base}cmaps/`,
        cMapPacked: true,
        iccUrl: `${base}iccs/`,
        wasmUrl: `${base}wasm/`,
    });
    const doc: PDFDocumentProxy = await task.promise;
    const pages = new Map<number, Awaited<ReturnType<PDFDocumentProxy['getPage']>>>();
    const page = async (n: number) => {
        let p = pages.get(n);
        if (!p) {
            p = await doc.getPage(n);
            pages.set(n, p);
        }
        return p;
    };
    return {
        numPages: doc.numPages,
        async pageSize(n) {
            const v = (await page(n)).getViewport({ scale: 1 });
            return { width: v.width, height: v.height };
        },
        async render(n, canvas, scale) {
            const p = await page(n);
            const viewport = p.getViewport({ scale });
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas indisponible');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await p.render({ canvas, canvasContext: context, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
        },
        async destroy() {
            pages.forEach(p => p.cleanup());
            pages.clear();
            await task.destroy();
        },
    };
}
