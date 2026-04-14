import React, { useMemo } from 'react';
import { LayoutDashboard, FileText, Wallet, Activity, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n';
import { dataService } from '../../services/dataService';
import { HonoraryNote, Prescription } from '../../types';

interface DossierOverviewProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
    onNavigate: (tab: any) => void;
    onPreviewNote: (note: HonoraryNote) => void;
    onPreviewPrescription: (rx: Prescription) => void;
}

const DossierOverview: React.FC<DossierOverviewProps> = ({
    patientId,
    patientName,
    refreshTrigger,
    onNavigate,
    onPreviewNote,
    onPreviewPrescription
}) => {
    const { t, lang, dir } = useI18n();
    const consultations = useMemo(() => dataService.getConsultations(patientId), [patientId, refreshTrigger]);
    const prescriptions = useMemo(() => dataService.getPrescriptions().filter(p => p.patientId === patientId), [patientId, refreshTrigger]);
    const labRequests = useMemo(() => dataService.getLabRequests(patientId), [patientId, refreshTrigger]);
    const invoices = useMemo(() => dataService.getInvoices(patientId), [patientId, refreshTrigger]);
    const honoraryNotes = useMemo(() => dataService.getHonoraryNotes(patientId), [patientId, refreshTrigger]);
    const results = useMemo(() => dataService.getMedicalResults(patientId), [patientId, refreshTrigger]);

    const totalDebt = useMemo(() => invoices.reduce((s, i) => s + i.balance, 0), [invoices]);

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            {/* Dashboard Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-[2rem] text-white shadow-lg">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">{t('consultations')}</p>
                    <h4 className="text-2xl font-black">{consultations.length}</h4>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('prescriptions')}</p>
                    <h4 className="text-2xl font-black text-gray-900">{prescriptions.length}</h4>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">{t('certificates')}</p>
                    <h4 className="text-2xl font-black text-gray-900">{honoraryNotes.length}</h4>
                </div>
                <div className="bg-red-50 p-6 rounded-[2rem] border border-red-100">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">{t('total_debt')}</p>
                    <h4 className="text-2xl font-black text-red-600">{totalDebt} {lang === 'ar' ? 'د.م.' : 'DH'}</h4>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Latest Prescription */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[400px]">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">{t('latest_prescription')}</h4>
                        <button onClick={() => onNavigate('ordonnance')} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">{t('view_all')}</button>
                    </div>
                    <div className="flex-1 p-6 overflow-hidden">
                        {prescriptions.length > 0 ? (
                            <div className="h-full flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-3 py-1 rounded-full uppercase italic">{prescriptions[0].date}</span>
                                    <FileText size={20} className="text-emerald-500" />
                                </div>
                                <div className="space-y-2 flex-1 overflow-y-auto pr-2 scrollbar-thin">
                                    {prescriptions[0].items.map((item, idx) => (
                                        <div key={idx} className="p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            <span className="text-xs font-bold text-gray-700 uppercase">{item.medicineName}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => onPreviewPrescription(prescriptions[0])}
                                    className="mt-4 w-full py-3 bg-emerald-50 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all"
                                >
                                    {t('open_prescription')}
                                </button>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-20">
                                <FileText size={48} />
                                <p className="mt-2 text-[10px] font-black uppercase">{t('no_prescriptions')}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Latest Honorary Note */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[400px]">
                    <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">{t('latest_note')}</h4>
                        <button onClick={() => onNavigate('facture')} className="text-[10px] font-black text-blue-600 uppercase hover:underline">{t('analytics')}</button>
                    </div>
                    <div className="flex-1 p-6">
                        {honoraryNotes.length > 0 ? (
                            <div className="h-full flex flex-col justify-center items-center text-center">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                                    <Wallet size={32} />
                                </div>
                                <h5 className="text-xl font-black text-gray-900 mb-1">{honoraryNotes[0].totalAmount} {lang === 'ar' ? 'د.م.' : 'DH'}</h5>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 italic">{honoraryNotes[0].date}</p>
                                <div className="flex gap-2">
                                    <button onClick={() => onPreviewNote(honoraryNotes[0])} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100">{t('overview')}</button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-20">
                                <Wallet size={48} />
                                <p className="mt-2 text-[10px] font-black uppercase">{t('no_prescriptions')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mini Observations & Lab Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-emerald-50/30 rounded-[2.5rem] border border-emerald-100/50 p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={16} /> {t('latest_observations')}
                        </h4>
                        <button onClick={() => onNavigate('consultation')} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">{t('view_history')}</button>
                    </div>
                    {consultations.length > 0 ? (
                        <div className="space-y-4">
                            <div>
                                <p className="text-[9px] font-black text-emerald-400 uppercase mb-2">Motif & symptômes</p>
                                <p className="text-sm font-bold text-gray-800 leading-relaxed italic">"{consultations[0].motif}"</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-emerald-400 uppercase mb-2">Diagnostic / Plan</p>
                                <p className="text-sm font-black text-emerald-700 mb-1">{consultations[0].diagnostic || "N/A"}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-center text-[10px] font-black text-gray-300 uppercase py-4">{t('no_patients')}</p>
                    )}
                </div>

                <div className="bg-amber-50/20 rounded-[2.5rem] border border-amber-100/50 p-8 flex flex-col h-[350px]">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                            <Filter size={16} /> {t('bilan_results')}
                        </h4>
                        <div className="flex gap-3">
                            <button onClick={() => onNavigate('analyses')} className="text-[10px] font-black text-amber-600 uppercase hover:underline">{t('analyses')}</button>
                            <button onClick={() => onNavigate('resultats')} className="text-[10px] font-black text-blue-600 uppercase hover:underline">{t('results')}</button>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 overflow-y-auto pr-2 scrollbar-thin">
                        {/* 1. Pending Lab Requests (Analyses) */}
                        {labRequests.filter(l => l.status === 'REQUESTED').length > 0 && (
                            <div className="space-y-2 mb-4">
                                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">{t('pending_requests')} ({labRequests.filter(l => l.status === 'REQUESTED').length})</p>
                                {labRequests.filter(l => l.status === 'REQUESTED').slice(0, 3).map((req, i) => (
                                    <div key={i} className={`flex justify-between items-center p-3 bg-white rounded-xl border border-amber-50 shadow-sm ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                        <span className={`text-[10px] font-black text-gray-700 uppercase truncate flex-1 ${dir === 'rtl' ? 'ml-2 text-right' : 'mr-2 text-left'}`}>{req.title}</span>
                                        <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded-md uppercase whitespace-nowrap">{t('to_do')}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 2. Recent Medical Results */}
                        {results.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Derniers Résultats</p>
                                {results.slice(0, 3).map((res, i) => (
                                    <div key={i} className="p-3 bg-white rounded-xl border border-blue-50 shadow-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-black text-gray-900 uppercase truncate">{res.title}</span>
                                            <span className="text-[8px] font-black text-gray-400 uppercase italic">{res.date}</span>
                                        </div>
                                        <p className="text-[9px] font-bold text-gray-500 line-clamp-1 italic">"{res.interpretation}"</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {labRequests.filter(l => l.status === 'REQUESTED').length === 0 && results.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-30">
                                <Filter size={32} />
                                <p className="text-[10px] font-black uppercase mt-2">{t('no_biological_data')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DossierOverview;
