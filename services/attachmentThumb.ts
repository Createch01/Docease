/**
 * Vignette d'une pièce jointe (≤ ~22 Ko, data URL JPEG), générée à l'import côté interface puis
 * stockée dans l'index : la liste s'affiche sans déchiffrer chaque fichier. Aucune URL `blob:` :
 * les images passent par une URL `data:` en mémoire.
 */
import { toDataUrl } from './attachmentService';

const SIDE = 160;
/** Rust refuse une vignette de plus de 24 Ko (chaîne complète) : marge de sécurité. */
export const THUMB_MAX_CHARS = 22_000;

/** Réduit une source dessinable en JPEG ≤ THUMB_MAX_CHARS ; `undefined` si impossible. */
export function canvasToThumb(source: CanvasImageSource, width: number, height: number): string | undefined {
    if (!width || !height) return undefined;
    for (let side = SIDE; side >= 64; side = Math.floor(side * 0.8)) {
        const k = Math.min(1, side / Math.max(width, height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(width * k));
        c.height = Math.max(1, Math.round(height * k));
        const ctx = c.getContext('2d');
        if (!ctx) return undefined;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(source, 0, 0, c.width, c.height);
        for (const q of [0.72, 0.6, 0.5, 0.4]) {
            const url = c.toDataURL('image/jpeg', q);
            if (url.length <= THUMB_MAX_CHARS) return url;
        }
    }
    return undefined;
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
});

export async function makeThumb(bytes: Uint8Array, mime: string): Promise<string | undefined> {
    try {
        if (mime === 'application/pdf') {
            const { openPdf } = await import('./pdfRenderer');
            const doc = await openPdf(bytes);
            try {
                const size = await doc.pageSize(1);
                const canvas = document.createElement('canvas');
                await doc.render(1, canvas, (SIDE * 2) / Math.max(size.width, size.height));
                return canvasToThumb(canvas, canvas.width, canvas.height);
            } finally {
                await doc.destroy();
            }
        }
        const img = await loadImage(toDataUrl(bytes, mime));
        return canvasToThumb(img, img.naturalWidth, img.naturalHeight);
    } catch {
        return undefined; // pas de vignette : l'interface affiche une icône
    }
}
