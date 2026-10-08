import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HonoraryNote } from '../types';
import { dataService } from '../services/dataService';
import { toastService } from '../services/toastService';
import { PAY_MODES, PayMode } from './PaymentFields';

/** Paiement reçu en plus sur une note existante : le statut en découle (calculé par Rust), il ne se saisit pas. */
const RecordPaymentDialog: React.FC<{ note: HonoraryNote; currency: string; onClose: () => void; onSaved: () => void }> = ({ note, currency, onClose, onSaved }) => {
    const already = note.status === 'PAID' ? note.totalAmount : note.status === 'PARTIAL' ? (note.amountPaid ?? 0) : 0;
    const remaining = Math.max(0, Math.round((note.totalAmount - already) * 100) / 100);
    const [amount, setAmount] = useState(String(remaining));
    const [mode, setMode] = useState<PayMode>(note.paymentMode);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        const v = parseFloat(amount.replace(',', '.'));
        if (!(v > 0)) { setError('Saisissez le montant encaissé.'); return; }
        if (v > remaining + 1e-9) { setError(`Le montant ne peut pas dépasser le reste dû (${remaining} ${currency}).`); return; }
        setBusy(true);
        setError(null);
        try {
            await dataService.saveHonoraryNote({ ...note, amountPaid: Math.round((already + v) * 100) / 100, paymentMode: mode });
            onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
            toastService.error("Échec de l'enregistrement du paiement.");
            setBusy(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={`Encaisser la note ${note.invoiceNumber}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Encaisser — note {note.invoiceNumber}</h2>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Dû {note.totalAmount} {currency} · déjà payé {already} {currency} · reste {remaining} {currency}. La note passe à « Réglé » seulement quand le total payé atteint le montant dû.
                </p>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Montant encaissé maintenant ({currency})
                    <input className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white w-40 block mt-1" style={{ borderColor: 'var(--color-border)' }} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
                </label>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Mode de paiement
                    <select className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white block mt-1" style={{ borderColor: 'var(--color-border)' }} value={mode} onChange={e => setMode(e.target.value as PayMode)}>
                        {PAY_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                </label>
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Annuler</button>
                    <button type="button" onClick={submit} disabled={busy || remaining <= 0} className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Enregistrer le paiement
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecordPaymentDialog;
