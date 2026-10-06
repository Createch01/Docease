import React from 'react';
import { MessageCircle } from 'lucide-react';

export type WhatsAppConsent = 'yes' | 'no' | undefined;

interface Props {
  value: WhatsAppConsent;
  /** Date d'enregistrement (posée par Rust) ; absente tant que le consentement n'est pas enregistré. */
  at?: string;
  onChange: (v: WhatsAppConsent) => void;
  compact?: boolean;
  disabled?: boolean;
}

const OPTIONS: { id: 'yes' | 'no' | 'unset'; label: string }[] = [
  { id: 'yes', label: 'Oui' },
  { id: 'no', label: 'Non' },
  { id: 'unset', label: 'Non renseigné' },
];

const fmt = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Consentement : « Le patient a accepté d'être contacté par WhatsApp » — Oui / Non / Non renseigné. */
const WhatsAppConsentField: React.FC<Props> = ({ value, at, onChange, compact, disabled }) => {
  const current = value ?? 'unset';
  const date = value ? fmt(at) : '';
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-x-3 gap-y-1' : 'space-y-1.5'}>
      <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
        <MessageCircle size={13} /> Le patient a accepté d'être contacté par WhatsApp
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-md p-0.5" role="radiogroup" aria-label="Consentement WhatsApp" style={{ background: 'var(--color-border)' }}>
          {OPTIONS.map(o => (
            <button key={o.id} type="button" role="radio" aria-checked={current === o.id} disabled={disabled}
                    onClick={() => onChange(o.id === 'unset' ? undefined : o.id)}
                    className="px-2.5 h-7 rounded text-[12px] font-semibold transition-all disabled:opacity-50"
                    style={current === o.id
                      ? { background: 'white', color: o.id === 'no' ? 'var(--color-danger-700)' : 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' }
                      : { color: 'var(--color-text-subtle)' }}>
              {o.label}
            </button>
          ))}
        </div>
        {date && <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>le {date}</span>}
      </div>
    </div>
  );
};

export default WhatsAppConsentField;
