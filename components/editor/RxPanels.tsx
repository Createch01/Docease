/* DocEase prescription editor — left-rail panels. */

import React from 'react';
import { DoctorInfo } from '../../types';
import {
  RxEditorElement,
  RxElementType,
  RxLayoutConfig,
  RX_SWATCHES,
  RX_BINDS,
  RX_FONTS,
  rxResolveText,
} from './rxEditorModel';
import { RxIcon, RX_ICON_KEYS, RX_ICON_LABELS } from './RxContactIcons';

const T = {
  ink: 'var(--color-text, #1A202C)',
  muted: 'var(--color-text-muted, #4A5568)',
  subtle: 'var(--color-text-subtle, #718096)',
  faint: 'var(--color-text-faint, #A0AEC0)',
  border: 'var(--color-border, #E2E8F0)',
  surface: 'var(--color-surface-alt, #F7FAFC)',
  primary: 'var(--color-primary, #1A6B8A)',
  primary50: 'var(--color-primary-50, #E8F0F4)',
  danger: 'var(--color-danger, #E53E3E)',
};

/* ── small controls ── */
export const RxField: React.FC<{ label: string; children: React.ReactNode; hint?: string | number | null }> = ({
  label,
  children,
  hint,
}) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between">
      <label className="uppercase" style={{ fontSize: 10, fontWeight: 500, color: T.subtle, letterSpacing: '.07em' }}>
        {label}
      </label>
      {hint != null && (
        <span className="tabular-nums" style={{ fontSize: 10, color: T.faint }}>
          {hint}
        </span>
      )}
    </div>
    {children}
  </div>
);

export const RxSlider: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void }> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
}) => (
  <input
    type="range"
    className="ed-range w-full"
    value={value}
    min={min}
    max={max}
    step={step}
    onChange={e => onChange(parseFloat(e.target.value))}
  />
);

const inputCls = 'w-full rounded-md border px-2.5 outline-none transition-colors';
const inputSty: React.CSSProperties = { height: 32, borderColor: T.border, fontSize: 12.5, color: T.ink, background: '#fff' };

export const NumInput: React.FC<{ value: number; onChange: (v: number) => void; step?: number; suffix?: string }> = ({
  value,
  onChange,
  step = 0.5,
  suffix,
}) => (
  <div className="relative">
    <input
      type="number"
      className={inputCls}
      style={{ ...inputSty, paddingRight: suffix ? 26 : 10 }}
      value={value}
      step={step}
      onChange={e => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
    />
    {suffix && (
      <span className="absolute pointer-events-none" style={{ right: 8, top: 8, fontSize: 10, color: T.faint }}>
        {suffix}
      </span>
    )}
  </div>
);

export const Segmented = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="flex rounded-md p-0.5" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
    {options.map(o => {
      const on = o.id === value;
      return (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className="flex-1 rounded transition-all flex items-center justify-center gap-1"
          style={{
            height: 26,
            fontSize: 11,
            fontWeight: on ? 600 : 500,
            background: on ? '#fff' : 'transparent',
            color: on ? T.primary : T.subtle,
            boxShadow: on ? '0 1px 2px rgba(15,23,42,.08)' : 'none',
          }}
        >
          {o.icon}
          {o.label}
        </button>
      );
    })}
  </div>
);

export const Swatches: React.FC<{ value?: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    {RX_SWATCHES.map(c => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        title={c}
        className="rounded-md transition-all"
        style={{
          width: 22,
          height: 22,
          background: c,
          border: value?.toUpperCase() === c.toUpperCase() ? `2px solid ${T.ink}` : `1px solid rgba(15,23,42,.12)`,
          boxShadow: value?.toUpperCase() === c.toUpperCase() ? '0 0 0 2px #fff inset' : 'none',
        }}
      />
    ))}
    <label
      className="relative rounded-md flex items-center justify-center cursor-pointer"
      style={{ width: 22, height: 22, border: `1px dashed ${T.border}`, color: T.faint }}
      title="Couleur personnalisée"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <input
        type="color"
        value={value || '#000000'}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
      />
    </label>
  </div>
);

export const RxToggle: React.FC<{ label: string; on?: boolean; onChange: (v: boolean) => void }> = ({
  label,
  on = false,
  onChange,
}) => (
  <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2">
    <span
      className="relative rounded-full transition-all shrink-0"
      style={{ width: 34, height: 19, background: on ? T.primary : '#CBD5E0' }}
    >
      <span
        className="absolute rounded-full bg-white transition-all"
        style={{ width: 15, height: 15, top: 2, left: on ? 17 : 2, boxShadow: '0 1px 2px rgba(15,23,42,.2)' }}
      />
    </span>
    <span style={{ fontSize: 11.5, fontWeight: 500, color: T.muted }}>{label}</span>
  </button>
);

/* ── Elements panel ── */
const ADD_BUTTONS: { type: RxElementType; label: string; icon: React.ReactNode }[] = [
  { type: 'text', label: 'Texte', icon: <path d="M4 6h16M9 6v13h6" /> },
  {
    type: 'logo',
    label: 'Logo',
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.8" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
  },
  { type: 'line', label: 'Filet', icon: <path d="M4 12h16" /> },
  {
    type: 'icon',
    label: 'Icône',
    icon: (
      <>
        <circle cx="12" cy="10" r="3" />
        <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z" />
      </>
    ),
  },
];

export interface RxElementsPanelProps {
  onAdd: (type: RxElementType) => void;
  onAddContact: (field: string) => void;
  config: RxLayoutConfig;
  doctor?: DoctorInfo | null;
  onLogoUpload: (file: File | null, url?: string) => void;
}

export const RxElementsPanel: React.FC<RxElementsPanelProps> = ({
  onAdd,
  onAddContact,
  config,
  doctor,
  onLogoUpload,
}) => {
  const usedFields = new Set(config.elements.filter(e => e.type === 'contact').map(e => e.field));
  const logoEl = config.elements.find(e => e.type === 'logo');

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 uppercase" style={{ fontSize: 10, fontWeight: 600, color: T.subtle, letterSpacing: '.08em' }}>
          Ajouter un élément
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ADD_BUTTONS.map(b => (
            <button
              key={b.type}
              type="button"
              onClick={() => onAdd(b.type)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border transition-all hover:bg-slate-50"
              style={{ height: 62, borderColor: T.border, background: '#fff', color: T.muted }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {b.icon}
              </svg>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 uppercase" style={{ fontSize: 10, fontWeight: 600, color: T.subtle, letterSpacing: '.08em' }}>
          Logo du cabinet
        </div>
        <label
          className="flex items-center gap-2.5 rounded-lg border cursor-pointer transition-all px-3 hover:bg-slate-50"
          style={{ height: 44, borderColor: T.border, background: '#fff' }}
        >
          <span
            className="flex items-center justify-center rounded-md shrink-0"
            style={{ width: 26, height: 26, background: T.primary50, color: T.primary }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
            </svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block truncate" style={{ fontSize: 12, fontWeight: 500, color: T.ink }}>
              {logoEl?.src ? 'Remplacer l’image' : 'Importer une image'}
            </span>
            <span className="block" style={{ fontSize: 10, color: T.faint }}>
              PNG ou SVG · fond transparent
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onLogoUpload(f);
              e.target.value = '';
            }}
          />
        </label>
        {doctor?.logoUrl && (
          <button
            type="button"
            onClick={() => onLogoUpload(null, doctor.logoUrl)}
            className="mt-1.5 w-full rounded-md border transition-all hover:bg-slate-50"
            style={{ height: 30, borderColor: T.border, fontSize: 11, color: T.muted }}
          >
            Utiliser le logo enregistré
          </button>
        )}
      </div>

      <div>
        <div className="mb-2 uppercase" style={{ fontSize: 10, fontWeight: 600, color: T.subtle, letterSpacing: '.08em' }}>
          Lignes de contact
        </div>
        <div className="space-y-1">
          {RX_ICON_KEYS.map(k => {
            const used = usedFields.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => onAddContact(k)}
                disabled={used}
                className="w-full flex items-center gap-2.5 rounded-md border px-2.5 transition-all"
                style={{
                  height: 34,
                  borderColor: T.border,
                  background: used ? T.surface : '#fff',
                  color: used ? T.faint : T.ink,
                  cursor: used ? 'not-allowed' : 'pointer',
                }}
              >
                <RxIcon name={k} style="outline" size={15} color={used ? T.faint : T.primary} />
                <span className="flex-1 text-left" style={{ fontSize: 12, fontWeight: 500 }}>
                  {RX_ICON_LABELS[k]}
                </span>
                <span style={{ fontSize: 10, color: T.faint }}>{used ? 'ajoutée' : '+'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ── Properties panel ── */
export interface RxPropertiesPanelProps {
  el: RxEditorElement | null;
  onChange: (id: string, patch: Partial<RxEditorElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export const RxPropertiesPanel: React.FC<RxPropertiesPanelProps> = ({ el, onChange, onDelete, onDuplicate }) => {
  if (!el) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <span
          className="flex items-center justify-center rounded-xl mb-3"
          style={{ width: 44, height: 44, background: T.surface, color: T.faint }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
          </svg>
        </span>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Aucune sélection</div>
        <p style={{ fontSize: 11.5, color: T.subtle, maxWidth: 190, marginTop: 4 }}>
          Cliquez un élément sur la page pour modifier sa couleur, sa taille et sa position.
        </p>
      </div>
    );
  }

  const set = (patch: Partial<RxEditorElement>) => onChange(el.id, patch);
  const isTexty = el.type === 'text' || el.type === 'contact';
  const hasIcon = el.type === 'contact' || el.type === 'icon';

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-2">
        <input
          value={el.name}
          onChange={e => set({ name: e.target.value })}
          className={inputCls}
          style={{ ...inputSty, fontWeight: 600 }}
        />
        <button
          type="button"
          onClick={() => onDuplicate(el.id)}
          title="Dupliquer"
          className="rounded-md border flex items-center justify-center shrink-0 hover:bg-slate-50"
          style={{ width: 32, height: 32, borderColor: T.border, color: T.muted }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onDelete(el.id)}
          title="Supprimer"
          className="rounded-md border flex items-center justify-center shrink-0 hover:bg-red-50"
          style={{ width: 32, height: 32, borderColor: T.border, color: T.danger }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>

      {/* position */}
      <div className="grid grid-cols-2 gap-2">
        <RxField label="X">
          <NumInput value={el.x} onChange={v => set({ x: v })} suffix="mm" />
        </RxField>
        <RxField label="Y">
          <NumInput value={el.y} onChange={v => set({ y: v })} suffix="mm" />
        </RxField>
      </div>

      {/* size */}
      {isTexty && (
        <RxField label="Largeur du bloc" hint={`${el.width ?? 80} mm`}>
          <RxSlider value={el.width ?? 80} min={10} max={190} step={1} onChange={v => set({ width: v })} />
        </RxField>
      )}
      {el.type === 'logo' && (
        <RxField label="Largeur du logo" hint={`${el.w ?? 34} mm`}>
          <RxSlider value={el.w ?? 34} min={8} max={120} step={1} onChange={v => set({ w: v })} />
        </RxField>
      )}
      {el.type === 'line' && (
        <>
          <RxField label="Longueur" hint={`${el.length ?? 174} mm`}>
            <RxSlider value={el.length ?? 174} min={5} max={190} step={1} onChange={v => set({ length: v })} />
          </RxField>
          <RxField label="Épaisseur" hint={`${el.thickness ?? 0.5} mm`}>
            <RxSlider value={el.thickness ?? 0.5} min={0.2} max={4} step={0.1} onChange={v => set({ thickness: v })} />
          </RxField>
          <RxField label="Couleur">
            <Swatches value={el.color} onChange={v => set({ color: v })} />
          </RxField>
        </>
      )}
      {el.type === 'body' && (
        <div className="grid grid-cols-2 gap-2">
          <RxField label="Largeur">
            <NumInput value={el.w ?? 174} onChange={v => set({ w: v })} suffix="mm" />
          </RxField>
          <RxField label="Hauteur">
            <NumInput value={el.h ?? 150} onChange={v => set({ h: v })} suffix="mm" />
          </RxField>
        </div>
      )}

      {/* text properties */}
      {isTexty && (
        <>
          <RxField label="Contenu">
            <select
              className={inputCls}
              style={inputSty}
              value={el.bind || ''}
              onChange={e => set({ bind: e.target.value })}
            >
              {RX_BINDS.map(b => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </RxField>
          {!el.bind && (
            <RxField label="Texte">
              <textarea
                value={el.text || ''}
                onChange={e => set({ text: e.target.value })}
                className="w-full rounded-md border px-2.5 py-2 outline-none resize-none"
                style={{ borderColor: T.border, fontSize: 12.5, color: T.ink, height: 64, background: '#fff' }}
              />
            </RxField>
          )}

          <RxField label="Corps" hint={`${el.fontSize ?? 10} pt`}>
            <RxSlider value={el.fontSize ?? 10} min={5} max={40} step={0.5} onChange={v => set({ fontSize: v })} />
          </RxField>

          <RxField label="Police">
            <select
              className={inputCls}
              style={inputSty}
              value={el.fontFamily || 'sans'}
              onChange={e => set({ fontFamily: e.target.value, rtl: e.target.value === 'arabic' ? true : el.rtl })}
            >
              {RX_FONTS.map(f => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </RxField>

          <RxField label="Graisse">
            <Segmented
              value={el.fontWeight ?? 500}
              onChange={v => set({ fontWeight: v })}
              options={[
                { id: 400, label: 'Normal' },
                { id: 500, label: 'Medium' },
                { id: 600, label: 'Semi' },
                { id: 700, label: 'Bold' },
              ]}
            />
          </RxField>

          <RxField label="Alignement">
            <Segmented
              value={el.align || 'left'}
              onChange={v => set({ align: v })}
              options={[
                {
                  id: 'left',
                  label: '',
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 12h10M4 18h13" />
                    </svg>
                  ),
                },
                {
                  id: 'center',
                  label: '',
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M7 12h10M6 18h12" />
                    </svg>
                  ),
                },
                {
                  id: 'right',
                  label: '',
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M10 12h10M7 18h13" />
                    </svg>
                  ),
                },
              ]}
            />
          </RxField>

          <RxField label="Couleur du texte">
            <Swatches value={el.color} onChange={v => set({ color: v })} />
          </RxField>

          <div className="grid grid-cols-2 gap-2">
            <RxField label="Interlettrage" hint={el.letterSpacing ?? 0}>
              <RxSlider value={el.letterSpacing ?? 0} min={0} max={12} step={0.5} onChange={v => set({ letterSpacing: v })} />
            </RxField>
            <RxField label="Interligne" hint={el.lineHeight ?? 1.35}>
              <RxSlider value={el.lineHeight ?? 1.35} min={1} max={2.2} step={0.05} onChange={v => set({ lineHeight: v })} />
            </RxField>
          </div>

          <div className="flex items-center gap-4">
            <RxToggle label="Majuscules" on={el.uppercase} onChange={v => set({ uppercase: v })} />
            <RxToggle label="RTL" on={el.rtl} onChange={v => set({ rtl: v })} />
          </div>
        </>
      )}

      {/* icon properties */}
      {hasIcon && (
        <div className="space-y-4 pt-1" style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <div className="uppercase" style={{ fontSize: 10, fontWeight: 600, color: T.subtle, letterSpacing: '.08em' }}>
            Icône
          </div>

          {el.type === 'contact' && (
            <RxToggle label="Afficher l’icône" on={el.showIcon} onChange={v => set({ showIcon: v })} />
          )}

          <RxField label="Pictogramme">
            <div className="grid grid-cols-4 gap-1.5">
              {RX_ICON_KEYS.map(k => {
                const on = el.field === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set({ field: k })}
                    title={RX_ICON_LABELS[k]}
                    className="flex items-center justify-center rounded-md border transition-all"
                    style={{
                      height: 34,
                      borderColor: on ? T.primary : T.border,
                      background: on ? T.primary50 : '#fff',
                    }}
                  >
                    <RxIcon name={k} style={el.iconStyle} size={16} color={on ? T.primary : T.muted} />
                  </button>
                );
              })}
            </div>
          </RxField>

          <RxField label="Style">
            <Segmented
              value={el.iconStyle || 'outline'}
              onChange={v => set({ iconStyle: v })}
              options={[
                { id: 'outline', label: 'Contour' },
                { id: 'filled', label: 'Plein' },
              ]}
            />
          </RxField>

          <RxField label="Taille de l’icône" hint={`${el.iconSize ?? 3.6} mm`}>
            <RxSlider value={el.iconSize ?? 3.6} min={2} max={16} step={0.2} onChange={v => set({ iconSize: v })} />
          </RxField>

          {el.type === 'contact' && (
            <RxField label="Écart icône / texte" hint={`${el.iconGap ?? 2.2} mm`}>
              <RxSlider value={el.iconGap ?? 2.2} min={0} max={10} step={0.2} onChange={v => set({ iconGap: v })} />
            </RxField>
          )}

          <RxField label="Couleur de l’icône">
            <Swatches value={el.iconColor} onChange={v => set({ iconColor: v })} />
          </RxField>
        </div>
      )}

      <RxField label="Opacité" hint={`${Math.round((el.opacity ?? 1) * 100)} %`}>
        <RxSlider value={el.opacity ?? 1} min={0.1} max={1} step={0.05} onChange={v => set({ opacity: v })} />
      </RxField>
    </div>
  );
};

/* ── Layers panel ── */
const TYPE_GLYPH: Record<string, React.ReactNode> = {
  text: <path d="M4 6h16M9 6v13h6" />,
  contact: <path d="M4 6h16M9 6v13h6" />,
  logo: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.8" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  line: <path d="M4 12h16" />,
  icon: (
    <>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z" />
    </>
  ),
  body: <path d="M6 3h8a6 6 0 010 12H6V3M6 15v6M13 15l7 6M20 15l-7 6" />,
};

export interface RxLayersPanelProps {
  config: RxLayoutConfig;
  doctor?: DoctorInfo | null;
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<RxEditorElement>) => void;
  onReorder: (idx: number, dir: number) => void;
  onDelete: (id: string) => void;
}

export const RxLayersPanel: React.FC<RxLayersPanelProps> = ({
  config,
  doctor,
  selectedId,
  onSelect,
  onChange,
  onReorder,
  onDelete,
}) => {
  const els = config.elements;
  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center justify-between">
        <span className="uppercase" style={{ fontSize: 10, fontWeight: 600, color: T.subtle, letterSpacing: '.08em' }}>
          Calques
        </span>
        <span style={{ fontSize: 10, color: T.faint }}>{els.length} éléments</span>
      </div>

      {[...els].reverse().map(el => {
        const idx = els.indexOf(el);
        const on = el.id === selectedId;
        const preview = el.type === 'text' || el.type === 'contact' ? rxResolveText(el, doctor) : '';
        return (
          <div
            key={el.id}
            onClick={() => onSelect(el.id)}
            className="flex items-center gap-2 rounded-md px-2 transition-all cursor-pointer hover:bg-slate-50"
            style={{
              height: 38,
              background: on ? T.primary50 : 'transparent',
              border: `1px solid ${on ? 'rgba(26,107,138,.28)' : 'transparent'}`,
            }}
          >
            <span className="shrink-0" style={{ color: on ? T.primary : T.faint }}>
              {el.type === 'contact' ? (
                <RxIcon name={el.field} style="outline" size={15} color={on ? T.primary : T.faint} />
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {TYPE_GLYPH[el.type]}
                </svg>
              )}
            </span>

            <span className="flex-1 min-w-0">
              <span
                className="block truncate"
                style={{ fontSize: 12, fontWeight: on ? 600 : 500, color: on ? T.primary : T.ink }}
              >
                {el.name}
              </span>
              {preview && <span className="block truncate" style={{ fontSize: 10, color: T.faint }}>{preview}</span>}
            </span>

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onReorder(idx, +1);
              }}
              title="Monter"
              className="shrink-0 rounded flex items-center justify-center hover:bg-slate-200"
              style={{ width: 20, height: 20, color: T.faint }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onReorder(idx, -1);
              }}
              title="Descendre"
              className="shrink-0 rounded flex items-center justify-center hover:bg-slate-200"
              style={{ width: 20, height: 20, color: T.faint }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onChange(el.id, { visible: !el.visible });
              }}
              title={el.visible ? 'Masquer' : 'Afficher'}
              className="shrink-0 rounded flex items-center justify-center hover:bg-slate-200"
              style={{ width: 20, height: 20, color: el.visible ? T.muted : T.faint }}
            >
              {el.visible ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.4 3M6.5 8.5C4 10.3 2 12 2 12s3.6 7 10 7c1.5 0 2.8-.3 4-.8" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onChange(el.id, { locked: !el.locked });
              }}
              title={el.locked ? 'Déverrouiller' : 'Verrouiller'}
              className="shrink-0 rounded flex items-center justify-center hover:bg-slate-200"
              style={{ width: 20, height: 20, color: el.locked ? T.primary : T.faint }}
            >
              {el.locked ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 7-2.6" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onDelete(el.id);
              }}
              title="Supprimer"
              className="shrink-0 rounded flex items-center justify-center hover:bg-red-100"
              style={{ width: 20, height: 20, color: T.faint }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};
