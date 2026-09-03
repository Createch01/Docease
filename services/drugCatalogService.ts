import { Medicine, MedicinePresentation } from '../types';
import { loadOverrides, getLetterOverridesSync } from './medicamentAdminService';

export interface Medicament {
    id: string;
    brand_name: string;
    generic_name: string;
    composition?: string[];
    strength: string | null;
    form: string;
    route?: string;
    atc_code?: string;
    therapeutic_group?: string;
    drug_class?: string;
    mechanism?: string;
    half_life?: string;
    indications?: string[];
    contraindications?: string[];
    interactions?: Array<{ drug: string; severity: string; effect: string } | string>;
    pregnancy?: { category?: string; warning?: string; breastfeeding?: string };
    children?: { allowed?: boolean; min_age?: number; warning?: string; dose_rule?: string };
    renal_adjustment?: { required?: boolean; rule?: string };
    dosage?: { adult?: string; children?: string };
    adverse_effects?: string[];
    smart_flags?: string[];
    market_data?: Array<{
        packaging?: string | null;
        price_ppv_dhs?: number | null;
        price_ph_dhs?: number | null;
        laboratory?: string | null;
        status?: string;
        source_url?: string;
    }>;
    tableau_maroc?: string;
    nature?: string;
    nature_produit?: string;
    clinical_flags?: string[];
    drugbank_id?: string;
    drug_interactions?: Array<{
        interacting_drugs?: string[];
        interacting_classes?: string[];
        severity?: string;
        effect?: string;
        recommendation?: string;
    }>;
    notice_url?: string | null;
    data_sources?: Record<string, string | null | undefined>;
    audit_notes?: string[];
    verification_corrections?: string[];
    verified_medicament_ma?: boolean;
    last_updated?: string;
    needs_manual_review?: boolean;
    manual_review_note?: string;
}

// ─── Schema normalization ──────────────────────────────────────────────────
//
// Source files (public/medicaments/medicament_<L>_final.json) are NOT uniform
// (verified by scripting every file, not assumed). Three shapes exist:
//   - A: brand doc with `variants[]` (per-presentation strength/form/packaging)
//        + shared clinical fields at top level.
//   - B..Z (mostly): flat, one record per presentation, top-level
//        strength/form/market_data[].
//   - R: `presentations[]` (strength/packaging/price only) *and* a redundant
//        top-level `market_data[]` that also carries laboratory/status — we
//        treat market_data[] as authoritative since it's richer.
// pregnancy/children/renal_adjustment additionally use different key names
// for the same concept across files (warning vs notes, dose_rule vs
// dose_adjustment, allowed vs safe) — normalized below, never defaulted.

function normalizePregnancy(p: any): Medicament['pregnancy'] | undefined {
    if (!p) return undefined;
    return {
        category: p.category,
        warning: p.warning ?? p.notes,
        breastfeeding: p.breastfeeding,
    };
}

function normalizeChildren(c: any): Medicament['children'] | undefined {
    if (!c) return undefined;
    return {
        allowed: c.allowed ?? c.safe,
        min_age: c.min_age,
        warning: c.warning ?? c.notes,
        dose_rule: c.dose_rule ?? c.dose_adjustment,
    };
}

function normalizeRenal(r: any): Medicament['renal_adjustment'] | undefined {
    if (!r) return undefined;
    return {
        required: r.required,
        rule: r.rule ?? r.notes,
    };
}

/** Fields shared by a brand/molecule, independent of presentation — copied as-is onto every expanded row. */
function sharedClinicalFields(m: any) {
    return {
        atc_code: m.atc_code,
        therapeutic_group: m.therapeutic_group,
        drug_class: m.drug_class,
        mechanism: m.mechanism,
        half_life: m.half_life,
        indications: m.indications,
        contraindications: m.contraindications,
        interactions: m.interactions,
        pregnancy: normalizePregnancy(m.pregnancy),
        children: normalizeChildren(m.children),
        renal_adjustment: normalizeRenal(m.renal_adjustment),
        dosage: m.dosage,
        adverse_effects: m.adverse_effects ?? m.side_effects,
        smart_flags: m.smart_flags,
        tableau_maroc: m.tableau_maroc,
        nature: m.nature,
        nature_produit: m.nature_produit,
        clinical_flags: m.clinical_flags,
        drugbank_id: m.drugbank_id,
        drug_interactions: m.drug_interactions,
        needs_manual_review: m.needs_manual_review,
        manual_review_note: m.manual_review_note,
        composition: Array.isArray(m.composition)
            ? m.composition.map((c: any) => (typeof c === 'string' ? c : c.name)).filter(Boolean)
            : m.composition,
    };
}

/** A (variants[]): one Medicament per variant, inheriting the brand's shared clinical fields. */
function expandVariantsDoc(doc: any): Medicament[] {
    const clinical = sharedClinicalFields(doc);
    return doc.variants.map((v: any) => {
        let market_data = v.market_data;
        if (!market_data && (v.packaging !== undefined || v.price_ppv_dhs !== undefined || v.laboratory !== undefined || v.status !== undefined)) {
            market_data = [{
                packaging: v.packaging ?? null,
                price_ppv_dhs: v.price_ppv_dhs ?? null,
                price_ph_dhs: v.price_ph_dhs ?? null,
                laboratory: v.laboratory ?? null,
                status: v.status ?? 'Inconnu',
                source_url: v.source_url,
            }];
        }
        return {
            ...clinical,
            id: v.id || doc.record_id,
            brand_name: doc.brand_name,
            generic_name: doc.generic_name,
            strength: v.strength ?? null,
            form: v.form,
            route: v.route,
            market_data: market_data ?? [],
            notice_url: v.notice_url,
            last_updated: v.last_updated,
            verified_medicament_ma: v.verified_medicament_ma,
        } as Medicament;
    });
}

/**
 * R (and any future file with the same shape): `presentations[]` alongside a
 * redundant top-level `market_data[]`. market_data[] is authoritative (it
 * carries laboratory/status; presentations[] doesn't). Each market_data row
 * becomes one presentation. We do NOT attempt to split a combined packaging
 * string like "20 MG — Boîte de 7" into strength — if a clean split isn't
 * possible we leave strength null rather than guess.
 */
function expandPresentationsDoc(doc: any): Medicament[] {
    const clinical = sharedClinicalFields(doc);
    const rows: any[] = Array.isArray(doc.market_data) && doc.market_data.length > 0
        ? doc.market_data
        : (doc.presentations ?? []);

    return rows.map((row: any, i: number) => {
        let strength: string | null = null;
        let packaging: string | null = row.packaging ?? null;
        const m = typeof row.packaging === 'string' ? row.packaging.match(/^(.+?)\s*—\s*(.+)$/) : null;
        if (m) {
            strength = m[1].trim();
            packaging = m[2].trim();
        }

        return {
            ...clinical,
            id: `${doc.id || doc.record_id}_${i}`,
            brand_name: doc.brand_name,
            generic_name: doc.generic_name,
            strength,
            form: doc.form,
            route: doc.route,
            market_data: [{
                packaging,
                price_ppv_dhs: row.price_ppv_dhs ?? row.price ?? null,
                price_ph_dhs: row.price_ph_dhs ?? null,
                laboratory: row.laboratory ?? doc.laboratory ?? null,
                status: row.status ?? 'Inconnu',
                source_url: row.url ?? row.source_url,
            }],
        } as Medicament;
    });
}

/** Flat B..Z: already one record per presentation — pass through, normalizing the drifting sub-shapes. */
function normalizeFlatDoc(item: any): Medicament {
    // A small minority of flat records (31 across A/B/D, confirmed by scripting every file) carry
    // packaging/price/laboratory/status as singular top-level fields instead of a market_data[] array
    // (the shape every other flat record uses). Without this, groupByBrandName's `d.market_data ?? []`
    // sees nothing and the presentation renders as "Inconnu" even though the pricing/lab data exists —
    // synthesize the one-row array the same way expandVariantsDoc/expandPresentationsDoc already do.
    let market_data = item.market_data;
    if (!Array.isArray(market_data) || market_data.length === 0) {
        if (item.packaging !== undefined || item.price_ppv_dhs !== undefined || item.price_ph_dhs !== undefined || item.laboratory !== undefined || item.status !== undefined) {
            market_data = [{
                packaging: item.packaging ?? null,
                price_ppv_dhs: item.price_ppv_dhs ?? null,
                price_ph_dhs: item.price_ph_dhs ?? null,
                laboratory: item.laboratory ?? null,
                status: item.status ?? 'Inconnu',
                source_url: item.source_url,
            }];
        }
    }
    return {
        ...item,
        market_data,
        composition: Array.isArray(item.composition)
            ? item.composition.map((c: any) => (typeof c === 'string' ? c : c.name)).filter(Boolean)
            : item.composition,
        pregnancy: normalizePregnancy(item.pregnancy),
        children: normalizeChildren(item.children),
        renal_adjustment: normalizeRenal(item.renal_adjustment),
        adverse_effects: item.adverse_effects ?? item.side_effects,
        id: item.id || item.record_id,
    } as Medicament;
}

function normalizeItem(item: any): Medicament[] {
    if (!item) return [];
    if (Array.isArray(item.variants)) return expandVariantsDoc(item);
    if (Array.isArray(item.presentations)) return expandPresentationsDoc(item);
    return [normalizeFlatDoc(item)];
}

function normalizeLetterData(data: unknown): Medicament[] {
    if (!Array.isArray(data)) return [];
    return data.flatMap(normalizeItem);
}

// In-memory cache: letter → loaded drugs
const cache = new Map<string, Medicament[]>();
// Dedup in-flight fetches
const inflight = new Map<string, Promise<Medicament[]>>();

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Merges the manual-edit overlay (services/medicamentAdminService.ts) on top
 * of the base catalog for one letter: an override entry with a matching `id`
 * replaces the base record wholesale (an edit always produces a complete
 * record); an override with no matching base id is a brand-new medicament
 * and is appended. The generated medicament_<L>_final.json file itself is
 * never modified.
 */
function applyOverrides(letter: string, base: Medicament[]): Medicament[] {
    const overrides = getLetterOverridesSync(letter);
    const overrideIds = Object.keys(overrides);
    if (overrideIds.length === 0) return base;

    const overrideIdSet = new Set(overrideIds);
    const merged = base.map(m => (overrideIdSet.has(m.id) ? overrides[m.id] : m));

    const baseIdSet = new Set(base.map(m => m.id));
    const newRecords = overrideIds
        .filter(id => !baseIdSet.has(id))
        .map(id => overrides[id]);

    return [...merged, ...newRecords];
}

/**
 * Lazy-load drugs for a given letter.
 * Returns cached data immediately on subsequent calls.
 */
export async function loadLetter(letter: string): Promise<Medicament[]> {
    const L = letter.toUpperCase();
    if (cache.has(L)) return cache.get(L)!;
    if (inflight.has(L)) return inflight.get(L)!;

    const promise = Promise.all([
        fetch(`/medicaments/medicament_${L}_final.json`)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status} for letter ${L}`);
                return r.json();
            })
            .catch(err => {
                console.warn(`[drugCatalog] Could not load letter ${L}:`, err);
                return [] as unknown;
            }),
        loadOverrides(),
    ])
        .then(([data]) => {
            const merged = applyOverrides(L, normalizeLetterData(data));
            cache.set(L, merged);
            inflight.delete(L);
            return merged;
        });

    inflight.set(L, promise);
    return promise;
}

/**
 * Drops the cached data for a letter so the next loadLetter() call re-reads
 * the base file and re-merges the overlay — call after saving an edit so the
 * UI reflects it without an app restart.
 */
export function invalidateLetter(letter: string): void {
    cache.delete(letter.toUpperCase());
    inflight.delete(letter.toUpperCase());
}

/** Returns cached drugs for a letter synchronously, or null if not yet loaded. */
export function getCached(letter: string): Medicament[] | null {
    return cache.get(letter.toUpperCase()) ?? null;
}

/** True if the letter file has already been fetched. */
export function isLoaded(letter: string): boolean {
    return cache.has(letter.toUpperCase());
}

/**
 * Search across ALL already-loaded letters.
 * Returns up to `limit` matches sorted by relevance (starts-with > includes).
 */
export function searchLoaded(query: string, limit = 40): Medicament[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const exact: Medicament[] = [];
    const partial: Medicament[] = [];

    for (const drugs of cache.values()) {
        for (const d of drugs) {
            const bn = d.brand_name.toLowerCase();
            const gn = d.generic_name.toLowerCase();
            if (bn.startsWith(q) || gn.startsWith(q)) {
                exact.push(d);
            } else if (bn.includes(q) || gn.includes(q)) {
                partial.push(d);
            }
            if (exact.length + partial.length >= limit * 3) break;
        }
    }

    return [...exact, ...partial].slice(0, limit);
}

export function getSuggestions(query: string): Medicament[] {
    return searchLoaded(query, 6);
}

/**
 * Returns all currently loaded medicaments from the cache.
 */
export function getAllLoadedMedicines(): Medicament[] {
    const all: Medicament[] = [];
    for (const drugs of cache.values()) {
        all.push(...drugs);
    }
    return all;
}

/**
 * Async search that auto-loads the inferred letter first, then searches across all loaded data.
 * This provides a "global" feel without loading the entire database upfront.
 */
export async function searchDrugsGlobal(query: string, limit = 40): Promise<Medicament[]> {
    if (!query.trim()) return [];

    const inferred = inferLetter(query);
    if (inferred && !isLoaded(inferred)) {
        await loadLetter(inferred);
    }

    return searchLoaded(query, limit);
}

/**
 * Given a search query, returns which letter file to auto-load.
 * E.g. "amox" → "A", "Doliprane" → "D"
 */
export function inferLetter(query: string): string | null {
    const first = query.trim()[0]?.toUpperCase();
    return first && /[A-Z]/.test(first) ? first : null;
}

/**
 * Groups catalog rows that represent the SAME médicament (brand + DCI + dosage + forme)
 * but different présentations/conditionnements (e.g. "Boîte de 8" vs "Boîte de 20") into
 * a single Medicine with a `presentations[]` list, so the search UI shows one entry per
 * médicament instead of one per packaging — per the spec: never mix médicament and
 * présentation commerciale in the same list row.
 */
export function groupMedicamentsForSelection(meds: Medicament[]): Medicine[] {
    const groups = new Map<string, { rep: Medicament; presentations: MedicinePresentation[]; seenPackaging: Set<string> }>();

    for (const m of meds) {
        const key = [m.brand_name, m.generic_name, m.strength ?? '', m.form ?? ''].join('|').toLowerCase();
        let group = groups.get(key);
        if (!group) {
            group = { rep: m, presentations: [], seenPackaging: new Set() };
            groups.set(key, group);
        }
        for (const md of m.market_data ?? []) {
            const packagingKey = (md.packaging ?? '').toLowerCase();
            const dedupeKey = `${packagingKey}|${(md.laboratory ?? '').toLowerCase()}`;
            if (group.seenPackaging.has(dedupeKey)) continue;
            group.seenPackaging.add(dedupeKey);
            group.presentations.push({
                id: `${m.id}_${group.presentations.length}`,
                packaging: md.packaging,
                laboratory: md.laboratory,
                route: m.route,
                pricePpvDhs: md.price_ppv_dhs,
            });
        }
    }

    return Array.from(groups.values()).map(({ rep, presentations }) => {
        const medicine = mapMedicamentToMedicine(rep);
        medicine.presentations = presentations;
        // Default packaging = the representative row's own présentation when only one exists.
        if (presentations.length === 1) medicine.packaging = presentations[0].packaging ?? undefined;
        return medicine;
    });
}

/**
 * Maps a Medicament object into a generic Medicine object compatible with components.
 */
export function mapMedicamentToMedicine(m: Medicament): Medicine {
    return {
        id: m.id || Math.random().toString(),
        name: m.brand_name,
        active_ingredient: m.generic_name,
        category: m.therapeutic_group || m.drug_class || 'Autre',
        form: m.form,
        strength: m.strength || undefined,
        route: m.route,
        packaging: m.market_data?.[0]?.packaging ?? undefined,
        defaultDosage: m.dosage?.adult || '',
        defaultTiming: 'Indifférent',
        isAdultOnly: m.smart_flags?.includes('ADULTE_SEULEMENT') || false,
        isPregnantForbidden: m.smart_flags?.includes('GROSSESSE_CONTRE_INDIQUE') || m.smart_flags?.includes('GROSSESSE_INTERDIT') || false,
        isBreastfeedingForbidden: m.pregnancy?.breastfeeding?.toLowerCase().includes('contre-indiqué') || false,
        isHeartForbidden: m.smart_flags?.includes('CARDIAQUE_PRUDENCE') || false,
        isKidneyForbidden: m.smart_flags?.includes('RENAL_INTERDIT') || m.smart_flags?.includes('RENAL_PRUDENCE') || false,
        isLiverForbidden: m.smart_flags?.includes('HEPATIQUE_PRUDENCE') || false,
        interactionGroup: m.generic_name || undefined,
        atcCode: m.atc_code,
        nature: m.nature,
        clinicalFlags: m.clinical_flags,
        contraindicationNotes: m.contraindications,
        isHospitalOnly: m.smart_flags?.some(f => ['RESERVE_HOPITAL', 'USAGE_HOSPITALIER', 'USAGE_HOSPITALIER_UNIQUEMENT'].includes(f)) || false,
        pediatricDoseRule: m.children?.dose_rule,
    };
}
