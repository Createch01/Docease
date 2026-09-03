import React, { useState, useMemo, useRef } from 'react';
import { Plus, ShieldCheck, Paperclip, X, Eye, Layers, List, FlaskConical, Radio, FileQuestion } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { MedicalResult, MedicalResultAttachment, MedicalResultType } from '../../types';
import { useI18n } from '../../i18n';

interface ResultsSectionProps {
    patientId: string;
    patientName: string;
    refreshTrigger: number;
    onNavigate?: (view: string, data?: any) => void;
}

const TYPE_LABELS: Record<MedicalResultType, string> = {
    biologie: 'Biologie',
    imagerie: 'Imagerie',
    autre: 'Autre',
};

const TYPE_ICONS: Record<MedicalResultType, React.ReactNode> = {
    biologie: <FlaskConical size={14} />,
    imagerie: <Radio size={14} />,
    autre: <FileQuestion size={14} />,
};

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const ResultsSection: React.FC<ResultsSectionProps> = ({ patientId, patientName, refreshTrigger, onNavigate }) => {
    const { t, dir } = useI18n();
    const [isAddingResult, setIsAddingResult] = useState(false);
    const [newResult, setNewResult] = useState<{ title: string; interpretation: string; resultType: MedicalResultType; prescriberName: string; analysisId: string }>({
        title: '', interpretation: '', resultType: 'biologie', prescriberName: '', analysisId: ''
    });
    const [pendingAttachments, setPendingAttachments] = useState<MedicalResultAttachment[]>([]);
    const [typeFilter, setTypeFilter] = useState<MedicalResultType | 'all'>('all');
    const [grouped, setGrouped] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState<MedicalResultAttachment | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const results = useMemo(() => dataService.getMedicalResults(patientId).sort((a, b) => b.date.localeCompare(a.date)), [patientId, refreshTrigger]);
    const labRequests = useMemo(() => dataService.getLabRequests(patientId), [patientId, refreshTrigger]);
    // Requests without a linked result yet, so the doctor can attach a result to the request that produced it
    const unlinkedRequests = useMemo(() => {
        const linkedIds = new Set(results.map(r => r.analysisId).filter(Boolean));
        return labRequests.filter(l => !linkedIds.has(l.id));
    }, [labRequests, results]);

    const filteredResults = useMemo(() => typeFilter === 'all' ? results : results.filter(r => (r.resultType || 'autre') === typeFilter), [results, typeFilter]);

    const groupedResults = useMemo(() => {
        const groups: Record<string, MedicalResult[]> = {};
        filteredResults.forEach(r => {
            const key = r.resultType || 'autre';
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        });
        return groups;
    }, [filteredResults]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const newAttachments: MedicalResultAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files.item(i) as File;
            const url = await readFileAsDataUrl(file);
            newAttachments.push({ name: file.name, type: file.type, url });
        }
        setPendingAttachments(prev => [...prev, ...newAttachments]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSaveResult = () => {
        if (!patientId || !newResult.title) return;
        const res: MedicalResult = {
            id: Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            receivedDate: new Date().toISOString().split('T')[0],
            title: newResult.title,
            interpretation: newResult.interpretation,
            resultType: newResult.resultType,
            prescriberName: newResult.prescriberName || undefined,
            analysisId: newResult.analysisId || undefined,
            patientId: patientId,
            attachments: pendingAttachments,
        };
        dataService.saveMedicalResult(res);
        setIsAddingResult(false);
        setNewResult({ title: '', interpretation: '', resultType: 'biologie', prescriberName: '', analysisId: '' });
        setPendingAttachments([]);
        window.dispatchEvent(new Event('meddoc_data_update'));
    };

    const renderCard = (res: MedicalResult) => (
        <div key={res.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative group overflow-hidden">
            <div className={`flex justify-between items-start mb-4 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <ShieldCheck className="text-blue-500" size={20} />
                    <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                        <div className="flex items-center gap-2">
                            <h4 className="font-black text-gray-900 uppercase text-sm">{res.title}</h4>
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase">
                                {TYPE_ICONS[res.resultType || 'autre']} {TYPE_LABELS[res.resultType || 'autre']}
                            </span>
                        </div>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest italic">
                            {res.date}{res.prescriberName ? ` · ${res.prescriberName}` : ''}
                        </span>
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
            {res.interpretation && (
                <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-50 mb-3">
                    <p className={`text-[9px] font-black text-blue-400 uppercase mb-2 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('medical_conclusion')}</p>
                    <p className={`text-xs font-black text-gray-700 leading-relaxed ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{res.interpretation}</p>
                </div>
            )}
            {res.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {res.attachments.map((att, i) => (
                        <button key={i} onClick={() => setPreviewAttachment(att)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-all">
                            <Eye size={12} /> {att.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className={`flex justify-between items-center px-2 gap-3 flex-wrap ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <h3 className={`text-xs font-black text-gray-400 uppercase tracking-widest ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>{t('exam_results')}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Type filter */}
                    <select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value as any)}
                        className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-black uppercase text-gray-500 outline-none"
                    >
                        <option value="all">Tous types</option>
                        <option value="biologie">Biologie</option>
                        <option value="imagerie">Imagerie</option>
                        <option value="autre">Autre</option>
                    </select>
                    <button
                        onClick={() => setGrouped(!grouped)}
                        title={grouped ? 'Vue liste' : 'Vue groupée par type'}
                        className={`p-2 rounded-xl border text-gray-500 transition-all ${grouped ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 border-gray-100'}`}
                    >
                        {grouped ? <Layers size={14} /> : <List size={14} />}
                    </button>
                    <button onClick={() => setIsAddingResult(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">
                        <Plus size={14} /> {t('add_result')}
                    </button>
                </div>
            </div>

            {isAddingResult && (
                <div className="bg-white p-6 rounded-[2rem] border-2 border-blue-100 shadow-xl space-y-4 animate-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2 text-right' : 'ml-2 text-left'} block`}>{t('exam_type_title')}</label>
                            <input type="text" className={`w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                                value={newResult.title} placeholder={t('preop_example')} onChange={e => setNewResult({ ...newResult, title: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 text-left block">Catégorie</label>
                            <select
                                value={newResult.resultType}
                                onChange={e => setNewResult({ ...newResult, resultType: e.target.value as MedicalResultType })}
                                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                            >
                                <option value="biologie">Biologie</option>
                                <option value="imagerie">Imagerie</option>
                                <option value="autre">Autre</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 text-left block">Médecin / laboratoire prescripteur</label>
                            <input type="text" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                                value={newResult.prescriberName} placeholder="Optionnel" onChange={e => setNewResult({ ...newResult, prescriberName: e.target.value })} />
                        </div>
                        {unlinkedRequests.length > 0 && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase ml-2 text-left block">Lier à une demande d'analyse</label>
                                <select
                                    value={newResult.analysisId}
                                    onChange={e => setNewResult({ ...newResult, analysisId: e.target.value })}
                                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs"
                                >
                                    <option value="">Aucune</option>
                                    {unlinkedRequests.map(r => <option key={r.id} value={r.id}>{r.title} ({r.date})</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1">
                        <label className={`text-[10px] font-black text-gray-400 uppercase ${dir === 'rtl' ? 'mr-2 text-right' : 'ml-2 text-left'} block`}>{t('interpretation_conclusion')}</label>
                        <textarea className={`w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs min-h-[80px] ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                            value={newResult.interpretation} placeholder={t('observations_placeholder')} onChange={e => setNewResult({ ...newResult, interpretation: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-2 text-left block">Pièces jointes (PDF, images)</label>
                        <input ref={fileInputRef} type="file" multiple accept=".pdf,image/*" onChange={handleFileChange} className="text-xs" />
                        {pendingAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {pendingAttachments.map((att, i) => (
                                    <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold">
                                        <Paperclip size={11} /> {att.name}
                                        <button onClick={() => setPendingAttachments(pendingAttachments.filter((_, idx) => idx !== i))}><X size={11} /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={`flex justify-end gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                        <button onClick={() => { setIsAddingResult(false); setPendingAttachments([]); }} className="px-5 py-2 text-[10px] font-black uppercase text-gray-400">{t('cancel')}</button>
                        <button onClick={handleSaveResult} className="px-5 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">{t('save')}</button>
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {filteredResults.length > 0 ? (
                    grouped ? (
                        Object.entries(groupedResults).map(([type, items]: [string, MedicalResult[]]) => (
                            <div key={type} className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                        {TYPE_ICONS[type as MedicalResultType]} {TYPE_LABELS[type as MedicalResultType]} ({items.length})
                                    </span>
                                    <div className="h-px flex-1 bg-gray-100" />
                                </div>
                                <div className="space-y-4">{items.map(renderCard)}</div>
                            </div>
                        ))
                    ) : (
                        <div className="space-y-4">{filteredResults.map(renderCard)}</div>
                    )
                ) : (
                    <div className="p-12 text-center bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200 opacity-50">
                        <ShieldCheck className="mx-auto text-gray-200 mb-3" size={32} />
                        <p className="text-xs font-black text-gray-300 uppercase">{t('no_results_documented')}</p>
                    </div>
                )}
            </div>

            {/* Attachment preview modal */}
            {previewAttachment && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setPreviewAttachment(null)}>
                    <div className="bg-white rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-100">
                            <span className="text-xs font-bold text-gray-700">{previewAttachment.name}</span>
                            <button onClick={() => setPreviewAttachment(null)} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"><X size={16} /></button>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-2">
                            {previewAttachment.type.startsWith('image/') ? (
                                <img src={previewAttachment.url} alt={previewAttachment.name} className="max-w-full max-h-[75vh] object-contain" />
                            ) : (
                                <embed src={previewAttachment.url} type="application/pdf" className="w-full h-[75vh]" />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsSection;
