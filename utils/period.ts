/**
 * Période de la Comptabilité : calcul PUR des bornes `from` / `to` (AAAA-MM-JJ, jours LOCAUX).
 * Aucun montant ici : les bornes sont transmises à accounting_summary / journal / dépenses (Rust).
 * Semaine = lundi → dimanche (ISO 8601).
 */
import { localDateStr } from './localDate';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface Period {
    kind: PeriodKind;
    /** AAAA-MM-JJ */
    from: string;
    /** AAAA-MM-JJ, inclus */
    to: string;
}

export const MAX_CUSTOM_DAYS = 366;

export const KIND_LABEL: Record<PeriodKind, string> = { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année', custom: 'Personnalisée' };
export const KINDS: PeriodKind[] = ['day', 'week', 'month', 'year', 'custom'];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-JJ → minuit LOCAL ; null si la date n'existe pas (2026-02-31). */
export const parseDay = (s: string): Date | null => {
    if (!DAY_RE.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return localDateStr(dt) === s ? dt : null;
};

const must = (s: string): Date => {
    const d = parseDay(s);
    if (!d) throw new Error(`Date invalide : ${s}`);
    return d;
};

export const addDays = (s: string, n: number): string => {
    const d = must(s);
    d.setDate(d.getDate() + n);
    return localDateStr(d);
};

/** Nombre de jours, bornes comprises. */
export const daysInclusive = (from: string, to: string): number => {
    const a = must(from), b = must(to);
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000) + 1;
};

/** Lundi de la semaine de `s`. */
export const mondayOf = (s: string): string => {
    const d = must(s);
    return addDays(s, -((d.getDay() + 6) % 7));
};

const firstOfMonth = (s: string): string => `${s.slice(0, 7)}-01`;
const lastOfMonth = (s: string): string => {
    const d = must(firstOfMonth(s));
    return localDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const addMonths = (s: string, n: number): string => {
    const d = must(firstOfMonth(s));
    return localDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
};

/** Période de type `kind` qui contient `anchor`. Personnalisée : utiliser `custom`. */
export const periodAround = (kind: Exclude<PeriodKind, 'custom'>, anchor: string): Period => {
    switch (kind) {
        case 'day': return { kind, from: anchor, to: anchor };
        case 'week': { const from = mondayOf(anchor); return { kind, from, to: addDays(from, 6) }; }
        case 'month': return { kind, from: firstOfMonth(anchor), to: lastOfMonth(anchor) };
        default: return { kind, from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
    }
};

/** Contrôle d'une période personnalisée ; message en français ou null. */
export const validateCustom = (from: string, to: string): string | null => {
    if (!parseDay(from) || !parseDay(to)) return 'Choisissez deux dates valides.';
    if (to < from) return 'La date de fin doit être postérieure ou égale à la date de début.';
    if (daysInclusive(from, to) > MAX_CUSTOM_DAYS) return `La période ne peut pas dépasser ${MAX_CUSTOM_DAYS} jours.`;
    return null;
};

export const customPeriod = (from: string, to: string): Period => {
    const err = validateCustom(from, to);
    if (err) throw new Error(err);
    return { kind: 'custom', from, to };
};

/** Période précédente (-1) ou suivante (+1), de même type. Personnalisée : décalage de sa propre longueur. */
export const shiftPeriod = (p: Period, dir: -1 | 1): Period => {
    switch (p.kind) {
        case 'day': return periodAround('day', addDays(p.from, dir));
        case 'week': return periodAround('week', addDays(p.from, 7 * dir));
        case 'month': return periodAround('month', addMonths(p.from, dir));
        case 'year': return periodAround('year', `${Number(p.from.slice(0, 4)) + dir}-01-01`);
        default: {
            const n = daysInclusive(p.from, p.to);
            return { kind: 'custom', from: addDays(p.from, n * dir), to: addDays(p.to, n * dir) };
        }
    }
};

/** Période entièrement dans le futur. */
export const isFuture = (p: Period, today: string): boolean => p.from > today;

/** « › » : désactivé si la période suivante est entièrement dans le futur. */
export const canGoNext = (p: Period, today: string): boolean => !isFuture(shiftPeriod(p, 1), today);

export const containsDay = (p: Period, day: string): boolean => p.from <= day && day <= p.to;

/** Période « d'aujourd'hui » du même type (personnalisée : la même longueur, se terminant aujourd'hui). */
export const periodToday = (kind: PeriodKind, today: string, like?: Period): Period => {
    if (kind === 'custom') {
        const n = like ? Math.min(daysInclusive(like.from, like.to), MAX_CUSTOM_DAYS) : 30;
        return { kind, from: addDays(today, -(n - 1)), to: today };
    }
    return periodAround(kind, today);
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fr = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', o);
const ddmmyyyy = (s: string) => s.split('-').reverse().join('/');

export const periodLabel = (p: Period): string => {
    const a = must(p.from), b = must(p.to);
    switch (p.kind) {
        case 'day': return cap(fr(a, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
        case 'week': {
            if (a.getFullYear() !== b.getFullYear()) return `Semaine du ${fr(a, { day: 'numeric', month: 'long', year: 'numeric' })} au ${fr(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
            if (a.getMonth() !== b.getMonth()) return `Semaine du ${fr(a, { day: 'numeric', month: 'long' })} au ${fr(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
            return `Semaine du ${a.getDate()} au ${fr(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
        }
        case 'month': return cap(fr(a, { month: 'long', year: 'numeric' }));
        case 'year': return `Année ${a.getFullYear()}`;
        default: return `Du ${ddmmyyyy(p.from)} au ${ddmmyyyy(p.to)}`;
    }
};

/** Mois AAAA-MM touchés par la période. */
export const monthsOf = (p: Period): string[] => {
    const out: string[] = [];
    let m = firstOfMonth(p.from);
    while (m <= p.to) { out.push(m.slice(0, 7)); m = addMonths(m, 1); }
    return out;
};

/** Période valide ? (mémoire de session lue depuis le stockage : jamais de confiance aveugle). */
export const isValidPeriod = (p: unknown): p is Period => {
    if (!p || typeof p !== 'object') return false;
    const { kind, from, to } = p as Record<string, unknown>;
    if (!KINDS.includes(kind as PeriodKind) || typeof from !== 'string' || typeof to !== 'string') return false;
    if (!parseDay(from) || !parseDay(to) || to < from) return false;
    if (kind === 'custom') return validateCustom(from, to) === null;
    const ref = periodAround(kind as Exclude<PeriodKind, 'custom'>, from);
    return ref.from === from && ref.to === to;
};

// ─── Granularité du graphique (les tranches viennent de Rust) ────────────────

export type ChartGranularity = 'day' | 'week' | 'month' | 'year';

/** Plage et tranche du graphique pour la période choisie : un peu d'historique avant la période, jamais de calcul de montant. */
export const chartRangeFor = (p: Period): { from: string; to: string; gran: ChartGranularity } => {
    switch (p.kind) {
        case 'day': return { from: addDays(p.to, -13), to: p.to, gran: 'day' };
        case 'week': return { from: addDays(p.to, -49), to: p.to, gran: 'week' };
        case 'month': return { from: addMonths(p.from, -11), to: p.to, gran: 'month' };
        case 'year': return { from: `${Number(p.from.slice(0, 4)) - 4}-01-01`, to: p.to, gran: 'year' };
        default: {
            const n = daysInclusive(p.from, p.to);
            return { from: p.from, to: p.to, gran: n <= 62 ? 'day' : n <= 200 ? 'week' : 'month' };
        }
    }
};

// ─── Mémoire de la session (pas le stockage chiffré) ─────────────────────────

const STORE_KEY = 'docease_accounting_period';
let current: Period | null = null;
const listeners = new Set<() => void>();

const readStored = (): Period | null => {
    try {
        const raw = sessionStorage.getItem(STORE_KEY);
        const p = raw ? JSON.parse(raw) : null;
        return isValidPeriod(p) ? p : null;
    } catch { return null; }
};

export const getPeriod = (today: string = localDateStr()): Period => {
    if (!current) current = readStored() ?? periodAround('day', today);
    return current;
};

export const setPeriod = (p: Period): void => {
    if (!isValidPeriod(p)) return;
    current = p;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* mémoire de session indisponible : la période reste en mémoire */ }
    listeners.forEach(l => l());
};

export const subscribePeriod = (l: () => void): (() => void) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
};

/** Test uniquement : oublie la période mémorisée. */
export const resetPeriodStore = (): void => {
    current = null;
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* sans effet */ }
};
