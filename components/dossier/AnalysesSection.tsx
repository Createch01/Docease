import React, { useState, useMemo } from 'react';
import { Plus, Filter, Printer, Check, X, Search, FlaskConical, Radio, FileText, Activity, Eye, FileDigit, ChevronRight, Loader2 } from 'lucide-react';
import { useI18n } from '../../i18n';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { dataService } from '../../services/dataService';
import { LabRequest, Patient } from '../../types';
import { printService } from '../../services/printService';
import { toastService } from '../../services/toastService';
import { settingsService } from '../../services/settingsService';
import AnalysisPrescriptionTemplate from '../AnalysisPrescriptionTemplate';
import { COMMON_ANALYSES } from '../../constants/medicalData';

interface AnalysesSectionProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
}


const AnalysesSection: React.FC<AnalysesSectionProps> = ({ patientId, patientName, refreshTrigger }) => {
    const { t, lang, dir } = useI18n();
    const [isAddingLabRequest, setIsAddingLabRequest] = useState(false);
    const [newLabRequest, setNewLabRequest] = useState({ title: '', tests: [] as string[], notes: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [printingRequest, setPrintingRequest] = useState<LabRequest | null>(null);
    const [previewRequest, setPreviewRequest] = useState<LabRequest | null>(null);
    const doctor = dataService.getDoctorInfo();

    const patient = useMemo(() => dataService.getPatientProfile(patientId), [patientId]);
    const labRequests = useMemo(() => dataService.getLabRequests(patientId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [patientId, refreshTrigger]);

    const handleToggleTest = (test: string) => {
        setNewLabRequest(prev => ({
            ...prev,
            tests: prev.tests.includes(test)
                ? prev.tests.filter(t => t !== test)
                : [...prev.tests, test]
        }));
    };

    const handleSaveLabRequest = (shouldPrint = false) => {
        const titleToSave = newLabRequest.title.trim() || 'Bilan Biologique';

        if (!patientId || newLabRequest.tests.length === 0) {
            toastService.warning(t('new_prescription'));
            return;
        }

        const req: LabRequest = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            title: titleToSave,
            tests: newLabRequest.tests,
            status: 'REQUESTED',
            notes: newLabRequest.notes,
            patientId: patientId
        };

        dataService.saveLabRequest(req);
        toastService.success(t('lab_request_saved'));

        if (shouldPrint) {
            handlePrint(req);
        }

        setIsAddingLabRequest(false);
        setNewLabRequest({ title: '', tests: [], notes: '' });
    };

    const handlePrint = (req: LabRequest) => {
        if (!patient) {
            toastService.error(t('patient_profile_not_found'));
            return;
        }
        setPrintingRequest(req);
        toastService.info(t('generating_print'));
        setTimeout(() => {
            window.onafterprint = () => {
                setPrintingRequest(null);
            };
            window.print();
        }, 300);
    };

    const groupedTests = useMemo(() => {
        const groups: { category: string; items: string[] }[] = [];
        COMMON_ANALYSES.forEach(cat => {
            const items = cat.items.filter(item => newLabRequest.tests.includes(item));
            if (items.length > 0) {
                // Keep the order defined in COMMON_ANALYSES
                groups.push({ category: cat.category, items });
            }
        });
        return groups;
    }, [newLabRequest.tests]);

    const getGroupedFromRequest = (reqTests: string[]) => {
        const groups: { category: string; items: string[] }[] = [];
        COMMON_ANALYSES.forEach(cat => {
            const items = cat.items.filter(item => reqTests.includes(item));
            if (items.length > 0) {
                groups.push({ category: cat.category, items });
            }
        });

        // Handle tests that might not be in COMMON_ANALYSES (manual entry if added later)
        const allKnownItems = new Set(COMMON_ANALYSES.flatMap(c => c.items));
        const unknownItems = reqTests.filter(t => !allKnownItems.has(t));

        if (unknownItems.length > 0) {
            groups.push({ category: "Autres", items: unknownItems });
        }

        return groups;
    };

    const handleExportPDF = (req: LabRequest) => {
        const element = document.getElementById(`pdf-render-${req.id}`);
        if (!element) return;

        const opt = {
            margin: 0,
            filename: `Bilan_${patientName}_${req.date}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
            pagebreak: { mode: 'avoid-all' }
        };

        toastService.info(t('generating_pdf'));
        html2pdf()
            .set(opt)
            .from(element)
            .save()
            .then(() => {
                toastService.success(t('pdf_saved_success'));
            })
            .catch((err: any) => {
                console.error("PDF Export Error:", err);
                toastService.error(t('pdf_generation_error'));
            });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className={`flex justify-between items-center px-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                    <h3 className="text-xl font-black text-emerald-900 uppercase tracking-tight italic">{t('lab_imaging')}</h3>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1">{labRequests.length} {t('total_requests')}</p>
                </div>
                <button
                    onClick={() => setIsAddingLabRequest(!isAddingLabRequest)}
                    className={`flex items-center gap-2 px-6 py-3 font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-lg ${isAddingLabRequest ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-600 text-white shadow-emerald-100'}`}
                >
                    {isAddingLabRequest ? <X size={16} /> : <Plus size={16} />}
                    {isAddingLabRequest ? t('cancel') : t('new_request')}
                </button>
            </div>

            {/* Modal/Form Overlay for New Request */}
            {isAddingLabRequest && (
                <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden">
                    {/* Header Bar */}
                    <div className={`bg-emerald-600 p-6 flex justify-between items-center text-white shadow-xl ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex items-center gap-4 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                            <FlaskConical size={24} />
                            <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                                <h3 className="text-xl font-black uppercase italic tracking-tighter">{t('new_bio_exam')}</h3>
                                <p className="text-[10px] font-bold uppercase opacity-80 tracking-widest mt-0.5">{t('for_patient')}: {patientName}</p>
                            </div>
                        </div>
                        <div className={`flex gap-4 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                            <button onClick={() => setIsAddingLabRequest(false)} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">{t('cancel')}</button>
                            <button
                                onClick={() => {
                                    const element = document.getElementById('preview-sheet-creation');
                                    if (element) {
                                        toastService.info(t('preparing_pdf'));
                                        const opt = {
                                            margin: 0,
                                            filename: `Bilan_${patientName}_${new Date().toLocaleDateString()}.pdf`,
                                            image: { type: 'jpeg' as const, quality: 0.98 },
                                            html2canvas: { scale: 2.5, useCORS: true },
                                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                                            pagebreak: { mode: 'avoid-all' }
                                        };
                                        html2pdf()
                                            .set(opt)
                                            .from(element)
                                            .save()
                                            .then(() => {
                                                toastService.success(t('pdf_saved_success'));
                                                handleSaveLabRequest(false);
                                            })
                                            .catch((err: any) => {
                                                console.error("PDF Save Error:", err);
                                                toastService.error(t('pdf_generation_error'));
                                            });
                                    }
                                }}
                                className="px-6 py-3 bg-white text-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95"
                            >
                                <FileDigit size={16} /> {t('save_pdf')}
                            </button>
                            <button onClick={() => handleSaveLabRequest(true)} className="px-8 py-3 bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95"><Printer size={16} /> {t('save_print')}</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex">
                        {/* LEFT: Selection Interface */}
                        <div className={`w-[45%] h-full overflow-y-auto p-10 border-r border-emerald-50 space-y-8 bg-gray-50/50 ${dir === 'rtl' ? 'order-last border-l border-r-0' : ''}`}>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className={`text-[10px] font-black text-emerald-900 uppercase tracking-widest ${dir === 'rtl' ? 'mr-4 text-right' : 'ml-4 text-left'}`}>{t('report_title')}</label>
                                    <input
                                        type="text"
                                        className={`w-full p-4 bg-white border border-emerald-100 rounded-2xl font-black text-sm text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                                        value={newLabRequest.title}
                                        placeholder={t('preop_example')}
                                        onChange={e => setNewLabRequest({ ...newLabRequest, title: e.target.value })}
                                    />
                                </div>

                                <div className="relative">
                                    <Search className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-emerald-400`} size={16} />
                                    <input
                                        type="text"
                                        placeholder={t('search_analysis')}
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className={`w-full ${dir === 'rtl' ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'} py-4 bg-white border border-emerald-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm`}
                                    />
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {COMMON_ANALYSES.map(cat => {
                                        const filteredItems = cat.items.filter(item => item.toLowerCase().includes(searchTerm.toLowerCase()));
                                        if (filteredItems.length === 0) return null;

                                        return (
                                            <div key={cat.category} className="space-y-3 bg-white p-5 rounded-2xl border border-emerald-50 shadow-sm flex flex-col">
                                                <div className={`flex items-center gap-2 border-b border-emerald-50/50 pb-2 mb-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                                    <FlaskConical size={12} className="text-emerald-500" />
                                                    <h5 className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">{cat.category}</h5>
                                                </div>
                                                <div className="grid grid-cols-1 gap-1 flex-1">
                                                    {filteredItems.map(item => {
                                                        const isSelected = newLabRequest.tests.includes(item);
                                                        return (
                                                            <button
                                                                key={item}
                                                                onClick={() => handleToggleTest(item)}
                                                                className={`text-left px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-between group ${isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-50/50 hover:bg-emerald-50 text-gray-700 border border-transparent'} ${dir === 'rtl' ? 'flex-row-reverse text-right' : ''}`}
                                                            >
                                                                <span className="truncate flex-1">{item}</span>
                                                                {isSelected ? <Check size={12} /> : <div className="w-3 h-3 border border-gray-200 rounded-sm bg-white" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: LIVE PREVIEW (FULL SHEET) */}
                        <div className="flex-1 h-full bg-gray-200/50 flex flex-col items-center p-6 overflow-y-auto">
                            <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4">{t('real_time_preview')}</h4>
                            <div className="shadow-2xl rounded-[2rem] overflow-hidden bg-white border border-gray-100 flex justify-center items-start shrink-0">
                                <AnalysisPrescriptionTemplate
                                    doctor={doctor}
                                    appearance={settingsService.getAppearance()}
                                    patient={patient || { name: patientName }}
                                    tests={groupedTests}
                                    date={new Date().toLocaleDateString('fr-FR')}
                                    notes={newLabRequest.notes}
                                    scale={0.32}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* List of Previous Requests */}
            <div className="grid grid-cols-1 gap-6">
                {labRequests.length > 0 ? labRequests.map(req => (
                    <div key={req.id} className="bg-white p-8 rounded-[3rem] border border-emerald-100/50 shadow-soft-lg flex flex-col md:flex-row justify-between items-center gap-8 group hover:border-emerald-500/30 transition-all glass-effect relative overflow-hidden">
                        {/* Priority Decoration */}
                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-500/20" />

                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                                    <FlaskConical size={24} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-emerald-500 uppercase italic tracking-widest">{req.date}</span>
                                        <span className="text-[10px] font-black text-gray-300 uppercase">Ref: #{req.id.slice(-6)}</span>
                                    </div>
                                    <h4 className="font-extrabold text-emerald-900 uppercase text-lg tracking-tight">{req.title}</h4>
                                </div>
                            </div>

                            <div className={`flex flex-wrap gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                {req.tests.map((test, idx) => (
                                    <span key={idx} className="px-3 py-1.5 bg-emerald-50/50 text-[9px] font-black text-emerald-700 rounded-xl uppercase border border-emerald-100 hover:bg-emerald-100 transition-colors">
                                        {test}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className={`flex items-center gap-6 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                            <div className="text-right">
                                {req.status === 'RECEIVED' && (
                                    <span className="px-4 py-2 rounded-full text-[9px] font-black uppercase border tracking-widest bg-emerald-50 text-emerald-600 border-emerald-100">
                                        {t('received')}
                                    </span>
                                )}
                            </div>
                            <div className="h-10 w-[1px] bg-emerald-100/30" />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPreviewRequest(req)}
                                    className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-all"
                                    title={t('overview')}
                                >
                                    <Eye size={18} />
                                </button>
                                <button
                                    onClick={() => handleExportPDF(req)}
                                    className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl hover:bg-emerald-100 transition-all"
                                    title={t('save_pdf')}
                                >
                                    <FileDigit size={18} />
                                </button>
                                <button
                                    onClick={() => handlePrint(req)}
                                    className="p-4 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-100 transition-all hover:scale-110 active:scale-95 flex items-center gap-2"
                                    title={t('print')}
                                >
                                    <Printer size={18} />
                                    <span className="text-[10px] font-black uppercase hidden lg:inline">{t('print')}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="p-20 text-center bg-white rounded-[4rem] border border-dashed border-emerald-200">
                        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <FlaskConical className="text-emerald-300" size={40} />
                        </div>
                        <h4 className="text-emerald-700 font-extrabold uppercase italic">{t('no_results_found')}</h4>
                        <p className="text-[10px] text-emerald-500/50 font-black uppercase tracking-widest mt-2">{t('no_results_found')}</p>
                    </div>
                )}
            </div>

            <style>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            {/* Modal for Preview */}
            {
                previewRequest && (
                    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="bg-emerald-950/20 absolute inset-0" onClick={() => setPreviewRequest(null)} />
                        <div className="bg-white rounded-[3rem] p-2 max-w-[900px] w-full max-h-[98vh] overflow-y-auto relative z-10 shadow-2xl space-y-2 flex flex-col items-center">
                            <div className={`flex justify-between items-center w-full mb-1 px-4 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                <h3 className="text-xl font-black text-emerald-900 uppercase italic">{t('bilan_preview')}</h3>
                                <button onClick={() => setPreviewRequest(null)} className="p-3 hover:bg-red-50 text-red-500 rounded-full transition-colors"><X size={28} /></button>
                            </div>

                            <div className="shadow-2xl rounded-[2.5rem] overflow-hidden bg-gray-100 border border-gray-100 flex justify-center items-start shrink-0">
                                <AnalysisPrescriptionTemplate
                                    doctor={doctor}
                                    appearance={settingsService.getAppearance()}
                                    patient={patient || { name: patientName }}
                                    tests={getGroupedFromRequest(previewRequest.tests)}
                                    date={previewRequest.date}
                                    notes={previewRequest.notes}
                                    scale={0.17}
                                />
                            </div>

                            <div className="flex gap-4 w-full pt-4">
                                <button
                                    onClick={() => handleExportPDF(previewRequest)}
                                    className="flex-1 py-5 bg-emerald-50 text-emerald-700 font-black rounded-2xl border border-emerald-100 uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95"
                                >
                                    <FileDigit size={20} /> {t('save_pdf')}
                                </button>
                                <button
                                    onClick={() => handlePrint(previewRequest)}
                                    className="flex-1 py-5 bg-emerald-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95"
                                >
                                    <Printer size={20} /> {t('print_now')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Hidden PDF Renders */}
            <div className="opacity-0 pointer-events-none fixed -left-[5000px]">
                {labRequests.map(req => (
                    <div key={req.id} id={`pdf-render-${req.id}`} style={{ width: '2480px', height: '3508px', background: 'white' }}>
                        <AnalysisPrescriptionTemplate
                            doctor={doctor}
                            appearance={settingsService.getAppearance()}
                            patient={patient || { name: patientName }}
                            tests={getGroupedFromRequest(req.tests)}
                            date={req.date}
                            notes={req.notes}
                            isPrinting={true}
                            scale={0.32}
                        />
                    </div>
                ))}
            </div>

            {/* Hidden Print Overlay */}
            {
                printingRequest && (
                    <div className="hidden print:block fixed inset-0 z-[9999] bg-white">
                        <div className="print-page w-full h-full bg-white">
                            <AnalysisPrescriptionTemplate
                                doctor={doctor}
                                appearance={settingsService.getAppearance()}
                                patient={patient as Patient}
                                tests={getGroupedFromRequest(printingRequest.tests)}
                                date={printingRequest.date}
                                notes={printingRequest.notes}
                                isPrinting={true}
                            />
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AnalysesSection;
