import React, { useMemo, useState } from 'react';
import { Plus, Wallet, FileText, Trash2, Zap, CheckCircle } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { HonoraryNote, HonoraryMasterService } from '../../types';
import { formatCurrencyToWords } from '../../utils/numberToWords';
import { useI18n } from '../../i18n';

interface FinancesSectionProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
    currency: string;
    onAddNote: () => void;
    onPreviewNote: (note: HonoraryNote) => void;
}

const FinancesSection: React.FC<FinancesSectionProps> = ({
    patientId,
    patientName,
    refreshTrigger,
    currency,
    onAddNote,
    onPreviewNote
}) => {
    const { t, lang, dir } = useI18n();
    const honoraryNotes = useMemo(() => dataService.getHonoraryNotes(patientId), [patientId, refreshTrigger]);
    const [toast, setToast] = useState<string | null>(null);

    const stats = useMemo(() => ({
        total: honoraryNotes.reduce((s, n) => s + n.totalAmount, 0),
        paid: honoraryNotes.filter(n => n.status === 'PAID').reduce((s, n) => s + n.totalAmount, 0),
        balance: honoraryNotes.filter(n => n.status === 'UNPAID').reduce((s, n) => s + n.totalAmount, 0),
    }), [honoraryNotes]);

    const handleQuickInvoice = () => {
        // 1. Get default service (Consultation)
        const masters = dataService.getHonoraryMasterServices();
        const consultationService = masters.find(m => m.name.toLowerCase().includes('consultation')) || { name: 'Consultation', price: 300 };

        // 2. Generate Invoice Number
        const existingNotes = dataService.getHonoraryNotes();
        const currentYear = new Date().getFullYear();
        const notesThisYear = existingNotes.filter(n => n.date.startsWith(currentYear.toString()));
        const invoiceNumber = `${currentYear}-${String(notesThisYear.length + 1).padStart(4, '0')}`;

        // 3. Create Note
        const total = consultationService.price;
        const note: HonoraryNote = {
            id: Date.now().toString(),
            patientId,
            patientName,
            visitId: undefined,
            date: new Date().toISOString().split('T')[0],
            invoiceNumber,
            services: [{ name: consultationService.name, price: total, checked: true }],
            totalAmount: total,
            totalInWords: formatCurrencyToWords(total, currency),
            status: 'PAID',
            paymentMode: 'CASH'
        };

        // 4. Save
        dataService.saveHonoraryNote(note);
        setToast(t('quick_invoice_generated'));
        setTimeout(() => setToast(null), 3000);
        window.dispatchEvent(new Event('meddoc_data_update'));
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative">
            {toast && (
                <div className={`absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-lg z-50 animate-in slide-in-from-top-4 font-bold flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <CheckCircle size={18} /> {toast}
                </div>
            )}

            <div className={`flex justify-between items-center px-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <h3 className={`text-xs font-black text-gray-400 uppercase tracking-widest text-emerald-700/60 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('financial_view')} • {patientName}</h3>
                <div className="flex gap-2">
                    <button
                        onClick={handleQuickInvoice}
                        className="flex items-center gap-2 px-4 py-3 bg-emerald-100 text-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-200 transition-all hover:scale-105"
                    >
                        <Zap size={14} fill="currentColor" /> {t('quick_invoice')}
                    </button>
                    <button
                        onClick={onAddNote}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all hover:scale-105"
                    >
                        <Plus size={14} /> {t('honorary_note')}
                    </button>
                </div>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 rounded-[3rem] text-white shadow-xl shadow-emerald-100/50 overflow-hidden relative group">
                    <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-700"><Wallet size={160} /></div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2 ${dir === 'rtl' ? 'text-right' : ''}`}>{t('total_fees')}</p>
                    <h3 className={`text-4xl font-black ${dir === 'rtl' ? 'text-right' : ''}`}>{stats.total} <span className="text-lg opacity-60 font-bold">{currency}</span></h3>
                </div>
                <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                    <p className={`text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 ${dir === 'rtl' ? 'text-right' : ''}`}>{t('collected_amount')}</p>
                    <h3 className={`text-4xl font-black text-emerald-600 ${dir === 'rtl' ? 'text-right' : ''}`}>{stats.paid} <span className="text-lg opacity-60 font-bold">{currency}</span></h3>
                    <div className="mt-4 w-full bg-gray-50 h-1 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${(stats.paid / (stats.total || 1)) * 100}%` }} />
                    </div>
                </div>
                <div className="bg-red-50/50 p-8 rounded-[3rem] border border-red-100 shadow-sm">
                    <p className={`text-[10px] font-black text-red-400 uppercase tracking-[0.2em] mb-2 ${dir === 'rtl' ? 'text-right' : ''}`}>{t('amount_to_receive')}</p>
                    <h3 className={`text-4xl font-black text-red-600 ${dir === 'rtl' ? 'text-right' : ''}`}>{stats.balance} <span className="text-lg opacity-60 font-bold">{currency}</span></h3>
                </div>
            </div>

            <div className="bg-white rounded-[3rem] border border-gray-100 overflow-hidden shadow-xl shadow-gray-100/20">
                <table className={`w-full ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                            <th className={`p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ${dir === 'rtl' ? 'text-right' : ''}`}>{t('note_number')}</th>
                            <th className={`p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ${dir === 'rtl' ? 'text-right' : ''}`}>{t('date')}</th>
                            <th className={`p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ${dir === 'rtl' ? 'text-right' : ''}`}>{t('benefits')}</th>
                            <th className={`p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>{t('amount')}</th>
                            <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center">{t('status')}</th>
                            <th className={`p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>{t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {honoraryNotes.length > 0 ? honoraryNotes.map(note => (
                            <tr key={note.id} className="border-b border-gray-50 text-[11px] font-black hover:bg-emerald-50/20 transition-all group">
                                <td className="p-6 text-gray-400 font-mono">#{note.invoiceNumber}</td>
                                <td className="p-6">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500/20" />
                                        {note.date}
                                    </div>
                                </td>
                                <td className="p-6">
                                    <div className="max-w-[250px] truncate uppercase tracking-tight text-gray-600">
                                        {note.services.filter(s => s.checked).map(s => s.name).join(', ') || 'Consultation'}
                                    </div>
                                </td>
                                <td className={`p-6 text-lg ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
                                    <span className="text-emerald-700">{note.totalAmount}</span>
                                    <span className="text-[10px] text-gray-300 ml-1 ml-1">{currency}</span>
                                </td>
                                <td className="p-6 text-center">
                                    <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 ${note.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                        {note.status === 'PAID' ? <CheckCircle size={10} /> : <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
                                        {note.status === 'PAID' ? t('paid') : t('unpaid')}
                                    </span>
                                </td>
                                <td className={`p-6 shrink-0 ${dir === 'rtl' ? 'text-left' : 'text-right'}`}>
                                    <div className={`flex justify-end gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                        <button onClick={() => onPreviewNote(note)} title={t('overview')} className="p-3 bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-100 rounded-2xl transition-all shadow-sm hover:shadow-emerald-100">
                                            <FileText size={18} />
                                        </button>
                                        <button onClick={() => {
                                            if (window.confirm(t('delete_honorary_note_confirm'))) {
                                                dataService.deleteHonoraryNote(note.id);
                                                window.dispatchEvent(new Event('meddoc_data_update'));
                                            }
                                        }} title={t('delete')} className="p-3 bg-white text-gray-400 hover:bg-red-500 hover:text-white border border-gray-100 hover:border-red-400 rounded-2xl transition-all">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan={6} className="p-32 text-center text-gray-300 font-bold uppercase text-[10px] tracking-[0.2em]">
                                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 opacity-40">
                                    <Wallet size={40} />
                                </div>
                                {t('no_invoices_found')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FinancesSection;
