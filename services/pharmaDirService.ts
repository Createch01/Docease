import { loadLetter, LETTERS, type Medicament } from './drugCatalogService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketRow {
  packaging: string | null;
  price_ppv_dhs: number | null;
  laboratory: string | null;
  status: string;
}

export interface DrugVariant {
  id: string;
  form: string;
  strength: string | null;
  route?: string;
  market_data: MarketRow[];
  dosage_adult?: string;
}

/** Clinical fields that are consolidated at group level, with divergence detection. */
export type ClinicalField =
  | 'indications' | 'contraindications' | 'interactions' | 'pregnancy'
  | 'children' | 'renal_adjustment' | 'smart_flags' | 'adverse_effects'
  | 'mechanism' | 'dosage' | 'needs_manual_review';

export interface ClinicalDivergence {
  field: ClinicalField;
  /** One entry per distinct value found, with the variant ids (DrugVariant.id) that carry it. */
  values: Array<{ value: unknown; variantIds: string[] }>;
}

export interface DrugGroup {
  key: string;
  brand_name: string;
  generic_name: string;
  therapeutic_group?: string;
  drug_class?: string;
  atc_code?: string;
  variants: DrugVariant[];
  /** Total commercial presentations (sum of market_data rows across variants). */
  presentationsCount: number;

  // Consolidated clinical data — present when identical across all source
  // records in the group. Absent (undefined) when the field is divergent;
  // in that case check `divergences` and render per-presentation, never
  // pick one value arbitrarily.
  indications?: string[];
  contraindications?: string[];
  interactions?: Medicament['interactions'];
  pregnancy?: Medicament['pregnancy'];
  children?: Medicament['children'];
  renal_adjustment?: Medicament['renal_adjustment'];
  smart_flags?: string[];
  adverse_effects?: string[];
  mechanism?: string;
  dosage?: Medicament['dosage'];
  needs_manual_review?: boolean;

  /** Clinical fields that differ between presentations of this brand+generic — must be surfaced, never hidden. */
  divergences: ClinicalDivergence[];
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

const CLINICAL_FIELDS: ClinicalField[] = [
  'indications', 'contraindications', 'interactions', 'pregnancy',
  'children', 'renal_adjustment', 'smart_flags', 'adverse_effects',
  'mechanism', 'dosage', 'needs_manual_review',
];

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as object).every(x => x == null);
  return false;
}

/**
 * Consolidates one clinical field across the source records feeding a group.
 * If every non-empty value is deep-equal, returns that single value.
 * If values genuinely differ, returns undefined and records a divergence
 * entry (grouped by distinct value, attributed to the variant ids that carry it)
 * so the UI can show every value instead of silently picking one.
 */
function consolidateField(
  field: ClinicalField,
  records: Array<{ variantId: string; value: unknown }>,
): { value: unknown; divergence?: ClinicalDivergence } {
  const nonEmpty = records.filter(r => !isEmptyValue(r.value));
  if (nonEmpty.length === 0) return { value: undefined };

  const buckets = new Map<string, { value: unknown; variantIds: string[] }>();
  for (const r of nonEmpty) {
    const sig = JSON.stringify(r.value);
    if (!buckets.has(sig)) buckets.set(sig, { value: r.value, variantIds: [] });
    buckets.get(sig)!.variantIds.push(r.variantId);
  }

  if (buckets.size === 1) {
    return { value: nonEmpty[0].value };
  }

  return {
    value: undefined,
    divergence: { field, values: Array.from(buckets.values()) },
  };
}

export function groupByBrandName(drugs: Medicament[]): DrugGroup[] {
  const map = new Map<string, { group: DrugGroup; sources: Medicament[] }>();

  for (const d of drugs) {
    // Key on brand_name + generic_name, not brand_name alone: some brand
    // strings (e.g. "ADO", "AMEP") are reused across unrelated molecules,
    // and merging them would attach one drug's clinical data to another.
    const key = `${d.brand_name.trim().toUpperCase()}::${(d.generic_name || '').trim().toUpperCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        group: {
          key,
          brand_name: d.brand_name,
          generic_name: d.generic_name,
          therapeutic_group: d.therapeutic_group,
          drug_class: d.drug_class,
          atc_code: d.atc_code,
          variants: [],
          presentationsCount: 0,
          divergences: [],
        },
        sources: [],
      });
    }

    const entry = map.get(key)!;
    const { group } = entry;
    const rows: MarketRow[] = (d.market_data ?? []).map(m => ({
      packaging: m.packaging ?? null,
      price_ppv_dhs: m.price_ppv_dhs ?? null,
      laboratory: m.laboratory ?? null,
      status: m.status ?? 'Inconnu',
    }));

    group.variants.push({
      id: d.id,
      form: d.form,
      strength: d.strength,
      route: d.route,
      market_data: rows.length ? rows : [{ packaging: null, price_ppv_dhs: null, laboratory: null, status: 'Inconnu' }],
      dosage_adult: d.dosage?.adult,
    });

    group.presentationsCount += rows.length || 1;
    if (!group.therapeutic_group && d.therapeutic_group) group.therapeutic_group = d.therapeutic_group;
    if (!group.drug_class && d.drug_class) group.drug_class = d.drug_class;
    entry.sources.push(d);
  }

  for (const { group, sources } of map.values()) {
    for (const field of CLINICAL_FIELDS) {
      const records = sources.map((s, i) => ({
        variantId: group.variants[i]?.id ?? String(i),
        value: (s as any)[field],
      }));
      const { value, divergence } = consolidateField(field, records);
      if (divergence) {
        group.divergences.push(divergence);
      } else {
        (group as any)[field] = value;
      }
    }
  }

  return Array.from(map.values())
    .map(e => e.group)
    .sort((a, b) => a.brand_name.localeCompare(b.brand_name, 'fr', { sensitivity: 'base' }));
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Filter groups by brand name and/or generic name.
 * If both queries are provided, a group must match BOTH.
 * Returns at most 200 results.
 */
export function filterGroups(
  groups: DrugGroup[],
  brandQuery: string,
  genericQuery: string
): DrugGroup[] {
  const bq = brandQuery.trim().toLowerCase();
  const gq = genericQuery.trim().toLowerCase();
  if (!bq && !gq) return [];

  const out: DrugGroup[] = [];
  for (const g of groups) {
    const matchBrand = bq ? g.brand_name.toLowerCase().includes(bq) : true;
    const matchGeneric = gq ? g.generic_name.toLowerCase().includes(gq) : true;
    const passes = bq && gq ? matchBrand && matchGeneric : matchBrand || matchGeneric;
    if (passes) {
      out.push(g);
      if (out.length >= 200) break;
    }
  }
  return out;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

let cachedGroups: DrugGroup[] | null = null;

export async function loadAllDrugs(): Promise<DrugGroup[]> {
  if (cachedGroups) return cachedGroups;
  const batches = await Promise.all(LETTERS.map(l => loadLetter(l)));
  cachedGroups = groupByBrandName(batches.flat());
  return cachedGroups;
}

/** Drops the grouped cache so the next loadAllDrugs() re-reads (and re-merges the overlay via loadLetter). */
export function resetDrugGroupsCache(): void {
  cachedGroups = null;
}

/**
 * True if this group (or any presentation within it, when the flag diverges
 * across variants) is flagged as not yet manually reviewed.
 */
export function groupNeedsReview(group: DrugGroup): boolean {
  if (group.needs_manual_review === true) return true;
  return group.divergences.some(
    d => d.field === 'needs_manual_review' && d.values.some(v => v.value === true)
  );
}

// ─── Unified single-query search (with typo-tolerant fallback) ──────────────

import { fuzzyRank } from './fuzzySearch';

/**
 * Filter groups by a single query that matches brand_name OR generic_name.
 * Returns at most 200 results, preserving sort order.
 */
export function filterGroupsUnified(groups: DrugGroup[], query: string): DrugGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: DrugGroup[] = [];
  for (const g of groups) {
    if (g.brand_name.toLowerCase().includes(q) || g.generic_name.toLowerCase().includes(q)) {
      out.push(g);
      if (out.length >= 200) break;
    }
  }
  return out;
}

/**
 * Same as filterGroupsUnified, but when the exact/substring search finds
 * nothing, falls back to typo-tolerant fuzzy matching on brand_name /
 * generic_name — useful for names transcribed from a handwritten or
 * scanned prescription. Never invents a match: fuzzy results are capped by
 * an edit-distance threshold relative to the query length.
 */
export function searchWithFuzzyFallback(
  groups: DrugGroup[],
  query: string,
  limit = 8,
): { results: DrugGroup[]; isFuzzy: boolean } {
  const exact = filterGroupsUnified(groups, query);
  if (exact.length > 0) return { results: exact, isFuzzy: false };
  if (!query.trim()) return { results: [], isFuzzy: false };

  const ranked = fuzzyRank(
    query,
    groups,
    g => [g.brand_name, g.generic_name],
    limit,
  );
  return { results: ranked, isFuzzy: true };
}

// ─── Autocomplete suggestions ─────────────────────────────────────────────────

export interface AutocompleteSuggestions {
  /** Groups whose brand_name matches the query (max 4). */
  brands: DrugGroup[];
  /** Groups whose generic_name matches the query (max 4), deduped from brands. */
  generics: DrugGroup[];
  /** True when brands/generics come from typo-tolerant fallback matching, not exact substring. */
  isFuzzy: boolean;
}

/**
 * Returns up to 8 autocomplete suggestions split into two groups:
 * brand-name matches and generic-name matches (no duplicates).
 * Falls back to fuzzy matching when there are no substring matches at all.
 */
export function getAutocompleteSuggestions(
  groups: DrugGroup[],
  query: string,
): AutocompleteSuggestions {
  const q = query.trim().toLowerCase();
  if (!q) return { brands: [], generics: [], isFuzzy: false };

  const brands: DrugGroup[] = [];
  const brandKeys = new Set<string>();

  for (const g of groups) {
    if (brands.length >= 4) break;
    if (g.brand_name.toLowerCase().includes(q)) {
      brands.push(g);
      brandKeys.add(g.key);
    }
  }

  const generics: DrugGroup[] = [];
  for (const g of groups) {
    if (generics.length >= 4) break;
    if (!brandKeys.has(g.key) && g.generic_name.toLowerCase().includes(q)) {
      generics.push(g);
    }
  }

  if (brands.length > 0 || generics.length > 0) {
    return { brands, generics, isFuzzy: false };
  }

  // No exact/substring matches at all — fall back to typo-tolerant suggestions.
  const fuzzy = fuzzyRank(query, groups, g => [g.brand_name, g.generic_name], 8);
  return { brands: fuzzy, generics: [], isFuzzy: true };
}
