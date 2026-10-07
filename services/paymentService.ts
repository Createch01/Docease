import { invoke } from '@tauri-apps/api/core';
import { HonoraryNote } from '../types';
import { dataService } from './dataService';
import { todayLocal } from '../utils/localDate';

// Encaissement des visites du JOUR, tel que l'assistante le voit : montant dû, montant
// payé, mode, statut — rien d'autre (ni historique, ni totaux, ni contenu d'ordonnance,
// ni tarifs). Le filtrage et les règles sont appliqués par Rust (scoped.rs).
export type PaymentStatus = 'PAID' | 'UNPAID' | 'PARTIAL';
export type PaymentMode = 'CASH' | 'CARD' | 'TRANSFER';

export interface DayPayment {
    id?: string;
    patientId: string;
    patientName?: string;
    date?: string;
    totalAmount: number;
    amountPaid: number;
    paymentMode: PaymentMode;
    status: PaymentStatus;
}

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
const todayDate = () => todayLocal();

const fromNote = (n: HonoraryNote): DayPayment => ({
    id: n.id,
    patientId: n.patientId,
    patientName: n.patientName,
    date: n.date,
    totalAmount: n.totalAmount,
    amountPaid: n.status === 'PAID' ? n.totalAmount : n.status === 'PARTIAL' ? (n.amountPaid || 0) : 0,
    paymentMode: n.paymentMode,
    status: n.status,
});

export const paymentService = {
    listToday: async (): Promise<DayPayment[]> => {
        if (!isTauri()) return dataService.getHonoraryNotes().filter(n => n.date === todayDate()).map(fromNote);
        return invoke<DayPayment[]>('billing_today_list');
    },

    // Crée (sans id) ou met à jour (avec id) l'encaissement d'une visite du jour.
    saveToday: async (payment: DayPayment): Promise<DayPayment> => {
        if (!isTauri()) {
            // Aperçu navigateur uniquement : pas de Rust, donc pas de contrôle.
            const existing = payment.id ? dataService.getHonoraryNotes().find(n => n.id === payment.id) : undefined;
            const note: HonoraryNote = {
                ...(existing || {
                    id: `pay-${Date.now()}`,
                    patientId: payment.patientId,
                    patientName: payment.patientName || '',
                    date: todayDate(),
                    invoiceNumber: '',
                    services: [{ name: 'Consultation', price: payment.totalAmount, checked: true }],
                    totalAmount: payment.totalAmount,
                    totalInWords: '',
                }),
                status: payment.status,
                paymentMode: payment.paymentMode,
                amountPaid: payment.amountPaid,
            };
            await dataService.saveHonoraryNote(note);
            return fromNote(note);
        }
        const saved = await invoke<DayPayment>('billing_today_save', { payment });
        // Garde le cache d'interface cohérent avec ce que Rust vient d'écrire.
        window.dispatchEvent(new CustomEvent('meddoc_data_update', { detail: { key: 'meddoc_honorary_notes' } }));
        return saved;
    },
};
