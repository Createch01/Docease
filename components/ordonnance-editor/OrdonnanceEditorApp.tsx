/* Ordonnance editor — app shell: state, live preview with zoom, print test
   (A4/A5), JSON load/export, save. Talks to the rest of the app only through
   props: DoctorInfo (read-only) + stored CustomTemplateConfig in, the design
   config out. Never writes DoctorInfo — coordinates are edited in Cabinet.
*/

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CustomTemplateConfig, DoctorInfo } from '../../types';
import { DEFAULT_CUSTOM_TEMPLATE_CONFIG } from '../templates/CustomTemplate';
import OrdonnanceControls from './OrdonnanceControls';
import OrdonnanceTemplate from './OrdonnanceTemplate';
import {
  OrdonnanceAppearance, OrdDoctor, OrdItem, OrdPatient, PaperSize, ORD_PAGE,
  ordDefaultAppearance, deepMergeDefaults, setPath, resolveOrdonnanceAppearance, toOrdDoctor,
} from './ordonnanceModel';

const T = { ink: '#1A202C', muted: '#4A5568', subtle: '#718096', border: '#E2E8F0', bg: '#F0F4F8', primary: '#1A6B8A', secondary: '#2ECC9A' };
const MM_TO_PX = 96 / 25.4;

const PREVIEW_PATIENT: OrdPatient = { name: 'Ahmed Benali', age: '45 ans', sex: 'M' };
const PREVIEW_ITEMS: OrdItem[] = [
  { drugName: 'Amlodipine', strength: '5 mg', form: 'Comprimé', dosage: '1 comprimé le matin', duration: '30 jours' },
  { drugName: 'Metformine', strength: '850 mg', form: 'Comprimé', dosage: '1 comprimé matin et soir', timing: 'Après repas', duration: '30 jours' },
];

export interface OrdonnanceSaveResult {
  config: CustomTemplateConfig;
  paperSize: PaperSize;
}

interface OrdonnanceEditorAppProps {
  doctor: DoctorInfo;
  website?: string;
  paperSize?: PaperSize;
  initialConfig?: CustomTemplateConfig;
  onSave: (result: OrdonnanceSaveResult) => void;
  /* "Modifier dans Cabinet" / "Renseigner l'INPE" links. */
  onEditCabinet?: () => void;
}

const ToolBtn: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button type="button" onClick={onClick} title={title}
          className="rounded-md border flex items-center justify-center transition-all"
          style={{ width: 34, height: 34, borderColor: T.border, background: '#fff', color: T.muted }}>
    {children}
  </button>
);

const OrdonnanceEditorApp: React.FC<OrdonnanceEditorAppProps> = ({ doctor: doctorInfo, website, paperSize, initialConfig, onSave, onEditCabinet }) => {
  const [appearance, setAppearance] = useState<OrdonnanceAppearance>(() => {
    const a = resolveOrdonnanceAppearance(initialConfig);
    return paperSize ? { ...a, paperSize } : a;
  });
  const doctor: OrdDoctor = useMemo(() => toOrdDoctor(doctorInfo, website), [doctorInfo, website]);
  const [zoom, setZoom] = useState(0.82);
  const [showJson, setShowJson] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const zoomTouched = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const set = useCallback((path: string, value: unknown) => setAppearance(prev => setPath(prev, path, value)), []);

  const page = ORD_PAGE[appearance.paperSize] || ORD_PAGE.A4;
  const date = useMemo(() => new Date().toLocaleDateString('fr-FR'), []);

  // Fit the sheet to the available width (the design's standalone page starts
  // at 82%; embedded in Réglages the pane is narrower) until the doctor zooms
  // by hand. Re-fits on resize, paper change and full-screen toggle.
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const fit = () => {
      if (zoomTouched.current) return;
      const avail = el.clientWidth - 64;
      if (avail > 0) setZoom(Math.max(0.3, Math.min(0.82, Math.floor(avail / (page.w * MM_TO_PX) * 100) / 100)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.w, fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const zoomBy = (d: number) => {
    zoomTouched.current = true;
    setZoom(z => Math.min(1.6, Math.max(0.3, +(z + d).toFixed(2))));
  };

  const readFile = (file: File, cb: (url: string) => void) => {
    if (file.size > 2 * 1024 * 1024) { flash('Image trop volumineuse (max 2 Mo)'); return; }
    const fr = new FileReader();
    fr.onload = () => cb(String(fr.result));
    fr.readAsDataURL(file);
  };

  const onLogoFile = (file: File) => readFile(file, url => { set('header.logo.url', url); flash('Logo importé'); });
  const onClearLogo = () => set('header.logo.url', '');
  const onBodyLogoFile = (file: File) => readFile(file, url => { set('bodyLogo.url', url); flash('Logo importé'); });
  const onClearBodyLogo = () => set('bodyLogo.url', '');

  const json = useMemo(() => JSON.stringify({ appearance, doctor }, null, 2), [appearance, doctor]);

  const save = () => {
    const base: CustomTemplateConfig = { ...DEFAULT_CUSTOM_TEMPLATE_CONFIG, ...initialConfig };
    onSave({ config: { ...base, ordonnance: appearance }, paperSize: appearance.paperSize });
    flash('Design enregistré');
  };

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'docease-ordonnance-design.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadFile = (file: File) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(String(fr.result));
        // Only the design is loaded — doctor data always comes from Cabinet.
        if (!parsed.appearance) { flash('Fichier invalide'); return; }
        setAppearance(deepMergeDefaults(ordDefaultAppearance(), parsed.appearance));
        flash('Design chargé');
      } catch {
        flash('Fichier invalide');
      }
    };
    fr.readAsText(file);
  };

  // Print test: render the bare sheet into <body> and print only that.
  const printTest = () => {
    if (printing) { window.print(); return; }
    setPrinting(true);
  };
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add('ord-printing');
    const done = () => { document.body.classList.remove('ord-printing'); setPrinting(false); };
    window.addEventListener('afterprint', done, { once: true });
    // The portal is committed by now; a timer (unlike rAF) also fires when the window isn't painted.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('ord-printing'); };
  }, [printing]);

  const sheet = <OrdonnanceTemplate doctor={doctor} patient={PREVIEW_PATIENT} date={date} items={PREVIEW_ITEMS} appearance={appearance} />;

  return (
    <div className={`ord-editor flex flex-col overflow-hidden ${fullscreen ? 'fixed inset-0' : 'rounded-xl border'}`}
         style={{ height: fullscreen ? '100vh' : '100%', zIndex: fullscreen ? 60 : undefined, background: T.bg, color: T.ink, borderColor: T.border }}>
      <div className="flex items-center gap-3 px-4 shrink-0" style={{ height: 56, background: '#fff', borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="flex items-center justify-center rounded-lg text-white shrink-0"
                style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${T.primary} 0%, ${T.secondary} 100%)` }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" /></svg>
          </span>
          <div className="min-w-0">
            <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.15 }}>Éditeur d'ordonnance sur mesure</div>
            <div className="truncate" style={{ fontSize: 10.5, color: T.subtle }}>Dr. {doctor.name}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-2 rounded-md px-2.5" style={{ height: 34, background: '#F7FAFC' }}>
            <button type="button" onClick={() => zoomBy(-0.06)} style={{ color: T.muted }} title="Zoom arrière">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14" /></svg>
            </button>
            <span className="tabular-nums text-center" style={{ fontSize: 11.5, fontWeight: 500, width: 34 }}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(0.06)} style={{ color: T.muted }} title="Zoom avant">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>

          <ToolBtn onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran'}>
            {fullscreen
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
          </ToolBtn>

          <ToolBtn onClick={() => fileRef.current?.click()} title="Charger un design .json">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          </ToolBtn>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />

          <button type="button" onClick={() => setShowJson(true)}
                  className="rounded-md border px-3 flex items-center gap-2 transition-all"
                  style={{ height: 34, borderColor: T.border, background: '#fff', color: T.muted, fontSize: 12, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m8 6-6 6 6 6M16 6l6 6-6 6" /></svg>
            JSON
          </button>

          <button type="button" onClick={printTest}
                  className="rounded-md border px-3 flex items-center gap-2 transition-all"
                  style={{ height: 34, borderColor: T.border, background: '#fff', color: T.muted, fontSize: 12, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
            Test d'impression
          </button>

          <button type="button" onClick={save}
                  className="rounded-md px-4 flex items-center gap-2 text-white transition-all"
                  style={{ height: 34, background: T.primary, fontSize: 12, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
            Enregistrer le design
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 min-w-0" style={{ overflow: 'hidden' }}>
        <div className="ed-scroll overflow-y-auto shrink-0 p-4" style={{ width: 340, background: '#fff', borderRight: `1px solid ${T.border}` }}>
          <OrdonnanceControls appearance={appearance} set={set} doctor={doctor}
                              onLogoFile={onLogoFile} onClearLogo={onClearLogo}
                              onBodyLogoFile={onBodyLogoFile} onClearBodyLogo={onClearBodyLogo}
                              onEditCabinet={onEditCabinet} />
        </div>

        <div ref={mainRef} className="ed-scroll flex-1 min-w-0 overflow-auto" style={{ padding: 32 }}>
          <div style={{ width: page.w * MM_TO_PX * zoom, height: page.h * MM_TO_PX * zoom, margin: '0 auto' }}>
            <div className="rx-ord-sheet bg-white"
                 style={{ width: `${page.w}mm`, height: `${page.h}mm`, boxShadow: '0 1px 3px rgba(15,23,42,.10), 0 14px 40px rgba(15,23,42,.14)',
                          transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              {sheet}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 shrink-0" style={{ height: 30, background: '#fff', borderTop: `1px solid ${T.border}`, fontSize: 10.5, color: T.subtle }}>
        <span>{appearance.paperSize} · {appearance.paperSize === 'A4' ? '210 × 297 mm' : '148 × 210 mm'}</span>
        <span style={{ color: '#CBD5E0' }}>·</span>
        <span>{PREVIEW_ITEMS.length} médicament{PREVIEW_ITEMS.length > 1 ? 's' : ''} (exemple)</span>
      </div>

      {showJson && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(15,23,42,.55)', zIndex: 70, padding: 24 }} onClick={() => setShowJson(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl flex flex-col" style={{ width: 620, maxWidth: '100%', maxHeight: '82vh', boxShadow: '0 20px 60px rgba(15,23,42,.3)', color: T.ink }}>
            <div className="flex items-center justify-between px-5" style={{ height: 54, borderBottom: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Configuration du design</div>
                <div style={{ fontSize: 11, color: T.subtle }}>appearance rechargeable · doctor pour référence (non rechargé)</div>
              </div>
              <button type="button" onClick={() => setShowJson(false)} style={{ color: T.subtle }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <pre className="ed-scroll flex-1 overflow-auto m-0 px-5 py-4" style={{ fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, Menlo, monospace', color: '#334155', background: '#F7FAFC' }}>
              {json}
            </pre>
            <div className="flex items-center gap-2 px-5" style={{ height: 60, borderTop: `1px solid ${T.border}` }}>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(json); flash('JSON copié'); }}
                      className="rounded-md border px-4" style={{ height: 34, borderColor: T.border, fontSize: 12, fontWeight: 500, color: T.muted }}>
                Copier
              </button>
              <button type="button" onClick={download}
                      className="rounded-md border px-4" style={{ height: 34, borderColor: T.border, fontSize: 12, fontWeight: 500, color: T.muted }}>
                Télécharger .json
              </button>
              <button type="button" onClick={() => { setAppearance(ordDefaultAppearance()); flash('Réinitialisé'); }}
                      className="ml-auto rounded-md px-4 text-white" style={{ height: 34, background: '#E53E3E', fontSize: 12, fontWeight: 500 }}>
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed rounded-lg px-4 flex items-center gap-2 text-white"
             style={{ right: 20, bottom: 46, height: 40, background: T.primary, zIndex: 80, boxShadow: '0 8px 24px rgba(15,23,42,.24)', fontSize: 12.5, fontWeight: 500 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
          {toast}
        </div>
      )}

      {printing && createPortal(
        <div className={`ord-print-root document-print-container ord-print-${appearance.paperSize.toLowerCase()}`}>
          <style>{`@media print { @page { size: ${appearance.paperSize} portrait; margin: 0; } body.ord-printing > *:not(.ord-print-root) { display: none !important; } }`}</style>
          {sheet}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default OrdonnanceEditorApp;
