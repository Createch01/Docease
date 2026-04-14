import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Phone, Clock, ArrowRight, X, Command, Plus } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Patient } from '../types';

interface GlobalSearchProps {
    onSelectPatient: (patient: Patient) => void;
    onConsult: (patient: Patient) => void;
    onClose: () => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectPatient, onConsult, onClose }) => {
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
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-emerald-100 animate-in slide-in-from-top-4 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Input Area */}
                <div className="p-6 border-b border-gray-50 flex items-center gap-4 bg-gray-50/50">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm">
                        <Search size={24} />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Rechercher un patient (Nom, Téléphone...)"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="flex-1 bg-transparent border-none text-xl font-black text-gray-900 outline-none placeholder-gray-300"
                    />
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-widest shadow-sm">
                            <Command size={10} /> Esc
                        </span>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Results Area */}
                <div className="max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
                    {query.length <= 1 ? (
                        <div className="py-12 text-center">
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                <User size={32} />
                            </div>
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Commencez à taper pour rechercher...</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-2">
                            <div className="px-4 py-2 flex justify-between items-center">
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Résultats ({results.length})</span>
                                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest flex items-center gap-1">
                                    Utilisez <span className="px-1 border border-gray-200 rounded">↓↑</span> pour naviguer
                                </span>
                            </div>
                            {results.map((p, index) => (
                                <div
                                    key={p.id}
                                    className={`group p-4 rounded-3xl border transition-all cursor-pointer flex items-center justify-between ${selectedIndex === index
                                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-200 scale-[1.01]'
                                            : 'bg-white border-gray-100 hover:border-emerald-200 text-gray-900 group-hover:bg-gray-50'
                                        }`}
                                    onClick={() => onSelectPatient(p)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${selectedIndex === index ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'
                                            }`}>
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-black uppercase tracking-tight">{p.name}</h4>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className={`flex items-center gap-1 text-[10px] font-bold ${selectedIndex === index ? 'text-white/70' : 'text-gray-400'}`}>
                                                    <Phone size={10} /> {p.phone || 'Sans téléphone'}
                                                </span>
                                                <span className={`flex items-center gap-1 text-[10px] font-bold ${selectedIndex === index ? 'text-white/70' : 'text-gray-400'}`}>
                                                    <Clock size={10} /> {p.age} ans
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onConsult(p); }}
                                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${selectedIndex === index
                                                    ? 'bg-white text-emerald-600 hover:bg-emerald-50'
                                                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                                                }`}
                                        >
                                            <Plus size={14} /> Consulter
                                        </button>
                                        <div className={`p-2 rounded-xl transition-all ${selectedIndex === index ? 'bg-white/20 text-white' : 'text-gray-300'
                                            }`}>
                                            <ArrowRight size={18} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center">
                            <div className="w-16 h-16 bg-red-50 text-red-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                <X size={32} />
                            </div>
                            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Aucun patient trouvé pour "{query}"</p>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-gray-50/50 border-t border-gray-50 flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest">
                    <div>Professionnel • Rapide • Intuitif</div>
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1"><span className="px-1 border border-gray-200 rounded">Enter</span> Sélectionner</span>
                        <span className="flex items-center gap-1"><span className="px-1 border border-gray-200 rounded">Esc</span> Fermer</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalSearch;
