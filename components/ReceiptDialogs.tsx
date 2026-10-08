import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ReceiptView, receiptService } from '../services/receiptService';

const overlay = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50';
const card = 'bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4';
const ghost = 'h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40';
const primary = 'h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40';

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Opération impossible.');

/**
 * Médecin : émission d'un reçu avec l'option « détailler les actes » (noms des prestations cochées
 * de la note ; sinon « Consultation »). L'assistante n'a pas cette option : Rust la refuse.
 */
export const ReceiptIssueDialog: React.FC<{ noteId: string; onClose: () => void; onIssued: (r: ReceiptView) => void }> = ({ noteId, onClose, onIssued }) => {
    const [detail, setDetail] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        setBusy(true);
        setError(null);
        try { onIssued(await receiptService.issue(noteId, detail)); }
        catch (e) { setError(errorText(e)); setBusy(false); }
    };
    return (
        <div role="dialog" aria-modal="true" aria-label="Émettre un reçu" className={overlay}>
            <div className={card}>
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Émettre un reçu</h2>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Le reçu couvre le versement encaissé qui n'a pas encore de reçu. Son numéro est attribué à l'émission et ne peut plus changer.
                </p>
                <label className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--color-text)' }}>
                    <input type="checkbox" className="mt-1" checked={detail} onChange={e => setDetail(e.target.checked)} />
                    <span>Détailler les actes sur ce reçu <span style={{ color: 'var(--color-text-muted)' }}>(noms des prestations de la note ; sinon « Consultation »)</span></span>
                </label>
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className={ghost} style={{ borderColor: 'var(--color-border)' }} onClick={onClose} disabled={busy}>Annuler</button>
                    <button type="button" className={primary} style={{ background: 'var(--color-primary)' }} onClick={submit} disabled={busy}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Émettre le reçu
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Médecin : annulation par reçu d'annulation. Le reçu d'origine est conservé tel quel. */
export const CancelReceiptDialog: React.FC<{ receipt: ReceiptView; onClose: () => void; onCancelled: (r: ReceiptView) => void }> = ({ receipt, onClose, onCancelled }) => {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ok = reason.trim().length >= 3 && reason.trim().length <= 200;
    const submit = async () => {
        setBusy(true);
        setError(null);
        try { onCancelled(await receiptService.cancel(receipt.number, reason)); }
        catch (e) { setError(errorText(e)); setBusy(false); }
    };
    return (
        <div role="dialog" aria-modal="true" aria-label={`Annuler le reçu ${receipt.number}`} className={overlay}>
            <div className={card}>
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Annuler le reçu {receipt.number}</h2>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Un reçu d'annulation, avec son propre numéro, sera émis. Le reçu d'origine est conservé et marqué « annulé » ; il n'est jamais supprimé.
                </p>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Motif (obligatoire, 200 caractères au plus)
                    <textarea className="w-full mt-1 p-2 rounded-lg border text-[14px] outline-none bg-white" style={{ borderColor: 'var(--color-border)' }} rows={3} maxLength={200}
                        value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : erreur de saisie du montant" />
                </label>
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className={ghost} style={{ borderColor: 'var(--color-border)' }} onClick={onClose} disabled={busy}>Retour</button>
                    <button type="button" className={primary} style={{ background: 'var(--color-danger)' }} onClick={submit} disabled={busy || !ok}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Émettre le reçu d'annulation
                    </button>
                </div>
            </div>
        </div>
    );
};
