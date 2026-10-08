import React, { useEffect } from 'react';
import { FileDown, Printer, X } from 'lucide-react';
import ReceiptTemplate from './ReceiptTemplate';
import { usePrintMode } from './usePrintMode';
import { dataService } from '../services/dataService';
import { canOutput } from '../services/cabinetSetup';
import { toastService } from '../services/toastService';
import { ReceiptView } from '../services/receiptService';

// Aperçu, impression et PDF (A5) d'un reçu déjà enregistré par Rust. Un duplicata n'est affiché
// qu'après son enregistrement (`receiptService.duplicate`) : le bandeau porte le rang et l'heure de Rust.
interface Props {
    receipt: ReceiptView;
    onClose: () => void;
}

const ReceiptModal: React.FC<Props> = ({ receipt, onClose }) => {
    const printing = usePrintMode();
    const doctor = dataService.getDoctorInfo();
    const duplicate = receipt.duplicateRank ? { rank: receipt.duplicateRank, printedAt: receipt.duplicateAt || receipt.issuedAt } : undefined;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const exportPdf = async () => {
        const element = document.getElementById('receipt-pdf-export');
        if (!element || !canOutput()) return;
        const opt = {
            margin: 0,
            filename: `Recu_${receipt.number}${duplicate ? `_duplicata-${duplicate.rank}` : ''}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' as const },
            pagebreak: { mode: 'avoid-all' },
        };
        toastService.info('Génération du reçu PDF...');
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            await html2pdf().set(opt).from(element).save();
            toastService.success('Reçu enregistré.');
        } catch {
            toastService.error("Erreur lors de l'export PDF.");
        }
    };

    const btn = 'h-10 px-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white';
    return (
        <div role="dialog" aria-modal="true" aria-label={`Reçu ${receipt.number}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden" style={{ maxWidth: '96vw' }}>
                <div className="px-5 py-3 border-b flex items-center justify-between gap-6" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                            {receipt.kind === 'cancellation' ? "Reçu d'annulation" : 'Reçu de paiement'} {receipt.number}
                        </h2>
                        {duplicate && <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Duplicata n° {duplicate.rank} enregistré.</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }} onClick={() => window.print()}><Printer size={15} /> Imprimer</button>
                        <button type="button" className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }} onClick={exportPdf}><FileDown size={15} /> PDF</button>
                        <button type="button" aria-label="Fermer" className={btn} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }} onClick={onClose}><X size={15} /></button>
                    </div>
                </div>
                <div className="overflow-auto p-5 flex justify-center" style={{ background: 'var(--color-surface-alt)' }}>
                    {!printing && <div className="shadow-md"><ReceiptTemplate id="receipt-preview" receipt={receipt} doctor={doctor} duplicate={duplicate} /></div>}
                </div>
            </div>

            {/* Copie pour l'export PDF (hors écran) */}
            <div className="opacity-0 pointer-events-none fixed -left-[5000px]">
                {!printing && <ReceiptTemplate id="receipt-pdf-export" receipt={receipt} doctor={doctor} duplicate={duplicate} />}
            </div>
            {/* Copie pour l'impression : seule monte pendant l'impression (voir usePrintMode) */}
            <div className="hidden print:block fixed inset-0 z-[9999] bg-white">
                <ReceiptTemplate id="receipt-print" receipt={receipt} doctor={doctor} duplicate={duplicate} />
            </div>
        </div>
    );
};

export default ReceiptModal;
