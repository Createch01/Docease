import React, { useState } from 'react';

// Motif d'annulation / de correction / de remboursement : liste fermée. Rust refuse tout autre texte
// (src-tauri/src/reasons.rs). Valeur produite : « Libellé » ou « Libellé — précision » ; chaîne vide
// tant que le motif n'est pas valide (« Autre » exige au moins 10 caractères).

export const REASON_LABELS = [
    'Doublon',
    'Erreur de montant',
    'Erreur de patient',
    'Erreur de mode de paiement',
    'Demande du patient',
    'Autre',
] as const;

export const OTHER_MIN_CHARS = 10;
const SEP = ' — ';

export const composeReason = (label: string, detail: string): string => {
    const d = detail.replace(/\s+/g, ' ').trim();
    if (!(REASON_LABELS as readonly string[]).includes(label)) return '';
    if (label === 'Autre') return d.length >= OTHER_MIN_CHARS ? `${label}${SEP}${d}` : '';
    return d ? `${label}${SEP}${d}` : label;
};

interface Props {
    value: string;
    onChange: (reason: string) => void;
    title?: string;
}

const ReasonPicker: React.FC<Props> = ({ onChange, title = 'Motif (obligatoire)' }) => {
    const [label, setLabel] = useState<string>('');
    const [detail, setDetail] = useState('');
    const other = label === 'Autre';
    const border = { borderColor: 'var(--color-border)' } as const;
    const update = (l: string, d: string) => { setLabel(l); setDetail(d); onChange(l ? composeReason(l, d) : ''); };
    const short = other && detail.trim().length < OTHER_MIN_CHARS;
    return (
        <div className="space-y-2">
            <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                {title}
                <select className="w-full mt-1 h-10 px-3 rounded-lg border text-[14px] outline-none bg-white" style={border}
                        value={label} onChange={e => update(e.target.value, detail)} aria-label="Motif">
                    <option value="">Choisir un motif…</option>
                    {REASON_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
            </label>
            {label && (
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    {other ? `Précisez (au moins ${OTHER_MIN_CHARS} caractères)` : 'Précision (facultatif)'}
                    <textarea className="w-full mt-1 p-2 rounded-lg border text-[14px] outline-none bg-white" style={border} rows={2} maxLength={150}
                              value={detail} onChange={e => update(label, e.target.value)} aria-label="Précision du motif" />
                </label>
            )}
            {short && <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Encore {OTHER_MIN_CHARS - detail.trim().length} caractère(s).</p>}
        </div>
    );
};

export default ReasonPicker;
