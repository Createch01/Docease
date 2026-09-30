/* Ordonnance editor — full control panel (header / body / footer / extras).
   Plain controlled inputs; every change calls `set(path, value)` which the
   host merges into `appearance` immutably.
*/

import React, { useState } from 'react';
import { RxIcon, RX_ICON_LABELS } from '../editor/RxContactIcons';
import { OrdonnanceAppearance, OrdDoctor, OrdTheme, FooterField, ORD_THEMES } from './ordonnanceModel';

const T = {
  ink: '#1A202C', muted: '#4A5568', subtle: '#718096', faint: '#A0AEC0',
  border: '#E2E8F0', surface: '#F7FAFC', primary: '#1A6B8A', primary50: '#E8F0F4', danger: '#E53E3E',
};

const Row: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, children, hint }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between mb-1.5">
      <span style={{ fontSize: 10.5, fontWeight: 500, color: T.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      {hint != null && <span style={{ fontSize: 10, color: T.faint }} className="tabular-nums">{hint}</span>}
    </div>
    {children}
  </div>
);

const Divider = () => <div className="my-3" style={{ borderTop: `1px solid ${T.border}` }} />;

const Slider: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void }> = ({ value, min, max, step = 1, onChange }) => (
  <input type="range" className="ed-range w-full" value={value} min={min} max={max} step={step}
         onChange={e => onChange(parseFloat(e.target.value))} />
);

const ColorInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <label className="relative rounded-md shrink-0" style={{ width: 30, height: 30, background: value, border: `1px solid ${T.border}` }}>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
    </label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
           className="flex-1 min-w-0 rounded-md border px-2 uppercase" style={{ height: 30, borderColor: T.border, fontSize: 11.5, color: T.ink }} />
  </div>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label?: string }> = ({ on, onChange, label }) => (
  <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-left">
    <span className="relative rounded-full transition-all shrink-0" style={{ width: 34, height: 19, background: on ? T.primary : '#CBD5E0' }}>
      <span className="absolute rounded-full bg-white transition-all" style={{ width: 15, height: 15, top: 2, left: on ? 17 : 2, boxShadow: '0 1px 2px rgba(15,23,42,.2)' }} />
    </span>
    {label && <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>{label}</span>}
  </button>
);

function Segmented<V extends string>({ options, value, onChange }: { options: { id: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <div className="flex rounded-md p-0.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button type="button" key={o.id} onClick={() => onChange(o.id)}
                  className="flex-1 rounded transition-all" style={{ height: 26, fontSize: 11, fontWeight: on ? 600 : 500,
                    background: on ? '#fff' : 'transparent', color: on ? T.primary : T.subtle,
                    boxShadow: on ? '0 1px 2px rgba(15,23,42,.08)' : 'none' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const UploadZone: React.FC<{ label: string; hasFile: boolean; onFile: (f: File) => void; onClear: () => void }> = ({ label, hasFile, onFile, onClear }) => {
  const [drag, setDrag] = useState(false);
  const pick = (f?: File | null) => { if (f) onFile(f); };
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
        <button type="button" onClick={e => { e.preventDefault(); onClear(); }} style={{ color: T.danger }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
      <input type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border mb-3" style={{ borderColor: T.border, background: '#fff' }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2.5 px-3" style={{ height: 42 }}>
        <span style={{ color: T.primary }}>{icon}</span>
        <span className="flex-1 text-left" style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{title}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.subtle} strokeWidth="2.2"
             style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div className="px-3 pb-3.5" style={{ borderTop: `1px solid ${T.border}` }}><div className="pt-3">{children}</div></div>}
    </div>
  );
};

const DOCTOR_FIELDS: [keyof OrdDoctor, string, 'rtl'?][] = [
  ['name', 'Nom (FR)'], ['nameAr', 'Nom (AR)', 'rtl'], ['speciality', 'Spécialité (FR)'], ['specialityAr', 'Spécialité (AR)', 'rtl'],
  ['addressFr', 'Adresse (FR)'], ['addressAr', 'Adresse (AR)', 'rtl'], ['phone', 'Téléphone'], ['gsm', 'GSM'],
  ['fax', 'Fax'], ['email', 'E-mail'], ['website', 'Site web'], ['registrationNumber', "N° d'ordre"],
  ['inpe', 'INPE'], ['ice', 'ICE'], ['taxId', 'IF'],
];

const FOOTER_FIELDS: { id: FooterField; label: string }[] = [
  { id: 'address', label: 'Adresse' }, { id: 'phone', label: 'Téléphone' }, { id: 'gsm', label: 'GSM' },
  { id: 'email', label: 'E-mail' }, { id: 'fax', label: 'Fax' }, { id: 'website', label: 'Site web' },
];

const FOOTER_ICON_CHOICES: Record<FooterField, string[]> = {
  address: ['location', 'address'], phone: ['phone', 'cellphone'], gsm: ['cellphone', 'phone'],
  email: ['mail'], fax: ['fax', 'phone'], website: ['website'],
};

export interface OrdonnanceControlsProps {
  appearance: OrdonnanceAppearance;
  set: (path: string, value: unknown) => void;
  doctor: OrdDoctor;
  onBodyLogoFile: (f: File) => void;
  onClearBodyLogo: () => void;
  onEditCabinet?: () => void;
  onEditProfile?: () => void;
}

const EditCabinetLink: React.FC<{ onClick?: () => void; label?: string }> = ({ onClick, label = 'Modifier dans Cabinet' }) =>
  onClick ? (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 600, color: T.primary }}>
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 17 17 7M8 7h9v9" /></svg>
    </button>
  ) : null;

const OrdonnanceControls: React.FC<OrdonnanceControlsProps> = ({ appearance: A, set, doctor, onBodyLogoFile, onClearBodyLogo, onEditCabinet, onEditProfile }) => {
  const applyTheme = (t: Pick<OrdTheme, 'badge' | 'accent' | 'footerBg' | 'footerText' | 'nameColor'>) => {
    set('badge.bg', t.badge);
    set('drugList.accentColor', t.accent);
    set('footer.bg', t.footerBg);
    set('footer.textColor', t.footerText);
    set('header.name.color', t.nameColor);
  };
  const shade = (hex: string, f: number) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const applyCustom = (hex: string) => applyTheme({ badge: hex, accent: hex, footerBg: hex, footerText: '#FFFFFF', nameColor: shade(hex, 0.72) });
  const isPreset = ORD_THEMES.some(t => t.badge.toLowerCase() === (A.badge.bg || '').toLowerCase());

  return (
    <div className="space-y-1">
      {!doctor.inpe && (
        <div role="alert" className="rounded-lg border mb-3 px-3 py-2.5 flex gap-2.5" style={{ borderColor: '#F6AD55', background: '#FFFAF0' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C05621" strokeWidth="2" className="shrink-0" style={{ marginTop: 1 }}>
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <div className="min-w-0">
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9C4221' }}>INPE manquant — obligatoire sur l'ordonnance</div>
            <div style={{ fontSize: 10.5, color: '#9C4221', opacity: 0.85, margin: '2px 0 4px' }}>La feuille affiche « — » tant qu'il n'est pas renseigné (Mon profil › Identifiants professionnels).</div>
            <EditCabinetLink onClick={onEditProfile} label="Renseigner l'INPE" />
          </div>
        </div>
      )}

      {/* ── THEME ── */}
      <div className="rounded-lg border mb-3 px-3 py-3" style={{ borderColor: T.border, background: '#fff' }}>
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontSize: 10.5, fontWeight: 500, color: T.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>Thème de couleurs</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {ORD_THEMES.map(t => {
            const on = t.badge.toLowerCase() === (A.badge.bg || '').toLowerCase();
            return (
              <button type="button" key={t.id} onClick={() => applyTheme(t)} className="flex flex-col items-center gap-1" title={t.label}>
                <span className="rounded-full" style={{ width: 26, height: 26, background: t.badge, border: '2px solid #fff', boxShadow: `0 0 0 ${on ? 2 : 1}px ${on ? T.primary : T.border}` }} />
                <span style={{ fontSize: 9, color: on ? T.primary : T.subtle, fontWeight: on ? 600 : 400 }}>{t.label}</span>
              </button>
            );
          })}
          <label className="flex flex-col items-center gap-1 cursor-pointer" title="Choisir une couleur">
            <span className="relative rounded-full flex items-center justify-center"
                  style={{ width: 26, height: 26, border: '2px solid #fff', boxShadow: `0 0 0 ${!isPreset ? 2 : 1}px ${!isPreset ? T.primary : T.border}`,
                           background: !isPreset ? A.badge.bg : 'conic-gradient(#E53E3E,#F6AD55,#48BB78,#4299E1,#805AD5,#E53E3E)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              <input type="color" value={A.badge.bg || '#12496B'} onChange={e => applyCustom(e.target.value)}
                     style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            </span>
            <span style={{ fontSize: 9, color: !isPreset ? T.primary : T.subtle, fontWeight: !isPreset ? 600 : 400 }}>Personnalisé</span>
          </label>
        </div>
        <p style={{ fontSize: 10, color: T.faint, marginTop: 8 }}>
          Applique une palette d'un coup ; chaque couleur reste modifiable ensuite. Ce design démarre toujours sur le style classique DocEase — libre à vous de tout changer.
        </p>
      </div>

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
        <Row label="Diplômes / titres">
          <Toggle on={A.header.diplomas.show} onChange={v => set('header.diplomas.show', v)} label={A.header.diplomas.show ? 'Visibles' : 'Masqués'} />
        </Row>
        <Row label="Numéro d'ordre">
          <Toggle on={A.header.registration.show} onChange={v => set('header.registration.show', v)} label={A.header.registration.show ? 'Visible' : 'Masqué'} />
        </Row>

        <Divider />

        <Row label="Logo">
          <div className="flex items-center gap-2">
            {doctor.logoUrl && <img src={doctor.logoUrl} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />}
            <p style={{ fontSize: 10, color: T.faint }}>{doctor.logoUrl ? 'Logo du cabinet.' : 'Aucun logo de cabinet.'}</p>
          </div>
          <EditCabinetLink onClick={onEditCabinet} label={doctor.logoUrl ? 'Changer dans Cabinet › Logo' : 'Choisir dans Cabinet › Logo'} />
        </Row>
        <Row label="Afficher le logo">
          <Toggle on={A.header.logo.show} onChange={v => set('header.logo.show', v)} />
        </Row>
        {A.header.logo.show && (
          <>
            <Row label="Position horizontale">
              <Segmented value={A.header.logo.position} onChange={v => set('header.logo.position', v)}
                         options={[{ id: 'left', label: 'Gauche' }, { id: 'center', label: 'Centre' }, { id: 'right', label: 'Droite' }]} />
            </Row>
            <Row label="Position verticale">
              <Segmented value={A.header.logo.verticalAlign} onChange={v => set('header.logo.verticalAlign', v)}
                         options={[{ id: 'top', label: 'Haut' }, { id: 'center', label: 'Centre' }, { id: 'bottom', label: 'Bas' }]} />
            </Row>
            <Row label="Taille du logo" hint={`${A.header.logo.size}px`}>
              <Slider value={A.header.logo.size} min={40} max={120} onChange={v => set('header.logo.size', v)} />
            </Row>
            <Row label="Fond derrière le logo">
              <Toggle on={A.header.logo.bgShow} onChange={v => set('header.logo.bgShow', v)} />
            </Row>
            {A.header.logo.bgShow && (
              <Row label="Couleur du fond"><ColorInput value={A.header.logo.bgColor} onChange={v => set('header.logo.bgColor', v)} /></Row>
            )}
            <Row label="Opacité du logo" hint={`${Math.round(A.header.logo.opacity * 100)}%`}>
              <Slider value={A.header.logo.opacity} min={0.2} max={1} step={0.05} onChange={v => set('header.logo.opacity', v)} />
            </Row>
          </>
        )}

        <Divider />

        <Row label="Fond de l'en-tête"><ColorInput value={A.header.bg} onChange={v => set('header.bg', v)} /></Row>
        <Row label="Opacité du fond" hint={`${Math.round(A.header.bgOpacity * 100)}%`}>
          <Slider value={A.header.bgOpacity} min={0} max={1} step={0.05} onChange={v => set('header.bgOpacity', v)} />
        </Row>

        <Divider />

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
        <Row label="Bandeau de titre">
          <Toggle on={A.badge.show} onChange={v => set('badge.show', v)} label={A.badge.show ? 'Visible' : 'Masqué'} />
        </Row>
        {A.badge.show && (
          <>
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
          </>
        )}

        <Divider />

        <div className="rounded-md p-2.5 mb-1" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Logo central (zone médicaments)</div>
          <Row label="Image (indépendante de l’en-tête)">
            <UploadZone label="Importer un logo" hasFile={!!A.bodyLogo.url} onFile={onBodyLogoFile} onClear={onClearBodyLogo} />
          </Row>
          <Row label="Afficher">
            <Toggle on={A.bodyLogo.show} onChange={v => set('bodyLogo.show', v)} label={A.bodyLogo.show ? 'Visible en filigrane, derrière les médicaments' : 'Masqué'} />
          </Row>
          {A.bodyLogo.show && (
            <>
              <Row label="Taille" hint={`${A.bodyLogo.size}px`}>
                <Slider value={A.bodyLogo.size} min={60} max={280} onChange={v => set('bodyLogo.size', v)} />
              </Row>
              <Row label="Opacité" hint={`${Math.round(A.bodyLogo.opacity * 100)}%`}>
                <Slider value={A.bodyLogo.opacity} min={0.03} max={0.20} step={0.01} onChange={v => set('bodyLogo.opacity', v)} />
              </Row>
              <p style={{ fontSize: 10.5, color: T.faint, marginTop: -4 }}>
                Centré derrière la liste des médicaments, en arrière-plan. Reste discret par défaut pour ne jamais gêner la lecture — augmentez l'opacité avec précaution.
              </p>
            </>
          )}
        </div>

        <Divider />

        <Row label="Champs affichés">
          <div className="grid grid-cols-2 gap-2">
            <Toggle on={A.patientLine.showAge} onChange={v => set('patientLine.showAge', v)} label="Âge" />
            <Toggle on={A.patientLine.showSex} onChange={v => set('patientLine.showSex', v)} label="Sexe" />
            <Toggle on={A.patientLine.showDate} onChange={v => set('patientLine.showDate', v)} label="Date" />
            <Toggle on={A.patientLine.showWeight} onChange={v => set('patientLine.showWeight', v)} label="Poids" />
          </div>
        </Row>
        <Row label="Style de la ligne patient">
          <Segmented value={A.patientLine.style} onChange={v => set('patientLine.style', v)}
                     options={[{ id: 'dotted', label: 'Pointillé' }, { id: 'dashed', label: 'Tirets' }, { id: 'solid', label: 'Continu' }, { id: 'none', label: 'Aucune' }]} />
        </Row>

        <Divider />

        <Row label="Style de la liste">
          <Segmented value={A.drugList.style} onChange={v => set('drugList.style', v)}
                     options={[{ id: 'bar', label: 'Barre' }, { id: 'simple', label: 'Numéros' }, { id: 'bullet', label: 'Puces' }]} />
        </Row>
        <Row label="Couleur d'accent"><ColorInput value={A.drugList.accentColor} onChange={v => set('drugList.accentColor', v)} /></Row>
        <Row label="Espacement entre médicaments" hint={`${A.drugList.itemGap}px`}>
          <Slider value={A.drugList.itemGap} min={4} max={24} onChange={v => set('drugList.itemGap', v)} />
        </Row>

        <Divider />

        <Row label="Notes du médecin (texte libre)">
          <Toggle on={A.freeNotes.show} onChange={v => set('freeNotes.show', v)} label={A.freeNotes.show ? 'Visible' : 'Masquées'} />
        </Row>
        {A.freeNotes.show && (
          <>
            <Row label="Texte">
              <textarea value={A.freeNotes.text} onChange={e => set('freeNotes.text', e.target.value)} rows={3}
                        placeholder="Ex : conseils, recommandations, mise en garde…"
                        className="w-full rounded-md border px-2.5 py-2 resize-none" style={{ borderColor: T.border, fontSize: 12 }} />
            </Row>
            <Row label="Taille du texte" hint={`${A.freeNotes.fontSize}px`}>
              <Slider value={A.freeNotes.fontSize} min={7.5} max={13} step={0.5} onChange={v => set('freeNotes.fontSize', v)} />
            </Row>
          </>
        )}

        <Divider />

        <Row label="Police">
          <Segmented value={A.fontFamily} onChange={v => set('fontFamily', v)}
                     options={[{ id: 'serif', label: 'Sérif' }, { id: 'sans', label: 'Sans' }, { id: 'arabic', label: 'Arabe' }]} />
        </Row>
      </Section>

      {/* ── COORDONNÉES (lecture seule : source = Paramètres > Cabinet / Mon profil) ── */}
      <Section title="Coordonnées du cabinet" defaultOpen={false} icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>}>
        <div className="flex items-center justify-between gap-2" style={{ marginTop: -2, marginBottom: 10 }}>
          <p style={{ fontSize: 10.5, color: T.faint }}>Lecture seule — issues de votre profil et du cabinet.</p>
          <span className="flex items-center gap-3 shrink-0">
            <EditCabinetLink onClick={onEditProfile} label="Mon profil" />
            <EditCabinetLink onClick={onEditCabinet} />
          </span>
        </div>
        <dl className="space-y-1.5" style={{ margin: 0 }}>
          {DOCTOR_FIELDS.map(([k, label, dir]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="shrink-0" style={{ width: 92, fontSize: 10.5, fontWeight: 500, color: T.subtle, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</dt>
              <dd dir={dir || 'ltr'} className="flex-1 min-w-0 break-words" style={{ margin: 0, fontSize: 12, color: doctor[k] ? T.ink : T.faint, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
                {doctor[k] || '—'}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── FOOTER ── */}
      <Section title="Pied de page" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="15" width="18" height="6" rx="1" /><path d="M3 15V6a1 1 0 011-1h16a1 1 0 011 1v9" /></svg>}>
        <Row label="Couleur du fond"><ColorInput value={A.footer.bg} onChange={v => set('footer.bg', v)} /></Row>
        <Row label="Couleur du texte"><ColorInput value={A.footer.textColor} onChange={v => set('footer.textColor', v)} /></Row>
        <Row label="Disposition">
          <Segmented value={A.footer.layout} onChange={v => set('footer.layout', v)}
                     options={[{ id: 'row', label: 'Sur une ligne' }, { id: 'stacked', label: 'Empilée' }]} />
        </Row>

        <Divider />

        <Row label="Taille du texte" hint={`${A.footer.fontSize}px`}>
          <Slider value={A.footer.fontSize} min={6} max={12} step={0.5} onChange={v => set('footer.fontSize', v)} />
        </Row>

        <Divider />

        {!A.footer.showIcons && (
          <Row label="Informations affichées">
            <div className="grid grid-cols-2 gap-2">
              {FOOTER_FIELDS.map(f => (
                <Toggle key={f.id} on={!!A.footer.show[f.id]} onChange={v => set(`footer.show.${f.id}`, v)} label={f.label} />
              ))}
            </div>
          </Row>
        )}

        <Divider />

        <Row label="Icônes de contact">
          <Toggle on={A.footer.showIcons} onChange={v => set('footer.showIcons', v)} label={A.footer.showIcons ? 'Visibles' : 'Masquées'} />
        </Row>
        {A.footer.showIcons && (
          <>
            <Row label="Style">
              <Segmented value={A.footer.icons.style} onChange={v => set('footer.icons.style', v)}
                         options={[{ id: 'outline', label: 'Contour' }, { id: 'filled', label: 'Plein' }]} />
            </Row>
            <Row label="Taille des icônes" hint={`${A.footer.icons.size}px`}>
              <Slider value={A.footer.icons.size} min={6} max={18} step={0.5} onChange={v => set('footer.icons.size', v)} />
            </Row>
            {A.footer.icons.style === 'outline' && (
              <Row label="Épaisseur du trait" hint={A.footer.icons.strokeWidth}>
                <Slider value={A.footer.icons.strokeWidth} min={1} max={3} step={0.1} onChange={v => set('footer.icons.strokeWidth', v)} />
              </Row>
            )}
            <Row label="Couleur des icônes">
              <div className="flex items-center gap-2">
                <div className="flex-1"><ColorInput value={A.footer.icons.color || A.footer.textColor} onChange={v => set('footer.icons.color', v)} /></div>
                {A.footer.icons.color && (
                  <button type="button" onClick={() => set('footer.icons.color', '')} style={{ fontSize: 10.5, color: T.primary, fontWeight: 500 }}>Auto</button>
                )}
              </div>
            </Row>
            <Row label="Pastille ronde derrière l'icône">
              <Toggle on={A.footer.icons.badge} onChange={v => set('footer.icons.badge', v)} />
            </Row>
            {A.footer.icons.badge && (
              <>
                <Row label="Couleur de la pastille"><ColorInput value={A.footer.icons.badgeBg} onChange={v => set('footer.icons.badgeBg', v)} /></Row>
                <Row label="Couleur de l'icône sur pastille"><ColorInput value={A.footer.icons.badgeColor || A.footer.bg} onChange={v => set('footer.icons.badgeColor', v)} /></Row>
              </>
            )}
            <Row label="Informations affichées et icônes">
              <div className="space-y-1.5">
                {FOOTER_FIELDS.map(f => (
                  <div key={f.id} className="flex items-center gap-2">
                    <Toggle on={!!A.footer.show[f.id]} onChange={v => set(`footer.show.${f.id}`, v)} />
                    <span style={{ width: 62, fontSize: 11, color: A.footer.show[f.id] ? T.muted : T.faint }}>{f.label}</span>
                    <div className="flex gap-1 flex-1" style={{ opacity: A.footer.show[f.id] ? 1 : 0.35, pointerEvents: A.footer.show[f.id] ? 'auto' : 'none' }}>
                      {FOOTER_ICON_CHOICES[f.id].map(k => {
                        const on = A.footer.icons.map[f.id] === k;
                        return (
                          <button type="button" key={k} title={RX_ICON_LABELS[k]} onClick={() => set(`footer.icons.map.${f.id}`, k)}
                                  className="flex items-center justify-center rounded"
                                  style={{ width: 24, height: 24, border: `1px solid ${on ? T.primary : T.border}`, background: on ? T.primary50 : '#fff', color: on ? T.primary : T.muted }}>
                            <RxIcon name={k} style={A.footer.icons.style} size={13} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Row>
          </>
        )}

        <Divider />

        <Row label="Pied de page arabe">
          <Toggle on={A.footer.arabic.show} onChange={v => set('footer.arabic.show', v)} />
        </Row>
      </Section>

      {/* ── EXTRAS ── */}
      <Section title="Extras" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2 3 7v6l9 5 9-5V7z" /></svg>}>
        <Row label="Zone signature et cachet">
          <Toggle on={A.signatureZone.show} onChange={v => set('signatureZone.show', v)} label={A.signatureZone.show ? 'Visible (espace vide à signer)' : 'Masquée'} />
        </Row>
        {A.signatureZone.show && (
          <>
            <Row label="Position">
              <Segmented value={A.signatureZone.position} onChange={v => set('signatureZone.position', v)}
                         options={[{ id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' }]} />
            </Row>
            <Row label="Libellé">
              <input type="text" value={A.signatureZone.label} onChange={e => set('signatureZone.label', e.target.value)}
                     className="w-full rounded-md border px-2.5" style={{ height: 32, borderColor: T.border, fontSize: 12 }} />
            </Row>
            <Row label="Hauteur de la zone" hint={`${A.signatureZone.height}mm`}>
              <Slider value={A.signatureZone.height} min={15} max={50} onChange={v => set('signatureZone.height', v)} />
            </Row>
          </>
        )}

        <Divider />

        <Row label="Code QR"><Toggle on={A.qr.show} onChange={v => set('qr.show', v)} label={A.qr.show ? 'Visible dans le pied de page' : 'Masqué'} /></Row>
        {A.qr.show && (
          <>
            <Row label="Position">
              <Segmented value={A.qr.position} onChange={v => set('qr.position', v)}
                         options={[{ id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' }]} />
            </Row>
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

        <Divider />

        <Row label="Code-barres"><Toggle on={A.barcode.show} onChange={v => set('barcode.show', v)} label={A.barcode.show ? 'Visible (référence ordonnance)' : 'Masqué'} /></Row>
        {A.barcode.show && (
          <>
            <Row label="Position">
              <Segmented value={A.barcode.position} onChange={v => set('barcode.position', v)}
                         options={[{ id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' }]} />
            </Row>
            <Row label="Référence encodée">
              <input type="text" value={A.barcode.value} placeholder="Auto (référence ordonnance)"
                     onChange={e => set('barcode.value', e.target.value)}
                     className="w-full rounded-md border px-2.5" style={{ height: 32, borderColor: T.border, fontSize: 12 }} />
            </Row>
          </>
        )}

        <Divider />

        <Row label="Filigrane">
          <Toggle on={A.watermark.show} onChange={v => set('watermark.show', v)} label={A.watermark.show ? 'Visible' : 'Masqué'} />
        </Row>
        {A.watermark.show && (
          <>
            <Row label="Type">
              <Segmented value={A.watermark.type} onChange={v => set('watermark.type', v)}
                         options={[{ id: 'image', label: 'Logo du cabinet' }, { id: 'text', label: 'Texte libre' }]} />
            </Row>
            {A.watermark.type === 'text' && (
              <Row label="Texte du filigrane">
                <input type="text" value={A.watermark.text} onChange={e => set('watermark.text', e.target.value)}
                       placeholder="Ex : COPIE"
                       className="w-full rounded-md border px-2.5" style={{ height: 32, borderColor: T.border, fontSize: 12 }} />
              </Row>
            )}
            <Row label="Position">
              <Segmented value={A.watermark.position} onChange={v => set('watermark.position', v)}
                         options={[{ id: 'center', label: 'Centre' }, { id: 'top-left', label: 'Haut gauche' }, { id: 'bottom-right', label: 'Bas droite' }]} />
            </Row>
            <Row label="Taille" hint={`${A.watermark.size}px`}>
              <Slider value={A.watermark.size} min={80} max={300} onChange={v => set('watermark.size', v)} />
            </Row>
            <Row label="Opacité" hint={`${Math.round(A.watermark.opacity * 100)}%`}>
              <Slider value={A.watermark.opacity} min={0.03} max={0.10} step={0.005} onChange={v => set('watermark.opacity', v)} />
            </Row>
            <p style={{ fontSize: 10.5, color: T.faint, marginTop: -4 }}>
              À l'impression, l'opacité ne dépasse jamais 10%.
            </p>
          </>
        )}

        <Divider />

        <Row label="Format papier">
          <Segmented value={A.paperSize} onChange={v => set('paperSize', v)}
                     options={[{ id: 'A4', label: 'A4' }, { id: 'A5', label: 'A5' }]} />
        </Row>
        <Row label="Marges — horizontales" hint={`${A.margins.horizontal}mm`}>
          <Slider value={A.margins.horizontal} min={5} max={25} onChange={v => set('margins.horizontal', v)} />
        </Row>
        <Row label="Marges — haut" hint={`${A.margins.top}mm`}>
          <Slider value={A.margins.top} min={4} max={20} onChange={v => set('margins.top', v)} />
        </Row>
        <Row label="Marges — bas" hint={`${A.margins.bottom}mm`}>
          <Slider value={A.margins.bottom} min={2} max={20} onChange={v => set('margins.bottom', v)} />
        </Row>
      </Section>
    </div>
  );
};

export default OrdonnanceControls;
