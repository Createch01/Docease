import React, {
    useState, useEffect, useRef, useMemo, useCallback,
} from 'react';
import {
    Search, Plus, X, Pill, ShieldAlert, ChevronDown, ChevronUp,
    Loader2, Baby, Droplets, Heart,
    FlaskConical, AlertTriangle, CheckCircle2,
    BookOpen, Stethoscope, Star, Trash2, Activity,
} from 'lucide-react';
import {
    Medicament, LETTERS,
    loadLetter, getCached, isLoaded,
    getSuggestions, inferLetter,
} from '../services/drugCatalogService';

// ─── Constants ───────────────────────────────────────────────────────────────

const FORMS = [
    'Comprimé', 'Comprimé pelliculé', 'Comprimé effervescent', 'Comprimé dispersible',
    'Gélule', 'Capsule', 'Sirop', 'Solution buvable', 'Suspension buvable',
    'Solution injectable', 'Poudre injectable', 'Ampoule', 'Sachet', 'Suppositoire',
    'Crème', 'Pommade', 'Gel', 'Collyre', 'Spray nasal', 'Patch', 'Autre',
];

const CUSTOM_DRUGS_KEY = 'docease_custom_drugs';

// ─── Custom drug storage ─────────────────────────────────────────────────────

interface CustomDrug extends Medicament { isCustom: true }

function loadCustomDrugs(): CustomDrug[] {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_DRUGS_KEY) || '[]');
    } catch { return []; }
}

function saveCustomDrugs(drugs: CustomDrug[]) {
    localStorage.setItem(CUSTOM_DRUGS_KEY, JSON.stringify(drugs));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasFlag(d: Medicament, flag: string) {
    return d.smart_flags?.includes(flag) ?? false;
}

function firstPrice(d: Medicament): string | null {
    const p = d.market_data?.find(m => m.price_ppv_dhs != null)?.price_ppv_dhs;
    return p != null ? `${p.toFixed(2)}` : null;
}

function firstLab(d: Medicament): string {
    return d.market_data?.find(m => m.laboratory)?.laboratory ?? '';
}

function Highlight({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-blue-100 text-blue-800 rounded px-0.5 not-italic">{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </>
    );
}

// ─── Safety flags ────────────────────────────────────────────────────────────

const SafetyBadges: React.FC<{ drug: Medicament; compact?: boolean }> = ({ drug, compact }) => {
    const size = compact ? 8 : 9;
    return (
        <div className="flex flex-wrap gap-1">
            {hasFlag(drug, 'ENFANT_INTERDIT') && (
                <span title="Contre-indiqué < 15 ans"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-600 border border-rose-200">
                    <Baby size={size} /> Enfant
                </span>
            )}
            {(hasFlag(drug, 'GROSSESSE_INTERDIT') || hasFlag(drug, 'GROSSESSE_PRUDENCE')) && (
                <span title="Grossesse — précaution"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-pink-50 text-pink-600 border border-pink-200">
                    <ShieldAlert size={size} /> Grossesse
                </span>
            )}
            {(hasFlag(drug, 'RENAL_PRUDENCE') || hasFlag(drug, 'RENAL_INTERDIT')) && (
                <span title="Ajustement rénal requis"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                    <Droplets size={size} /> Rénal
                </span>
            )}
            {hasFlag(drug, 'HEPATIQUE_PRUDENCE') && (
                <span title="Précaution hépatique"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
                    <AlertTriangle size={size} /> Hépatique
                </span>
            )}
            {hasFlag(drug, 'CARDIAQUE_PRUDENCE') && (
                <span title="Surveillance cardiaque"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-50 text-purple-600 border border-purple-200">
                    <Heart size={size} /> Cardiaque
                </span>
            )}
        </div>
    );
};

// ─── Drug Row (list item) ─────────────────────────────────────────────────────

const DrugRow: React.FC<{
    drug: Medicament;
    query: string;
    onView: () => void;
    onDelete?: () => void;
    isCustom?: boolean;
}> = ({ drug, query, onView, onDelete, isCustom }) => {
    const price = firstPrice(drug);
    const lab = firstLab(drug);
    const hasAlerts = (drug.smart_flags?.length ?? 0) > 0;

    return (
        <div
            onClick={onView}
            className="group flex items-center gap-4 px-4 py-3 bg-white border-b border-slate-100 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors duration-150"
        >
            {/* Left: icon */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCustom ? 'bg-emerald-100' : 'bg-blue-50'}`}>
                <Pill size={15} className={isCustom ? 'text-emerald-600' : 'text-blue-500'} />
            </div>

            {/* Center: name + meta */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-none">
                        <Highlight text={drug.brand_name} query={query} />
                    </span>
                    {isCustom && (
                        <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                            Ajouté
                        </span>
                    )}
                    {drug.tableau_maroc && (
                        <span className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                            Tab. {drug.tableau_maroc}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium">
                        <Highlight text={drug.generic_name || '—'} query={query} />
                    </span>
                    {drug.form && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                            {drug.form}
                        </span>
                    )}
                    {drug.strength && (
                        <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-semibold">
                            {drug.strength}
                        </span>
                    )}
                    {lab && (
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                            {lab}
                        </span>
                    )}
                </div>
            </div>

            {/* Right: safety + price + actions */}
            <div className="flex items-center gap-3 shrink-0">
                {hasAlerts && (
                    <div className="hidden md:flex">
                        <SafetyBadges drug={drug} compact />
                    </div>
                )}
                {price && (
                    <div className="text-right min-w-[52px]">
                        <p className="text-sm font-bold text-slate-800">{price}</p>
                        <p className="text-[9px] text-slate-400 font-medium">DHS</p>
                    </div>
                )}
                {isCustom && onDelete && (
                    <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Supprimer"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
                <div className="w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronDown size={14} className="text-slate-400 -rotate-90" />
                </div>
            </div>
        </div>
    );
};

// ─── Drug Detail Modal ────────────────────────────────────────────────────────

const DrugDetailModal: React.FC<{ drug: Medicament; onClose: () => void }> = ({ drug, onClose }) => {
    const price = firstPrice(drug);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-700 to-blue-500 p-6 relative overflow-hidden shrink-0">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                        <X size={16} className="text-white" />
                    </button>
                    <div className="absolute -bottom-6 -right-6 opacity-10 pointer-events-none">
                        <Pill size={120} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                <Pill size={24} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">{drug.brand_name}</h2>
                                <p className="text-sm text-white/80 font-medium mt-0.5 truncate">{drug.generic_name}</p>
                            </div>
                            {price && (
                                <div className="shrink-0 bg-white/20 rounded-xl px-3 py-2 text-right">
                                    <p className="text-[9px] text-white/70 font-semibold uppercase tracking-wider">PPV</p>
                                    <p className="text-lg font-black text-white">{price} <span className="text-[10px]">DHS</span></p>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-4">
                            {drug.form && (
                                <span className="bg-white/20 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">{drug.form}</span>
                            )}
                            {drug.strength && (
                                <span className="bg-white/20 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">{drug.strength}</span>
                            )}
                            {drug.route && (
                                <span className="bg-white/20 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">{drug.route}</span>
                            )}
                            {drug.atc_code && (
                                <span className="bg-white/10 text-white/70 text-[9px] font-mono px-2 py-1 rounded-lg">ATC: {drug.atc_code}</span>
                            )}
                            {drug.nature && (
                                <span className="bg-white/10 text-white/70 text-[9px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider">Nature: {drug.nature}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-6 space-y-5 scrollbar-hide">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Groupe Thérapeutique</p>
                            <p className="text-sm font-bold text-slate-800 leading-snug">{drug.therapeutic_group || '—'}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Classe Pharmacologique</p>
                            <p className="text-sm font-bold text-slate-800 leading-snug">{drug.drug_class || '—'}</p>
                        </div>
                    </div>

                    {drug.market_data && drug.market_data.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Données de Marché</p>
                            <div className="space-y-2">
                                {drug.market_data.filter(m => m.laboratory || m.packaging).map((m, i) => (
                                    <div key={i} className="flex items-center justify-between bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">{m.laboratory || '—'}</p>
                                            {m.packaging && <p className="text-[10px] text-slate-400 mt-0.5">{m.packaging}</p>}
                                        </div>
                                        {m.price_ppv_dhs != null && (
                                            <div className="text-right">
                                                <p className="text-xs font-black text-blue-700">{m.price_ppv_dhs.toFixed(2)} DHS</p>
                                                {m.price_ph_dhs != null && (
                                                    <p className="text-[9px] text-slate-400">PH: {m.price_ph_dhs.toFixed(2)}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {drug.mechanism && (
                        <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <FlaskConical size={11} /> Mécanisme d'action
                            </p>
                            <p className="text-sm text-slate-700 leading-relaxed">{drug.mechanism}</p>
                        </div>
                    )}

                    {drug.indications && drug.indications.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                <CheckCircle2 size={11} /> Indications
                            </p>
                            <div className="grid grid-cols-1 gap-1.5">
                                {drug.indications.slice(0, 7).map((ind, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                        <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                                        <span>{ind}</span>
                                    </div>
                                ))}
                                {drug.indications.length > 7 && (
                                    <p className="text-[10px] text-slate-400 italic pl-4">+ {drug.indications.length - 7} autres indications</p>
                                )}
                            </div>
                        </div>
                    )}

                    {drug.contraindications && drug.contraindications.length > 0 && (
                        <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-100">
                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                <AlertTriangle size={11} /> Contre-indications
                            </p>
                            <div className="space-y-1.5">
                                {drug.contraindications.slice(0, 5).map((ci, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-rose-700">
                                        <span className="shrink-0 mt-0.5">⚠</span>
                                        <span>{ci}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {drug.dosage && (drug.dosage.adult || drug.dosage.children) && (
                        <div className="bg-teal-50/50 rounded-xl p-4 border border-teal-100">
                            <p className="text-[9px] font-black text-teal-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                <Stethoscope size={11} /> Posologie
                            </p>
                            {drug.dosage.adult && (
                                <div className="mb-2">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">Adulte: </span>
                                    <span className="text-sm text-slate-700">{drug.dosage.adult}</span>
                                </div>
                            )}
                            {drug.dosage.children && (
                                <div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase">Enfant: </span>
                                    <span className="text-sm text-slate-700">{drug.dosage.children}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Alertes de Sécurité</p>
                        <div className="flex flex-wrap gap-2">
                            {drug.smart_flags && drug.smart_flags.length > 0
                                ? <SafetyBadges drug={drug} />
                                : <span className="text-[11px] text-slate-400 italic">Aucune alerte spécifique</span>
                            }
                            {drug.clinical_flags && drug.clinical_flags.length > 0 && drug.clinical_flags.map((flag, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                                    <Activity size={10} /> {flag}
                                </span>
                            ))}
                        </div>
                    </div>

                    {drug.pregnancy && (
                        <div className="bg-pink-50/50 rounded-xl p-4 border border-pink-100">
                            <p className="text-[9px] font-black text-pink-500 uppercase tracking-widest mb-2">Grossesse & Allaitement</p>
                            {drug.pregnancy.category && (
                                <p className="text-xs font-bold text-slate-700 mb-1">Catégorie: {drug.pregnancy.category}</p>
                            )}
                            {drug.pregnancy.warning && (
                                <p className="text-sm text-slate-600 leading-relaxed">{drug.pregnancy.warning}</p>
                            )}
                            {drug.pregnancy.breastfeeding && (
                                <p className="text-sm text-slate-500 mt-1.5 italic">{drug.pregnancy.breastfeeding}</p>
                            )}
                        </div>
                    )}

                    {drug.children && drug.children.warning && (
                        <div className="bg-rose-50/30 rounded-xl p-4 border border-rose-100">
                            <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <Baby size={11} /> Pédiatrie
                            </p>
                            <p className="text-sm text-slate-700">{drug.children.warning}</p>
                            {drug.children.dose_rule && (
                                <p className="text-[11px] text-slate-500 mt-1 italic">{drug.children.dose_rule}</p>
                            )}
                        </div>
                    )}

                    {drug.half_life && (
                        <div className="flex items-center gap-3 text-sm text-slate-500">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Demi-vie:</span>
                            <span className="font-semibold text-slate-700">{drug.half_life}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Add Drug Modal ───────────────────────────────────────────────────────────

interface AddDrugForm {
    brand_name: string;
    generic_name: string;
    therapeutic_group: string;
    drug_class: string;
    form: string;
    strength: string;
    dosage_adult: string;
    notes: string;
}

const EMPTY_FORM: AddDrugForm = {
    brand_name: '', generic_name: '', therapeutic_group: '',
    drug_class: '', form: '', strength: '', dosage_adult: '', notes: '',
};

const AddDrugModal: React.FC<{
    onSave: (drug: CustomDrug) => void;
    onClose: () => void;
}> = ({ onSave, onClose }) => {
    const [form, setForm] = useState<AddDrugForm>(EMPTY_FORM);
    const [errors, setErrors] = useState<Partial<AddDrugForm>>({});

    const set = (key: keyof AddDrugForm, val: string) => {
        setForm(f => ({ ...f, [key]: val }));
        if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
    };

    const validate = () => {
        const errs: Partial<AddDrugForm> = {};
        if (!form.brand_name.trim()) errs.brand_name = 'Nom commercial requis';
        if (!form.generic_name.trim()) errs.generic_name = 'DCI requis';
        return errs;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); return; }

        const newDrug: CustomDrug = {
            id: `custom_${Date.now()}`,
            brand_name: form.brand_name.trim().toUpperCase(),
            generic_name: form.generic_name.trim(),
            strength: form.strength.trim() || null,
            form: form.form || 'Comprimé',
            therapeutic_group: form.therapeutic_group.trim() || 'Autre',
            drug_class: form.drug_class.trim() || undefined,
            dosage: form.dosage_adult ? { adult: form.dosage_adult } : undefined,
            smart_flags: [],
            isCustom: true,
        };
        onSave(newDrug);
    };

    const Field = ({ label, name, required, placeholder }: {
        label: string; name: keyof AddDrugForm; required?: boolean; placeholder?: string;
    }) => (
        <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                {label} {required && <span className="text-rose-400">*</span>}
            </label>
            <input
                type="text"
                value={form[name]}
                onChange={e => set(name, e.target.value)}
                placeholder={placeholder}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-medium text-slate-800 placeholder:text-slate-300 outline-none transition-all focus:ring-2 focus:ring-blue-400 ${errors[name] ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-slate-50 focus:border-blue-300 focus:bg-white'
                    }`}
            />
            {errors[name] && (
                <p className="text-[10px] text-rose-500 font-semibold mt-1">{errors[name]}</p>
            )}
        </div>
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <Plus size={16} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Nouveau Médicament</h3>
                            <p className="text-[10px] text-slate-400 font-medium">Ajout personnalisé au catalogue</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-hide">
                    <div className="grid grid-cols-2 gap-4">
                        <Field name="brand_name" label="Nom Commercial" required placeholder="Ex: DOLIPRANE" />
                        <Field name="generic_name" label="DCI / Générique" required placeholder="Ex: Paracétamol" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Forme Galénique</label>
                            <select
                                value={form.form}
                                onChange={e => set('form', e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 focus:bg-white transition-all"
                            >
                                <option value="">Sélectionner…</option>
                                {FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <Field name="strength" label="Dosage / Concentr." placeholder="Ex: 1000 mg" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field name="therapeutic_group" label="Groupe Thérapeutique" placeholder="Ex: Analgésique" />
                        <Field name="drug_class" label="Classe Pharmacologique" placeholder="Ex: AINS" />
                    </div>
                    <Field name="dosage_adult" label="Posologie Adulte" placeholder="Ex: 1g toutes les 6h, max 4g/j" />
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Notes / Remarques</label>
                        <textarea
                            value={form.notes}
                            onChange={e => set('notes', e.target.value)}
                            placeholder="Informations complémentaires…"
                            rows={2}
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 focus:bg-white transition-all resize-none"
                        />
                    </div>
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-black uppercase tracking-tight transition-colors"
                        >
                            Ajouter au Catalogue
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Letter Navigation ────────────────────────────────────────────────────────

const LetterNav: React.FC<{
    active: string;
    onSelect: (l: string) => void;
}> = ({ active, onSelect }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current?.querySelector(`[data-letter="${active}"]`) as HTMLElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [active]);

    return (
        <div ref={scrollRef} className="flex gap-1 overflow-x-auto scrollbar-hide">
            {LETTERS.map(l => {
                const loaded = isLoaded(l);
                const isCurrent = active === l;
                return (
                    <button
                        key={l}
                        data-letter={l}
                        onClick={() => onSelect(l)}
                        className={`shrink-0 w-8 h-8 rounded-lg text-xs font-bold uppercase transition-all duration-150 ${isCurrent
                            ? 'bg-blue-600 text-white shadow-sm'
                            : loaded
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                    >
                        {l}
                    </button>
                );
            })}
        </div>
    );
};

// ─── Group Section ────────────────────────────────────────────────────────────

const GroupSection: React.FC<{
    group: string;
    drugs: Medicament[];
    customIds: Set<string>;
    query: string;
    initialOpen?: boolean;
    onView: (d: Medicament) => void;
    onDelete: (id: string) => void;
}> = ({ group, drugs, customIds, query, initialOpen = false, onView, onDelete }) => {
    const [open, setOpen] = useState(initialOpen);

    useEffect(() => { if (initialOpen) setOpen(true); }, [initialOpen]);

    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Group header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-100"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <FlaskConical size={13} className="text-slate-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide text-left truncate">{group}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full tabular-nums">
                        {drugs.length}
                    </span>
                    {open
                        ? <ChevronUp size={13} className="text-slate-400" />
                        : <ChevronDown size={13} className="text-slate-400" />
                    }
                </div>
            </button>

            {/* Drug rows */}
            {open && (
                <div className="divide-y divide-slate-50">
                    {drugs.map(drug => (
                        <DrugRow
                            key={drug.id}
                            drug={drug}
                            query={query}
                            onView={() => onView(drug)}
                            isCustom={customIds.has(drug.id)}
                            onDelete={() => onDelete(drug.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MedicineCatalogue: React.FC = () => {
    const [activeLetter, setActiveLetter] = useState('A');
    const [letterDrugs, setLetterDrugs] = useState<Medicament[]>([]);
    const [letterLoading, setLetterLoading] = useState(false);
    const [customDrugs, setCustomDrugs] = useState<CustomDrug[]>(loadCustomDrugs);

    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState<Medicament[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [selectedDrug, setSelectedDrug] = useState<Medicament | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [expandAll, setExpandAll] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const suggestBoxRef = useRef<HTMLDivElement>(null);

    // ── Load a letter ────────────────────────────────────────────────────────
    const switchLetter = useCallback(async (letter: string) => {
        setActiveLetter(letter);
        setSearchQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
        setExpandAll(false);

        const cached = getCached(letter);
        if (cached) { setLetterDrugs(cached); return; }

        setLetterLoading(true);
        setLetterDrugs([]);
        const data = await loadLetter(letter);
        setLetterDrugs(data);
        setLetterLoading(false);
    }, []);

    useEffect(() => { switchLetter('A'); }, []);

    // ── Search ───────────────────────────────────────────────────────────────
    const handleSearch = useCallback(async (val: string) => {
        setSearchQuery(val);
        if (!val.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        const inferred = inferLetter(val);
        if (inferred && !isLoaded(inferred)) loadLetter(inferred);

        const sugg = getSuggestions(val);
        setSuggestions(sugg);
        setShowSuggestions(sugg.length > 0);
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!suggestBoxRef.current?.contains(e.target as Node) &&
                !searchInputRef.current?.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Filtered drugs ───────────────────────────────────────────────────────
    const allLetterDrugs = useMemo(() => {
        const customForLetter = customDrugs.filter(
            d => d.brand_name[0]?.toUpperCase() === activeLetter
        );
        return [...customForLetter, ...letterDrugs];
    }, [letterDrugs, customDrugs, activeLetter]);

    const filteredDrugs = useMemo(() => {
        if (!searchQuery.trim()) return allLetterDrugs;
        const q = searchQuery.toLowerCase();
        return allLetterDrugs.filter(d =>
            d.brand_name.toLowerCase().includes(q) ||
            (d.generic_name || '').toLowerCase().includes(q) ||
            (d.therapeutic_group || '').toLowerCase().includes(q)
        );
    }, [allLetterDrugs, searchQuery]);

    const groupedDrugs = useMemo((): [string, Medicament[]][] => {
        const map = new Map<string, Medicament[]>();
        for (const d of filteredDrugs) {
            const g = d.therapeutic_group || 'Autre';
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(d);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'));
    }, [filteredDrugs]);

    const customIds = useMemo(() => new Set(customDrugs.map(d => d.id)), [customDrugs]);

    // ── Custom drug actions ──────────────────────────────────────────────────
    const handleAddDrug = (drug: CustomDrug) => {
        const updated = [drug, ...customDrugs];
        setCustomDrugs(updated);
        saveCustomDrugs(updated);
        setShowAddModal(false);
        const drugLetter = drug.brand_name[0]?.toUpperCase();
        if (drugLetter && drugLetter !== activeLetter) switchLetter(drugLetter);
    };

    const handleDeleteCustom = (id: string) => {
        const updated = customDrugs.filter(d => d.id !== id);
        setCustomDrugs(updated);
        saveCustomDrugs(updated);
    };

    const totalLoaded = useMemo(() => {
        let n = 0;
        for (const l of LETTERS) {
            const cached = getCached(l);
            if (cached) n += cached.length;
        }
        return n + customDrugs.length;
    }, [letterDrugs, customDrugs]); // eslint-disable-line

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-4 min-h-0">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <BookOpen size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-black text-slate-900 uppercase tracking-tight leading-none">
                            Catalogue Médicaments
                        </h1>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {totalLoaded.toLocaleString('fr-FR')} médicaments · Marché marocain
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-tight transition-colors shrink-0"
                >
                    <Plus size={14} />
                    Ajouter
                </button>
            </div>

            {/* ── Search ──────────────────────────────────────────────────── */}
            <div className="relative">
                <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-300 transition-all">
                    <Search size={16} className="text-slate-400 shrink-0" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Nom commercial, DCI, groupe thérapeutique…"
                        value={searchQuery}
                        onChange={e => handleSearch(e.target.value)}
                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                        className="flex-1 bg-transparent text-sm font-medium text-slate-800 placeholder:text-slate-300 outline-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && (
                    <div
                        ref={suggestBoxRef}
                        className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-40 overflow-hidden"
                    >
                        {suggestions.map((d, i) => (
                            <button
                                key={d.id || i}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-slate-50 last:border-0 group"
                                onClick={() => { setSelectedDrug(d); setShowSuggestions(false); setSearchQuery(d.brand_name); }}
                            >
                                <div className="w-7 h-7 bg-blue-50 group-hover:bg-blue-100 rounded-lg flex items-center justify-center shrink-0 transition-colors">
                                    <Pill size={13} className="text-blue-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">
                                        <Highlight text={d.brand_name} query={searchQuery} />
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                        <Highlight text={d.generic_name || ''} query={searchQuery} />
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[9px] text-slate-300 uppercase font-semibold">{d.form}</p>
                                    {firstPrice(d) && (
                                        <p className="text-[10px] font-black text-blue-600">{firstPrice(d)} DHS</p>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Letter Navigation ────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-sm">
                <LetterNav active={activeLetter} onSelect={switchLetter} />
            </div>

            {/* ── Status bar ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-0.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {letterLoading
                        ? `Chargement de la lettre ${activeLetter}…`
                        : searchQuery
                            ? `${filteredDrugs.length} résultat${filteredDrugs.length > 1 ? 's' : ''} pour « ${searchQuery} »`
                            : `${filteredDrugs.length} médicament${filteredDrugs.length > 1 ? 's' : ''} — lettre ${activeLetter}`
                    }
                </p>
                {groupedDrugs.length > 1 && (
                    <button
                        onClick={() => setExpandAll(v => !v)}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-700 uppercase tracking-wider transition-colors"
                    >
                        {expandAll ? 'Tout réduire' : 'Tout développer'}
                    </button>
                )}
            </div>

            {/* ── Drug List ────────────────────────────────────────────────── */}
            {letterLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 size={32} className="text-blue-400 animate-spin" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chargement en cours…</p>
                </div>
            ) : filteredDrugs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                        <Pill size={28} className="text-slate-300" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">
                            {searchQuery ? 'Aucun résultat trouvé' : `Aucun médicament — lettre ${activeLetter}`}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                            {searchQuery
                                ? "Essayez un autre terme ou vérifiez l'orthographe"
                                : 'Sélectionnez une autre lettre ou ajoutez un médicament'
                            }
                        </p>
                    </div>
                    {searchQuery && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-2 rounded-lg transition-colors"
                        >
                            <Plus size={12} /> Ajouter «&nbsp;{searchQuery}&nbsp;»
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {customDrugs.length > 0 && (
                        <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            <Star size={10} className="shrink-0" />
                            {customDrugs.length} médicament{customDrugs.length > 1 ? 's' : ''} ajouté{customDrugs.length > 1 ? 's' : ''} par vous — inclus dans le catalogue
                        </div>
                    )}

                    {groupedDrugs.map(([group, drugs]) => (
                        <GroupSection
                            key={group}
                            group={group}
                            drugs={drugs}
                            customIds={customIds}
                            query={searchQuery}
                            initialOpen={expandAll || groupedDrugs.length === 1 || !!searchQuery}
                            onView={setSelectedDrug}
                            onDelete={handleDeleteCustom}
                        />
                    ))}
                </div>
            )}

            {/* ── Modals ──────────────────────────────────────────────────── */}
            {selectedDrug && (
                <DrugDetailModal drug={selectedDrug} onClose={() => setSelectedDrug(null)} />
            )}
            {showAddModal && (
                <AddDrugModal onSave={handleAddDrug} onClose={() => setShowAddModal(false)} />
            )}
        </div>
    );
};

export default MedicineCatalogue;
