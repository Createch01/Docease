/* Ordonnance editor — app shell: state, live A4 preview, print test,
   JSON save/load. Exports (window): OrdonnanceEditorApp
*/
(() => {
const { useState, useCallback, useMemo, useRef } = React;

const T = { ink: '#1A202C', muted: '#4A5568', subtle: '#718096', border: '#E2E8F0', bg: '#F0F4F8', primary: '#1A6B8A', secondary: '#2ECC9A' };

function setPath(obj, path, value) {
  const keys = path.split('.');
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return next;
}

function OrdonnanceEditorApp({ doctorInitial, patient, date, items, initialAppearance, onSave }) {
  const [appearance, setAppearance] = useState(() => initialAppearance || window.rxOrdDefaultAppearance());
  const [doctor, setDoctor] = useState(() => doctorInitial || window.rxOrdDefaultDoctor());
  const [zoom, setZoom] = useState(0.82);
  const [showJson, setShowJson] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const set = useCallback((path, value) => setAppearance(prev => setPath(prev, path, value)), []);

  const readFile = (file, cb) => {
    const fr = new FileReader();
    fr.onload = () => cb(String(fr.result));
    fr.readAsDataURL(file);
  };

  const onLogoFile = (file) => readFile(file, (url) => { setDoctor(d => ({ ...d, logoUrl: url })); flash('Logo importé'); });
  const onClearLogo = () => setDoctor(d => ({ ...d, logoUrl: '' }));
  const onSignatureFile = (file) => readFile(file, (url) => { setAppearance(prev => setPath(prev, 'signature.url', url)); flash('Signature importée'); });
  const onClearSignature = () => set('signature.url', '');

  const json = useMemo(() => JSON.stringify({ appearance, doctor }, null, 2), [appearance, doctor]);

  const save = () => {
    onSave?.({ appearance, doctor });
    try { localStorage.setItem('docease_ordonnance_appearance', json); } catch (_) {}
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

  const loadFile = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(String(fr.result));
        if (parsed.appearance) setAppearance(parsed.appearance);
        if (parsed.doctor) setDoctor(parsed.doctor);
        flash('Design chargé');
      } catch (_) { flash('Fichier invalide'); }
    };
    fr.readAsText(file);
  };

  const printTest = () => window.print();

  const ToolBtn = ({ onClick, title, children }) => (
    <button onClick={onClick} title={title}
            className="rounded-md border flex items-center justify-center transition-all"
            style={{ width: 34, height: 34, borderColor: T.border, background: '#fff', color: T.muted }}>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: T.bg, color: T.ink }}>
      <header className="ed-noprint flex items-center gap-3 px-4 shrink-0" style={{ height: 56, background: '#fff', borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center rounded-lg text-white shrink-0"
                style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${T.primary} 0%, ${T.secondary} 100%)` }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" /></svg>
          </span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.15 }}>Éditeur d'ordonnance sur mesure</div>
            <div style={{ fontSize: 10.5, color: T.subtle }}>Dr. {doctor.name}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-2 rounded-md px-2.5" style={{ height: 34, background: '#F7FAFC' }}>
            <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.06).toFixed(2)))} style={{ color: T.muted }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14" /></svg>
            </button>
            <span className="tabular-nums text-center" style={{ fontSize: 11.5, fontWeight: 500, width: 34 }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(1.6, +(z + 0.06).toFixed(2)))} style={{ color: T.muted }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>

          <ToolBtn onClick={() => fileRef.current?.click()} title="Charger un design .json">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
          </ToolBtn>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />

          <button onClick={() => setShowJson(true)}
                  className="rounded-md border px-3 flex items-center gap-2 transition-all"
                  style={{ height: 34, borderColor: T.border, background: '#fff', color: T.muted, fontSize: 12, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m8 6-6 6 6 6M16 6l6 6-6 6" /></svg>
            JSON
          </button>

          <button onClick={printTest}
                  className="rounded-md border px-3 flex items-center gap-2 transition-all"
                  style={{ height: 34, borderColor: T.border, background: '#fff', color: T.muted, fontSize: 12, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
            Test d'impression
          </button>

          <button onClick={save}
                  className="rounded-md px-4 flex items-center gap-2 text-white transition-all"
                  style={{ height: 34, background: T.primary, fontSize: 12, fontWeight: 500 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
            Enregistrer le design
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-w-0" style={{ overflow: 'hidden' }}>
        <aside className="ed-noprint ed-scroll overflow-y-auto shrink-0 p-4" style={{ width: 340, background: '#fff', borderRight: `1px solid ${T.border}` }}>
          <window.OrdonnanceControls appearance={appearance} set={set} doctor={doctor}
                                     onLogoFile={onLogoFile} onSignatureFile={onSignatureFile}
                                     onClearLogo={onClearLogo} onClearSignature={onClearSignature} />
        </aside>

        <main className="ed-scroll flex-1 min-w-0 overflow-auto flex items-start justify-center" style={{ padding: 32 }}>
          <div className="rx-ord-sheet shrink-0 bg-white"
               style={{ boxShadow: '0 1px 3px rgba(15,23,42,.10), 0 14px 40px rgba(15,23,42,.14)',
                        transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <window.OrdonnanceTemplate doctor={doctor} patient={patient} date={date} items={items} appearance={appearance} />
          </div>
        </main>
      </div>

      <footer className="ed-noprint flex items-center gap-4 px-4 shrink-0" style={{ height: 30, background: '#fff', borderTop: `1px solid ${T.border}`, fontSize: 10.5, color: T.subtle }}>
        <span>{appearance.paperSize} · {appearance.paperSize === 'A4' ? '210 × 297 mm' : '148 × 210 mm'}</span>
        <span style={{ color: '#CBD5E0' }}>·</span>
        <span>{items.length} médicament{items.length > 1 ? 's' : ''}</span>
      </footer>

      {showJson && (
        <div className="ed-noprint fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(15,23,42,.55)', zIndex: 70, padding: 24 }} onClick={() => setShowJson(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl flex flex-col" style={{ width: 620, maxWidth: '100%', maxHeight: '82vh', boxShadow: '0 20px 60px rgba(15,23,42,.3)' }}>
            <div className="flex items-center justify-between px-5" style={{ height: 54, borderBottom: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Configuration du design</div>
                <div style={{ fontSize: 11, color: T.subtle }}>appearance + doctor — rechargeable</div>
              </div>
              <button onClick={() => setShowJson(false)} style={{ color: T.subtle }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <pre className="ed-scroll flex-1 overflow-auto m-0 px-5 py-4" style={{ fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, Menlo, monospace', color: '#334155', background: '#F7FAFC' }}>
              {json}
            </pre>
            <div className="flex items-center gap-2 px-5" style={{ height: 60, borderTop: `1px solid ${T.border}` }}>
              <button onClick={() => { navigator.clipboard?.writeText(json); flash('JSON copié'); }}
                      className="rounded-md border px-4" style={{ height: 34, borderColor: T.border, fontSize: 12, fontWeight: 500, color: T.muted }}>
                Copier
              </button>
              <button onClick={download}
                      className="rounded-md border px-4" style={{ height: 34, borderColor: T.border, fontSize: 12, fontWeight: 500, color: T.muted }}>
                Télécharger .json
              </button>
              <button onClick={() => { setAppearance(window.rxOrdDefaultAppearance()); flash('Réinitialisé'); }}
                      className="ml-auto rounded-md px-4 text-white" style={{ height: 34, background: '#E53E3E', fontSize: 12, fontWeight: 500 }}>
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="ed-noprint fixed rounded-lg px-4 flex items-center gap-2 text-white"
             style={{ right: 20, bottom: 46, height: 40, background: T.primary, zIndex: 80, boxShadow: '0 8px 24px rgba(15,23,42,.24)', fontSize: 12.5, fontWeight: 500 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
          {toast}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { OrdonnanceEditorApp });

})();
