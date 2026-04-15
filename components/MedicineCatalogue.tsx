import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, Filter, ChevronRight, ChevronDown, Pill,
    Info, ShoppingCart, Activity, ShieldAlert,
    SearchX, Loader2, BookOpen, Layers, X
} from 'lucide-react';

interface Medication {
    id: string;
    brand_name: string;
    generic_name: string;
    strength: string;
    form: string;
    route: string;
    therapeutic_group: string;
    drug_class: string;
    indications?: string[];
    market_data?: Array<{
        packaging: string;
        price_ppv_dhs: number;
        laboratory: string;
        status: string;
    }>;
    smart_flags?: Record<string, boolean>;
}

interface CatalogueData {
    [group: string]: {
        [drugClass: string]: Medication[];
    };
}

const cleanName = (name: string, context?: string): string => {
    if (!name) return '';

    // 1. Remove ATC codes: letter + 2 digits + optional letters/digits
    const atcPattern = /[A-Z][0-9]{2}[A-Z]?[0-9]?/g;

    // 2. Remove common abbreviations in caps (2-4 chars)
    const abbrPattern = /\b[A-Z]{2,4}\b/g;

    let cleaned = name
        .replace(atcPattern, '')
        .replace(abbrPattern, '')
        .replace(/\s*\([^)]*\)/g, (match) => {
            // Keep parenthetical content only if it's long and descriptive
            const content = match.slice(1, -1).trim();
            if (content.length <= 5 || /[0-9]/.test(content) || /^[A-Z\s]+$/.test(content)) return '';
            return ' ' + content;
        })
        .replace(/^\s*[-_:/,]\s*/, '')
        .replace(/\s*[-_:/,]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    // 3. Remove redundancy with the group name (context)
    if (context && cleaned.toLowerCase().includes(context.toLowerCase())) {
        // If it's something like "Analgesique non opioide" and context is "Analgesique"
        // Remove the context word
        const regex = new RegExp(`\\b${context}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '').replace(/^\s*[-_:/,]\s*/, '').trim();
    }

    // 4. Final fallback
    if (!cleaned) return 'Général';

    // Capitalize first letter
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const MedicineCatalogue: React.FC = () => {
    const [data, setData] = useState<CatalogueData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
    const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // In a real app, this would be a fetch or imported
                // Since we are in a Vite environment, we use dynamic import
                const response = await import('../medicaments/medicaments_par_classe_v2.json');
                setData(response.default || response);

                // Select first group by default
                const groups = Object.keys(response.default || response);
                if (groups.length > 0) {
                    setSelectedGroup(groups[0]);
                }
            } catch (error) {
                console.error("Error loading catalogue data:", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    const groups = useMemo(() => data ? Object.keys(data).sort() : [], [data]);

    const toggleClass = (className: string) => {
        setExpandedClasses(prev => ({
            ...prev,
            [className]: !prev[className]
        }));
    };

    const filteredGroups = useMemo(() => {
        if (!data) return [];
        if (!searchTerm) return groups;

        return groups.filter(group => {
            const groupMatch = group.toLowerCase().includes(searchTerm.toLowerCase());
            if (groupMatch) return true;

            // Check if any medication inside matches
            return Object.values(data[group]).some((meds: any) =>
                Array.isArray(meds) && meds.some((m: Medication) =>
                    m.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    m.generic_name.toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        });
    }, [data, groups, searchTerm]);

    // If we have a search term, expand everything that matches
    useEffect(() => {
        if (searchTerm && data && selectedGroup && data[selectedGroup]) {
            const newExpanded: Record<string, boolean> = {};
            Object.keys(data[selectedGroup]).forEach(cls => {
                const matches = data[selectedGroup][cls].some(m =>
                    m.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    m.generic_name.toLowerCase().includes(searchTerm.toLowerCase())
                );
                if (matches) newExpanded[cls] = true;
            });
            setExpandedClasses(newExpanded);
        }
    }, [searchTerm, selectedGroup, data]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <div className="relative">
                    <Loader2 size={64} className="text-emerald-500 animate-spin" />
                    <Pill size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-300" />
                </div>
                <p className="text-emerald-900 font-black uppercase tracking-widest text-xs">Chargement du Catalogue...</p>
            </div>
        );
    }

    if (!data) return null;

    const currentGroupData = data[selectedGroup] || {};
    const currentClasses = Object.keys(currentGroupData).sort();

    return (
        <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-700">
            {/* Sidebar - Therapeutic Groups */}
            <div className="lg:w-80 flex flex-col gap-4">
                <div className="bg-white/80 p-6 rounded-[2.5rem] border border-emerald-100 shadow-sm glass-effect">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                            <Filter size={20} />
                        </div>
                        <h3 className="font-black text-emerald-900 uppercase text-xs tracking-tighter italic">Classes Thérapeutiques</h3>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" size={16} />
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-emerald-300"
                        />
                    </div>

                    <div className="space-y-1 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                        {filteredGroups.map(group => (
                            <button
                                key={group}
                                onClick={() => {
                                    setSelectedGroup(group);
                                    setExpandedClasses({});
                                }}
                                className={`w-full text-left px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-tight transition-all flex items-center justify-between group ${selectedGroup === group
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                            >
                                <span className="truncate">{cleanName(group)}</span>
                                <ChevronRight size={14} className={selectedGroup === group ? 'opacity-100' : 'opacity-0 group-hover:opacity-40 transition-opacity'} />
                            </button>
                        ))}
                        {filteredGroups.length === 0 && (
                            <div className="text-center py-10">
                                <SearchX size={32} className="mx-auto text-emerald-200 mb-2" />
                                <p className="text-[10px] text-emerald-300 font-bold uppercase">Aucune classe</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Stats Card */}
                <div className="gradient-emerald-teal p-6 rounded-[2.5rem] text-white shadow-xl shadow-emerald-100/50 relative overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Catalogue</p>
                        <h4 className="text-3xl font-black italic mt-1">4500+</h4>
                        <p className="text-[9px] font-bold mt-2 leading-tight">Médicaments officiels du marché marocain mis à jour.</p>
                    </div>
                    <BookOpen size={80} className="absolute -bottom-4 -right-4 opacity-10 rotate-12" />
                </div>
            </div>

            {/* Main Content - Medications List */}
            <div className="flex-1 space-y-6">
                <div className="bg-white/40 p-10 rounded-[3rem] border border-emerald-100 shadow-sm glass-effect flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 gradient-emerald-light border border-emerald-200 rounded-[1.5rem] flex items-center justify-center shadow-soft">
                            <Layers className="text-emerald-600" size={32} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tight">{cleanName(selectedGroup)}</h2>
                            <p className="text-[10px] text-emerald-600/60 font-black uppercase tracking-widest mt-1">
                                {currentClasses.length} sous-classes identifiées
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {currentClasses.map(cls => {
                        const meds = currentGroupData[cls];
                        const isExpanded = expandedClasses[cls];

                        // Filter meds if there's a search term
                        const filteredMeds = searchTerm
                            ? meds.filter(m =>
                                m.brand_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                m.generic_name.toLowerCase().includes(searchTerm.toLowerCase())
                            )
                            : meds;

                        if (searchTerm && filteredMeds.length === 0) return null;

                        return (
                            <div key={cls} className="bg-white/80 rounded-[2.5rem] border border-emerald-100 overflow-hidden shadow-sm transition-all duration-500 hover:shadow-md">
                                <button
                                    onClick={() => toggleClass(cls)}
                                    className="w-full flex items-center justify-between p-6 hover:bg-emerald-50/30 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isExpanded ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                                            <Activity size={20} />
                                        </div>
                                        <span className="font-black text-emerald-900 uppercase text-xs text-left tracking-tight italic">{cleanName(cls, selectedGroup)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-50 px-3 py-1 rounded-full uppercase">{filteredMeds.length} items</span>
                                        {isExpanded ? <ChevronDown size={20} className="text-emerald-400" /> : <ChevronRight size={20} className="text-emerald-400" />}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="p-6 pt-0 animate-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {filteredMeds.map(med => (
                                                <div
                                                    key={med.id}
                                                    onClick={() => setSelectedMedication(med)}
                                                    className="group bg-white p-6 rounded-[2rem] border border-emerald-50 hover:border-emerald-200 transition-all hover:shadow-xl shadow-emerald-900/5 relative overflow-hidden cursor-pointer"
                                                >
                                                    <div className="flex justify-between items-start mb-3 relative z-10">
                                                        <div>
                                                            <h4 className="font-black text-emerald-900 text-sm uppercase italic tracking-tighter group-hover:text-emerald-600 transition-colors">
                                                                {med.brand_name}
                                                            </h4>
                                                            <p className="text-[10px] font-bold text-emerald-500/70 mt-0.5">{med.generic_name}</p>
                                                        </div>
                                                        <div className="bg-emerald-50 px-3 py-1.5 rounded-xl">
                                                            <span className="text-xs font-black text-emerald-700 italic">
                                                                {med.market_data?.[0]?.price_ppv_dhs?.toFixed(2) || 'N/A'} <span className="text-[8px] uppercase tracking-widest non-italic">DHS</span>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 mb-4 relative z-10">
                                                        <span className="text-[9px] font-black text-gray-400 uppercase bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">{med.form}</span>
                                                        <span className="text-[9px] font-black text-gray-400 uppercase bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">{med.strength}</span>
                                                    </div>

                                                    <div className="flex items-center justify-between pt-4 border-t border-emerald-50 relative z-10">
                                                        <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                                                            <ShoppingCart size={10} /> {med.market_data?.[0]?.laboratory || 'Inconnu'}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            {med.smart_flags?.dangerous_in_pregnancy && (
                                                                <div title="Contre-indiqué Grossesse" className="text-rose-500 bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                                                                    <ShieldAlert size={12} />
                                                                </div>
                                                            )}
                                                            <button
                                                                className="p-1.5 bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white rounded-lg transition-all"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedMedication(med);
                                                                }}
                                                            >
                                                                <Info size={12} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Decoration */}
                                                    <div className="absolute top-0 right-0 p-4 opacity-[0.02] group-hover:opacity-[0.05] group-hover:scale-150 transition-all pointer-events-none">
                                                        <Pill size={64} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedMedication && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-emerald-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedMedication(null)}>
                    <div
                        className="bg-white max-w-2xl w-full rounded-[3rem] p-8 shadow-2xl relative border border-emerald-100 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedMedication(null)}
                            className="absolute top-6 right-6 p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full transition-colors z-20"
                        >
                            <X size={20} />
                        </button>

                        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none z-0">
                            <Pill size={120} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                                <div>
                                    <h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">
                                        {selectedMedication.brand_name}
                                    </h2>
                                    <p className="text-sm font-bold text-emerald-500 mt-1">{selectedMedication.generic_name}</p>
                                </div>
                                <div className="bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 text-right">
                                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest block mb-1">Prix Public</span>
                                    <span className="text-xl font-black text-emerald-700 italic">
                                        {selectedMedication.market_data?.[0]?.price_ppv_dhs?.toFixed(2) || 'N/A'} <span className="text-[10px] uppercase tracking-widest non-italic">DHS</span>
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3 mb-8">
                                <span className="text-xs font-black text-emerald-700 uppercase bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                    {selectedMedication.form}
                                </span>
                                <span className="text-xs font-black text-emerald-700 uppercase bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                    {selectedMedication.strength}
                                </span>
                                <span className="text-xs font-black text-emerald-700 uppercase bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                                    <ShoppingCart size={14} /> {selectedMedication.market_data?.[0]?.laboratory || 'Inconnu'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div className="bg-gray-50/50 p-5 rounded-[2rem] border border-gray-100">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Classification</h4>
                                    <p className="text-sm font-bold text-gray-700 mb-1">{selectedMedication.therapeutic_group}</p>
                                    <p className="text-xs text-gray-500">{selectedMedication.drug_class}</p>
                                </div>

                                <div className="bg-gray-50/50 p-5 rounded-[2rem] border border-gray-100">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Sécurité / Smart Flags</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedMedication.smart_flags?.dangerous_in_pregnancy ? (
                                            <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100 text-[10px] font-black uppercase tracking-tight">
                                                <ShieldAlert size={14} /> Contre-indiqué Grossesse
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-gray-400 italic">Aucune alerte spécifique</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedMedication.indications && selectedMedication.indications.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Activity size={14} /> Indications principales
                                    </h4>
                                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-1">
                                        {selectedMedication.indications.slice(0, 5).map((ind, i) => (
                                            <li key={i}>{ind}</li>
                                        ))}
                                        {selectedMedication.indications.length > 5 && (
                                            <li className="text-emerald-500 italic text-xs pt-1">et {selectedMedication.indications.length - 5} autres indications...</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MedicineCatalogue;
