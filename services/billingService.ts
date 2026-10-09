import { HonoraryNote } from '../types';
import { dataService } from './dataService';
import { todayLocal } from '../utils/localDate';
import { DiscountInput, LineInput } from './tariffService';

export const billingService = {
    /** Tarif proposé par défaut dans la fenêtre « Facture rapide » (modifiable). */
    defaultQuickAmount: (): number => {
        const masters = dataService.getHonoraryMasterServices();
        const standardFee = dataService.getDoctorInfo().standardConsultationFee;
        const consultationService = masters.find(m => m.name.toLowerCase().includes('consultation')) || { name: 'Consultation', price: standardFee || 300 };
        return standardFee ?? consultationService.price;
    },

    // Builds (but does not save) a quick honorary note for a patient. Les lignes (actes de la grille, remises) sont
    // calculées et figées par Rust à l'enregistrement : le prix envoyé ici n'est jamais repris. Le montant
    // réellement encaissé est fourni par l'appelant (fenêtre de confirmation) : une note n'est JAMAIS « réglée »
    // d'office. Le statut est calculé et enregistré par Rust (payé ≥ dû) ; celui-ci n'est qu'indicatif.
    buildQuickInvoice: (params: {
        patientId: string;
        patientName: string;
        lines: LineInput[];
        noteDiscount?: DiscountInput | null;
        /** Net en dirhams, tel que calculé par Rust (aperçu). */
        total: number;
        totalInWords: string;
        prescriptionId?: string;
        amountPaid: number;
        paymentMode: 'CASH' | 'CARD' | 'TRANSFER' | 'CHEQUE';
    }): HonoraryNote => ({
        id: Date.now().toString(),
        patientId: params.patientId,
        patientName: params.patientName,
        prescriptionId: params.prescriptionId,
        date: todayLocal(),
        invoiceNumber: '', // attribué par Rust à l'enregistrement (compteur), jamais calculé ici
        services: [],
        lines: params.lines,
        noteDiscount: params.noteDiscount ?? null,
        totalAmount: params.total,
        totalInWords: params.totalInWords,
        status: 'UNPAID', // indicatif : Rust recalcule depuis le registre des encaissements
        amountPaid: params.amountPaid,
        paymentMode: params.paymentMode,
    }),

    // Computed collected/outstanding amounts for a set of honorary notes, PARTIAL-aware.
    computeStats: (notes: HonoraryNote[]) => {
        let total = 0, collected = 0, outstanding = 0;
        notes.forEach(n => {
            total += n.totalAmount;
            if (n.status === 'PAID') collected += n.totalAmount;
            else if (n.status === 'PARTIAL') {
                const paid = n.amountPaid || 0;
                collected += paid;
                outstanding += Math.max(0, n.totalAmount - paid);
            } else {
                outstanding += n.totalAmount;
            }
        });
        return { total, collected, outstanding };
    },
};
