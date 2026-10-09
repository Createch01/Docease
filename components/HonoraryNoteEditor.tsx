
import React, { useState } from 'react';
import { X, Save, Printer, Check, Wallet } from 'lucide-react';
import { dataService } from '../services/dataService';
import { HonoraryNote, Patient } from '../types';
import HonoraryNoteTemplate from './HonoraryNoteTemplate';
import { usePrintMode } from './usePrintMode';
// @ts-ignore
import { toastService } from '../services/toastService';
import { canOutput } from '../services/cabinetSetup';
import { todayLocal } from '../utils/localDate';
import PaymentFields, { DEFAULT_PAYMENT, PaymentChoice, amountPaidOf } from './PaymentFields';
import ExistingNoteNotice, { todaysNotes } from './ExistingNoteNotice';
import NoteLinesEditor, { NoteDraft, draftToInput, emptyDraft } from './tariffs/NoteLinesEditor';
import { useTariffGrid } from './tariffs/useTariffGrid';
import { Preview } from '../services/tariffService';
import { sessionService } from '../services/sessionService';
import { settingsHash } from './settings/settingsRoutes';

interface HonoraryNoteEditorProps {
    /** « Imprimer la note … » : ouvre l'aperçu de la note du jour déjà existante. */
    onOpenExisting?: (note: HonoraryNote) => void;
    patient: Patient;
    visitId?: string;
    onClose: () => void;
}

// Note d'honoraires multi-lignes : actes de la grille (prix figés à l'émission), ligne libre, remises à motif.
// Rust calcule et fige les lignes, les remises, le total et le montant en lettres (src-tauri/src/tariff.rs) ;
// l'éditeur n'additionne rien : il affiche l'aperçu renvoyé par Rust.
const HonoraryNoteEditor: React.FC<HonoraryNoteEditorProps> = ({ patient, visitId, onClose, onOpenExisting }) => {
    const doctor = dataService.getDoctorInfo();
    const currency = doctor.currency || 'DH';
    const isMedecin = sessionService.isMedecin();
    const [date] = useState(todayLocal());
    // While printing, only the dedicated print layer is mounted (see usePrintMode).
    const printing = usePrintMode();
    const { grid } = useTariffGrid();
    const [draft, setDraft] = useState<NoteDraft>(() => emptyDraft());
    const [preview, setPreview] = useState<Preview | null>(null);
    // Jamais « Payé » par défaut : le paiement est choisi explicitement (le statut est calculé par Rust).
    const [payment, setPayment] = useState<PaymentChoice>(DEFAULT_PAYMENT);
    // Une visite = une note : si une note du jour existe déjà, on propose de l'imprimer d'abord.
    const [existingToday] = useState(() => todaysNotes(dataService.getAllHonoraryNotes(patient.id), patient.id, todayLocal())[0]);
    const [createAnother, setCreateAnother] = useState(false);
    const [isPreview, setIsPreview] = useState(false);
    const [savedNote, setSavedNote] = useState<HonoraryNote | null>(null);
    const [saving, setSaving] = useState(false);

    const openGrid = () => {
        window.location.hash = settingsHash({ section: 'cabinet', tab: 'tarifs' });
        onClose();
    };

    const handleSave = async (): Promise<HonoraryNote | null> => {
        if (saving) return null;
        // Enregistrer puis imprimer / exporter ne doit jamais créer une seconde note.
        if (savedNote) return savedNote;
        const input = draftToInput(draft);
        if (input.lines.length === 0 || !preview) {
            toastService.error(input.incomplete ?? 'Ajoutez au moins un acte avant d\'enregistrer.');
            return null;
        }
        const total = preview.netCents / 100; // dirhams, pour le choix de paiement (le net vient de Rust)
        const paid = amountPaidOf(payment, total);
        if ('error' in paid) { toastService.error(paid.error); return null; }
        const note: HonoraryNote = {
            id: Date.now().toString(),
            patientId: patient.id,
            patientName: patient.name,
            patientPhone: patient.phone || undefined,
            visitId,
            date,
            invoiceNumber: '', // attribué par Rust à l'enregistrement
            services: [],
            lines: input.lines,
            noteDiscount: input.noteDiscount,
            totalAmount: total,
            totalInWords: preview.inWords,
            status: 'UNPAID', // indicatif : Rust recalcule le statut depuis le registre
            amountPaid: paid.paid,
            paymentMode: payment.mode,
        };
        setSaving(true);
        try {
            const stored = await dataService.saveHonoraryNote(note);
            setSavedNote(stored);
            setIsPreview(true);
            window.dispatchEvent(new Event('meddoc_data_update'));
            return stored;
        } catch (e) {
            toastService.error(e instanceof Error ? e.message : typeof e === 'string' ? e : "Échec de l'enregistrement de la note.");
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleExportPDF = async (note: HonoraryNote | null = savedNote) => {
        if (!note) return;
        const element = document.getElementById('note-pdf-export');
        if (!element) return;

        const opt = {
            margin: 0,
            filename: `Note_Honoraires_${patient.name}_${note.invoiceNumber}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
            pagebreak: { mode: 'avoid-all' }
        };

        if (!canOutput()) return;
        toastService.info("Génération de la note PDF...");
        const html2pdf = (await import('html2pdf.js')).default;
        html2pdf()
            .set(opt)
            .from(element)
            .save()
            .then(() => {
                toastService.success("Note enregistrée avec succès !");
            })
            .catch((err: any) => {
                console.error("PDF Export Error:", err);
                toastService.error("Erreur lors de l'export PDF.");
            });
    };

    if (existingToday && !createAnother) {
        return <ExistingNoteNotice note={existingToday} currency={currency} onOpen={() => (onOpenExisting ? onOpenExisting(existingToday) : onClose())} onCreateAnother={() => setCreateAnother(true)} onClose={onClose} />;
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                            <Wallet size={20} />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-semibold" style={{ color: 'var(--color-text)' }}>Note d'honoraires</h2>
                            <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>{patient.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Fermer" className="p-2.5 rounded-lg hover:bg-gray-100" style={{ color: 'var(--color-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Form Side */}
                    <div className={`flex-1 overflow-y-auto p-6 ${isPreview ? 'hidden lg:block lg:w-1/2' : 'w-full'}`}>
                        <div className="space-y-6">
                            <div className="p-3 rounded-lg border text-[13px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }} data-testid="note-date-readonly">
                                Jour de l'émission ({date}) — numéro attribué à l'enregistrement
                            </div>

                            <section className="space-y-3">
                                <h3 className="text-[13px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                                    <Check size={14} style={{ color: 'var(--color-primary)' }} /> Actes réalisés
                                </h3>
                                <NoteLinesEditor
                                    grid={grid} isMedecin={isMedecin} patientId={patient.id} currency={currency}
                                    draft={draft} onChange={setDraft} onPreview={setPreview} onOpenGrid={openGrid}
                                />
                            </section>

                            <PaymentFields value={payment} onChange={setPayment} currency={currency} />

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    onClick={() => { void handleSave(); }}
                                    disabled={saving || !!savedNote}
                                    className="flex-1 h-11 rounded-lg border text-[13px] font-medium flex items-center justify-center gap-2 bg-white disabled:opacity-40"
                                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                                >
                                    <Save size={16} /> Enregistrer
                                </button>
                                <button
                                    onClick={async () => { const n = await handleSave(); if (n) setTimeout(() => window.print(), 500); }}
                                    disabled={saving}
                                    className="flex-1 h-11 rounded-lg border text-[13px] font-medium flex items-center justify-center gap-2 bg-white disabled:opacity-40"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                                >
                                    <Printer size={16} /> Enregistrer et imprimer
                                </button>
                                <button
                                    onClick={async () => { const n = await handleSave(); if (n) setTimeout(() => handleExportPDF(n), 500); }}
                                    disabled={saving}
                                    className="flex-[2] h-11 rounded-lg text-white text-[13px] font-medium flex items-center justify-center gap-2 disabled:opacity-40"
                                    style={{ background: 'var(--color-primary)' }}
                                >
                                    <Save size={16} /> Enregistrer en PDF
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Preview Side */}
                    {isPreview && savedNote && (
                        <div className="flex-1 bg-gray-100 overflow-y-auto p-6 flex flex-col items-center gap-4">
                            <div className="sticky top-0 w-full z-10 flex justify-center gap-3 mb-2">
                                <button onClick={() => setIsPreview(false)} className="h-10 px-4 rounded-lg bg-white border text-[13px] font-medium" style={{ borderColor: 'var(--color-border)' }}>Retour</button>
                                <button onClick={() => handleExportPDF()} className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2" style={{ background: 'var(--color-primary)' }}>
                                    <Save size={15} /> Enregistrer PDF
                                </button>
                                <button onClick={() => window.print()} className="h-10 px-4 rounded-lg bg-white border text-[13px] font-medium flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
                                    <Printer size={15} /> Imprimer
                                </button>
                            </div>

                            <div className="shadow-2xl aspect-[1/1.41] w-full max-w-[500px] rounded-lg overflow-hidden bg-white border flex justify-center items-start shrink-0 print:m-0 print:shadow-none print:w-auto print:h-auto print:max-w-none" style={{ borderColor: 'var(--color-border)' }}>
                                <div className="print:block">
                                    {!printing && <HonoraryNoteTemplate doctor={doctor} note={savedNote} scale={0.45} />}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden Export Layer */}
                <div className="opacity-0 pointer-events-none fixed -left-[5000px]">
                    {savedNote && !printing && (
                        <div id="note-pdf-export" style={{ width: '2480px', height: '3508px', background: 'white' }}>
                            <HonoraryNoteTemplate doctor={doctor} note={savedNote} isPrinting={true} scale={0.32} />
                        </div>
                    )}
                </div>

                {/* Print Layer — outside the animated preview panel, whose
                    slide-in transform/opacity would offset or blank the page. */}
                {savedNote && (
                    <div className="hidden print:block fixed inset-0 z-[9999] bg-white">
                        <HonoraryNoteTemplate doctor={doctor} note={savedNote} isPrinting={true} />
                    </div>
                )}

            </div>
        </div>
    );
};

export default HonoraryNoteEditor;
