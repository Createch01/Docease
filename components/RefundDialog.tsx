import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HonoraryNote } from '../types';
import { paymentRegistryService } from '../services/paymentRegistryService';
import { PAY_MODES, PayMode } from './PaymentFields';
import ReasonPicker from './ReasonPicker';

/**
 * Médecin : remboursement d'un patient. Ce n'est jamais une modification de l'encaissement d'origine : Rust
 * ajoute une écriture négative au registre (motif obligatoire, date et auteur posés par Rust), puis
 * recalcule le montant payé et le statut de la note.
 */
const RefundDialog: React.FC<{ note: HonoraryNote; currency: string; onClose: () => void; onDone: () => void }> = ({ note, currency, onClose, onDone }) => {
    const paid = note.status === 'PAID' ? note.totalAmount : note.status === 'PARTIAL' ? (note.amountPaid ?? 0) : 0;
    const [amount, setAmount] = useState(String(paid));
    const [mode, setMode] = useState<PayMode>(note.paymentMode);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ok = reason.trim().length >= 3 && reason.trim().length <= 200;

    const submit = async () => {
        const v = parseFloat(amount.replace(',', '.'));
        if (!(v > 0)) { setError('Saisissez le montant remboursé.'); return; }
        setBusy(true);
        setError(null);
        try { await paymentRegistryService.refund(note.id, v, mode, reason); onDone(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Remboursement impossible.'); setBusy(false); }
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={`Rembourser la note ${note.invoiceNumber}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Rembourser — note {note.invoiceNumber}</h2>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Encaissé à ce jour : {paid} {currency}. Le remboursement est enregistré comme une écriture négative dans le registre des encaissements ; l'encaissement d'origine n'est jamais modifié. Le statut de la note est recalculé.
                </p>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Montant remboursé ({currency})
                    <input className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white w-40 block mt-1" style={{ borderColor: 'var(--color-border)' }} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
                </label>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Mode de remboursement
                    <select className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white block mt-1" style={{ borderColor: 'var(--color-border)' }} value={mode} onChange={e => setMode(e.target.value as PayMode)}>
                        {PAY_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                </label>
                <ReasonPicker value={reason} onChange={setReason} />
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }} onClick={onClose} disabled={busy}>Retour</button>
                    <button type="button" className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-danger)' }} onClick={submit} disabled={busy || !ok}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Rembourser
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RefundDialog;
