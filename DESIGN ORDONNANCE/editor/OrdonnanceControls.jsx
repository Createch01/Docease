/* Ordonnance editor — full control panel (header / body / footer / extras).
   Plain controlled inputs; every change calls `set(path, value)` which the
   host merges into `appearance` immutably.
   Exports (window): OrdonnanceControls
*/
(() => {
const { useState } = React;

const T = {
  ink: '#1A202C', muted: '#4A5568', subtle: '#718096', faint: '#A0AEC0',
  border: '#E2E8F0', surface: '#F7FAFC', primary: '#1A6B8A', primary50: '#E8F0F4', danger: '#E53E3E',
};

const Row = ({ label, children, hint }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between mb-1.5">
      <span style={{ fontSize: 10.5, fontWeight: 500, color: T.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      {hint != null && <span style={{ fontSize: 10, color: T.faint }} className="tabular-nums">{hint}</span>}
    </div>
    {children}
  </div>
);

const Slider = ({ value, min, max, step = 1, onChange }) => (
  <input type="range" className="ed-range w-full" value={value} min={min} max={max} step={step}
         onChange={e => onChange(parseFloat(e.target.value))} />
);

const ColorInput = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <label className="relative rounded-md shrink-0" style={{ width: 30, height: 30, background: value, border: `1px solid ${T.border}` }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
    </label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
           className="flex-1 rounded-md border px-2 uppercase" style={{ height: 30, borderColor: T.border, fontSize: 11.5, color: T.ink }} />
  </div>
);

const Toggle = ({ on, onChange, label }) => (
  <button onClick={() => onChange(!on)} className="flex items-center gap-2">
    <span className="relative rounded-full transition-all shrink-0" style={{ width: 34, height: 19, background: on ? T.primary : '#CBD5E0' }}>
      <span className="absolute rounded-full bg-white transition-all" style={{ width: 15, height: 15, top: 2, left: on ? 17 : 2, boxShadow: '0 1px 2px rgba(15,23,42,.2)' }} />
    </span>
    {label && <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>{label}</span>}
  </button>
);

const Segmented = ({ options, value, onChange }) => (
  <div className="flex rounded-md p-0.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
    {options.map(o => {
      const on = o.id === value;
      return (
        <button key={o.id} onClick={() => onChange(o.id)}
                className="flex-1 rounded transition-all" style={{ height: 26, fontSize: 11, fontWeight: on ? 600 : 500,
                  background: on ? '#fff' : 'transparent', color: on ? T.primary : T.subtle,
                  boxShadow: on ? '0 1px 2px rgba(15,23,42,.08)' : 'none' }}>
          {o.label}
        </button>
      );
    })}
  </div>
);

const UploadZone = ({ label, hasFile, onFile, onClear }) => {
  const [drag, setDrag] = useState(false);
  const pick = (f) => { if (f) onFile(f); };
  return (
    <label
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
      className="flex items-center gap-2.5 rounded-lg cursor-pointer px-3 transition-all"
      style={{ height: 46, border: `1.5px dashed ${drag ? T.primary : T.border}`, background: drag ? T.primary50 : '#fff' }}>
      <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 26, height: 26, background: T.primary50, color: T.primary }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontSize: 12, fontWeight: 500, color: T.ink }}>{hasFile ? 'Remplacer' : label}</span>
        <span className="block" style={{ fontSize: 10, color: T.faint }}>Glisser une image ou cliquer</span>
      </span>
      {hasFile && (
        <button onClick={(e) => { e.preventDefault(); onClear(); }} style={{ color: T.danger }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
      <input type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
    </label>
  );
};

const Section = ({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border mb-3" style={{ borderColor: T.border, background: '#fff' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2.5 px-3" style={{ height: 42 }}>
        <span style={{ color: T.primary }}>{icon}</span>
        <span className="flex-1 text-left" style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{title}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.subtle} strokeWidth="2.2"
             style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div className="px-3 pb-3.5" style={{ borderTop: `1px solid ${T.border}` }}><div className="pt-3">{children}</div></div>}
    </div>
  );
};

function OrdonnanceControls({ appearance, set, doctor, onLogoFile, onSignatureFile, onClearLogo, onClearSignature }) {
  const A = appearance;

  return (
    <div className="space-y-1">
      {/* ── HEADER ── */}
      <Section title="En-tête" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 6h16M4 12h16M4 18h16" /></svg>}>
        <Row label="Nom du médecin" hint={`${A.header.name.fontSize}px`}>
          <Slider value={A.header.name.fontSize} min={12} max={36} onChange={v => set('header.name.fontSize', v)} />
        </Row>
        <Row label="Couleur du nom"><ColorInput value={A.header.name.color} onChange={v => set('header.name.color', v)} /></Row>
        <Row label="Position">
          <Segmented value={A.header.name.align} onChange={v => set('header.name.align', v)}
                     options={[{ id: 'left', label: 'Gauche' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Droite' }]} />
        </Row>
        <Row label="Spécialité">
          <Toggle on={A.header.speciality.show} onChange={v => set('header.speciality.show', v)} label={A.header.speciality.show ? 'Visible' : 'Masquée'} />
        </Row>
        {A.header.speciality.show && (
          <Row label="Taille spécialité" hint={`${A.header.speciality.fontSize}px`}>
            <Slider value={A.header.speciality.fontSize} min={7} max={16} step={0.5} onChange={v => set('header.speciality.fontSize', v)} />
          </Row>
        )}

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Logo du cabinet">
          <UploadZone label="Importer un logo" hasFile={!!doctor.logoUrl} onFile={onLogoFile} onClear={onClearLogo} />
        </Row>
        <Row label="Afficher le logo">
          <Toggle on={A.header.logo.show} onChange={v => set('header.logo.show', v)} />
        </Row>
        {A.header.logo.show && (
          <>
            <Row label="Position du logo">
              <Segmented value={A.header.logo.position} onChange={v => set('header.logo.position', v)}
                         options={[{ id: 'left', label: 'Gauche' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Droite' }]} />
            </Row>
            <Row label="Taille du logo" hint={`${A.header.logo.size}px`}>
              <Slider value={A.header.logo.size} min={40} max={120} onChange={v => set('header.logo.size', v)} />
            </Row>
          </>
        )}

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Fond de l'en-tête"><ColorInput value={A.header.bg} onChange={v => set('header.bg', v)} /></Row>
        <Row label="Opacité du fond" hint={`${Math.round(A.header.bgOpacity * 100)}%`}>
          <Slider value={A.header.bgOpacity} min={0} max={1} step={0.05} onChange={v => set('header.bgOpacity', v)} />
        </Row>

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Version arabe (droite)">
          <Toggle on={A.header.arabic.show} onChange={v => set('header.arabic.show', v)} label={A.header.arabic.show ? 'Visible' : 'Masquée'} />
        </Row>
        {A.header.arabic.show && (
          <>
            <Row label="Taille nom arabe" hint={`${A.header.arabic.nameFontSize}px`}>
              <Slider value={A.header.arabic.nameFontSize} min={10} max={24} onChange={v => set('header.arabic.nameFontSize', v)} />
            </Row>
            <Row label="Taille spécialité arabe" hint={`${A.header.arabic.specialityFontSize}px`}>
              <Slider value={A.header.arabic.specialityFontSize} min={6} max={14} step={0.5} onChange={v => set('header.arabic.specialityFontSize', v)} />
            </Row>
          </>
        )}
      </Section>

      {/* ── BODY ── */}
      <Section title="Corps" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" /></svg>}>
        <Row label="Texte du badge">
          <input type="text" value={A.badge.text} onChange={e => set('badge.text', e.target.value)}
                 className="w-full rounded-md border px-2.5" style={{ height: 32, borderColor: T.border, fontSize: 12.5 }} />
        </Row>
        <Row label="Couleur du badge"><ColorInput value={A.badge.bg} onChange={v => set('badge.bg', v)} /></Row>
        <Row label="Couleur du texte"><ColorInput value={A.badge.color} onChange={v => set('badge.color', v)} /></Row>
        <Row label="Taille du texte" hint={`${A.badge.fontSize}px`}>
          <Slider value={A.badge.fontSize} min={9} max={20} onChange={v => set('badge.fontSize', v)} />
        </Row>
        <Row label="Arrondi (rectangle → pilule)" hint={A.badge.radius >= 60 ? 'Pilule' : `${A.badge.radius}px`}>
          <Slider value={A.badge.radius} min={0} max={999} step={2} onChange={v => set('badge.radius', v)} />
        </Row>

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Style de la ligne patient">
          <Segmented value={A.patientLine.style} onChange={v => set('patientLine.style', v)}
                     options={[{ id: 'dotted', label: 'Pointillé' }, { id: 'dashed', label: 'Tirets' }, { id: 'solid', label: 'Continu' }]} />
        </Row>

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Style de la liste">
          <Segmented value={A.drugList.style} onChange={v => set('drugList.style', v)}
                     options={[{ id: 'bar', label: 'Barre' }, { id: 'simple', label: 'Numéros' }, { id: 'bullet', label: 'Puces' }]} />
        </Row>
        <Row label="Couleur d'accent"><ColorInput value={A.drugList.accentColor} onChange={v => set('drugList.accentColor', v)} /></Row>

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Police">
          <Segmented value={A.fontFamily} onChange={v => set('fontFamily', v)}
                     options={[{ id: 'serif', label: 'Sérif' }, { id: 'sans', label: 'Sans' }, { id: 'arabic', label: 'Arabe' }]} />
        </Row>
      </Section>

      {/* ── FOOTER ── */}
      <Section title="Pied de page" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="15" width="18" height="6" rx="1" /><path d="M3 15V6a1 1 0 011-1h16a1 1 0 011 1v9" /></svg>}>
        <Row label="Couleur du fond"><ColorInput value={A.footer.bg} onChange={v => set('footer.bg', v)} /></Row>
        <Row label="Couleur du texte"><ColorInput value={A.footer.textColor} onChange={v => set('footer.textColor', v)} /></Row>

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <div className="grid grid-cols-2 gap-2 mb-1">
          <Toggle on={A.footer.show.phone} onChange={v => set('footer.show.phone', v)} label="Téléphone" />
          <Toggle on={A.footer.show.email} onChange={v => set('footer.show.email', v)} label="E-mail" />
          <Toggle on={A.footer.show.address} onChange={v => set('footer.show.address', v)} label="Adresse" />
          <Toggle on={A.footer.show.fax} onChange={v => set('footer.show.fax', v)} label="Fax" />
        </div>

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Icônes de contact">
          <Toggle on={A.footer.showIcons} onChange={v => set('footer.showIcons', v)} />
        </Row>
        <Row label="Pied de page arabe">
          <Toggle on={A.footer.arabic.show} onChange={v => set('footer.arabic.show', v)} />
        </Row>
      </Section>

      {/* ── EXTRAS ── */}
      <Section title="Extras" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2 3 7v6l9 5 9-5V7z" /></svg>}>
        <Row label="Code QR"><Toggle on={A.qr.show} onChange={v => set('qr.show', v)} label={A.qr.show ? 'Visible dans le pied de page' : 'Masqué'} /></Row>
        {A.qr.show && (
          <>
            <Row label="Taille" hint={`${A.qr.size}px`}>
              <Slider value={A.qr.size} min={40} max={70} onChange={v => set('qr.size', v)} />
            </Row>
            <Row label="Contenu (adresse / lien Maps)">
              <input type="text" value={A.qr.value} placeholder={doctor.addressFr}
                     onChange={e => set('qr.value', e.target.value)}
                     className="w-full rounded-md border px-2.5" style={{ height: 32, borderColor: T.border, fontSize: 12 }} />
            </Row>
          </>
        )}

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Filigrane (logo du cabinet)">
          <Toggle on={A.watermark.show} onChange={v => set('watermark.show', v)} label={A.watermark.show ? 'Visible' : 'Masqué'} />
        </Row>
        {A.watermark.show && (
          <>
            <Row label="Taille" hint={`${A.watermark.size}px`}>
              <Slider value={A.watermark.size} min={100} max={300} onChange={v => set('watermark.size', v)} />
            </Row>
            <Row label="Opacité" hint={`${Math.round(A.watermark.opacity * 100)}%`}>
              <Slider value={A.watermark.opacity} min={0.03} max={0.10} step={0.005} onChange={v => set('watermark.opacity', v)} />
            </Row>
            <p style={{ fontSize: 10.5, color: T.faint, marginTop: -4 }}>
              Utilise le logo importé dans l'en-tête. À l'impression, l'opacité ne dépasse jamais 8%.
            </p>
          </>
        )}

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Signature / cachet">
          <UploadZone label="Importer une signature" hasFile={!!A.signature.url} onFile={onSignatureFile} onClear={onClearSignature} />
        </Row>
        <Row label="Afficher"><Toggle on={A.signature.show} onChange={v => set('signature.show', v)} /></Row>
        {A.signature.show && (
          <>
            <Row label="Position">
              <Segmented value={A.signature.position} onChange={v => set('signature.position', v)}
                         options={[{ id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' }]} />
            </Row>
            <Row label="Taille" hint={`${A.signature.size}px`}>
              <Slider value={A.signature.size} min={50} max={160} onChange={v => set('signature.size', v)} />
            </Row>
          </>
        )}

        <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />

        <Row label="Format papier">
          <Segmented value={A.paperSize} onChange={v => set('paperSize', v)}
                     options={[{ id: 'A4', label: 'A4' }, { id: 'A5', label: 'A5' }]} />
        </Row>
      </Section>
    </div>
  );
}

Object.assign(window, { OrdonnanceControls });

})();
