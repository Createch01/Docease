import React, { useState, useMemo, useCallback } from 'react';
import {
    Search, Plus, X, ChevronDown, ChevronUp, ArrowLeft,
    AlertTriangle, ShieldAlert, CheckCircle2, Pill,
    FlaskConical, Activity, LayoutGrid, List,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FlagType = 'ci' | 'caution' | 'ok';

interface SmartFlag {
    type: FlagType;
    label: string;
}

interface Drug {
    id: string;
    brand_name: string;
    generic_name: string;
    therapeutic_class: string;
    dosage: string;
    form: string;
    posology: string;
    contraindications: string[];
    side_effects: string[];
    price_mad: number | null;
    smart_flags: SmartFlag[];
}

// ─── Class config (colors + icon labels) ─────────────────────────────────────

interface ClassConfig {
    label: string;
    color: string;         // text color
    bg: string;            // card background
    border: string;        // card border
    badge: string;         // count badge
    dot: string;           // left accent dot
}

const CLASS_CONFIG: Record<string, ClassConfig> = {
    'Antibiotiques':       { label: 'Antibiotiques',       color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
    'Antihypertenseurs':   { label: 'Antihypertenseurs',   color: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-200',   badge: 'bg-rose-100 text-rose-700',   dot: 'bg-rose-500'   },
    'Antidiabétiques':     { label: 'Antidiabétiques',     color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
    'Analgésiques':        { label: 'Analgésiques',        color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
    'Anti-inflammatoires': { label: 'Anti-inflammatoires', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
    'Anticoagulants':      { label: 'Anticoagulants',      color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    },
    'Gastroprotecteurs':   { label: 'Gastroprotecteurs',   color: 'text-teal-700',   bg: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700',   dot: 'bg-teal-500'   },
    'Antihistaminiques':   { label: 'Antihistaminiques',   color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
};

const CLASS_ICONS: Record<string, React.ReactNode> = {
    'Antibiotiques':       <FlaskConical size={22} />,
    'Antihypertenseurs':   <Activity size={22} />,
    'Antidiabétiques':     <FlaskConical size={22} />,
    'Analgésiques':        <Pill size={22} />,
    'Anti-inflammatoires': <ShieldAlert size={22} />,
    'Anticoagulants':      <AlertTriangle size={22} />,
    'Gastroprotecteurs':   <CheckCircle2 size={22} />,
    'Antihistaminiques':   <Pill size={22} />,
};

// ─── Sample data ──────────────────────────────────────────────────────────────

const INITIAL_DRUGS: Drug[] = [
    // Antibiotiques
    {
        id: 'a1', brand_name: 'AMOXIL', generic_name: 'Amoxicilline', therapeutic_class: 'Antibiotiques',
        dosage: '500 mg', form: 'Gélule', posology: '1 gélule × 3/j pendant 7 jours',
        contraindications: ['Allergie aux pénicillines', 'Mononucléose infectieuse'],
        side_effects: ['Diarrhée', 'Rash cutané', 'Nausées'],
        price_mad: 28.50,
        smart_flags: [{ type: 'caution', label: 'Allergie pénicilline' }, { type: 'ok', label: 'Grossesse OK (cat B)' }],
    },
    {
        id: 'a2', brand_name: 'CIPROFLOX', generic_name: 'Ciprofloxacine', therapeutic_class: 'Antibiotiques',
        dosage: '500 mg', form: 'Comprimé', posology: '1 cp × 2/j pendant 5-10 jours',
        contraindications: ['Grossesse', 'Enfant < 15 ans', 'Tendinopathie antérieure aux FQ'],
        side_effects: ['Tendinite', 'Troubles digestifs', 'Photosensibilité', 'Vertiges'],
        price_mad: 45.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse CI' }, { type: 'ci', label: 'Pédiatrie CI' }, { type: 'caution', label: 'Risque tendinite' }],
    },
    {
        id: 'a3', brand_name: 'ZITHROMAX', generic_name: 'Azithromycine', therapeutic_class: 'Antibiotiques',
        dosage: '500 mg', form: 'Comprimé', posology: '1 cp/j pendant 3 jours',
        contraindications: ['Allergie macrolides', 'Insuffisance hépatique sévère'],
        side_effects: ['Troubles digestifs', 'Allongement QT', 'Élévation transaminases'],
        price_mad: 62.00,
        smart_flags: [{ type: 'caution', label: 'Allongement QT' }, { type: 'ok', label: 'Courte durée' }],
    },
    {
        id: 'a4', brand_name: 'AUGMENTIN', generic_name: 'Amoxicilline + Acide clavulanique', therapeutic_class: 'Antibiotiques',
        dosage: '1g/125mg', form: 'Comprimé', posology: '1 cp × 2/j pendant 7 jours',
        contraindications: ['Allergie pénicillines', 'Antécédent ictère cholestatique aux AA'],
        side_effects: ['Diarrhée', 'Candidose', 'Hépatotoxicité rare'],
        price_mad: 78.00,
        smart_flags: [{ type: 'caution', label: 'Hépatotoxicité' }, { type: 'caution', label: 'Grossesse prudence' }],
    },
    // Antihypertenseurs
    {
        id: 'b1', brand_name: 'AMLOR', generic_name: 'Amlodipine', therapeutic_class: 'Antihypertenseurs',
        dosage: '5 mg', form: 'Comprimé', posology: '1 cp/j en une prise',
        contraindications: ['Choc cardiogénique', 'Hypotension sévère', 'Sténose aortique sévère'],
        side_effects: ['Oedèmes des membres inférieurs', 'Céphalées', 'Bouffées de chaleur', 'Palpitations'],
        price_mad: 52.00,
        smart_flags: [{ type: 'caution', label: 'Œdèmes fréquents' }, { type: 'ok', label: 'Grossesse possible' }],
    },
    {
        id: 'b2', brand_name: 'RENITEC', generic_name: 'Énalapril', therapeutic_class: 'Antihypertenseurs',
        dosage: '20 mg', form: 'Comprimé', posology: '1 cp/j, dose ajustable',
        contraindications: ['Grossesse (2e et 3e trimestre)', 'Sténose rénale bilatérale', 'Hyperkaliémie'],
        side_effects: ['Toux sèche', 'Hyperkaliémie', 'Hypotension 1ère dose', 'Insuffisance rénale aiguë'],
        price_mad: 38.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse CI T2/T3' }, { type: 'caution', label: 'Surveillance rénale' }],
    },
    {
        id: 'b3', brand_name: 'LOSARTAN TEVA', generic_name: 'Losartan', therapeutic_class: 'Antihypertenseurs',
        dosage: '50 mg', form: 'Comprimé', posology: '1 cp/j, max 100 mg/j',
        contraindications: ['Grossesse', 'Insuffisance hépatique sévère', 'Association avec aliskiren (diabétiques)'],
        side_effects: ['Hyperkaliémie', 'Vertiges', 'Hypotension'],
        price_mad: 35.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse CI' }, { type: 'caution', label: 'Rénal prudence' }],
    },
    {
        id: 'b4', brand_name: 'AVLOCARDYL', generic_name: 'Propranolol', therapeutic_class: 'Antihypertenseurs',
        dosage: '40 mg', form: 'Comprimé', posology: '1-2 cp × 2-3/j selon indication',
        contraindications: ['Asthme', 'BPCO', 'Bloc AV 2e/3e degré', 'Bradycardie < 45 bpm'],
        side_effects: ['Bradycardie', 'Bronchospasme', 'Fatigue', 'Extrémités froides', 'Masque hypoglycémie'],
        price_mad: 22.00,
        smart_flags: [{ type: 'ci', label: 'Asthme / BPCO CI' }, { type: 'caution', label: 'Diabétiques prudence' }],
    },
    // Antidiabétiques
    {
        id: 'c1', brand_name: 'GLUCOPHAGE', generic_name: 'Metformine', therapeutic_class: 'Antidiabétiques',
        dosage: '850 mg', form: 'Comprimé', posology: '1 cp × 2-3/j au cours des repas',
        contraindications: ['IRC stade ≥ 3b (DFG < 45)', 'Insuffisance hépatique', 'Alcoolisme', 'IDR inject avec iode'],
        side_effects: ['Troubles digestifs', 'Acidose lactique (rare)', 'Carence B12'],
        price_mad: 15.00,
        smart_flags: [{ type: 'caution', label: 'Surveillance rénale' }, { type: 'ok', label: '1ère intention DT2' }],
    },
    {
        id: 'c2', brand_name: 'DIAMICRON', generic_name: 'Gliclazide', therapeutic_class: 'Antidiabétiques',
        dosage: '30 mg', form: 'Comprimé LP', posology: '1-4 cp/j en une prise le matin',
        contraindications: ['DT1', 'Insuffisance rénale/hépatique sévère', 'Grossesse', 'Allaitement'],
        side_effects: ['Hypoglycémie', 'Prise de poids', 'Troubles digestifs'],
        price_mad: 42.00,
        smart_flags: [{ type: 'caution', label: 'Risque hypoglycémie' }, { type: 'ci', label: 'DT1 CI' }],
    },
    {
        id: 'c3', brand_name: 'LANTUS', generic_name: 'Insuline glargine', therapeutic_class: 'Antidiabétiques',
        dosage: '100 UI/mL', form: 'Solution injectable', posology: '1 injection SC/j à heure fixe',
        contraindications: ['Hypoglycémie'],
        side_effects: ['Hypoglycémie', 'Lipodystrophie', 'Prise de poids'],
        price_mad: 185.00,
        smart_flags: [{ type: 'caution', label: 'Risque hypoglycémie' }, { type: 'caution', label: 'Auto-injection' }],
    },
    // Analgésiques
    {
        id: 'd1', brand_name: 'DOLIPRANE', generic_name: 'Paracétamol', therapeutic_class: 'Analgésiques',
        dosage: '1000 mg', form: 'Comprimé', posology: '1 cp toutes les 6h, max 4g/j',
        contraindications: ['Insuffisance hépatique sévère', 'Alcoolisme chronique'],
        side_effects: ['Hépatotoxicité en cas de surdosage'],
        price_mad: 12.00,
        smart_flags: [{ type: 'ok', label: 'Grossesse OK' }, { type: 'caution', label: 'Dose max 4g/j' }],
    },
    {
        id: 'd2', brand_name: 'TOPALGIC', generic_name: 'Tramadol', therapeutic_class: 'Analgésiques',
        dosage: '100 mg', form: 'Gélule LP', posology: '1-2 gél × 2/j, max 400 mg/j',
        contraindications: ['Épilepsie non contrôlée', 'IMAO < 14j', 'Insuffisance respiratoire sévère', 'Enfant < 12 ans'],
        side_effects: ['Nausées', 'Vertiges', 'Dépendance', 'Constipation', 'Convulsions'],
        price_mad: 68.00,
        smart_flags: [{ type: 'ci', label: 'Dépendance possible' }, { type: 'caution', label: 'Seuil épileptique' }],
    },
    {
        id: 'd3', brand_name: 'MORPHINE LAVOISIER', generic_name: 'Morphine', therapeutic_class: 'Analgésiques',
        dosage: '10 mg/mL', form: 'Solution injectable', posology: 'Titration individuelle IV/SC',
        contraindications: ['IRA/IRC sévère', 'BPCO décompensé', 'Hypertension intracrânienne', 'Iléus paralytique'],
        side_effects: ['Dépression respiratoire', 'Nausées/vomissements', 'Constipation', 'Dépendance', 'Somnolence'],
        price_mad: null,
        smart_flags: [{ type: 'ci', label: 'Ordonnance sécurisée' }, { type: 'caution', label: 'Dépression respiratoire' }],
    },
    // Anti-inflammatoires
    {
        id: 'e1', brand_name: 'VOLTAREN', generic_name: 'Diclofénac', therapeutic_class: 'Anti-inflammatoires',
        dosage: '50 mg', form: 'Comprimé gastro-résistant', posology: '1 cp × 2-3/j au cours des repas',
        contraindications: ['Ulcère gastroduodénal actif', 'Insuffisance cardiaque sévère', 'Grossesse T3', 'IRC sévère'],
        side_effects: ['Gastralgie', 'Élévation tensionnelle', 'Rétention sodée', 'Risque CV'],
        price_mad: 24.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse T3 CI' }, { type: 'caution', label: 'Protection gastrique' }],
    },
    {
        id: 'e2', brand_name: 'IBUPROFÈNE BIOGARAN', generic_name: 'Ibuprofène', therapeutic_class: 'Anti-inflammatoires',
        dosage: '400 mg', form: 'Comprimé', posology: '1 cp × 3/j au cours des repas, max 1200 mg/j',
        contraindications: ['Ulcère évolutif', 'Insuffisance rénale', 'Grossesse ≥ 24 SA', 'Enfant < 3 mois'],
        side_effects: ['Gastralgie', 'Ulcère gastroduodénal', 'Risque rénal', 'Risque CV'],
        price_mad: 18.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse ≥ 24 SA' }, { type: 'caution', label: 'Gastroprotection recommandée' }],
    },
    {
        id: 'e3', brand_name: 'CORTANCYL', generic_name: 'Prednisone', therapeutic_class: 'Anti-inflammatoires',
        dosage: '20 mg', form: 'Comprimé', posology: '1-2 mg/kg/j le matin au petit-déjeuner',
        contraindications: ['Infection non contrôlée', 'Vaccins vivants', 'Psychose non traitée'],
        side_effects: ['Ostéoporose', 'Diabète cortisonique', 'HTA', 'Syndrome de Cushing', 'Infections'],
        price_mad: 32.00,
        smart_flags: [{ type: 'caution', label: 'Surveillance glycémie' }, { type: 'caution', label: 'Arrêt progressif' }],
    },
    // Anticoagulants
    {
        id: 'f1', brand_name: 'PREVISCAN', generic_name: 'Fluindione', therapeutic_class: 'Anticoagulants',
        dosage: '20 mg', form: 'Comprimé', posology: 'Dose ajustée à l\'INR cible (2-3)',
        contraindications: ['Grossesse (toute durée)', 'Hémorragie active', 'Chirurgie récente SNC'],
        side_effects: ['Hémorragies', 'Nécrose cutanée', 'Réactions immunoallergiques'],
        price_mad: 28.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse CI absolue' }, { type: 'caution', label: 'Surveillance INR' }],
    },
    {
        id: 'f2', brand_name: 'XARELTO', generic_name: 'Rivaroxaban', therapeutic_class: 'Anticoagulants',
        dosage: '20 mg', form: 'Comprimé', posology: '1 cp/j avec le repas du soir',
        contraindications: ['Grossesse', 'IRC DFG < 15', 'Hémorragie active', 'Association avec anticoagulants'],
        side_effects: ['Hémorragies', 'Élévation enzymes hépatiques', 'Nausées'],
        price_mad: 320.00,
        smart_flags: [{ type: 'ci', label: 'Grossesse CI' }, { type: 'caution', label: 'Pas d\'antidote immédiat' }],
    },
    {
        id: 'f3', brand_name: 'LOVENOX', generic_name: 'Énoxaparine', therapeutic_class: 'Anticoagulants',
        dosage: '0.4 mL (4000 UI)', form: 'Solution injectable SC', posology: '1 inj SC/j en prophylaxie',
        contraindications: ['TIH antérieure', 'Hémorragie active', 'Endocardite bactérienne aiguë'],
        side_effects: ['Hémorragies', 'Thrombopénie', 'Hématomes au site d\'injection', 'Hyperkaliémie'],
        price_mad: 95.00,
        smart_flags: [{ type: 'caution', label: 'Surveillance plaquettes' }, { type: 'ok', label: 'Grossesse envisageable' }],
    },
    // Gastroprotecteurs
    {
        id: 'g1', brand_name: 'MOPRAL', generic_name: 'Oméprazole', therapeutic_class: 'Gastroprotecteurs',
        dosage: '20 mg', form: 'Gélule gastro-résistante', posology: '1 gél/j avant le repas, 4-8 semaines',
        contraindications: ['Association avec nelfinavir'],
        side_effects: ['Céphalées', 'Diarrhée', 'Carence B12 (long terme)', 'Hypoagnésémie', 'Fractures (long terme)'],
        price_mad: 22.00,
        smart_flags: [{ type: 'caution', label: 'Carence B12 long terme' }, { type: 'ok', label: 'Grossesse OK' }],
    },
    {
        id: 'g2', brand_name: 'INEXIUM', generic_name: 'Ésoméprazole', therapeutic_class: 'Gastroprotecteurs',
        dosage: '40 mg', form: 'Comprimé gastro-résistant', posology: '1 cp/j avant le repas 4 semaines',
        contraindications: ['Association avec nelfinavir', 'Atazanavir'],
        side_effects: ['Céphalées', 'Diarrhée ou constipation', 'Flatulences', 'Nausées'],
        price_mad: 35.00,
        smart_flags: [{ type: 'ok', label: 'Bien toléré' }, { type: 'caution', label: 'Interactions métaboliques' }],
    },
    {
        id: 'g3', brand_name: 'SMECTA', generic_name: 'Diosmectite', therapeutic_class: 'Gastroprotecteurs',
        dosage: '3 g', form: 'Poudre pour suspension buvable', posology: '1 sachet × 3/j entre les repas',
        contraindications: [],
        side_effects: ['Constipation', 'Espace de 2h avec autres médicaments'],
        price_mad: 8.50,
        smart_flags: [{ type: 'ok', label: 'Grossesse OK' }, { type: 'ok', label: 'Pédiatrie OK' }],
    },
    // Antihistaminiques
    {
        id: 'h1', brand_name: 'AERIUS', generic_name: 'Desloratadine', therapeutic_class: 'Antihistaminiques',
        dosage: '5 mg', form: 'Comprimé', posology: '1 cp/j',
        contraindications: ['Insuffisance rénale sévère'],
        side_effects: ['Céphalées', 'Sécheresse buccale', 'Somnolence (rare)'],
        price_mad: 45.00,
        smart_flags: [{ type: 'ok', label: 'Non sédatif' }, { type: 'ok', label: 'Grossesse prudence' }],
    },
    {
        id: 'h2', brand_name: 'ZYRTEC', generic_name: 'Cétirizine', therapeutic_class: 'Antihistaminiques',
        dosage: '10 mg', form: 'Comprimé', posology: '1 cp/j le soir',
        contraindications: ['Insuffisance rénale sévère', 'Galactosémie'],
        side_effects: ['Somnolence modérée', 'Céphalées', 'Sécheresse buccale'],
        price_mad: 32.00,
        smart_flags: [{ type: 'caution', label: 'Légère somnolence' }, { type: 'ok', label: 'Enfant ≥ 6 ans OK' }],
    },
    {
        id: 'h3', brand_name: 'POLARAMINE', generic_name: 'Dexchlorphéniramine', therapeutic_class: 'Antihistaminiques',
        dosage: '2 mg', form: 'Comprimé', posology: '1 cp × 3/j',
        contraindications: ['Glaucome', 'Rétention urinaire', 'Enfant < 2 ans'],
        side_effects: ['Somnolence', 'Sécheresse buccale', 'Constipation', 'Rétention urinaire'],
        price_mad: 14.00,
        smart_flags: [{ type: 'caution', label: 'Sédatif — vigilance' }, { type: 'ci', label: 'Glaucome CI' }],
    },
];

const FLAG_STYLES: Record<FlagType, string> = {
    ci:      'bg-red-100 text-red-700 border border-red-200',
    caution: 'bg-orange-100 text-orange-700 border border-orange-200',
    ok:      'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

const FLAG_ICONS: Record<FlagType, React.ReactNode> = {
    ci:      <AlertTriangle size={9} />,
    caution: <ShieldAlert size={9} />,
    ok:      <CheckCircle2 size={9} />,
};

// ─── Highlight ────────────────────────────────────────────────────────────────

function HL({ text, q }: { text: string; q: string }) {
    if (!q.trim()) return <>{text}</>;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, i)}
            <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 not-italic">{text.slice(i, i + q.length)}</mark>
            {text.slice(i + q.length)}
        </>
    );
}

// ─── Drug Card ────────────────────────────────────────────────────────────────

const DrugCard: React.FC<{
    drug: Drug;
    query: string;
    onDelete?: (id: string) => void;
    isCustom?: boolean;
}> = ({ drug, query, onDelete, isCustom }) => {
    const [open, setOpen] = useState(!!query);
    const cfg = CLASS_CONFIG[drug.therapeutic_class];

    return (
        <div className={`rounded-xl border ${cfg.border} bg-white overflow-hidden transition-shadow hover:shadow-md`}>
            {/* Header row */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
            >
                <div className={`w-2 h-2 rounded-full ${cfg.dot} shrink-0`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                            <HL text={drug.brand_name} q={query} />
                        </span>
                        {isCustom && (
                            <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                                Ajouté
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-slate-500 font-medium">
                            <HL text={drug.generic_name} q={query} />
                        </span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${cfg.badge}`}>
                            {drug.dosage}
                        </span>
                        <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                            {drug.form}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {drug.price_mad != null && (
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-black text-slate-800">{drug.price_mad.toFixed(2)}</p>
                            <p className="text-[8px] text-slate-400 font-medium">MAD</p>
                        </div>
                    )}
                    {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                </div>
            </button>

            {/* Expanded body */}
            {open && (
                <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-4">
                    {/* Smart flags */}
                    {drug.smart_flags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {drug.smart_flags.map((f, i) => (
                                <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${FLAG_STYLES[f.type]}`}>
                                    {FLAG_ICONS[f.type]} {f.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Posologie */}
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Posologie standard</p>
                        <p className="text-sm text-slate-700 font-medium">{drug.posology}</p>
                    </div>

                    {/* Contre-indications */}
                    {drug.contraindications.length > 0 && (
                        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                            <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <AlertTriangle size={10} /> Contre-indications
                            </p>
                            <ul className="space-y-1">
                                {drug.contraindications.map((ci, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-red-700 font-medium">
                                        <span className="mt-0.5 shrink-0">•</span> {ci}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Effets secondaires */}
                    {drug.side_effects.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Effets secondaires</p>
                            <div className="flex flex-wrap gap-1.5">
                                {drug.side_effects.map((se, i) => (
                                    <span key={i} className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                                        {se}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Prix */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prix indicatif</span>
                        <span className="text-sm font-black text-slate-800">
                            {drug.price_mad != null ? `${drug.price_mad.toFixed(2)} MAD` : '—'}
                        </span>
                    </div>

                    {isCustom && onDelete && (
                        <button
                            onClick={() => onDelete(drug.id)}
                            className="w-full py-1.5 rounded-lg border border-rose-200 text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors"
                        >
                            Supprimer ce médicament
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Class Card ───────────────────────────────────────────────────────────────

const ClassCard: React.FC<{
    name: string;
    count: number;
    onClick: () => void;
}> = ({ name, count, onClick }) => {
    const cfg = CLASS_CONFIG[name];
    return (
        <button
            onClick={onClick}
            className={`${cfg.bg} ${cfg.border} border rounded-xl p-5 text-left hover:shadow-md hover:scale-[1.02] transition-all duration-150 flex flex-col gap-3`}
        >
            <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color} bg-white shadow-sm border ${cfg.border}`}>
                    {CLASS_ICONS[name]}
                </div>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${cfg.badge}`}>
                    {count}
                </span>
            </div>
            <div>
                <p className={`text-sm font-black ${cfg.color} uppercase tracking-tight leading-tight`}>{name}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{count} médicament{count > 1 ? 's' : ''}</p>
            </div>
        </button>
    );
};

// ─── Add Drug Modal ───────────────────────────────────────────────────────────

interface AddForm {
    brand_name: string; generic_name: string; therapeutic_class: string;
    dosage: string; form: string; posology: string;
    contraindications: string; side_effects: string; price_mad: string;
}

const EMPTY: AddForm = {
    brand_name: '', generic_name: '', therapeutic_class: '',
    dosage: '', form: '', posology: '',
    contraindications: '', side_effects: '', price_mad: '',
};

const FORMS_LIST = [
    'Comprimé', 'Comprimé pelliculé', 'Comprimé gastro-résistant', 'Comprimé LP',
    'Gélule', 'Gélule LP', 'Sirop', 'Solution buvable', 'Suspension buvable',
    'Solution injectable', 'Poudre pour suspension', 'Ampoule buvable',
    'Suppositoire', 'Crème', 'Pommade', 'Gel', 'Collyre', 'Spray nasal',
    'Patch transdermique', 'Sachet', 'Autre',
];

const AddDrugModal: React.FC<{
    onSave: (drug: Drug) => void;
    onClose: () => void;
    defaultClass?: string;
}> = ({ onSave, onClose, defaultClass }) => {
    const [form, setForm] = useState<AddForm>({ ...EMPTY, therapeutic_class: defaultClass || '' });
    const [errors, setErrors] = useState<Partial<AddForm>>({});

    const set = (k: keyof AddForm, v: string) => {
        setForm(f => ({ ...f, [k]: v }));
        if (errors[k]) setErrors(e => ({ ...e, [k]: '' }));
    };

    const validate = () => {
        const errs: Partial<AddForm> = {};
        if (!form.brand_name.trim()) errs.brand_name = 'Requis';
        if (!form.generic_name.trim()) errs.generic_name = 'Requis';
        if (!form.therapeutic_class) errs.therapeutic_class = 'Requis';
        return errs;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length) { setErrors(errs); return; }
        onSave({
            id: `custom_${Date.now()}`,
            brand_name: form.brand_name.trim().toUpperCase(),
            generic_name: form.generic_name.trim(),
            therapeutic_class: form.therapeutic_class,
            dosage: form.dosage.trim(),
            form: form.form || 'Autre',
            posology: form.posology.trim() || '—',
            contraindications: form.contraindications.split('\n').map(s => s.trim()).filter(Boolean),
            side_effects: form.side_effects.split('\n').map(s => s.trim()).filter(Boolean),
            price_mad: form.price_mad ? parseFloat(form.price_mad) : null,
            smart_flags: [],
        });
    };

    const inputCls = (k: keyof AddForm) =>
        `w-full px-3 py-2 rounded-lg border text-sm font-medium text-slate-800 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-[#1D9E75] transition-all ${
            errors[k] ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-slate-50 focus:border-[#1D9E75] focus:bg-white'
        }`;

    const Label: React.FC<{ text: string; req?: boolean }> = ({ text, req }) => (
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
            {text} {req && <span className="text-red-400">*</span>}
        </label>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/30 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1D9E75' }}>
                            <Plus size={16} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Nouveau Médicament</h3>
                            <p className="text-[10px] text-slate-400 font-medium">Ajout au répertoire</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                        <X size={15} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label text="Nom Commercial" req />
                            <input value={form.brand_name} onChange={e => set('brand_name', e.target.value)} placeholder="Ex: DOLIPRANE" className={inputCls('brand_name')} />
                            {errors.brand_name && <p className="text-[10px] text-red-500 mt-0.5">{errors.brand_name}</p>}
                        </div>
                        <div>
                            <Label text="DCI / Générique" req />
                            <input value={form.generic_name} onChange={e => set('generic_name', e.target.value)} placeholder="Ex: Paracétamol" className={inputCls('generic_name')} />
                            {errors.generic_name && <p className="text-[10px] text-red-500 mt-0.5">{errors.generic_name}</p>}
                        </div>
                    </div>

                    <div>
                        <Label text="Classe Thérapeutique" req />
                        <select value={form.therapeutic_class} onChange={e => set('therapeutic_class', e.target.value)} className={inputCls('therapeutic_class')}>
                            <option value="">Sélectionner une classe…</option>
                            {Object.keys(CLASS_CONFIG).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {errors.therapeutic_class && <p className="text-[10px] text-red-500 mt-0.5">{errors.therapeutic_class}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label text="Dosage" />
                            <input value={form.dosage} onChange={e => set('dosage', e.target.value)} placeholder="Ex: 500 mg" className={inputCls('dosage')} />
                        </div>
                        <div>
                            <Label text="Forme Galénique" />
                            <select value={form.form} onChange={e => set('form', e.target.value)} className={inputCls('form')}>
                                <option value="">Sélectionner…</option>
                                {FORMS_LIST.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <Label text="Posologie Standard" />
                        <input value={form.posology} onChange={e => set('posology', e.target.value)} placeholder="Ex: 1 cp × 3/j pendant 7 jours" className={inputCls('posology')} />
                    </div>

                    <div>
                        <Label text="Contre-indications (une par ligne)" />
                        <textarea value={form.contraindications} onChange={e => set('contraindications', e.target.value)} rows={2} placeholder={"Grossesse\nInsuffisance rénale"} className={`${inputCls('contraindications')} resize-none`} />
                    </div>

                    <div>
                        <Label text="Effets secondaires (un par ligne)" />
                        <textarea value={form.side_effects} onChange={e => set('side_effects', e.target.value)} rows={2} placeholder={"Nausées\nCéphalées"} className={`${inputCls('side_effects')} resize-none`} />
                    </div>

                    <div>
                        <Label text="Prix indicatif (MAD)" />
                        <input type="number" min="0" step="0.01" value={form.price_mad} onChange={e => set('price_mad', e.target.value)} placeholder="Ex: 45.00" className={inputCls('price_mad')} />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                            Annuler
                        </button>
                        <button type="submit" className="flex-1 py-2.5 rounded-lg text-white text-sm font-black uppercase tracking-tight transition-opacity hover:opacity-90" style={{ backgroundColor: '#1D9E75' }}>
                            Ajouter
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

type View = 'home' | 'class';

const PharmaceuticalDirectory: React.FC = () => {
    const [drugs, setDrugs] = useState<Drug[]>(INITIAL_DRUGS);
    const [view, setView] = useState<View>('home');
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [listMode, setListMode] = useState<'class' | 'flat'>('class');

    // ── Stats ────────────────────────────────────────────────────────────────
    const totalAlerts = useMemo(
        () => drugs.reduce((n, d) => n + d.smart_flags.filter(f => f.type === 'ci').length, 0),
        [drugs]
    );

    const classCounts = useMemo(() => {
        const map: Record<string, number> = {};
        for (const d of drugs) map[d.therapeutic_class] = (map[d.therapeutic_class] || 0) + 1;
        return map;
    }, [drugs]);

    // ── Search filter ────────────────────────────────────────────────────────
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();
        return drugs.filter(d =>
            d.brand_name.toLowerCase().includes(q) ||
            d.generic_name.toLowerCase().includes(q) ||
            d.therapeutic_class.toLowerCase().includes(q)
        );
    }, [drugs, searchQuery]);

    const isSearching = searchQuery.trim().length > 0;

    // ── Class drugs ──────────────────────────────────────────────────────────
    const classDrugs = useMemo(
        () => drugs.filter(d => d.therapeutic_class === selectedClass),
        [drugs, selectedClass]
    );

    // ── Handlers ─────────────────────────────────────────────────────────────
    const openClass = useCallback((name: string) => {
        setSelectedClass(name);
        setView('class');
        setSearchQuery('');
    }, []);

    const goHome = useCallback(() => {
        setView('home');
        setSelectedClass('');
        setSearchQuery('');
    }, []);

    const handleAdd = useCallback((drug: Drug) => {
        setDrugs(prev => [drug, ...prev]);
        setShowAdd(false);
        if (drug.therapeutic_class && view === 'home') {
            openClass(drug.therapeutic_class);
        }
    }, [view, openClass]);

    const handleDelete = useCallback((id: string) => {
        setDrugs(prev => prev.filter(d => d.id !== id));
    }, []);

    const customIds = useMemo(() => new Set(drugs.filter(d => d.id.startsWith('custom_')).map(d => d.id)), [drugs]);

    const classCfg = selectedClass ? CLASS_CONFIG[selectedClass] : null;

    return (
        <div className="flex flex-col gap-4 min-h-0 font-sans">

            {/* ── Stats bar ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total médicaments</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">{drugs.length}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Classes</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">{Object.keys(CLASS_CONFIG).length}</p>
                </div>
                <div className="bg-white border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Alertes CI actives</p>
                    <p className="text-2xl font-black text-red-600 mt-0.5 tabular-nums">{totalAlerts}</p>
                </div>
            </div>

            {/* ── Toolbar ───────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                {/* Back button (class view) */}
                {view === 'class' && !isSearching && (
                    <button
                        onClick={goHome}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                    >
                        <ArrowLeft size={13} /> Retour
                    </button>
                )}

                {/* Search */}
                <div className="flex-1 relative">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 transition-all">
                        <Search size={15} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            placeholder="Rechercher par nom, DCI ou classe…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-sm font-medium text-slate-800 placeholder:text-slate-300 outline-none"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full transition-colors">
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* View toggle (home only) */}
                {view === 'home' && !isSearching && (
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
                        <button onClick={() => setListMode('class')} className={`p-1.5 rounded-md transition-colors ${listMode === 'class' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}>
                            <LayoutGrid size={14} />
                        </button>
                        <button onClick={() => setListMode('flat')} className={`p-1.5 rounded-md transition-colors ${listMode === 'flat' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}>
                            <List size={14} />
                        </button>
                    </div>
                )}

                {/* Add button */}
                <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-xs font-bold uppercase tracking-tight transition-opacity hover:opacity-90 shrink-0"
                    style={{ backgroundColor: '#1D9E75' }}
                >
                    <Plus size={14} /> Ajouter
                </button>
            </div>

            {/* ── Content ───────────────────────────────────────────────────── */}

            {/* Global search results */}
            {isSearching ? (
                <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
                        {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''} pour «&nbsp;{searchQuery}&nbsp;»
                    </p>
                    {searchResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                                <Pill size={24} className="text-slate-300" />
                            </div>
                            <p className="text-sm font-bold text-slate-400">Aucun résultat trouvé</p>
                            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg border transition-colors" style={{ color: '#1D9E75', borderColor: '#1D9E75', backgroundColor: '#f0fdf9' }}>
                                <Plus size={12} /> Ajouter «&nbsp;{searchQuery}&nbsp;»
                            </button>
                        </div>
                    ) : (
                        searchResults.map(drug => (
                            <DrugCard
                                key={drug.id}
                                drug={drug}
                                query={searchQuery}
                                onDelete={handleDelete}
                                isCustom={customIds.has(drug.id)}
                            />
                        ))
                    )}
                </div>
            ) : view === 'home' ? (
                /* ── Home view ────────────────────────────────────────────── */
                listMode === 'class' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                        {Object.keys(CLASS_CONFIG).map(cls => (
                            <ClassCard
                                key={cls}
                                name={cls}
                                count={classCounts[cls] || 0}
                                onClick={() => openClass(cls)}
                            />
                        ))}
                    </div>
                ) : (
                    // Flat list across all classes
                    <div className="space-y-2">
                        {Object.keys(CLASS_CONFIG).map(cls => {
                            const cDrugs = drugs.filter(d => d.therapeutic_class === cls);
                            if (!cDrugs.length) return null;
                            const cfg = CLASS_CONFIG[cls];
                            return (
                                <div key={cls} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <div className={`flex items-center justify-between px-4 py-2.5 ${cfg.bg} border-b ${cfg.border}`}>
                                        <span className={`text-xs font-black uppercase tracking-wide ${cfg.color}`}>{cls}</span>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cDrugs.length}</span>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {cDrugs.map(drug => (
                                            <DrugCard key={drug.id} drug={drug} query="" onDelete={handleDelete} isCustom={customIds.has(drug.id)} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            ) : (
                /* ── Class view ───────────────────────────────────────────── */
                <div className="space-y-3">
                    {/* Class header */}
                    {classCfg && (
                        <div className={`${classCfg.bg} border ${classCfg.border} rounded-xl px-4 py-3 flex items-center gap-3`}>
                            <div className={`w-9 h-9 rounded-lg bg-white border ${classCfg.border} flex items-center justify-center ${classCfg.color}`}>
                                {CLASS_ICONS[selectedClass]}
                            </div>
                            <div>
                                <h2 className={`text-sm font-black uppercase tracking-tight ${classCfg.color}`}>{selectedClass}</h2>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{classDrugs.length} médicament{classDrugs.length > 1 ? 's' : ''} dans cette classe</p>
                            </div>
                        </div>
                    )}

                    {classDrugs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                                <Pill size={24} className="text-slate-300" />
                            </div>
                            <p className="text-sm font-bold text-slate-400">Aucun médicament dans cette classe</p>
                            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg border transition-colors" style={{ color: '#1D9E75', borderColor: '#1D9E75', backgroundColor: '#f0fdf9' }}>
                                <Plus size={12} /> Ajouter le premier
                            </button>
                        </div>
                    ) : (
                        classDrugs.map(drug => (
                            <DrugCard
                                key={drug.id}
                                drug={drug}
                                query=""
                                onDelete={handleDelete}
                                isCustom={customIds.has(drug.id)}
                            />
                        ))
                    )}
                </div>
            )}

            {/* ── Add Modal ─────────────────────────────────────────────────── */}
            {showAdd && (
                <AddDrugModal
                    onSave={handleAdd}
                    onClose={() => setShowAdd(false)}
                    defaultClass={view === 'class' ? selectedClass : ''}
                />
            )}
        </div>
    );
};

export default PharmaceuticalDirectory;
