import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HonoraryNote } from '../types';
import { dataService } from '../services/dataService';
import { billingService } from '../services/billingService';
import { toastService } from '../services/toastService';
import { todayLocal } from '../utils/localDate';
import { sessionService } from '../services/sessionService';
import { Preview, gridIsEmpty, isUsableAct } from '../services/tariffService';
import PaymentFields, { DEFAULT_PAYMENT, PaymentChoice, amountPaidOf } from './PaymentFields';
import ExistingNoteNotice, { todaysNotes } from './ExistingNoteNotice';
import NoteLinesEditor, { NoteDraft, draftToInput, emptyDraft, newLine } from './tariffs/NoteLinesEditor';
import { useTariffGrid } from './tariffs/useTariffGrid';
import { settingsHash } from './settings/settingsRoutes';
import { centsToText } from '../utils/cents';

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
 * Facture rapide : jamais créée sans fenêtre de confirmation. Acte de la grille (« Consultation » par défaut),
 * remise éventuelle à motif, paiement (Non payé par défaut) et mode. Une visite = une note : si une note du jour
 * existe déjà, on propose de l'imprimer ; une seconde note n'est créée qu'après « Créer une autre note ».
 * Prix, remises et totaux sont calculés par Rust ; grille vide : le médecin garde une ligne libre
 * « Consultation » au tarif standard, l'assistante est invitée à faire compléter les tarifs.
 */
const QuickInvoiceDialog: React.FC<Props> = ({ patientId, patientName, currency, onOpenExisting, onCreated, onClose }) => {
    const isMedecin = sessionService.isMedecin();
    const { grid } = useTariffGrid();
    const [existing] = useState(() => todaysNotes(dataService.getAllHonoraryNotes(patientId), patientId, todayLocal())[0]);
    const [another, setAnother] = useState(false);
    const [draft, setDraft] = useState<NoteDraft>(() => emptyDraft());
    const [preview, setPreview] = useState<Preview | null>(null);
    const [payment, setPayment] = useState<PaymentChoice>(DEFAULT_PAYMENT);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Consultation par défaut dès que la grille est chargée.
    useEffect(() => {
        if (!grid) return;
        const usable = grid.acts.filter(isUsableAct).sort((a, b) => a.order - b.order);
        const consult = usable.find(a => a.category === 'CONSULTATION') ?? usable[0];
        if (consult) {
            setDraft(d => (d.lines.length === 1 && !d.lines[0].actId && !d.lines[0].free ? { ...d, lines: [{ ...d.lines[0], actId: consult.id }] } : d));
        } else if (isMedecin) {
            const fee = billingService.defaultQuickAmount();
            const free = { ...newLine('', true), label: 'Consultation', price: fee > 0 ? centsToText(Math.round(fee * 100)) : '' };
            setDraft(d => (d.lines.length === 1 && !d.lines[0].actId && !d.lines[0].free ? { ...d, lines: [free] } : d));
        }
    }, [grid, isMedecin]);

    if (existing && !another) {
        return <ExistingNoteNotice note={existing} currency={currency} onOpen={() => onOpenExisting(existing)} onCreateAnother={() => setAnother(true)} onClose={onClose} />;
    }

    const openGrid = () => { window.location.hash = settingsHash({ section: 'cabinet', tab: 'tarifs' }); onClose(); };

    const submit = async () => {
        const input = draftToInput(draft);
        if (!preview || input.lines.length === 0) { setError(input.incomplete ?? 'Choisissez un acte de la grille.'); return; }
        const total = preview.netCents / 100; // net calculé par Rust, en dirhams
        const paid = amountPaidOf(payment, total);
        if ('error' in paid) { setError(paid.error); return; }
        setBusy(true);
        setError(null);
        try {
            const note = billingService.buildQuickInvoice({
                patientId, patientName, lines: input.lines, noteDiscount: input.noteDiscount,
                total, totalInWords: preview.inWords, amountPaid: paid.paid, paymentMode: payment.mode,
            });
            const stored = await dataService.saveHonoraryNote(note);
            onCreated(stored);
        } catch (e) {
            setError(e instanceof Error ? e.message : typeof e === 'string' ? e : 'Enregistrement impossible.');
            toastService.error("Échec de l'enregistrement de la note.");
            setBusy(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="Facture rapide" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Facture rapide — {patientName}</h2>
                <NoteLinesEditor grid={grid} isMedecin={isMedecin} patientId={patientId} currency={currency} draft={draft}
                    onChange={setDraft} onPreview={setPreview} single onOpenGrid={openGrid} />
                <PaymentFields value={payment} onChange={setPayment} currency={currency} />
                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={{ borderColor: 'var(--color-border)' }}>Annuler</button>
                    <button type="button" onClick={submit} disabled={busy || !preview || (gridIsEmpty(grid) && !isMedecin)} className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>
                        {busy && <Loader2 size={15} className="animate-spin" />} Créer la note
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickInvoiceDialog;
