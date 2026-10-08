import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HonoraryNote } from '../types';
import { honoraryNoteService } from '../services/honoraryNoteService';

/** Médecin : annulation d'une note numérotée. Le numéro est conservé ; la note ne compte plus dans les montants. */
const CancelNoteDialog: React.FC<{ note: HonoraryNote; onClose: () => void; onCancelled: () => void }> = ({ note, onClose, onCancelled }) => {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ok = reason.trim().length >= 3 && reason.trim().length <= 200;
    const submit = async () => {
        setBusy(true);
        setError(null);
        try { await honoraryNoteService.cancel(note.id, reason); onCancelled(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Annulation impossible.'); setBusy(false); }
    };
    return (
        <div role="dialog" aria-modal="true" aria-label={`Annuler la note ${note.invoiceNumber}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Annuler la note {note.invoiceNumber}</h2>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    La note reste dans la liste avec son numéro, marquée « Annulée » (date et auteur enregistrés). Elle ne compte plus dans les montants, les impayés ni les statistiques, et ne peut plus être modifiée. Une note numérotée ne se supprime jamais.
                </p>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Motif (obligatoire, 200 caractères au plus)
                    <textarea className="w-full mt-1 p-2 rounded-lg border text-[14px] outline-none bg-white" style={{ borderColor: 'var(--color-border)' }} rows={3} maxLength={200}
                        value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : note émise par erreur" />
                </label>
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }} onClick={onClose} disabled={busy}>Retour</button>
                    <button type="button" className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-danger)' }} onClick={submit} disabled={busy || !ok}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Annuler la note
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CancelNoteDialog;
