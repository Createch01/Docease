import React, { useState, useMemo } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { MedicalResult } from '../../types';
import { useI18n } from '../../i18n';

interface ResultsSectionProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
    onNavigate?: (view: string, data?: any) => void;
}

const ResultsSection: React.FC<ResultsSectionProps> = ({ patientId, patientName, refreshTrigger, onNavigate }) => {
    const { t, dir } = useI18n();
    const [isAddingResult, setIsAddingResult] = useState(false);
    const [newResult, setNewResult] = useState({ title: '', interpretation: '' });

    const results = useMemo(() => dataService.getMedicalResults(patientId), [patientId, refreshTrigger]);

    const handleSaveResult = () => {
        if (!patientId || !newResult.title) return;
        const res: MedicalResult = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            receivedDate: new Date().toISOString().split('T')[0],
            title: newResult.title,
            interpretation: newResult.interpretation,
            patientId: patientId,
            attachments: []
        };
        dataService.saveMedicalResult(res);
        setIsAddingResult(false);
        setNewResult({ title: '', interpretation: '' });
        window.dispatchEvent(new Event('meddoc_data_update'));
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className={`flex justify-between items-center px-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <h3 className={`text-xs font-black text-gray-400 uppercase tracking-widest ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('exam_results')}</h3>
                <button onClick={() => setIsAddingResult(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">
                    <Plus size={14} /> {t('add_result')}
                </button>
            </div>

            {isAddingResult && (
                <div className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl space-y-4 animate-in slide-in-from-top-4">
                    <div className="space-y-1">
                        <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2 text-right' : 'ml-2 text-left'} block`}>{t('exam_type_title')}</label>
                        <input type="text" className={`w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                            value={newResult.title} placeholder={t('preop_example')} onChange={e => setNewResult({ ...newResult, title: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2 text-right' : 'ml-2 text-left'} block`}>{t('interpretation_conclusion')}</label>
                        <textarea className={`w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs min-h-[80px] ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                            value={newResult.interpretation} placeholder={t('observations_placeholder')} onChange={e => setNewResult({ ...newResult, interpretation: e.target.value })} />
                    </div>
                    <div className={`flex justify-end gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                        <button onClick={() => setIsAddingResult(false)} className="px-5 py-2 text-[10px] font-black uppercase text-gray-400">{t('cancel')}</button>
                        <button onClick={handleSaveResult} className="px-5 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">{t('save')}</button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {results.length > 0 ? results.map(res => (
                    <div key={res.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden">
                        <div className={`flex justify-between items-start mb-4 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                                <ShieldCheck className="text-blue-500" size={20} />
                                <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                                    <h4 className="font-black text-gray-900 uppercase text-sm">{res.title}</h4>
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest italic">{res.date}</span>
                                </div>
                            </div>
                            {onNavigate && (
                                <button
                                    onClick={() => onNavigate('smart-doc', { patientId: patientName })}
                                    className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-100 transition-colors"
                                >
                                    {t('analyze_with_ai')}
                                </button>
                            )}
                        </div>
                        <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-50">
                            <p className={`text-[9px] font-black text-blue-400 uppercase mb-2 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('medical_conclusion')}</p>
                            <p className={`text-xs font-black text-gray-700 leading-relaxed ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{res.interpretation}</p>
                        </div>
                    </div>
                )) : (
                    <div className="p-12 text-center bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200 opacity-50">
                        <ShieldCheck className="mx-auto text-gray-200 mb-3" size={32} />
                        <p className="text-xs font-black text-gray-300 uppercase">{t('no_results_documented')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultsSection;
