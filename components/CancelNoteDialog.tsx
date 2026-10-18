import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HonoraryNote } from '../types';
import { formatCents } from '../services/receiptService';
import { CancelPreview, honoraryNoteService } from '../services/honoraryNoteService';
import { PAY_MODES, PayMode } from './PaymentFields';
import ReasonPicker from './ReasonPicker';

/** Médecin : annulation d'une note numérotée. Le numéro est conservé ; la note ne compte plus dans les montants. */
const CancelNoteDialog: React.FC<{ note: HonoraryNote; onClose: () => void; onCancelled: () => void }> = ({ note, onClose, onCancelled }) => {
    const [preview, setPreview] = useState<CancelPreview | null>(null);
    useEffect(() => { honoraryNoteService.cancelPreview(note.id).then(setPreview).catch(e => setError(e instanceof Error ? e.message : 'Aperçu impossible.')); }, [note.id]);
    // Net encaissé et reçus valides : décidés par Rust (aperçu). Avant sa réponse, on se rabat sur la note.
    const collectedCents = preview ? preview.netCents : Math.round((note.status === 'PAID' ? note.totalAmount : note.status === 'PARTIAL' ? (note.amountPaid ?? 0) : 0) * 100);
    const receiptCount = preview?.receipts.length ?? 0;
    const combined = collectedCents > 0 || receiptCount > 0;
    const [reason, setReason] = useState('');
    const [mode, setMode] = useState<PayMode>(note.paymentMode);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ok = reason.trim().length >= 3 && reason.trim().length <= 200 && !!preview && !preview.blocked;
    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            if (combined) await honoraryNoteService.refundAndCancel(note.id, reason, mode);
            else await honoraryNoteService.cancel(note.id, reason);
            onCancelled();
        }
        catch (e) { setError(e instanceof Error ? e.message : 'Annulation impossible.'); setBusy(false); }
    };
    return (
        <div role="dialog" aria-modal="true" aria-label={`Annuler la note ${note.invoiceNumber}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Annuler la note {note.invoiceNumber}</h2>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    La note reste dans la liste avec son numéro, marquée « Annulée » (date et auteur enregistrés). Elle ne compte plus dans les montants, les impayés ni les statistiques, et ne peut plus être modifiée. Une note numérotée ne se supprime jamais.
                </p>
                {preview?.blocked && <p role="alert" className="p-3 rounded-lg text-[13px] font-medium" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>{preview.blocked}</p>}
                {combined && (
                    <div className="p-3 rounded-lg text-[13px] space-y-2" style={{ background: 'var(--color-warning-50, #fffbeb)', color: 'var(--color-text)' }}>
                        <p className="font-semibold">Une seule action, tout ou rien :</p>
                        <ul className="list-disc pl-5 space-y-0.5">
                            {collectedCents > 0 && <li>Remboursement du net encaissé : <strong>{formatCents(collectedCents)}</strong></li>}
                            {receiptCount > 0 && <li>Reçu{receiptCount > 1 ? 's' : ''} annulé{receiptCount > 1 ? 's' : ''} : <strong>{preview!.receipts.join(', ')}</strong></li>}
                            <li>Note <strong>{note.invoiceNumber}</strong> annulée (le numéro est conservé)</li>
                        </ul>
                        <p>Même motif, même date et même auteur partout. Si une étape échoue, rien n'est enregistré.</p>
                        {collectedCents > 0 && <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                            Mode de remboursement
                            <select className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white block mt-1" style={{ borderColor: 'var(--color-border)' }} value={mode} onChange={e => setMode(e.target.value as PayMode)}>
                                {PAY_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                        </label>}
                    </div>
                )}
                <ReasonPicker value={reason} onChange={setReason} />
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }} onClick={onClose} disabled={busy}>Retour</button>
                    <button type="button" className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-danger)' }} onClick={submit} disabled={busy || !ok}>
                        {busy && <Loader2 size={15} className="animate-spin" />} {combined ? 'Rembourser puis annuler' : 'Annuler la note'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelNoteDialog;
