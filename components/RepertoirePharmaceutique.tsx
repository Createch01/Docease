import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, Pill, Plus, X, ChevronDown, ChevronUp, AlertTriangle,
    ShieldCheck, HeartPulse, Activity, Droplets, Flame, Syringe,
    Thermometer, Loader2, ArrowLeft,
} from 'lucide-react';
import { searchDrugsGlobal } from '../services/drugCatalogService';
import { Medicine, MealTiming, MedicineContraindication } from '../types';
import { dataService } from '../services/dataService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassInfo { count: number; file: string }

interface ClassesSummary {
    totalMedicines: number;
    totalClasses: number;
    totalAlerts: number;
    classesCount: Record<string, ClassInfo>;
}

/** Formulaire d'ajout — séparé du type Medicine pour éviter les conflits de types */
interface AddForm {
    name: string;
    active_ingredient: string;
    category: string;
    strength: string;
    form: string;
    defaultDosage: string;
    defaultTiming: MealTiming;
    price: string;
    contraindications: string;   // texte libre, virgule-séparé
    adverseEffects: string;      // texte libre, virgule-séparé
    isAdultOnly: boolean;
    isPregnantForbidden: boolean;
    isBreastfeedingForbidden: boolean;
    isHeartForbidden: boolean;
    isKidneyForbidden: boolean;
    isLiverForbidden: boolean;
}

const EMPTY_FORM: AddForm = {
    name: '', active_ingredient: '', category: 'Antibiotiques',
    strength: '', form: '', defaultDosage: '', defaultTiming: 'Indifférent',
    price: '', contraindications: '', adverseEffects: '',
    isAdultOnly: false, isPregnantForbidden: false, isBreastfeedingForbidden: false,
    isHeartForbidden: false, isKidneyForbidden: false, isLiverForbidden: false,
};

const MEAL_TIMINGS: MealTiming[] = ['Avant repas', 'Pendant repas', 'Après repas', 'Indifférent'];

const FORMS_LIST = [
    'Comprimé', 'Comprimé pelliculé', 'Comprimé gastro-résistant', 'Comprimé LP',
    'Gélule', 'Sirop', 'Solution buvable', 'Solution injectable',
    'Suppositoire', 'Crème', 'Pommade', 'Collyre', 'Spray nasal',
    'Patch transdermique', 'Sachet', 'Ampoule', 'Autre',
];

// ─── Config des classes ───────────────────────────────────────────────────────

const CLASS_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
    'Antibiotiques': { color: 'text-blue-600', bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200', icon: Syringe },
    'Antihypertenseurs': { color: 'text-red-600', bg: 'bg-red-50 hover:bg-red-100 border-red-200', icon: HeartPulse },
    'Antidiabétiques': { color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100 border-purple-200', icon: Droplets },
    'Analgésiques': { color: 'text-yellow-600', bg: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200', icon: Activity },
    'Anti-inflammatoires': { color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100 border-orange-200', icon: Flame },
    'Anticoagulants': { color: 'text-rose-600', bg: 'bg-rose-50 hover:bg-rose-100 border-rose-200', icon: Thermometer },
    'Gastroprotecteurs': { color: 'text-teal-600', bg: 'bg-teal-50 hover:bg-teal-100 border-teal-200', icon: ShieldCheck },
    'Antihistaminiques': { color: 'text-pink-600', bg: 'bg-pink-50 hover:bg-pink-100 border-pink-200', icon: Pill },
};

const DEFAULT_CFG = { color: 'text-gray-600', bg: 'bg-gray-50 hover:bg-gray-100 border-gray-200', icon: Pill };

// ─── Carte médicament (dépliable) ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MedCard: React.FC<{ med: any }> = ({ med }) => {
    const [expanded, setExpanded] = useState(false);

    const ci: string[] = Array.isArray(med.contraindications)
        ? med.contraindications.map((c: unknown) =>
            typeof c === 'string' ? c : (c as MedicineContraindication)?.message ?? String(c))
        : [];
    const ae: string[] = med.adverse_effects || [];
    const price = med.market_data?.[0]?.price_ppv_dhs;

    return (
        <div className="bg-white border text-left border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow mb-3 overflow-hidden">
            {/* Header */}
            <div
                className="p-5 cursor-pointer flex justify-between items-start"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-gray-800 uppercase leading-tight truncate">
                        {med.brand_name || med.name}
                    </h3>
                    <p className="text-sm font-semibold text-[#1D9E75] mt-0.5 truncate">
                        {med.generic_name || med.active_ingredient || '—'}
                    </p>

                    {/* Smart flags */}
                    {med.smart_flags && med.smart_flags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {(med.smart_flags as string[]).map(flag => {
                                const color = flag.includes('INTERDIT')
                                    ? 'bg-red-50 text-red-600 border-red-200'
                                    : flag.includes('PRUDENCE')
                                        ? 'bg-orange-50 text-orange-600 border-orange-200'
                                        : 'bg-gray-100 text-gray-500 border-gray-200';
                                return (
                                    <span key={flag} className={`text-[9px] font-bold px-2 py-0.5 rounded border ${color}`}>
                                        {flag.replace(/_/g, ' ')}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    {med.clinical_flags && med.clinical_flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 pl-0.5">
                            {(med.clinical_flags as string[]).map(flag => (
                                <span key={flag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                                    <Activity size={10} /> {flag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end shrink-0 ml-4 gap-1.5">
                    {price != null && (
                        <span className="text-sm font-black text-[#1D9E75] bg-[#E8F5F1] px-3 py-1 rounded-full">
                            {price} MAD
                        </span>
                    )}
                    {expanded
                        ? <ChevronUp className="text-gray-400" size={18} />
                        : <ChevronDown className="text-gray-400" size={18} />
                    }
                </div>
            </div>

            {/* Body dépliable */}
            {expanded && (
                <div className="px-5 pb-5 bg-gray-50 border-t border-gray-100 grid md:grid-cols-2 gap-6 pt-4">
                    {/* Colonne gauche */}
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Forme & Dosage</p>
                            <p className="text-sm text-gray-700">
                                {med.form || '—'}
                                {med.strength ? ` • ${med.strength}` : ''}
                                {med.atc_code ? ` • ATC: ${med.atc_code}` : ''}
                                {med.nature ? ` • ${med.nature}` : ''}
                            </p>
                        </div>

                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Posologie Standard</p>
                            {med.dosage?.adult && (
                                <p className="text-sm text-gray-700">Adulte : {med.dosage.adult}</p>
                            )}
                            {med.dosage?.children && (
                                <p className="text-sm text-gray-700">Enfant : {med.dosage.children}</p>
                            )}
                            {med.defaultDosage && !med.dosage?.adult && (
                                <p className="text-sm text-gray-700">{med.defaultDosage}</p>
                            )}
                            {!med.dosage?.adult && !med.dosage?.children && !med.defaultDosage && (
                                <p className="text-sm text-gray-400 italic">—</p>
                            )}
                        </div>

                        {ae.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Effets Secondaires</p>
                                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                                    {ae.slice(0, 5).map((e: string, i: number) => (
                                        <li key={i} className="truncate">{e}</li>
                                    ))}
                                    {ae.length > 5 && (
                                        <li className="text-gray-400 italic">+{ae.length - 5} autres</li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {med.indications && med.indications.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Indications</p>
                                <ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">
                                    {(med.indications as string[]).slice(0, 4).map((ind, i) => (
                                        <li key={i} className="truncate">{ind}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Colonne droite */}
                    <div className="space-y-4">
                        {ci.length > 0 && (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <AlertTriangle size={12} /> Contre-indications
                                </p>
                                <ul className="text-sm text-red-700 space-y-1">
                                    {ci.slice(0, 6).map((c, i) => (
                                        <li key={i} className="flex items-start gap-1.5">
                                            <span className="mt-0.5 shrink-0">•</span>
                                            <span>{c}</span>
                                        </li>
                                    ))}
                                    {ci.length > 6 && (
                                        <li className="text-red-400 italic text-xs">+{ci.length - 6} autres</li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {med.pregnancy && (med.pregnancy.warning || med.pregnancy.breastfeeding) && (
                            <div className="bg-pink-50 p-3 rounded-xl border border-pink-100">
                                <p className="text-[10px] font-bold text-pink-500 uppercase tracking-wider mb-1.5">Grossesse & Allaitement</p>
                                {med.pregnancy.warning && (
                                    <p className="text-xs text-pink-700">{med.pregnancy.warning}</p>
                                )}
                                {med.pregnancy.breastfeeding && (
                                    <p className="text-xs text-pink-600 mt-1 italic">{med.pregnancy.breastfeeding}</p>
                                )}
                            </div>
                        )}

                        {/* Prix détaillé */}
                        {med.market_data && med.market_data.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Prix de marché</p>
                                {med.market_data.slice(0, 2).map((m: { laboratory?: string; packaging?: string; price_ppv_dhs?: number }, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-sm bg-white rounded-lg px-3 py-2 border border-gray-100 mb-1">
                                        <span className="text-gray-600 truncate text-xs">{m.laboratory || m.packaging || '—'}</span>
                                        {m.price_ppv_dhs != null && (
                                            <span className="font-black text-[#1D9E75] shrink-0 ml-2">{m.price_ppv_dhs} MAD</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Modal d'ajout ────────────────────────────────────────────────────────────

const AddModal: React.FC<{
    onSave: (form: AddForm) => Promise<void>;
    onClose: () => void;
}> = ({ onSave, onClose }) => {
    const [form, setForm] = useState<AddForm>(EMPTY_FORM);
    const [errors, setErrors] = useState<Partial<Record<keyof AddForm, string>>>({});
    const [saving, setSaving] = useState(false);

    const set = <K extends keyof AddForm>(k: K, v: AddForm[K]) => {
        setForm(f => ({ ...f, [k]: v }));
        if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
    };

    const validate = () => {
        const e: Partial<Record<keyof AddForm, string>> = {};
        if (!form.name.trim()) e.name = 'Requis';
        if (!form.category) e.category = 'Requis';
        return e;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length) { setErrors(errs); return; }
        setSaving(true);
        await onSave(form);
        setSaving(false);
    };

    const inp = (k: keyof AddForm) =>
        `w-full border rounded-xl px-4 py-3 focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/10 outline-none text-sm font-medium text-gray-800 transition-all ${errors[k] ? 'border-red-300 bg-red-50/50' : 'border-gray-200 bg-white'
        }`;

    const Label = ({ text, req }: { text: string; req?: boolean }) => (
        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
            {text}{req && <span className="text-red-400 ml-0.5">*</span>}
        </label>
    );

    const FlagCheck = ({ field, label }: { field: keyof AddForm; label: string }) => (
        <label className="flex items-center gap-2 cursor-pointer group select-none">
            <input
                type="checkbox"
                checked={form[field] as boolean}
                onChange={e => set(field, e.target.checked as AddForm[typeof field])}
                className="w-4 h-4 rounded border-gray-300 text-[#1D9E75] focus:ring-[#1D9E75] cursor-pointer"
            />
            <span className="text-xs text-gray-600 font-medium group-hover:text-gray-800">{label}</span>
        </label>
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-xl rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 shrink-0">
                    <h2 className="text-xl font-black text-[#1D9E75]">Ajouter un médicament</h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="overflow-y-auto px-7 py-5 space-y-4">

                    {/* Nom + DCI */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label text="Nom commercial" req />
                            <input
                                value={form.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder="Ex: DOLIPRANE"
                                className={inp('name')}
                            />
                            {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
                        </div>
                        <div>
                            <Label text="DCI" />
                            <input
                                value={form.active_ingredient}
                                onChange={e => set('active_ingredient', e.target.value)}
                                placeholder="Ex: Paracétamol"
                                className={inp('active_ingredient')}
                            />
                        </div>
                    </div>

                    {/* Classe */}
                    <div>
                        <Label text="Classe thérapeutique" req />
                        <select
                            value={form.category}
                            onChange={e => set('category', e.target.value)}
                            className={inp('category')}
                        >
                            {Object.keys(CLASS_CONFIG).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        {errors.category && <p className="text-[10px] text-red-500 mt-0.5">{errors.category}</p>}
                    </div>

                    {/* Dosage + Forme */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label text="Dosage" />
                            <input
                                value={form.strength}
                                onChange={e => set('strength', e.target.value)}
                                placeholder="Ex: 500 mg"
                                className={inp('strength')}
                            />
                        </div>
                        <div>
                            <Label text="Forme galénique" />
                            <select
                                value={form.form}
                                onChange={e => set('form', e.target.value)}
                                className={inp('form')}
                            >
                                <option value="">Sélectionner…</option>
                                {FORMS_LIST.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Posologie + Timing */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label text="Posologie standard" />
                            <input
                                value={form.defaultDosage}
                                onChange={e => set('defaultDosage', e.target.value)}
                                placeholder="Ex: 1 cp × 3/j"
                                className={inp('defaultDosage')}
                            />
                        </div>
                        <div>
                            <Label text="Prise / repas" />
                            <select
                                value={form.defaultTiming}
                                onChange={e => set('defaultTiming', e.target.value as MealTiming)}
                                className={inp('defaultTiming')}
                            >
                                {MEAL_TIMINGS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Prix */}
                    <div>
                        <Label text="Prix indicatif (MAD)" />
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.price}
                            onChange={e => set('price', e.target.value)}
                            placeholder="Ex: 15.50"
                            className={inp('price')}
                        />
                    </div>

                    {/* Contre-indications */}
                    <div>
                        <Label text="Contre-indications (séparées par virgule)" />
                        <textarea
                            value={form.contraindications}
                            onChange={e => set('contraindications', e.target.value)}
                            rows={2}
                            placeholder="Ex: Insuffisance hépatique, Allergie, Grossesse"
                            className={`${inp('contraindications')} resize-none`}
                        />
                    </div>

                    {/* Effets secondaires */}
                    <div>
                        <Label text="Effets secondaires (séparés par virgule)" />
                        <textarea
                            value={form.adverseEffects}
                            onChange={e => set('adverseEffects', e.target.value)}
                            rows={2}
                            placeholder="Ex: Nausées, Céphalées, Vertiges"
                            className={`${inp('adverseEffects')} resize-none`}
                        />
                    </div>

                    {/* Alertes de sécurité */}
                    <div>
                        <Label text="Alertes de sécurité" />
                        <div className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <FlagCheck field="isAdultOnly" label="Adulte uniquement (CI enfant)" />
                            <FlagCheck field="isPregnantForbidden" label="Grossesse CI" />
                            <FlagCheck field="isBreastfeedingForbidden" label="Allaitement CI" />
                            <FlagCheck field="isHeartForbidden" label="Cardiaque CI" />
                            <FlagCheck field="isKidneyForbidden" label="Rénal CI" />
                            <FlagCheck field="isLiverForbidden" label="Hépatique CI" />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pb-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-3 rounded-xl text-white text-sm font-black transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 shadow-md"
                            style={{ backgroundColor: '#1D9E75' }}
                        >
                            {saving && <Loader2 size={15} className="animate-spin" />}
                            {saving ? 'Enregistrement…' : 'Enregistrer le médicament'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Composant principal ──────────────────────────────────────────────────────

const RepertoirePharmaceutique: React.FC = () => {
    const [summary, setSummary] = useState<ClassesSummary | null>(null);
    const [activeClass, setActiveClass] = useState<string | null>(null);
    const [classDrugs, setClassDrugs] = useState<unknown[]>([]);
    const [loadingClass, setLoadingClass] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<unknown[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [saving, setSaving] = useState(false);

    // ── Chargement du résumé des classes (JSON statique) ─────────────────────
    useEffect(() => {
        fetch('/medicaments/classes/classes_summary.json')
            .then(res => res.json())
            .then((data: ClassesSummary) => setSummary(data))
            .catch(err => console.warn('Résumé classes non trouvé :', err));
    }, []);

    // ── Clic sur une classe → charge ses médicaments ─────────────────────────
    const handleClassClick = useCallback(async (className: string, file: string) => {
        if (activeClass === className) {
            setActiveClass(null);
            setClassDrugs([]);
            return;
        }
        setActiveClass(className);
        setLoadingClass(true);
        setClassDrugs([]);
        setSearchQuery('');
        setSearchResults([]);

        try {
            const res = await fetch(`/medicaments/classes/${file}`);
            if (res.ok) {
                const data = await res.json();
                setClassDrugs(data);
            }
        } catch (e) {
            console.error('Erreur chargement classe :', e);
        } finally {
            setLoadingClass(false);
        }
    }, [activeClass]);

    // ── Recherche globale avec debounce ───────────────────────────────────────
    useEffect(() => {
        if (searchQuery.trim().length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        const timeout = setTimeout(async () => {
            setIsSearching(true);
            const results = await searchDrugsGlobal(searchQuery.trim(), 40);
            setSearchResults(results);
            setIsSearching(false);
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    // ── Sauvegarde d'un nouveau médicament via dataService ───────────────────
    const handleSaveMed = useCallback(async (form: AddForm) => {
        setSaving(true);

        const ciItems: MedicineContraindication[] = form.contraindications
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(msg => ({ type: 'CI', severity: 'absolute' as const, message: msg }));

        const med: Medicine = {
            id: `rep_${Date.now()}`,
            name: form.name.trim().toUpperCase(),
            active_ingredient: form.active_ingredient.trim() || undefined,
            category: form.category as string,
            strength: form.strength.trim() || undefined,
            form: form.form || undefined,
            defaultDosage: form.defaultDosage.trim() || '—',
            defaultTiming: form.defaultTiming,
            isAdultOnly: form.isAdultOnly || undefined,
            isPregnantForbidden: form.isPregnantForbidden || undefined,
            isBreastfeedingForbidden: form.isBreastfeedingForbidden || undefined,
            isHeartForbidden: form.isHeartForbidden || undefined,
            isKidneyForbidden: form.isKidneyForbidden || undefined,
            isLiverForbidden: form.isLiverForbidden || undefined,
            contraindications: ciItems.length > 0 ? ciItems : undefined,
        };

        await dataService.saveMedicine(med);

        // Toast de confirmation
        window.dispatchEvent(new CustomEvent('meddoc_toast', {
            detail: { message: `${med.name} ajouté au répertoire local`, type: 'success' }
        }));

        setSaving(false);
        setShowAddModal(false);
    }, []);

    // ── Rendu ─────────────────────────────────────────────────────────────────
    const isSearchActive = searchQuery.trim().length >= 2;

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">

            {/* ── En-tête ──────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-black text-gray-800 tracking-tight">
                        Répertoire Pharmaceutique
                    </h1>
                    <p className="text-gray-400 text-sm mt-0.5">
                        Base de données clinique — Marché marocain
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 shadow-sm shrink-0"
                    style={{ backgroundColor: '#1D9E75' }}
                >
                    <Plus size={17} /> Ajouter un médicament
                </button>
            </div>

            {/* ── Métriques ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    {
                        label: 'Total Médicaments',
                        value: summary?.totalMedicines
                            ? new Intl.NumberFormat('fr-FR').format(summary.totalMedicines)
                            : '…',
                        icon: <Pill size={20} />,
                        iconBg: 'bg-blue-50 text-blue-500',
                        valueColor: 'text-gray-800',
                    },
                    {
                        label: 'Classes Thérapeutiques',
                        value: summary?.totalClasses ?? 8,
                        icon: <Activity size={20} />,
                        iconBg: 'bg-purple-50 text-purple-500',
                        valueColor: 'text-gray-800',
                    },
                    {
                        label: 'Alertes Actives',
                        value: summary?.totalAlerts
                            ? new Intl.NumberFormat('fr-FR').format(summary.totalAlerts)
                            : '…',
                        icon: <AlertTriangle size={20} />,
                        iconBg: 'bg-orange-50 text-orange-500',
                        valueColor: 'text-orange-600',
                    },
                ].map(m => (
                    <div key={m.label} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{m.label}</p>
                            <p className={`text-2xl font-black mt-1 ${m.valueColor}`}>{m.value}</p>
                        </div>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${m.iconBg}`}>
                            {m.icon}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Barre de recherche globale ────────────────────────────────── */}
            <div className="relative">
                <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    size={20}
                    style={{ color: '#1D9E75' }}
                />
                <input
                    type="text"
                    placeholder="Recherche globale par nom, DCI ou classe…"
                    value={searchQuery}
                    onChange={e => {
                        setSearchQuery(e.target.value);
                        if (activeClass) { setActiveClass(null); setClassDrugs([]); }
                    }}
                    className="w-full pl-12 pr-10 py-4 bg-white border-2 border-gray-100 rounded-2xl outline-none focus:border-[#1D9E75] focus:ring-4 focus:ring-[#1D9E75]/10 transition-all text-base font-medium text-gray-800 placeholder-gray-300 shadow-sm"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* ── Zone de contenu principale ───────────────────────────────── */}

            {/* Vue Recherche */}
            {isSearchActive ? (
                <div className="space-y-3">
                    <p className="text-sm font-bold text-gray-500 text-left">
                        {isSearching
                            ? 'Recherche dans la base…'
                            : `${searchResults.length} résultat${searchResults.length > 1 ? 's' : ''} pour « ${searchQuery} »`
                        }
                    </p>
                    {isSearching ? (
                        <div className="flex justify-center py-12">
                            <Loader2 size={28} className="animate-spin" style={{ color: '#1D9E75' }} />
                        </div>
                    ) : searchResults.length > 0 ? (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        searchResults.map((med: any) => (
                            <MedCard key={med.id || med.name} med={med} />
                        ))
                    ) : (
                        <div className="text-center py-16 text-gray-400">
                            <Pill size={36} className="mx-auto mb-3 opacity-30" />
                            <p className="font-semibold">Aucun résultat trouvé</p>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="mt-3 text-sm font-bold underline"
                                style={{ color: '#1D9E75' }}
                            >
                                Ajouter « {searchQuery} » manuellement
                            </button>
                        </div>
                    )}
                </div>

            ) : activeClass ? (

                /* Vue Classe → liste de médicaments */
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2.5">
                            {CLASS_CONFIG[activeClass] && (
                                <span className={`p-2 rounded-lg bg-white border shadow-sm ${CLASS_CONFIG[activeClass].color} ${CLASS_CONFIG[activeClass].bg.split(' ')[0].replace('bg-', 'border-')}`}>
                                    {React.createElement(CLASS_CONFIG[activeClass].icon, { size: 18 })}
                                </span>
                            )}
                            {activeClass}
                            {classDrugs.length > 0 && (
                                <span className="text-sm font-bold text-gray-400">
                                    ({classDrugs.length})
                                </span>
                            )}
                        </h2>
                        <button
                            onClick={() => { setActiveClass(null); setClassDrugs([]); }}
                            className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-700 transition-colors"
                        >
                            <ArrowLeft size={15} /> Retour aux classes
                        </button>
                    </div>

                    {loadingClass ? (
                        <div className="flex items-center justify-center py-16 gap-3" style={{ color: '#1D9E75' }}>
                            <Loader2 size={24} className="animate-spin" />
                            <span className="font-bold text-sm">Chargement de la classe…</span>
                        </div>
                    ) : (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        classDrugs.map((med: any) => (
                            <MedCard key={med.id} med={med} />
                        ))
                    )}
                </div>

            ) : (

                /* Vue Accueil → Grille des classes */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {summary?.classesCount
                        ? (Object.entries(summary.classesCount) as [string, ClassInfo][]).map(([name, data]) => {
                            const cfg = CLASS_CONFIG[name] ?? DEFAULT_CFG;
                            const Icon = cfg.icon;
                            return (
                                <div
                                    key={name}
                                    onClick={() => handleClassClick(name, data.file)}
                                    className={`cursor-pointer border text-left rounded-2xl p-6 transition-all duration-200 ${cfg.bg} group shadow-sm hover:shadow-md`}
                                >
                                    <div className={`w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform ${cfg.color}`}>
                                        <Icon size={24} />
                                    </div>
                                    <h3 className={`font-black text-base leading-tight mb-1 ${cfg.color}`}>{name}</h3>
                                    <p className="text-sm font-bold text-gray-500">
                                        {new Intl.NumberFormat('fr-FR').format(data.count)} médicaments
                                    </p>
                                </div>
                            );
                        })
                        : (
                            /* Skeleton pendant le chargement du résumé */
                            Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="rounded-2xl border border-gray-100 p-6 bg-gray-50 animate-pulse">
                                    <div className="w-12 h-12 rounded-xl bg-gray-200 mb-4" />
                                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                </div>
                            ))
                        )
                    }
                </div>
            )}

            {/* ── Modal d'ajout ─────────────────────────────────────────────── */}
            {showAddModal && (
                <AddModal
                    onSave={handleSaveMed}
                    onClose={() => { if (!saving) setShowAddModal(false); }}
                />
            )}
        </div>
    );
};

export default RepertoirePharmaceutique;
