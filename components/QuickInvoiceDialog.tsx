import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HonoraryNote } from '../types';
import { dataService } from '../services/dataService';
import { billingService } from '../services/billingService';
import { toastService } from '../services/toastService';
import { todayLocal } from '../utils/localDate';
import PaymentFields, { DEFAULT_PAYMENT, PaymentChoice, amountPaidOf } from './PaymentFields';
import ExistingNoteNotice, { todaysNotes } from './ExistingNoteNotice';

interface Props {
    patientId: string;
    patientName: string;
    currency: string;
    /** « Imprimer la note … » : ouvre l'aperçu de la note existante. */
    onOpenExisting: (note: HonoraryNote) => void;
    onCreated: (note: HonoraryNote) => void;
    onClose: () => void;
}

/**
 * Facture rapide : jamais créée sans fenêtre de confirmation. Montant (tarif par défaut, modifiable),
 * paiement (Non payé par défaut) et mode. Une visite = une note : si une note du jour existe déjà, on
 * propose de l'imprimer ; une seconde note n'est créée qu'après « Créer une autre note ».
 */
const QuickInvoiceDialog: React.FC<Props> = ({ patientId, patientName, currency, onOpenExisting, onCreated, onClose }) => {
    const [existing] = useState(() => todaysNotes(dataService.getAllHonoraryNotes(patientId), patientId, todayLocal())[0]);
    const [another, setAnother] = useState(false);
    const [amount, setAmount] = useState(() => String(billingService.defaultQuickAmount()));
    const [payment, setPayment] = useState<PaymentChoice>(DEFAULT_PAYMENT);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (existing && !another) {
        return <ExistingNoteNotice note={existing} currency={currency} onOpen={() => onOpenExisting(existing)} onCreateAnother={() => setAnother(true)} onClose={onClose} />;
    }

    const submit = async () => {
        const total = parseFloat(amount.replace(',', '.'));
        if (!(total > 0)) { setError('Saisissez un montant supérieur à 0.'); return; }
        const paid = amountPaidOf(payment, total);
        if ('error' in paid) { setError(paid.error); return; }
        setBusy(true);
        setError(null);
        try {
            const note = billingService.buildQuickInvoice({ patientId, patientName, currency, amount: total, amountPaid: paid.paid, paymentMode: payment.mode });
            const stored = await dataService.saveHonoraryNote(note);
            onCreated(stored);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
            toastService.error("Échec de l'enregistrement de la note.");
            setBusy(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="Facture rapide" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Facture rapide — {patientName}</h2>
                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                    Montant ({currency})
                    <input className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white w-40 block mt-1" style={{ borderColor: 'var(--color-border)' }} inputMode="decimal"
                        value={amount} onChange={e => setAmount(e.target.value)} />
                </label>
                <PaymentFields value={payment} onChange={setPayment} currency={currency} />
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Annuler</button>
                    <button type="button" onClick={submit} disabled={busy} className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Créer la note
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickInvoiceDialog;
