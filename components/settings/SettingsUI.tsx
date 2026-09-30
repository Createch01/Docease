/**
 * Briques communes des pages Paramètres — mêmes tokens que l'ancien
 * SettingsPanel (variables.css : --color-primary, grille 8px, rayons 8/12px).
 * Une page = <SettingsPageFrame> (fil d'Ariane, titre, description, onglets,
 * indicateur de modifications, bouton Enregistrer) + des <SettingsCard>.
 */
import React, { useRef } from 'react';
import { ChevronRight, Save, Upload, Trash2, RefreshCw } from 'lucide-react';
import { SettingsRoute, getSection, normalizeRoute } from './settingsRoutes';
import { settingsService } from '../../services/settingsService';

// ─── Styles partagés ───
export const input40 = 'w-full h-10 px-3 rounded-md border text-[14px] outline-none transition-all bg-white';
export const inputStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;
export const monoInputStyle = { ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 } as React.CSSProperties;
export const textareaBase = 'w-full px-3 py-2.5 rounded-md border text-[14px] outline-none transition-all bg-white resize-none';
export const labelEyebrow = 'block text-[11px] font-medium uppercase tracking-wider mb-1.5';
export const labelEyebrowStyle = { color: 'var(--color-text-subtle)', letterSpacing: '0.06em' } as React.CSSProperties;
export const sectionStyle = { background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' } as React.CSSProperties;
export const cardStyle = { borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' } as React.CSSProperties;

export const primaryButton = 'h-10 px-5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-white transition-all shadow-soft hover:shadow-card active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none';

/** Compare deux objets sur une liste de champs (brouillon vs enregistré). */
export function pickFields<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  keys.forEach(k => { out[k] = obj[k]; });
  return out;
}
export const fieldsDiffer = <T extends object>(a: T, b: T, keys: readonly (keyof T)[]) =>
  keys.some(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));

// ─── Cadre de page ───
interface SettingsPageFrameProps {
  route: SettingsRoute;
  onNavigate: (route: SettingsRoute) => void;
  dirty?: boolean;
  onSave?: () => void;
  saveLabel?: string;
  /** Actions supplémentaires à gauche du bouton Enregistrer. */
  actions?: React.ReactNode;
  /** Le contenu occupe toute la hauteur disponible (éditeur Mon design). */
  fill?: boolean;
  children: React.ReactNode;
}

export const SettingsPageFrame: React.FC<SettingsPageFrameProps> = ({
  route, onNavigate, dirty = false, onSave, saveLabel = 'Enregistrer', actions, fill = false, children,
}) => {
  const section = getSection(route.section);
  const current = normalizeRoute(route);
  const tab = section.tabs?.find(t => t.id === current.tab);
  const Icon = section.icon;

  return (
    <div
      // Pas d'animation d'entrée (transform) en mode fill : elle servirait de
      // référence au position: fixed du plein écran de l'éditeur.
      className={`rounded-xl border flex flex-col ${fill ? 'h-full' : 'animate-in'}`}
      style={{ background: 'var(--color-surface)', ...cardStyle, minHeight: fill ? 0 : undefined }}
    >
      {/* Collé en haut de la zone de défilement (qui a 24px de marge intérieure) :
          titre, onglets et Enregistrer restent visibles sur les pages longues. */}
      <header
        className="px-7 pt-5 shrink-0 rounded-t-xl"
        style={{
          position: fill ? undefined : 'sticky', top: -24, zIndex: 10,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: section.tabs ? 0 : 20,
        }}
      >
        <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-[12px] mb-3" style={{ color: 'var(--color-text-subtle)' }}>
          <span>Paramètres</span>
          <ChevronRight size={12} style={{ color: 'var(--color-text-faint)' }} />
          {tab ? (
            <>
              <button type="button" onClick={() => onNavigate({ section: section.id })} className="hover:underline">{section.label}</button>
              <ChevronRight size={12} style={{ color: 'var(--color-text-faint)' }} />
              <span aria-current="page" style={{ color: 'var(--color-text)', fontWeight: 500 }}>{tab.label}</span>
            </>
          ) : (
            <span aria-current="page" style={{ color: 'var(--color-text)', fontWeight: 500 }}>{section.label}</span>
          )}
        </nav>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
              <Icon size={19} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{section.label}</h2>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{section.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {dirty && (
              <span role="status" className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                Modifications non enregistrées
              </span>
            )}
            {actions}
            {onSave && (
              <button type="button" onClick={onSave} disabled={!dirty} className={primaryButton} style={{ background: 'var(--color-primary)' }}>
                <Save size={15} /> {saveLabel}
              </button>
            )}
          </div>
        </div>

        {section.tabs && (
          <div role="tablist" aria-label={section.label} className="flex items-end gap-6 mt-5 -mb-px">
            {section.tabs.map(t => {
              const active = t.id === current.tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => !active && onNavigate({ section: section.id, tab: t.id })}
                  className="pb-3 text-[13.5px] transition-colors"
                  style={{
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontWeight: active ? 600 : 500,
                    borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className={fill ? 'flex-1 min-h-0 p-5' : 'p-7'}>
        {children}
      </div>
    </div>
  );
};

// ─── Carte de section ───
export const SettingsCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  dir?: 'rtl' | 'ltr';
  children: React.ReactNode;
}> = ({ title, icon, description, actions, className = '', dir, children }) => (
  <section className={`p-5 rounded-lg border space-y-4 ${className}`} style={sectionStyle} dir={dir}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          {icon && <span className="flex" style={{ color: 'var(--color-primary)' }}>{icon}</span>}
          {title}
        </h3>
        {description && <p className="text-[12px] mt-1" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

// ─── Champs ───
export const Field: React.FC<{ label: string; hint?: React.ReactNode; align?: 'left' | 'right'; htmlFor?: string; children: React.ReactNode }> = ({ label, hint, align = 'left', htmlFor, children }) => (
  <div>
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={htmlFor} className={labelEyebrow} style={{ ...labelEyebrowStyle, textAlign: align }}>{label}</label>
      {hint}
    </div>
    {children}
  </div>
);

export const TextField: React.FC<{
  label: string; value: string | undefined; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; rtl?: boolean; type?: string; hint?: React.ReactNode; icon?: React.ReactNode;
}> = ({ label, value, onChange, placeholder, mono, rtl, type = 'text', hint, icon }) => (
  <Field label={label} hint={hint} align={rtl ? 'right' : 'left'}>
    {icon ? (
      <div className="flex items-center gap-2.5 px-3 h-10 rounded-md border bg-white transition-all" style={inputStyle}>
        <span className="flex shrink-0" style={{ color: 'var(--color-text-faint)' }}>{icon}</span>
        <input
          type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          aria-label={label}
          className={`flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] ${rtl ? 'text-right' : ''}`}
          style={{ color: 'var(--color-text)', fontFamily: mono ? 'var(--font-mono)' : undefined }}
        />
      </div>
    ) : (
      <input
        type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        aria-label={label}
        className={`${input40} ${rtl ? 'text-right' : ''}`} style={mono ? monoInputStyle : inputStyle}
      />
    )}
  </Field>
);

export const TextAreaField: React.FC<{
  label: string; value: string | undefined; onChange: (v: string) => void;
  placeholder?: string; rtl?: boolean; rows?: number; hint?: React.ReactNode;
}> = ({ label, value, onChange, placeholder, rtl, rows = 4, hint }) => (
  <Field label={label} hint={hint} align={rtl ? 'right' : 'left'}>
    <textarea
      value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      aria-label={label}
      className={`${textareaBase} ${rtl ? 'text-right font-arabic' : ''}`} style={inputStyle}
    />
  </Field>
);

/** Zone d'image (logo, cachet, signature) : choisir, remplacer, supprimer. */
export const ImageField: React.FC<{
  label: string; value?: string; onChange: (url: string | undefined) => void; size?: number;
}> = ({ label, value, onChange, size = 144 }) => {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange(await settingsService.fileToBase64(file));
    } catch (error) {
      console.error(`Erreur lors du chargement (${label}) :`, error);
      alert(`Erreur lors du chargement : ${label.toLowerCase()}`);
    }
  };
  return (
    <div className="space-y-2" style={{ width: size }}>
      <span className={labelEyebrow} style={labelEyebrowStyle}>{label}</span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        aria-label={value ? `Remplacer : ${label}` : `Choisir : ${label}`}
        className="w-full aspect-square bg-white rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative group"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="w-full h-full object-contain p-2" />
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <RefreshCw className="text-white" size={18} />
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1.5" style={{ color: 'var(--color-text-faint)' }}>
            <Upload size={20} />
            <span className="text-[11px] font-medium">Choisir une image</span>
          </span>
        )}
      </button>
      <input type="file" ref={ref} onChange={pick} className="hidden" accept="image/*" />
      {value && (
        <button type="button" onClick={() => onChange(undefined)}
                className="w-full text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                style={{ color: 'var(--color-danger)' }}>
          <Trash2 size={12} /> Supprimer
        </button>
      )}
    </div>
  );
};

/** Lien vers une autre page des Paramètres (« Modifier dans Cabinet »…). */
export const SettingsLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
    {children} <ChevronRight size={12} />
  </button>
);

/** Interrupteur accessible (même rendu que les toggles existants). */
export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; danger?: boolean }> = ({ checked, onChange, label, danger }) => (
  <button
    type="button" role="switch" aria-checked={checked} aria-label={label}
    onClick={() => onChange(!checked)}
    className="w-10 h-[22px] rounded-full transition-colors relative shrink-0"
    style={{ background: checked ? (danger ? 'var(--color-danger)' : 'var(--color-primary)') : 'var(--color-border-strong)' }}
  >
    <span className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all" style={{ left: checked ? '20px' : '2px' }} />
  </button>
);

/** Choix segmenté (A4/A5, Gauche/Centre/Droite…). */
export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-md p-1" role="radiogroup" style={{ background: 'var(--color-border)' }}>
      {options.map(o => (
        <button
          key={o.id} type="button" role="radio" aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded font-semibold transition-all ${size === 'sm' ? 'py-1.5 text-[11px]' : 'py-2 text-[12px]'}`}
          style={value === o.id ? { background: 'white', color: 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--color-text-subtle)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
