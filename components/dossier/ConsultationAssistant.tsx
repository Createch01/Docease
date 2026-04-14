import React, { useState } from 'react';
import { Sparkles, BrainCircuit, Stethoscope, AlertTriangle, ArrowRight, Loader2, X } from 'lucide-react';
import { smartDocService } from '../../services/smartDocService';
import { useI18n } from '../../i18n';

interface ConsultationAssistantProps {
    symptoms: string;
    clinicalExam: string;
    onApplyParams: (params: any) => void;
    onClose: () => void;
}

const ConsultationAssistant: React.FC<ConsultationAssistantProps> = ({ symptoms, clinicalExam, onApplyParams, onClose }) => {
    const { t, dir } = useI18n();
    const [loading, setLoading] = useState(false);
    const [analysis, setAnalysis] = useState<any>(null);

    const handleAnalyze = async () => {
        if (!symptoms && !clinicalExam) return;
        setLoading(true);
        try {
            const result = await smartDocService.analyzeConsultation(symptoms, clinicalExam);
            setAnalysis(result);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`w-80 bg-white border-l border-gray-100 h-full flex flex-col shadow-xl absolute top-0 bottom-0 z-20 animate-in duration-300 ${dir === 'rtl' ? 'left-0 border-r slide-in-from-left' : 'right-0 border-l slide-in-from-right'}`}>
            {/* Header */}
            <div className={`p-5 bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex justify-between items-start ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                    <h3 className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                        <Sparkles size={16} /> {t('ai_assistant')}
                    </h3>
                    <p className="text-[10px] opacity-80 mt-1 max-w-[200px]">{t('real_time_analysis')}</p>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={16} /></button>
            </div>

            {/* Content */}
            <div className={`flex-1 overflow-y-auto p-5 space-y-6 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                {!analysis && !loading && (
                    <div className="text-center py-10 opacity-50">
                        <BrainCircuit size={48} className="mx-auto mb-4 text-indigo-300" />
                        <p className="text-xs font-bold text-gray-500">{t('fill_symptoms_instruction')}</p>
                        <button
                            onClick={handleAnalyze}
                            disabled={!symptoms && !clinicalExam}
                            className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {t('analyze_now')}
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="text-center py-20">
                        <Loader2 size={32} className="mx-auto text-indigo-600 animate-spin mb-3" />
                        <p className="text-xs font-bold text-gray-400 animate-pulse">{t('thinking_in_progress')}</p>
                    </div>
                )}

                {analysis && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        {/* Diagnostic */}
                        <div className="space-y-3">
                            <h4 className={`text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse text-right' : 'text-left'}`}>
                                <Stethoscope size={12} /> {t('diagnostic_hypotheses')}
                            </h4>
                            {analysis.differentialDiagnosis?.map((d: any, i: number) => (
                                <div key={i} className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                                    <div className={`flex justify-between items-start ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                        <p className="font-bold text-indigo-900 text-sm">{d.condition}</p>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${d.probability === 'High' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {d.probability}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-indigo-700 mt-1 leading-relaxed">{d.reasoning}</p>
                                    <button
                                        onClick={() => onApplyParams({ diagnostic: d.condition })}
                                        className={`mt-2 text-[9px] font-black text-indigo-600 uppercase flex items-center gap-1 hover:underline ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}
                                    >
                                        {t('choose')} <ArrowRight size={10} className={dir === 'rtl' ? 'rotate-180' : ''} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Red Flags */}
                        {analysis.redFlags?.length > 0 && (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                <h4 className={`text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2 mb-2 ${dir === 'rtl' ? 'flex-row-reverse text-right' : 'text-left'}`}>
                                    <AlertTriangle size={12} /> {t('red_flags')}
                                </h4>
                                <ul className={`list-disc list-inside space-y-1 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
                                    {analysis.redFlags.map((flag: string, i: number) => (
                                        <li key={i} className="text-[10px] font-bold text-red-700">{flag}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Exams */}
                        {analysis.recommendedExams?.length > 0 && (
                            <div className="space-y-2">
                                <h4 className={`text-[10px] font-black text-gray-400 uppercase tracking-widest ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('suggested_exams')}</h4>
                                <div className="space-y-2">
                                    {analysis.recommendedExams.map((exam: any, i: number) => (
                                        <div key={i} className={`flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                            <span className="text-xs font-bold text-gray-700">{exam.name}</span>
                                            <button
                                                onClick={() => onApplyParams({ treatmentPlan: `Examen: ${exam.name}` })}
                                                className="p-1 hover:bg-gray-200 rounded-md text-gray-400 hover:text-indigo-600 transition-colors"
                                            >
                                                <PlusIcon />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Treatment */}
                        {analysis.treatmentPlan?.length > 0 && (
                            <div className="space-y-2">
                                <h4 className={`text-[10px] font-black text-gray-400 uppercase tracking-widest ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('therapeutic_plan')}</h4>
                                <div className="space-y-2">
                                    {analysis.treatmentPlan.map((plan: any, i: number) => (
                                        <div key={i} className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                            <span className={`text-[9px] font-black text-emerald-600 uppercase mb-1 block ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{plan.category}</span>
                                            <p className={`text-xs font-bold text-emerald-900 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{plan.detail}</p>
                                            <button
                                                onClick={() => onApplyParams({ treatmentPlan: plan.detail })}
                                                className={`mt-2 text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1 hover:underline ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}
                                            >
                                                {t('add')} <ArrowRight size={10} className={dir === 'rtl' ? 'rotate-180' : ''} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
    );
};

const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
);

export default ConsultationAssistant;
