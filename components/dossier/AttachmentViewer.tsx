/**
 * Visionneuse plein écran d'une pièce jointe (image ou PDF) avec zoom.
 *
 * Aucun fichier temporaire, aucune URL `blob:` : les octets déchiffrés par Rust restent en mémoire ;
 * une image est affichée depuis une URL `data:`, un PDF est dessiné sur un canvas par pdf.js
 * (voir services/pdfRenderer). Pas de bouton « enregistrer » ni « imprimer ». À la fermeture, les
 * octets sont remis à zéro et le document PDF est libéré.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minus, MoveHorizontal, Plus, X } from 'lucide-react';
import { AttachmentMeta, attachmentService, categoryLabel, toDataUrl } from '../../services/attachmentService';
import type { PdfDoc } from '../../services/pdfRenderer';

interface Props {
    meta: AttachmentMeta;
    onClose: () => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
/** Plafond de pixels du canvas (≈ 16 Mpx) : au-delà, la résolution est réduite. */
const MAX_CANVAS_PIXELS = 16_000_000;

const btn = 'h-9 min-w-9 px-2.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 text-white/90 hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent transition-colors';

const AttachmentViewer: React.FC<Props> = ({ meta, onClose }) => {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [pdf, setPdf] = useState<PdfDoc | null>(null);
    const [page, setPage] = useState(1);
    /** 1 = page / image entière dans la fenêtre. */
    const [zoom, setZoom] = useState(1);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const boxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bytesRef = useRef<Uint8Array | null>(null);
    const isPdf = meta.mime === 'application/pdf';

    // Chargement : octets déchiffrés en mémoire seulement.
    useEffect(() => {
        let cancelled = false;
        let opened: PdfDoc | null = null;
        (async () => {
            try {
                const bytes = await attachmentService.read(meta.id);
                bytesRef.current = bytes;
                if (cancelled) return;
                if (isPdf) {
                    const { openPdf } = await import('../../services/pdfRenderer');
                    opened = await openPdf(bytes);
                    if (cancelled) { await opened.destroy(); return; }
                    const size = await opened.pageSize(1);
                    setNatural({ w: size.width, h: size.height });
                    setPdf(opened);
                } else {
                    setImageUrl(toDataUrl(bytes, meta.mime));
                }
            } catch (e) {
                if (!cancelled) setError(typeof e === 'string' ? e : (e as Error)?.message || "Le fichier n'a pas pu être ouvert.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            // Libération : document PDF détruit, octets remis à zéro.
            void opened?.destroy();
            bytesRef.current?.fill(0);
            bytesRef.current = null;
        };
    }, [meta.id, meta.mime, isPdf]);

    // Taille de la zone d'affichage.
    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Taille propre de la page courante (PDF : peut varier d'une page à l'autre).
    useEffect(() => {
        if (!pdf) return;
        let alive = true;
        pdf.pageSize(page).then(s => alive && setNatural({ w: s.width, h: s.height })).catch(() => undefined);
        return () => { alive = false; };
    }, [pdf, page]);

    const base = natural && box.w && box.h ? Math.min((box.w - 24) / natural.w, (box.h - 24) / natural.h) : 1; // « page entière »
    const shown = natural ? { w: natural.w * base * zoom, h: natural.h * base * zoom } : { w: 0, h: 0 };

    // Rendu PDF (résolution suivant le zoom, plafonnée).
    useEffect(() => {
        if (!pdf || !natural || !canvasRef.current || !base) return;
        const canvas = canvasRef.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let scale = base * zoom * dpr;
        const px = natural.w * scale * natural.h * scale;
        if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px);
        let alive = true;
        const t = setTimeout(() => {
            pdf.render(page, canvas, scale).catch(e => alive && setError((e as Error)?.message || 'Page illisible'));
        }, 60);
        return () => { alive = false; clearTimeout(t); };
    }, [pdf, page, zoom, natural, base]);

    const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    const fitWidth = () => natural && box.w && setZoom(clamp((box.w - 24) / natural.w / base));
    const actualSize = () => base && setZoom(clamp(1 / base));
    const pages = pdf?.numPages ?? 1;
    const go = useCallback((d: number) => setPage(p => Math.min(pages, Math.max(1, p + d))), [pages]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
            else if (e.key === '+' || e.key === '=') setZoom(z => clamp(z * 1.25));
            else if (e.key === '-') setZoom(z => clamp(z / 1.25));
            else if (e.key === '0') setZoom(1);
            else if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
        };
        window.addEventListener('keydown', h, true);
        return () => window.removeEventListener('keydown', h, true);
    }, [onClose, go]);

    const onWheel = (e: React.WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(z => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };

    return (
        <div className="fixed inset-0 z-[130] flex flex-col" role="dialog" aria-modal="true" aria-label={`Pièce jointe : ${meta.title}`} style={{ background: 'rgba(15,23,42,0.94)' }}>
            <div className="flex items-center gap-2 px-4 h-14 shrink-0 text-white">
                <div className="min-w-0 mr-auto">
                    <div className="text-[14px] font-semibold truncate">{meta.title}</div>
                    <div className="text-[11px] text-white/60">{categoryLabel(meta.category)} · examen du {meta.examDate.split('-').reverse().join('/')}</div>
                </div>
                {isPdf && pdf && (
                    <div className="flex items-center gap-1">
                        <button type="button" className={btn} onClick={() => go(-1)} disabled={page <= 1} aria-label="Page précédente"><ChevronLeft size={16} /></button>
                        <span className="text-[12px] tabular-nums text-white/80 w-16 text-center">{page} / {pages}</span>
                        <button type="button" className={btn} onClick={() => go(1)} disabled={page >= pages} aria-label="Page suivante"><ChevronRight size={16} /></button>
                    </div>
                )}
                <div className="flex items-center gap-1">
                    <button type="button" className={btn} onClick={() => setZoom(z => clamp(z / 1.25))} aria-label="Zoom arrière"><Minus size={16} /></button>
                    <span className="text-[12px] tabular-nums text-white/80 w-12 text-center" aria-live="polite">{Math.round(base * zoom * 100)} %</span>
                    <button type="button" className={btn} onClick={() => setZoom(z => clamp(z * 1.25))} aria-label="Zoom avant"><Plus size={16} /></button>
                    <button type="button" className={btn} onClick={() => setZoom(1)} title="Ajuster à la fenêtre (0)"><Maximize2 size={15} /> Page</button>
                    <button type="button" className={btn} onClick={fitWidth} title="Ajuster à la largeur"><MoveHorizontal size={15} /> Largeur</button>
                    <button type="button" className={btn} onClick={actualSize} title="Taille réelle">100 %</button>
                </div>
                <button type="button" className={btn} onClick={onClose} aria-label="Fermer"><X size={18} /></button>
            </div>

            <div ref={boxRef} className="flex-1 overflow-auto" onWheel={onWheel} onMouseDown={e => e.target === e.currentTarget && onClose()}>
                {loading && <p className="text-white/70 text-[13px] text-center pt-24">Ouverture…</p>}
                {error && <p role="alert" className="text-[13px] text-center pt-24" style={{ color: '#fecaca' }}>{error}</p>}
                {!loading && !error && (
                    <div className="min-w-full min-h-full flex items-center justify-center p-3" style={{ width: shown.w ? shown.w + 24 : undefined, height: shown.h ? shown.h + 24 : undefined }}>
                        {imageUrl && (
                            <img src={imageUrl} alt={meta.title} draggable={false} onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                                 style={{ width: shown.w || undefined, height: shown.h || undefined, maxWidth: 'none', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,.4)' }} />
                        )}
                        {pdf && <canvas ref={canvasRef} style={{ width: shown.w, height: shown.h, background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,.4)' }} />}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttachmentViewer;
