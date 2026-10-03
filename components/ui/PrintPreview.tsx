import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn } from 'lucide-react';

interface PrintPreviewProps {
    /** Dimensions de la feuille en px CSS à l'échelle 1 (A4 : 794 × 1123). */
    page: { w: number; h: number };
    /** Dessine la feuille à l'échelle demandée ; le rendu doit mesurer page × échelle. */
    render: (scale: number) => React.ReactNode;
    /** Libellé accessible (ex. « Aperçu de l'ordonnance »). */
    label?: string;
}

const SHEET_SHADOW = '0 1px 3px rgba(15, 23, 42, 0.12), 0 4px 14px rgba(15, 23, 42, 0.08)';

/** Feuille ajustée à la largeur de son conteneur ; cliquer l'ouvre en grand. Aucun cadre autour de la feuille. */
const PrintPreview: React.FC<PrintPreviewProps> = ({ page, render, label = 'Aperçu' }) => {
    const boxRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [zoomed, setZoomed] = useState(false);

    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const update = () => setWidth(el.clientWidth);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (!zoomed) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setZoomed(false); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [zoomed]);

    const scale = width > 0 ? width / page.w : 0;
    const modalScale = Math.min(
        (Math.min(window.innerWidth, 1100) - 64) / page.w,
        (window.innerHeight - 96) / page.h,
    );

    return (
        <>
            <div ref={boxRef} className="w-full">
                {scale > 0 && (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setZoomed(true)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomed(true); } }}
                        aria-label={`${label} — agrandir`}
                        title="Cliquer pour agrandir"
                        className="group relative block overflow-hidden bg-white cursor-zoom-in outline-none focus-visible:ring-2"
                        style={{ width: page.w * scale, height: page.h * scale, boxShadow: SHEET_SHADOW }}
                    >
                        {render(scale)}
                        <span className="absolute top-2 right-2 w-7 h-7 rounded-md bg-slate-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                            <ZoomIn size={14} />
                        </span>
                    </div>
                )}
            </div>
            {zoomed && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center print:hidden"
                    style={{ background: 'rgba(15, 23, 42, 0.72)' }}
                    role="dialog" aria-modal="true" aria-label={label}
                    onClick={() => setZoomed(false)}
                >
                    <button type="button" onClick={() => setZoomed(false)} aria-label="Fermer l'aperçu"
                        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white flex items-center justify-center" style={{ boxShadow: SHEET_SHADOW }}>
                        <X size={16} />
                    </button>
                    <div className="max-h-full overflow-auto" onClick={e => e.stopPropagation()}
                        style={{ width: page.w * modalScale, height: page.h * modalScale, boxShadow: SHEET_SHADOW, background: 'white' }}>
                        {render(modalScale)}
                    </div>
                </div>
            )}
        </>
    );
};

export default PrintPreview;
