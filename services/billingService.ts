import { HonoraryNote } from '../types';
import { dataService } from './dataService';
import { formatCurrencyToWords } from '../utils/numberToWords';

const generateInvoiceNumber = (): string => {
    const existingNotes = dataService.getHonoraryNotes();
    const currentYear = new Date().getFullYear();
    const notesThisYear = existingNotes.filter(n => n.date.startsWith(currentYear.toString()));
    return `${currentYear}-${String(notesThisYear.length + 1).padStart(4, '0')}`;
};

export const billingService = {
    generateInvoiceNumber,

    // Builds (but does not save) a quick honorary note for a patient, defaulting to the
    // practice's standard consultation fee. Reused by FinancesSection's Quick Invoice
    // button and by PrescriptionEditor's "create the matching invoice?" prompt.
    buildQuickInvoice: (params: {
        patientId: string;
        patientName: string;
        currency: string;
        amount?: number;
        prescriptionId?: string;
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
            date: new Date().toISOString().split('T')[0],
            invoiceNumber: generateInvoiceNumber(),
            services: [{ name: consultationService.name, price: total, checked: true }],
            totalAmount: total,
            totalInWords: formatCurrencyToWords(total, params.currency),
            status: 'PAID',
            paymentMode: 'CASH',
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
