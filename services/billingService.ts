import { HonoraryNote } from '../types';
import { dataService } from './dataService';
import { formatCurrencyToWords } from '../utils/numberToWords';
import { todayLocal } from '../utils/localDate';

export const billingService = {
    /** Tarif proposé par défaut dans la fenêtre « Facture rapide » (modifiable). */
    defaultQuickAmount: (): number => {
        const masters = dataService.getHonoraryMasterServices();
        const standardFee = dataService.getDoctorInfo().standardConsultationFee;
        const consultationService = masters.find(m => m.name.toLowerCase().includes('consultation')) || { name: 'Consultation', price: standardFee || 300 };
        return standardFee ?? consultationService.price;
    },

    // Builds (but does not save) a quick honorary note for a patient. Le montant réellement encaissé est
    // fourni par l'appelant (fenêtre de confirmation) : une note n'est JAMAIS « réglée » d'office. Le
    // statut est calculé et enregistré par Rust (payé ≥ dû) ; celui-ci n'est qu'indicatif.
    buildQuickInvoice: (params: {
        patientId: string;
        patientName: string;
        currency: string;
        amount?: number;
        prescriptionId?: string;
        amountPaid: number;
        paymentMode: 'CASH' | 'CARD' | 'TRANSFER' | 'CHEQUE';
    }): HonoraryNote => {
        const masters = dataService.getHonoraryMasterServices();
        const standardFee = dataService.getDoctorInfo().standardConsultationFee;
        const consultationService = masters.find(m => m.name.toLowerCase().includes('consultation')) || { name: 'Consultation', price: standardFee || 300 };
        const total = params.amount ?? standardFee ?? consultationService.price;

        return {
            id: Date.now().toString(),
            patientId: params.patientId,
            patientName: params.patientName,
            prescriptionId: params.prescriptionId,
            date: todayLocal(),
            invoiceNumber: '', // attribué par Rust à l'enregistrement (compteur), jamais calculé ici
            services: [{ name: consultationService.name, price: total, checked: true }],
            totalAmount: total,
            totalInWords: formatCurrencyToWords(total, params.currency),
            status: params.amountPaid >= total && total > 0 ? 'PAID' : params.amountPaid > 0 ? 'PARTIAL' : 'UNPAID',
            amountPaid: params.amountPaid,
            paymentMode: params.paymentMode,
        };
    },

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
