import React from 'react';

// Choix de paiement à la création d'une note : JAMAIS « Payé » par défaut ni automatiquement.
// L'interface ne fait que recueillir le montant réellement encaissé ; le statut (« Réglé » seulement si
// payé ≥ dû) est calculé et enregistré par Rust.

export type PayKind = 'UNPAID' | 'PAID' | 'PARTIAL';
export type PayMode = 'CASH' | 'CARD' | 'TRANSFER';

export interface PaymentChoice {
    kind: PayKind;
    /** Montant saisi si « Partiel ». */
    partial: string;
    mode: PayMode;
}

export const DEFAULT_PAYMENT: PaymentChoice = { kind: 'UNPAID', partial: '', mode: 'CASH' };

/** Montant réellement encaissé selon le choix (ou une erreur lisible). */
export const amountPaidOf = (c: PaymentChoice, total: number): { paid: number } | { error: string } => {
    if (c.kind === 'UNPAID') return { paid: 0 };
    if (c.kind === 'PAID') return { paid: total };
    const v = parseFloat(c.partial.replace(',', '.'));
    if (!(v > 0)) return { error: 'Saisissez le montant déjà payé.' };
    if (!(v < total)) return { error: 'Un paiement partiel doit être inférieur au montant dû (choisissez « Payé » sinon).' };
    return { paid: v };
};

const KINDS: Array<{ id: PayKind; label: string }> = [
    { id: 'UNPAID', label: 'Non payé' },
    { id: 'PAID', label: 'Payé' },
    { id: 'PARTIAL', label: 'Partiel' },
];

const field = 'h-10 px-3 rounded-lg border text-[14px] outline-none bg-white';
const fieldStyle = { borderColor: 'var(--color-border)' } as React.CSSProperties;

const PaymentFields: React.FC<{ value: PaymentChoice; onChange: (c: PaymentChoice) => void; currency: string }> = ({ value, onChange, currency }) => (
    <div className="space-y-3">
        <fieldset>
            <legend className="text-[12px] font-medium mb-1" style={{ color: 'var(--color-text-subtle)' }}>Paiement</legend>
            <div className="flex flex-wrap gap-4">
                {KINDS.map(k => (
                    <label key={k.id} className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--color-text)' }}>
                        <input type="radio" name="pay-kind" checked={value.kind === k.id} onChange={() => onChange({ ...value, kind: k.id })} />
                        {k.label}
                    </label>
                ))}
            </div>
        </fieldset>
        {value.kind === 'PARTIAL' && (
            <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                Montant payé ({currency})
                <input className={`${field} w-40 block mt-1`} style={fieldStyle} inputMode="decimal" value={value.partial} onChange={e => onChange({ ...value, partial: e.target.value })} />
            </label>
        )}
        <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
            Mode de paiement
            <select className={`${field} block mt-1`} style={fieldStyle} value={value.mode} onChange={e => onChange({ ...value, mode: e.target.value as PayMode })}>
                <option value="CASH">Espèces</option>
                <option value="CARD">Carte bancaire</option>
                <option value="TRANSFER">Virement</option>
            </select>
        </label>
    </div>
);

export default PaymentFields;
