import allergiesData from '../constants/referentials/allergies.json';
import pathologiesData from '../constants/referentials/pathologies.json';
import type { ContextEntry, RenalStage } from '../types';

// ─── Référentiels locaux (allergies / pathologies) ───────────────────────────
// JSON versionnés, hors ligne, sans IA. Ce module ne contient que la lecture, la
// recherche et la migration ; la vérification médicamenteuse est dans contextSafety.ts.

export type SafetySeverity = 'CRITIQUE' | 'ATTENTION';
export type ProfileKey = 'isCardiac' | 'isRenalImpaired' | 'isHepaticImpaired' | 'isDiabetic';

export interface CrossReactivity {
    label: string;
    ref?: string;
    atc?: string[];
    dci?: string[];
    note?: string;
}

export interface AllergyRef {
    id: string;
    label: string;
    /** Libellé court pour les pastilles du panneau de suggestions. */
    short?: string;
    kind: 'drug' | 'non_drug';
    synonyms: string[];
    match: { atc: string[]; dci: string[]; brands: string[]; text: string[] };
    crossReactivity?: CrossReactivity[];
}

export interface PathologyRef {
    id: string;
    code: string;
    label: string;
    short?: string;
    category: string;
    synonyms: string[];
    specialtyRank?: Record<string, number>;
    rules: { profile: ProfileKey[]; flags: Array<{ flag: string; severity: SafetySeverity }> };
}

export const ALLERGY_REFS: AllergyRef[] = (allergiesData as { items: AllergyRef[] }).items;
export const PATHOLOGY_REFS: PathologyRef[] = (pathologiesData as { items: PathologyRef[] }).items;
export const REFERENTIALS_VERSION = {
    allergies: (allergiesData as { version: string }).version,
    pathologies: (pathologiesData as { version: string }).version,
};

export type ContextKind = 'allergy' | 'pathology';

export const allergyById = (id?: string): AllergyRef | undefined =>
    id ? ALLERGY_REFS.find(a => a.id === id) : undefined;
export const pathologyById = (id?: string): PathologyRef | undefined =>
    id ? PATHOLOGY_REFS.find(p => p.id === id) : undefined;

// ─── Normalisation ───────────────────────────────────────────────────────────

const COMBINING_MARKS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

/** Minuscules, sans accents, œ/æ développés, espaces réduits. */
export function normalizeText(s: string): string {
    return (s || '')
        .replace(/œ/gi, 'oe')
        .replace(/æ/gi, 'ae')
        .normalize('NFD')
        .replace(COMBINING_MARKS_RE, '')
        .toLowerCase()
        .replace(/[^a-z0-9+/. -]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface SuggestItem {
    id: string;
    label: string;
    short?: string;
    code?: string;
    terms: string[];            // libellé + synonymes + code, déjà normalisés
    category?: string;
    specialtyRank?: Record<string, number>;
}

export const MIN_QUERY_LENGTH = 2;

export function toSuggestItems(kind: ContextKind): SuggestItem[] {
    if (kind === 'allergy') {
        return ALLERGY_REFS.map(a => ({
            id: a.id, label: a.label, short: a.short, category: a.kind,
            terms: [a.label, ...a.synonyms].map(normalizeText),
        }));
    }
    return PATHOLOGY_REFS.map(p => ({
        id: p.id, label: p.label, short: p.short, code: p.code, category: p.category, specialtyRank: p.specialtyRank,
        terms: [p.label, ...p.synonyms, p.code].map(normalizeText),
    }));
}

/** Un terme correspond si la requête est un début du terme, un début de l'un de ses mots, ou (≥ 3 car.) y est contenue. */
function termMatches(term: string, q: string): boolean {
    if (term.startsWith(q)) return true;
    if (term.split(' ').some(w => w.startsWith(q))) return true;
    return q.length >= 3 && term.includes(q);
}

export function itemMatches(item: SuggestItem, query: string): boolean {
    const q = normalizeText(query);
    if (q.length < MIN_QUERY_LENGTH) return false;
    return item.terms.some(t => termMatches(t, q));
}

export type UsageCounts = Record<string, number>;

/**
 * Suggestions pour une requête : ordre = les plus utilisés par le médecin, puis spécialité
 * (rang le plus bas d'abord), puis alphabétique. Les entrées déjà choisies sont exclues.
 */
export function searchSuggestions(
    items: SuggestItem[],
    query: string,
    opts: { usage?: UsageCounts; specialty?: string; exclude?: string[]; limit?: number } = {},
): SuggestItem[] {
    const { usage = {}, specialty, exclude = [], limit = 8 } = opts;
    const excluded = new Set(exclude);
    return items
        .filter(i => !excluded.has(i.id) && itemMatches(i, query))
        .sort((a, b) => {
            const ua = usage[a.id] || 0, ub = usage[b.id] || 0;
            if (ua !== ub) return ub - ua;
            const ra = specialty ? a.specialtyRank?.[specialty] ?? 99 : 99;
            const rb = specialty ? b.specialtyRank?.[specialty] ?? 99 : 99;
            if (ra !== rb) return ra - rb;
            return a.label.localeCompare(b.label, 'fr');
        })
        .slice(0, limit);
}

// ─── Suggestions au clic (sans saisie) ───────────────────────────────────────

const ALLERGY_FREQUENT: string[] = (allergiesData as { frequent?: string[] }).frequent ?? [];
const PATHOLOGY_FREQUENT: Record<string, string[]> = (pathologiesData as { frequent?: Record<string, string[]> }).frequent ?? {};

export const CATEGORY_LABELS: Record<string, string> = {
    drug: 'Médicamenteuses', non_drug: 'Non médicamenteuses',
    cardio: 'Cardio', renal: 'Rénal', hepatique: 'Hépatique', endocrino: 'Endocrino', respiratoire: 'Respiratoire',
    digestif: 'Digestif', neuro: 'Neuro / psy', hematologie: 'Hématologie', ophtalmo: 'Ophtalmo', addictologie: 'Addictologie',
};
const CATEGORY_ORDER: Record<ContextKind, string[]> = {
    allergy: ['drug', 'non_drug'],
    pathology: ['cardio', 'endocrino', 'renal', 'hepatique', 'respiratoire', 'digestif', 'neuro', 'hematologie', 'ophtalmo', 'addictologie'],
};

/** Identifiants proposés d'emblée : les plus fréquents (selon la spécialité pour les pathologies). */
export function frequentIds(kind: ContextKind, specialty?: string): string[] {
    if (kind === 'allergy') return ALLERGY_FREQUENT;
    return (specialty && PATHOLOGY_FREQUENT[specialty]) || PATHOLOGY_FREQUENT.default || [];
}

const byUsageThenLabel = (usage: UsageCounts) => (a: SuggestItem, b: SuggestItem) =>
    (usage[b.id] || 0) - (usage[a.id] || 0) || a.label.localeCompare(b.label, 'fr');

/**
 * 8 à 10 éléments cliquables sans taper : ceux que ce médecin utilise le plus, complétés par la liste
 * des plus fréquents (ordre de la liste). Les éléments déjà choisis restent affichés (cochés).
 */
export function suggestedItems(items: SuggestItem[], kind: ContextKind, usage: UsageCounts = {}, specialty?: string, limit = 10): SuggestItem[] {
    const freq = frequentIds(kind, specialty);
    const byId = new Map(items.map(i => [i.id, i]));
    const used = items.filter(i => (usage[i.id] || 0) > 0).sort(byUsageThenLabel(usage));
    const out: SuggestItem[] = [];
    for (const i of [...used, ...freq.map(id => byId.get(id)).filter((i): i is SuggestItem => !!i)]) {
        if (!out.includes(i)) out.push(i);
        if (out.length >= limit) break;
    }
    return out;
}

export interface ItemGroup { key: string; label: string; items: SuggestItem[] }

/** « Voir tout » : tous les éléments groupés par catégorie, les plus utilisés d'abord dans chaque groupe. */
export function groupItems(items: SuggestItem[], kind: ContextKind, usage: UsageCounts = {}): ItemGroup[] {
    const order = CATEGORY_ORDER[kind];
    const groups = new Map<string, SuggestItem[]>();
    for (const i of items) {
        const key = i.category && order.includes(i.category) ? i.category : 'autre';
        groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    return [...order, 'autre']
        .filter(k => groups.has(k))
        .map(k => ({ key: k, label: CATEGORY_LABELS[k] ?? 'Autres', items: groups.get(k)!.sort(byUsageThenLabel(usage)) }));
}

// ─── Compteurs d'usage (localStorage — aucune donnée patient) ────────────────

const USAGE_KEY = 'docease_context_usage_v1';
type UsageStore = Record<ContextKind, UsageCounts>;

export function loadUsage(kind: ContextKind): UsageCounts {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        return (raw ? (JSON.parse(raw) as UsageStore)[kind] : undefined) || {};
    } catch {
        return {};
    }
}

/** N'enregistre que l'identifiant du référentiel (jamais de texte libre ni d'identité). */
export function recordUsage(kind: ContextKind, refId: string): void {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        const store: UsageStore = raw ? JSON.parse(raw) : { allergy: {}, pathology: {} };
        store[kind] = store[kind] || {};
        store[kind][refId] = (store[kind][refId] || 0) + 1;
        localStorage.setItem(USAGE_KEY, JSON.stringify(store));
    } catch { /* stockage indisponible : l'ordre retombe sur spécialité/alphabétique */ }
}

/** Spécialité du médecin déduite de la fiche cabinet (texte libre) ; sert uniquement à ordonner les suggestions. */
export function specialtyKey(specialtyText?: string): string | undefined {
    return /cardio/.test(normalizeText(specialtyText || '')) ? 'cardiologie' : undefined;
}

// ─── Entrées & migration ─────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0];

export function makeEntry(kind: ContextKind, ref: { id: string; label: string }, extra: Partial<ContextEntry> = {}): ContextEntry {
    return { ref: ref.id, label: ref.label, coded: true, addedAt: today(), ...(kind === 'allergy' ? { reaction: extra.reaction } : {}), ...extra };
}

export function makeFreeTextEntry(label: string, extra: Partial<ContextEntry> = {}): ContextEntry {
    return { label: label.trim(), coded: false, addedAt: today(), ...extra };
}

/** Correspondance exacte (libellé, synonyme ou code, insensible aux accents/casse) ; sinon undefined. */
export function findExactRef(kind: ContextKind, text: string): { id: string; label: string } | undefined {
    const q = normalizeText(text);
    if (!q) return undefined;
    const items = kind === 'allergy' ? ALLERGY_REFS : PATHOLOGY_REFS;
    for (const it of items) {
        const terms = [it.label, ...it.synonyms, ...(kind === 'pathology' ? [(it as PathologyRef).code] : [])];
        if (terms.some(t => normalizeText(t) === q)) return { id: it.id, label: it.label };
    }
    return undefined;
}

const SPLIT_RE = /[,;\n]+/;

/**
 * Convertit l'ancien contexte (tags + texte libre) en entrées. Non destructif : ne modifie
 * pas les champs d'origine. Codé si correspondance exacte, sinon « non codé » ; le texte
 * d'origine est conservé dans `note` quand il diffère du libellé du référentiel.
 */
export function migrateLegacyContext(kind: ContextKind, sources: string | Array<string | string[] | undefined>, addedAt = today()): ContextEntry[] {
    const texts: string[] = [];
    for (const s of Array.isArray(sources) ? sources : [sources]) {
        if (!s) continue;
        (Array.isArray(s) ? s : s.split(SPLIT_RE)).forEach(t => {
            const v = t.trim();
            if (v) texts.push(v);
        });
    }
    const out: ContextEntry[] = [];
    const seen = new Set<string>();
    for (const t of texts) {
        const ref = findExactRef(kind, t);
        const key = ref ? ref.id : `txt:${normalizeText(t)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(ref
            ? { ref: ref.id, label: ref.label, coded: true, addedAt, ...(normalizeText(t) !== normalizeText(ref.label) ? { note: t } : {}) }
            : { label: t, coded: false, addedAt });
    }
    return out;
}

// ─── Dérivation des indicateurs de profil ────────────────────────────────────

export interface DerivedFlags {
    isHeartPatient: boolean;
    isKidneyPatient: boolean;
    isLiverPatient: boolean;
    isDiabetic: boolean;
}

/** Indicateurs de profil déduits des pathologies codées. DFG ≥ 60 seul n'active pas l'indicateur rénal. */
export function deriveProfileFlags(pathologies: ContextEntry[] | undefined, renalStage?: RenalStage): DerivedFlags {
    const keys = new Set<ProfileKey>();
    for (const e of pathologies || []) {
        const ref = e.coded ? pathologyById(e.ref) : undefined;
        ref?.rules.profile.forEach(k => keys.add(k));
    }
    return {
        isHeartPatient: keys.has('isCardiac'),
        isKidneyPatient: keys.has('isRenalImpaired') && renalStage !== 'ge60',
        isLiverPatient: keys.has('isHepaticImpaired'),
        isDiabetic: keys.has('isDiabetic'),
    };
}
