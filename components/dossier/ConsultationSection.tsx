import React, { useState, useMemo } from 'react';
import { Plus, Activity, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n';
import { dataService } from '../../services/dataService';
import { ClinicalConsultation } from '../../types';
import ConsultationAssistant from './ConsultationAssistant';

interface ConsultationSectionProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
}

const ConsultationSection: React.FC<ConsultationSectionProps> = ({ patientId, patientName, refreshTrigger }) => {
    const { t, lang, dir } = useI18n();
    const [isAddingConsultation, setIsAddingConsultation] = useState(false);
    const [showAssistant, setShowAssistant] = useState(false);
    const [newConsultation, setNewConsultation] = useState<Partial<ClinicalConsultation>>({
        motif: '',
        symptoms: '',
        clinicalExam: '',
        diagnostic: '',
        treatmentPlan: '',
        notes: ''
    });

    const consultations = useMemo(() => dataService.getConsultations(patientId), [patientId, refreshTrigger]);

    const handleSaveConsultation = () => {
        if (!patientId) return;
        const cons: ClinicalConsultation = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            patientId: patientId,
            motif: newConsultation.motif || '',
            symptoms: newConsultation.symptoms || '',
            clinicalExam: newConsultation.clinicalExam || '',
            diagnostic: newConsultation.diagnostic || '',
            treatmentPlan: newConsultation.treatmentPlan || '',
            notes: newConsultation.notes || '',
        };
        dataService.saveConsultation(cons);
        setIsAddingConsultation(false);
        setShowAssistant(false);
        setNewConsultation({ motif: '', symptoms: '', clinicalExam: '', diagnostic: '', treatmentPlan: '', notes: '' });
        window.dispatchEvent(new Event('meddoc_data_update'));
    };

    const handleApplyAIParams = (params: any) => {
        setNewConsultation(prev => ({
            ...prev,
            diagnostic: params.diagnostic || prev.diagnostic,
            treatmentPlan: params.treatmentPlan ? (prev.treatmentPlan ? `${prev.treatmentPlan}\n${params.treatmentPlan}` : params.treatmentPlan) : prev.treatmentPlan
        }));
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative min-h-[500px]">
            <div className="flex justify-between items-center px-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('medical_history')}</h3>
                <div className="flex gap-2">
                    {isAddingConsultation && (
                        <button
                            onClick={() => setShowAssistant(!showAssistant)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-all ${showAssistant ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50'}`}
                        >
                            <Sparkles size={14} /> {t('ai_assistant')}
                        </button>
                    )}
                    <button
                        onClick={() => setIsAddingConsultation(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-emerald-700 transition-all hover:scale-105"
                    >
                        <Plus size={14} /> {t('new_consultation_btn')}
                    </button>
                </div>
            </div>

            <div className="flex gap-6 relative">
                <div className={`flex-1 transition-all duration-300 ${showAssistant ? 'pr-80' : ''}`}>
                    {isAddingConsultation && (
                        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-emerald-100 shadow-xl space-y-4 animate-in slide-in-from-top-4 mb-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2' : 'ml-2'}`}>{t('motif_consultation')}</label>
                                    <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                                        value={newConsultation.motif} onChange={e => setNewConsultation({ ...newConsultation, motif: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2' : 'ml-2'}`}>{t('symptoms')}</label>
                                    <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                                        value={newConsultation.symptoms} onChange={e => setNewConsultation({ ...newConsultation, symptoms: e.target.value })} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2' : 'ml-2'}`}>{t('clinical_exam')}</label>
                                <textarea className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs min-h-[80px]"
                                    value={newConsultation.clinicalExam} onChange={e => setNewConsultation({ ...newConsultation, clinicalExam: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2' : 'ml-2'}`}>{t('diagnostic')}</label>
                                    <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                                        value={newConsultation.diagnostic} onChange={e => setNewConsultation({ ...newConsultation, diagnostic: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2' : 'ml-2'}`}>{t('therapeutic_plan')}</label>
                                    <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                                        value={newConsultation.treatmentPlan} onChange={e => setNewConsultation({ ...newConsultation, treatmentPlan: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => { setIsAddingConsultation(false); setShowAssistant(false); }} className="px-5 py-2.5 text-[10px] font-black uppercase text-gray-400">{t('cancel')}</button>
                                <button onClick={handleSaveConsultation} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md">{t('save')}</button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {consultations.length > 0 ? (
                            consultations.map(c => (
                                <div key={c.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                                            <div>
                                                <h4 className="font-black text-gray-900 text-sm uppercase">{c.motif}</h4>
                                                <span className="text-[9px] font-black text-gray-400 italic">{c.date} à {c.time}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`grid grid-cols-2 gap-6 ${dir === 'rtl' ? 'pr-4 border-r' : 'pl-4 border-l'} border-gray-50`}>
                                        <div>
                                            <p className="text-[9px] font-black text-gray-300 uppercase mb-1">{t('observations_exam')}</p>
                                            <p className="text-xs font-bold text-gray-600 leading-relaxed">{c.clinicalExam || "N/A"}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-gray-300 uppercase mb-1">{t('conclusion_diagnostic')}</p>
                                            <p className="text-xs font-black text-emerald-600">{c.diagnostic || "N/A"}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-12 text-center bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200">
                                <Activity className="mx-auto text-gray-200 mb-3" size={32} />
                                <p className="text-xs font-black text-gray-300 uppercase">{t('no_results_found')}</p>
                            </div>
                        )}
                    </div>
                </div>

                {showAssistant && isAddingConsultation && (
                    <ConsultationAssistant
                        symptoms={newConsultation.symptoms || ''}
                        clinicalExam={newConsultation.clinicalExam || ''}
                        onApplyParams={handleApplyAIParams}
                        onClose={() => setShowAssistant(false)}
                    />
                )}
            </div>
        </div>
    );
};

export default ConsultationSection;
