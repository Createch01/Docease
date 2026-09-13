/* DocEase prescription editor — application shell.

   Owns the config, selection, history and JSON persistence. The final output
   is the `config` object, ready to store in DocEase settings via
   settingsService (or whatever `onSave` you pass in).

   Exports (window): RxPrescriptionEditor
*/
/* IIFE-SCOPED — every <script type="text/babel"> runs as a classic script and
   shares ONE global lexical scope, so bare top-level consts across these files
   would collide. The IIFE keeps internals private; the Object.assign(window, …)
   at the bottom is the only cross-file contract. */
(() => {
  const { useState, useCallback, useEffect, useRef, useMemo } = React;

  const K = {
    ink: 'var(--color-text, #1A202C)',
    muted: 'var(--color-text-muted, #4A5568)',
    subtle: 'var(--color-text-subtle, #718096)',
    faint: 'var(--color-text-faint, #A0AEC0)',
    border: 'var(--color-border, #E2E8F0)',
    bg: 'var(--color-bg, #F0F4F8)',
    surface: 'var(--color-surface-alt, #F7FAFC)',
    primary: 'var(--color-primary, #1A6B8A)',
    primary50: 'var(--color-primary-50, #E8F0F4)',
    secondary: 'var(--color-secondary, #2ECC9A)',
  };

  const TABS = [
    { id: 'elements', label: 'Éléments', icon: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></> },
    { id: 'properties', label: 'Propriétés', icon: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></> },
    { id: 'layers', label: 'Calques', icon: <><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></> },
  ];

  function RxPrescriptionEditor({ doctor, initialConfig, onSave }) {
    const [config, setConfig] = useState(() => initialConfig || window.rxDefaultConfig());
    const [selectedId, setSelectedId] = useState(null);
    const [tab, setTab] = useState('elements');
    const [zoom, setZoom] = useState(0.78);
    const [showJson, setShowJson] = useState(false);
    const [toast, setToast] = useState(null);
    const [preview, setPreview] = useState(false);

    const past = useRef([]);
    const future = useRef([]);
    const selected = config.elements.find(e => e.id === selectedId) || null;

    const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

    const commit = useCallback((next, { history = true } = {}) => {
      setConfig(prev => {
        if (history) { past.current.push(prev); if (past.current.length > 60) past.current.shift(); future.current = []; }
        return typeof next === 'function' ? next(prev) : next;
      });
    }, []);

    const updateEl = useCallback((id, patch, opts) => {
      commit(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, ...patch } : e) }), opts);
    }, [commit]);

    /* drags fire many updates — collapse them into one history entry */
    const dragging = useRef(false);
    const dragUpdate = useCallback((id, patch) => {
      if (!dragging.current) { dragging.current = true; updateEl(id, patch, { history: true }); }
      else updateEl(id, patch, { history: false });
    }, [updateEl]);
    useEffect(() => {
      const up = () => { dragging.current = false; };
      window.addEventListener('pointerup', up);
      return () => window.removeEventListener('pointerup', up);
    }, []);

    const addElement = useCallback((type) => {
      const el = window.rxMakeElement(type, { y: 60 + Math.round(Math.random() * 40) });
      commit(prev => ({ ...prev, elements: [...prev.elements, el] }));
      setSelectedId(el.id);
      setTab('properties');
    }, [commit]);

    const addContact = useCallback((field) => {
      const rows = config.elements.filter(e => e.type === 'contact').length;
      const bindFor = { phone: 'phone', mail: 'email', address: 'address', location: 'address', name: 'name', website: '', cellphone: 'phone', fax: 'phone' };
      const el = window.rxMakeElement('contact', {
        field, bind: bindFor[field] ?? '',
        text: bindFor[field] ? '' : window.RX_ICON_LABELS[field],
        name: window.RX_ICON_LABELS[field],
        x: 18, y: 258 + rows * 8,
      });
      commit(prev => ({ ...prev, elements: [...prev.elements, el] }));
      setSelectedId(el.id);
      setTab('properties');
    }, [commit, config.elements]);

    const deleteEl = useCallback((id) => {
      commit(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== id) }));
      setSelectedId(s => (s === id ? null : s));
    }, [commit]);

    const duplicateEl = useCallback((id) => {
      const src = config.elements.find(e => e.id === id);
      if (!src) return;
      const copy = { ...src, id: `${src.type}-${Date.now().toString(36)}`, x: src.x + 4, y: src.y + 4, name: `${src.name} copie` };
      commit(prev => ({ ...prev, elements: [...prev.elements, copy] }));
      setSelectedId(copy.id);
    }, [commit, config.elements]);

    const reorder = useCallback((idx, dir) => {
      commit(prev => {
        const arr = [...prev.elements];
        const j = idx + dir;
        if (j < 0 || j >= arr.length) return prev;
        [arr[idx], arr[j]] = [arr[j], arr[idx]];
        return { ...prev, elements: arr };
      });
    }, [commit]);

    const handleLogo = useCallback((file, url) => {
      const apply = (src) => {
        const existing = config.elements.find(e => e.type === 'logo');
        if (existing) { updateEl(existing.id, { src }); setSelectedId(existing.id); }
        else {
          const el = window.rxMakeElement('logo', { src });
          commit(prev => ({ ...prev, elements: [...prev.elements, el] }));
          setSelectedId(el.id);
        }
        setTab('properties');
        flash('Logo mis à jour');
      };
      if (url) return apply(url);
      const fr = new FileReader();
      fr.onload = () => apply(String(fr.result));
      fr.readAsDataURL(file);
    }, [config.elements, updateEl, commit]);

    const undo = useCallback(() => {
      if (!past.current.length) return;
      const prev = past.current.pop();
      setConfig(cur => { future.current.push(cur); return prev; });
    }, []);
    const redo = useCallback(() => {
      if (!future.current.length) return;
      const nxt = future.current.pop();
      setConfig(cur => { past.current.push(cur); return nxt; });
    }, []);

    /* keyboard */
    useEffect(() => {
      const onKey = (e) => {
        const t = e.target;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        const meta = e.metaKey || e.ctrlKey;
        if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (meta && e.key.toLowerCase() === 'd' && selectedId) { e.preventDefault(); duplicateEl(selectedId); return; }
        if (!selectedId) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteEl(selectedId); return; }
        const step = e.shiftKey ? 5 : 1;
        const map = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['y', -step], ArrowDown: ['y', step] };
        const mv = map[e.key];
        if (mv && selected) { e.preventDefault(); updateEl(selectedId, { [mv[0]]: selected[mv[0]] + mv[1] }); }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, selected, undo, redo, duplicateEl, deleteEl, updateEl]);

    const json = useMemo(() => JSON.stringify(config, null, 2), [config]);

    const save = () => {
      onSave?.(config);
      try { localStorage.setItem('docease_rx_layout', json); } catch (_) {}
      flash('Modèle enregistré dans les paramètres');
    };

    const download = () => {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'docease-ordonnance-layout.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    const ToolBtn = ({ onClick, title, disabled, children }) => (
      <button onClick={onClick} title={title} disabled={disabled}
              className="rounded-md border flex items-center justify-center transition-all"
              style={{ width: 34, height: 34, borderColor: K.border, background: '#fff',
                       color: disabled ? K.faint : K.muted, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {children}
      </button>
    );

    return (
      <div className="flex flex-col" style={{ height: '100vh', background: K.bg, color: K.ink }}>
        {/* ── top bar ── */}
        <header className="ed-noprint flex items-center gap-3 px-4 shrink-0"
                style={{ height: 56, background: '#fff', borderBottom: `1px solid ${K.border}` }}>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center rounded-lg text-white shrink-0"
                  style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${K.primary} 0%, ${K.secondary} 100%)` }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" />
              </svg>
            </span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.15 }}>Éditeur d’ordonnance</div>
              <div style={{ fontSize: 10.5, color: K.subtle }}>{doctor?.name || 'Cabinet'}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-4">
            <ToolBtn onClick={undo} title="Annuler (⌘Z)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 7v6h6" /><path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" /></svg>
            </ToolBtn>
            <ToolBtn onClick={redo} title="Rétablir (⇧⌘Z)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M21 7v6h-6" /><path d="M20.5 13a9 9 0 1 1-2.3-9.3L21 7" /></svg>
            </ToolBtn>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-2 rounded-md px-2.5" style={{ height: 34, background: K.surface }}>
              <button onClick={() => setZoom(z => Math.max(0.3, +(z - 0.06).toFixed(2)))} style={{ color: K.muted }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14" /></svg>
              </button>
              <span className="tabular-nums text-center" style={{ fontSize: 11.5, fontWeight: 500, color: K.muted, width: 34 }}>
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.min(1.6, +(z + 0.06).toFixed(2)))} style={{ color: K.muted }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>

            <button onClick={() => { setPreview(p => !p); setSelectedId(null); }}
                    className="rounded-md border px-3 flex items-center gap-2 transition-all"
                    style={{ height: 34, borderColor: preview ? K.primary : K.border,
                             background: preview ? K.primary50 : '#fff',
                             color: preview ? K.primary : K.muted, fontSize: 12, fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              Aperçu
            </button>

            <button onClick={() => setShowJson(true)}
                    className="rounded-md border px-3 flex items-center gap-2 transition-all"
                    style={{ height: 34, borderColor: K.border, background: '#fff', color: K.muted, fontSize: 12, fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="m8 6-6 6 6 6M16 6l6 6-6 6" />
              </svg>
              JSON
            </button>

            <button onClick={save}
                    className="rounded-md px-4 flex items-center gap-2 text-white transition-all"
                    style={{ height: 34, background: K.primary, fontSize: 12, fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" />
              </svg>
              Enregistrer
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-w-0" style={{ overflow: 'hidden' }}>
          {/* ── left rail ── */}
          {!preview && (
            <>
              <nav className="ed-noprint flex flex-col items-center gap-1 py-3 shrink-0"
                   style={{ width: 62, background: '#fff', borderRight: `1px solid ${K.border}` }}>
                {TABS.map(t => {
                  const on = tab === t.id;
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)} title={t.label}
                            className="flex flex-col items-center justify-center gap-1 rounded-lg transition-all"
                            style={{ width: 48, height: 50, background: on ? K.primary50 : 'transparent',
                                     color: on ? K.primary : K.subtle }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth={on ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                      <span style={{ fontSize: 8.5, fontWeight: on ? 600 : 500, letterSpacing: '.01em' }}>{t.label}</span>
                    </button>
                  );
                })}
              </nav>

              <aside className="ed-noprint ed-scroll overflow-y-auto shrink-0 p-4"
                     style={{ width: 292, background: '#fff', borderRight: `1px solid ${K.border}` }}>
                {tab === 'elements' && (
                  <window.RxElementsPanel config={config} doctor={doctor}
                                          onAdd={addElement} onAddContact={addContact} onLogoUpload={handleLogo} />
                )}
                {tab === 'properties' && (
                  <window.RxPropertiesPanel el={selected} onChange={updateEl}
                                            onDelete={deleteEl} onDuplicate={duplicateEl} />
                )}
                {tab === 'layers' && (
                  <window.RxLayersPanel config={config} doctor={doctor} selectedId={selectedId}
                                        onSelect={(id) => { setSelectedId(id); }}
                                        onChange={updateEl} onReorder={reorder} onDelete={deleteEl} />
                )}
              </aside>
            </>
          )}

          {/* ── canvas ── */}
          <main className="ed-scroll flex-1 min-w-0 overflow-auto flex items-start justify-center"
                style={{ padding: 32 }}>
            <window.RxCanvas config={config} doctor={doctor} zoom={zoom}
                             selectedId={selectedId}
                             onSelect={(id) => { setSelectedId(id); if (id) setTab('properties'); }}
                             onChange={dragUpdate}
                             interactive={!preview} />
          </main>
        </div>

        {/* ── status strip ── */}
        <footer className="ed-noprint flex items-center gap-4 px-4 shrink-0"
                style={{ height: 30, background: '#fff', borderTop: `1px solid ${K.border}`, fontSize: 10.5, color: K.subtle }}>
          <span>A4 · 210 × 297 mm</span>
          <span style={{ color: K.faint }}>·</span>
          <span>{config.elements.length} éléments</span>
          {selected && (
            <>
              <span style={{ color: K.faint }}>·</span>
              <span style={{ color: K.primary, fontWeight: 500 }}>{selected.name}</span>
              <span className="tabular-nums">x {selected.x} mm · y {selected.y} mm</span>
            </>
          )}
          <span className="ml-auto">Flèches : déplacer · ⇧ flèches : 5 mm · ⌘D : dupliquer · Suppr : retirer</span>
        </footer>

        {/* ── JSON drawer ── */}
        {showJson && (
          <div className="ed-noprint fixed inset-0 flex items-center justify-center"
               style={{ background: 'rgba(15,23,42,.55)', zIndex: 70, padding: 24 }}
               onClick={() => setShowJson(false)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl flex flex-col"
                 style={{ width: 620, maxWidth: '100%', maxHeight: '82vh', boxShadow: '0 20px 60px rgba(15,23,42,.3)' }}>
              <div className="flex items-center justify-between px-5" style={{ height: 54, borderBottom: `1px solid ${K.border}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Configuration du modèle</div>
                  <div style={{ fontSize: 11, color: K.subtle }}>Enregistrée dans les paramètres DocEase</div>
                </div>
                <button onClick={() => setShowJson(false)} style={{ color: K.subtle }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <pre className="ed-scroll flex-1 overflow-auto m-0 px-5 py-4"
                   style={{ fontSize: 11, lineHeight: 1.5, fontFamily: 'ui-monospace, Menlo, monospace', color: '#334155', background: K.surface }}>
                {json}
              </pre>
              <div className="flex items-center gap-2 px-5" style={{ height: 60, borderTop: `1px solid ${K.border}` }}>
                <button onClick={() => { navigator.clipboard?.writeText(json); flash('JSON copié'); }}
                        className="rounded-md border px-4" style={{ height: 34, borderColor: K.border, fontSize: 12, fontWeight: 500, color: K.muted }}>
                  Copier
                </button>
                <button onClick={download}
                        className="rounded-md border px-4" style={{ height: 34, borderColor: K.border, fontSize: 12, fontWeight: 500, color: K.muted }}>
                  Télécharger .json
                </button>
                <button onClick={() => { commit(window.rxDefaultConfig()); setSelectedId(null); flash('Modèle réinitialisé'); }}
                        className="ml-auto rounded-md px-4 text-white" style={{ height: 34, background: 'var(--color-danger, #E53E3E)', fontSize: 12, fontWeight: 500 }}>
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="ed-noprint fixed rounded-lg px-4 flex items-center gap-2 text-white"
               style={{ right: 20, bottom: 46, height: 40, background: K.primary, zIndex: 80,
                        boxShadow: '0 8px 24px rgba(15,23,42,.24)', fontSize: 12.5, fontWeight: 500 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>
            {toast}
          </div>
        )}
      </div>
    );
  }

  Object.assign(window, { RxPrescriptionEditor });
})();
