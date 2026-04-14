import React, { useState } from 'react';
import { Upload, FileText, Play, CheckCircle, AlertTriangle, Info, Loader2, X, Plus, Calendar, CheckSquare, ArrowRight } from 'lucide-react';
import { smartDocService } from '../../services/smartDocService';
import { SmartDocAnalysis, Task } from '../../types';
import { dataService } from '../../services/dataService';

const SmartDocInterface: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<SmartDocAnalysis | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setResult(null);
            setError(null);

            // Create preview
            const reader = new FileReader();
            reader.onload = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;

        setAnalyzing(true);
        setError(null);

        try {
            const data = await smartDocService.analyzeDocument(file);
            setResult(data);
        } catch (err: any) {
            setError(err.message || "Une erreur est survenue lors de l'analyse.");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleCreateTask = (content: string, type: 'Medical' | 'Admin' | 'FollowUp' = 'Medical') => {
        const newTask: Task = {
            id: Date.now().toString(),
            title: `SmartDoc: ${content.substring(0, 40)}...`,
            description: content,
            priority: 'Moyenne',
            category: type,
            dueDate: new Date().toISOString().split('T')[0],
            isCompleted: false,
            createdAt: new Date().toISOString()
        };
        dataService.saveTask(newTask);
        setToast("Tâche créée avec succès !");
        setTimeout(() => setToast(null), 3000);
    };

    const clearAll = () => {
        setFile(null);
        setPreviewUrl(null);
        setResult(null);
        setError(null);
    };

    return (
        <div className="h-full flex flex-col gap-6 p-6 animate-in fade-in duration-500 relative">
            {toast && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-lg z-50 animate-in slide-in-from-top-4 font-bold flex items-center gap-2">
                    <CheckCircle size={18} /> {toast}
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-emerald-900 uppercase tracking-tight flex items-center gap-2">🟢 Analyse Assistée</h1>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-tighter italic opacity-80">Outil d'aide à la lecture – ne remplace pas le jugement médical</p>
                </div>
                <button
                    onClick={clearAll}
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 rounded-xl transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                >
                    <X size={14} /> Réinitialiser
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
                {/* Left Panel: Upload & Preview */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4">
                    <div className={`
                        flex-1 bg-white rounded-[2rem] border-2 border-dashed transition-all relative overflow-hidden group
                        ${file ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 hover:border-emerald-400 hover:bg-gray-50'}
                    `}>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                        />

                        {previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain p-4" />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
                                <div className="w-16 h-16 bg-emerald-100/50 rounded-full flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
                                    <Upload size={32} />
                                </div>
                                <h3 className="font-bold text-gray-700">Glisser un document ici</h3>
                                <p className="text-xs text-gray-400 mt-2">Images (JPG, PNG) ou PDF</p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleAnalyze}
                        disabled={!file || analyzing}
                        className={`
                            py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all shadow-lg
                            ${!file
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                : analyzing
                                    ? 'bg-emerald-700 text-white cursor-wait'
                                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-xl hover:scale-[1.02] active:scale-95'
                            }
                        `}
                    >
                        {analyzing ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Analyse en cours...
                            </>
                        ) : (
                            <>
                                <Play size={20} fill="currentColor" />
                                Lancer l'analyse
                            </>
                        )}
                    </button>

                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-start gap-3 border border-red-100">
                            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                            <p className="text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}
                </div>

                {/* Right Panel: Results */}
                <div className="flex-1 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col relative">
                    {!result ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-1000">
                            <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-8 relative">
                                <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
                                <FileText size={48} className="relative z-10" />
                            </div>
                            <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tight mb-4 max-w-md">
                                Prêt pour l'Analyse Assistée
                            </h2>
                            <p className="text-xs font-bold text-emerald-600/60 uppercase tracking-tighter italic mb-4">
                                Outil d'aide à la lecture – ne remplace pas le jugement médical
                            </p>
                            <p className="text-sm font-bold text-gray-400 leading-relaxed max-w-md italic">
                                "Laissez DocEase vous aider à analyser les documents, synthétiser les informations clés et générer des éléments de suivi pertinents"
                            </p>

                            <div className="mt-12 grid grid-cols-2 gap-4 w-full max-w-lg opacity-60">
                                <div className="p-4 bg-gray-50 rounded-2xl flex flex-col items-center gap-2">
                                    <Play size={20} className="text-emerald-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Synthèse Rapide</span>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl flex flex-col items-center gap-2">
                                    <CheckSquare size={20} className="text-emerald-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Suivi Automatique</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full animate-in slide-in-from-bottom-8 duration-500">
                            {/* Result Header */}
                            <div className="p-8 border-b border-gray-50 bg-gray-50/50">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <h2 className="text-xl font-black text-gray-900 leading-tight">
                                            {result.summary}
                                        </h2>
                                        <div className="flex gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            {result.patientName && (
                                                <span className="flex items-center gap-1"><Info size={12} /> Patient: {result.patientName}</span>
                                            )}
                                            {result.date && (
                                                <span className="flex items-center gap-1"><Calendar size={12} /> Date: {result.date}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button className="p-3 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-colors" title="Ajouter au dossier">
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Result Body */}
                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="grid grid-cols-1 gap-4">
                                    {result.items.map((item, index) => (
                                        <div
                                            key={index}
                                            className={`
                                                p-4 rounded-2xl border flex items-start gap-4 transition-all hover:shadow-sm group
                                                ${item.type === 'ALERT' ? 'bg-red-50/50 border-red-100' :
                                                    item.type === 'ACTION' ? 'bg-blue-50/50 border-blue-100' : 'bg-white border-gray-100'}
                                            `}
                                        >
                                            <div className={`
                                                w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                                                ${item.type === 'ALERT' ? 'bg-red-100 text-red-600' :
                                                    item.type === 'ACTION' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}
                                            `}>
                                                {item.type === 'ALERT' ? <AlertTriangle size={20} /> :
                                                    item.type === 'ACTION' ? <CheckCircle size={20} /> : <Info size={20} />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest 
                                                        ${item.type === 'ALERT' ? 'text-red-500' :
                                                            item.type === 'ACTION' ? 'text-blue-500' : 'text-gray-400'}
                                                    `}>
                                                        {item.type}
                                                    </span>
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full
                                                        ${item.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
                                                            item.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}
                                                    `}>
                                                        {item.confidence === 'HIGH' ? 'Confiance Élevée' : item.confidence === 'MEDIUM' ? 'Incertain' : 'Faible'}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-gray-800 leading-relaxed">{item.content}</p>

                                                <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                    <button
                                                        onClick={() => handleCreateTask(item.content, 'Medical')}
                                                        className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                                                    >
                                                        <CheckSquare size={12} /> Créer une tâche
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {result.suggestedActions && result.suggestedActions.length > 0 && (
                                    <div className="mt-8">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Actions Suggérées</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {result.suggestedActions.map((action, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleCreateTask(action, 'FollowUp')}
                                                    className="px-4 py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors text-left flex items-center gap-2 group"
                                                >
                                                    ✨ {action}
                                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity"><Plus size={12} /></span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartDocInterface;
