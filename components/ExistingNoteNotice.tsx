import React from 'react';
import { HonoraryNote } from '../types';

const STATUS_FR: Record<string, string> = { PAID: 'Réglé', PARTIAL: 'Partiel', UNPAID: 'Non payé' };

/** Notes non annulées de ce patient datées du jour (une visite = une note). */
export const todaysNotes = (notes: HonoraryNote[], patientId: string, today: string): HonoraryNote[] =>
    notes.filter(n => n.patientId === patientId && n.date === today && !n.cancelledAt);

/**
 * Règle « une visite = une note » : avant d'en créer une seconde, on propose d'imprimer celle qui existe.
 * Une seconde note n'est créée qu'après le clic explicite « Créer une autre note ».
 */
const ExistingNoteNotice: React.FC<{ note: HonoraryNote; currency: string; onOpen: () => void; onCreateAnother: () => void; onClose: () => void }> = ({ note, currency, onOpen, onCreateAnother, onClose }) => (
    <div role="dialog" aria-modal="true" aria-label="Une note existe déjà aujourd'hui" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Une note existe déjà aujourd'hui</h2>
            <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }} data-testid="existing-note">
                Pour ce patient : la note <span className="font-mono">{note.invoiceNumber || '—'}</span> ({note.totalAmount} {currency}, {STATUS_FR[note.status] ?? note.status}). Une visite correspond à une seule note.
            </p>
            <div className="flex flex-col gap-2">
                <button type="button" onClick={onOpen} className="h-10 px-4 rounded-lg text-white text-[13px] font-medium" style={{ background: 'var(--color-primary)' }}>
                    Imprimer la note {note.invoiceNumber}
                </button>
                <button type="button" onClick={onCreateAnother} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                    Créer une autre note
                </button>
                <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-[13px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Fermer
                </button>
            </div>
        </div>
    </div>
);

export default ExistingNoteNotice;
