import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Phone, Clock, ArrowRight, X, Command, Plus } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useI18n } from '../i18n';
import { Patient } from '../types';

interface GlobalSearchProps {
    onSelectPatient: (patient: Patient) => void;
    onConsult: (patient: Patient) => void;
    onClose: () => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectPatient, onConsult, onClose }) => {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Patient[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') {
                setSelectedIndex(prev => (prev + 1) % (results.length || 1));
            }
            if (e.key === 'ArrowUp') {
                setSelectedIndex(prev => (prev - 1 + (results.length || 1)) % (results.length || 1));
            }
            if (e.key === 'Enter' && results[selectedIndex]) {
                onSelectPatient(results[selectedIndex]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [results, selectedIndex, onClose, onSelectPatient]);

    useEffect(() => {
        if (query.length > 1) {
            const all = dataService.getAllPatients();
            const filtered = all.filter(p =>
                p.name.toLowerCase().includes(query.toLowerCase()) ||
                (p.phone && p.phone.includes(query))
            ).slice(0, 8);
            setResults(filtered);
            setSelectedIndex(0);
        } else {
            setResults([]);
        }
    }, [query]);

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-white rounded-[3rem] shadow-premium overflow-hidden premium-border animate-in slide-in-from-top-8 duration-700"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Input Area */}
                <div className="p-8 border-b border-slate-50 flex items-center gap-6 bg-slate-50/30">
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-soft border border-slate-100/50">
                        <Search size={28} strokeWidth={2.5} />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="RECHERCHER UN PATIENT..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="flex-1 bg-transparent border-none text-2xl font-black text-slate-900 outline-none placeholder-slate-200 uppercase tracking-tight"
                    />
                    <div className="flex items-center gap-3">
                        <span className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-soft border border-white/10">
                            <Command size={10} /> ESC
                        </span>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Results Area */}
                <div className="max-h-[60vh] overflow-y-auto p-6 scrollbar-hide">
                    {query.length <= 1 ? (
                        <div className="py-20 text-center flex flex-col items-center justify-center">
                            <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner border border-slate-100 animate-pulse">
                                <Search size={40} />
                            </div>
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">{t('search_hint') || 'Entrez un nom ou numéro...'}</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-3">
                            <div className="px-4 py-2 flex justify-between items-center">
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest italic">{t('results')} ({results.length})</span>
                                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest hidden sm:flex items-center gap-2">
                                    Navigation <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-slate-500 italic">↓↑</span>
                                </span>
                            </div>
                            {results.map((p, index) => (
                                <div
                                    key={p.id}
                                    className={`group p-5 rounded-[2.5rem] border transition-all duration-500 cursor-pointer flex items-center justify-between ${selectedIndex === index
                                        ? 'bg-slate-900 border-slate-800 text-white shadow-premium scale-[1.02] -translate-y-1'
                                        : 'bg-white border-slate-50 hover:border-emerald-200 text-slate-900'
                                        }`}
                                    onClick={() => onSelectPatient(p)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <div className="flex items-center gap-5">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg transition-colors ${selectedIndex === index ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600'
                                            }`}>
                                            <User size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-black uppercase tracking-tight text-lg">{p.name}</h4>
                                            <div className="flex items-center gap-4 mt-1 opacity-60">
                                                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                                                    <Phone size={12} className={selectedIndex === index ? 'text-emerald-400' : 'text-slate-400'} /> {p.phone || '---'}
                                                </span>
                                                <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                                                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                                                    <Clock size={12} className={selectedIndex === index ? 'text-emerald-400' : 'text-slate-400'} /> {p.age} ANS
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onConsult(p); }}
                                            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${selectedIndex === index
                                                ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                                                }`}
                                        >
                                            <Plus size={14} /> CONSULTER
                                        </button>
                                        <div className={`p-2 transition-transform duration-500 ${selectedIndex === index ? 'text-emerald-400 translate-x-1' : 'text-slate-200'}`}>
                                            <ArrowRight size={20} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 text-center flex flex-col items-center justify-center">
                            <div className="w-20 h-20 bg-rose-50 text-rose-200 rounded-[2rem] flex items-center justify-center mb-6 border border-rose-100">
                                <X size={40} />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Patient non trouvé</p>
                            <button className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all">Nouveau Patient</button>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex justify-between items-center">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">CLINICAL SEARCH ENGINE</div>
                    <div className="flex gap-6">
                        <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest"><span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600">ENTER</span> SÉLECTIONNER</span>
                        <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest"><span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600">ESC</span> FERMER</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalSearch;
