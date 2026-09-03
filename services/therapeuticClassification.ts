// ─── Therapeutic classification ──────────────────────────────────────────────
//
// Root-cause fix for a classification bug: AMEP (Amlodipine, cardiovascular)
// was showing up under "Antibiotiques" because the old logic did
// `therapeutic_group_regex.test(tg) || therapeutic_group_regex.test(drug_class)`
// and AMEP's `drug_class` field is corrupted upstream data — literally
// "Pénicilline à large spectre (aminopénicilline)", copy-pasted from an
// unrelated antibiotic record — while its `therapeutic_group`
// ("Inhibiteur calcique, dérivé de la dihydropyridine") is correct but
// doesn't contain any of the free-text cardiology keywords the old regex
// looked for. One bad field in one record silently poisoned classification.
//
// Fix: classify primarily from `atc_code` (WHO Anatomical Therapeutic
// Chemical classification — an unambiguous, internationally standardized
// code, immune to corrupted free-text fields) and only fall back to
// `therapeutic_group` keyword matching when no ATC code is present or it
// doesn't map to a known bucket. `drug_class` is intentionally NEVER used
// for classification — the AMEP case proved it is not reliable enough.
//
// The ATC → category mapping below was built empirically: every distinct
// ATC level-3/4 prefix actually present across all 26 medicament_*_final.json
// files (1,887 consolidated brands) was extracted and cross-checked against
// its therapeutic_group text before being assigned a bucket.

export interface TherapeuticCategoryDef {
    key: string;
    label: string;
    /** Fallback text-matching keywords — used only when the ATC code is absent or unmapped. */
    keywords: RegExp;
}

export const THERAPEUTIC_CATEGORIES: TherapeuticCategoryDef[] = [
    {
        key: 'cardiologie',
        label: 'Cardiologie',
        keywords: /cardio|hypertens|angineux|antiangin|antiarythmique|inotrope|coronaire|cardiaque|antithrombotique|anticoagulant|antiagrégant|thrombolytique|vasodilatateur|veinotonik|veinoton|dérivé nitré|hémostati|antihémor|hémoragi|hémostat|hémorragique|cardioton/i,
    },
    {
        key: 'neurologie',
        label: 'Neurologie / Psychiatrie',
        keywords: /neuro|psychi|antidépres|anxioly|hypnot|sédatif|antiépilept|antiépilepti|épilepsie|parkinson|alzheimer|démence|sclérose|sep\b|nootrope|neuroleptiq|antipsychot|benzodiazép|tdah|psychostim|myorelax|spasticité|migrain|antimigraineux/i,
    },
    {
        key: 'analgesiques',
        label: 'Analgésiques / AINS',
        keywords: /analg|antalgiq|douleur|antipyrét|ains\b|anti-inflammatoire non stéroïdien|salicyl|opioïde|morphin|palier|nsaid/i,
    },
    {
        key: 'antibiotiques',
        label: 'Antibiotiques',
        keywords: /antibio|antibact|fluoroquinol|céphalosporin|pénicillin|aminoside|macrolid|tétracyclin|carbapéném|synergistin|rifamp|vancomycin|linézolid/i,
    },
    {
        key: 'pneumologie',
        label: 'Pneumologie',
        keywords: /pneumo|asthm|bpco|broncho|respirat|mucolytiq|expectorant|antitussif|toux|inhalé|inhal|détresse respiratoire/i,
    },
    {
        key: 'gastroenterologie',
        label: 'Gastroentérologie',
        keywords: /gastro|ulcère|ipp\b|antiulcéreux|intestin|diarrhée|laxatif|constipat|hépatol|probiotiq|prébiotiq|antiémétiq|nausée|reflux|rgo\b|digestif|prokinét|protecteur gastrique|anti-h2|helicobacter/i,
    },
    {
        key: 'endocrinologie',
        label: 'Endocrinologie',
        keywords: /diabèt|diabet|insuline|glp-1|hypoglycémiant|thyroïd|hormono|endocrin|antidiabétiq|antidiabetiq|glucocorticoïd|corticostéroïd|corticothérap|corticoïd|gluco|surrén|métabolism/i,
    },
    {
        key: 'oncologie',
        label: 'Oncologie',
        keywords: /oncol|cancér|antinéoplasiq|antineoplasiq|cytostatiq|chimiothérap|immunothérap|anticorps monoclonal|inhibiteur de kinase|inhibiteur du protéasome|hormonothérap|aromatase|taxan|platine|antimétabolit|immunomodulat/i,
    },
    {
        key: 'gynecologie',
        label: 'Gynécologie',
        keywords: /gynéco|gynaeco|contracepti|contraception|progestatif|gonadotrophine|fertilité|infertilité|obstétrique|tocolytiq|maternité|oestrogène|œstrogène|inducteur de l.ovulation/i,
    },
    {
        key: 'rhumatologie',
        label: 'Rhumatologie',
        keywords: /rhumato|arthrit|arthros|ostéoporos|bisphosphonat|goutte|antigoutteux|antiarthros|os\b|osseux|antiostéoporos/i,
    },
    {
        key: 'ophtalmologie',
        label: 'Ophtalmologie',
        keywords: /ophtalmol|ophta|oculaire|œil|glaucom|mydriatiq|larmes artificial|anti-vegf|conjonctivit/i,
    },
    {
        key: 'dermatologie',
        label: 'Dermatologie',
        keywords: /dermato|cutané|topiq|acné|psoriasis|dermocorticoïd|antiseptiq|cicatrisant|psoralèn|alopéci/i,
    },
    {
        key: 'urologie',
        label: 'Urologie',
        keywords: /urol|diurétiq|rein|rénal|hbp\b|hyperplasie bénigne|vésical|prostat|érectile|htap\b/i,
    },
    {
        key: 'immunologie',
        label: 'Immunologie / Allergie',
        keywords: /immunol|immunosuppress|immunomodul|allergi|antihistamin|anti-tnf|biothérapi|rhumatismal|immunostimul|immunoglobulin/i,
    },
    {
        key: 'vaccins',
        label: 'Vaccins',
        keywords: /vaccin/i,
    },
    {
        key: 'vitamines',
        label: 'Vitamines / Suppléments',
        keywords: /vitamine|minéral|supplém|complément alimentaire|nutrition|acide foliq|fer oral|calcium|magnési/i,
    },
    {
        key: 'antiviraux',
        label: 'Antiviraux',
        keywords: /antivir|antiretrovir|vhc\b|vih\b|herpét|rétrovir/i,
    },
    {
        key: 'antifongiques',
        label: 'Antifongiques',
        keywords: /antifong|antimycosiq|triazole|candida/i,
    },
    {
        key: 'antiparasitaires',
        label: 'Antiparasitaires',
        keywords: /antiparasit|paludéen|antipaludéen|helminthiq|antipaludiq|scabicid|ivermectine|vermifug/i,
    },
];

export const AUTRES_KEY = 'autres';
export const NON_CLASSE_KEY = 'non-classe';

// ─── ATC → category mapping ──────────────────────────────────────────────────
//
// Checked most-specific first: 4-char (level 3), then 3-char (level 2), then
// 1-char (level 1) — only for the letters where every observed level-2/3
// sub-code maps to the same app category (verified against real data).

/** Exceptions where the level-2 (3-char) ATC code diverges from the letter's dominant bucket. */
const ATC_LEVEL2_OVERRIDES: Record<string, string> = {
    R06: 'immunologie',       // systemic antihistamines — app groups these under Immunologie/Allergie
    M01: 'analgesiques',      // NSAIDs
    M02: 'analgesiques',      // topical NSAIDs
    M03: 'neurologie',        // muscle relaxants
    M04: 'rhumatologie',      // antigout
    M05: 'rhumatologie',      // bone/osteoporosis (bisphosphonates)
    N02: 'analgesiques',      // analgesics — overrides the general N→neurologie rule
    B03: AUTRES_KEY,          // antianemics (iron/B12/folate) — not cardiovascular
    B05: AUTRES_KEY,          // perfusion fluids/plasma substitutes
    A01: AUTRES_KEY,          // stomatological preparations — no dedicated category
    A08: 'endocrinologie',    // anti-obesity — metabolic
    G04: 'urologie',          // urologicals (app splits G into gynéco vs uro)
    S02: AUTRES_KEY,          // otologicals — no ORL category
    S03: AUTRES_KEY,          // ophthalmo/oto combinations
};

/** General level-2 (3-char) → category, for letters with genuine internal variety. */
const ATC_LEVEL2: Record<string, string> = {
    A02: 'gastroenterologie', A03: 'gastroenterologie', A04: 'gastroenterologie',
    A05: 'gastroenterologie', A06: 'gastroenterologie', A07: 'gastroenterologie', A09: 'gastroenterologie',
    A10: 'endocrinologie', A14: 'endocrinologie', A16: 'endocrinologie',
    A11: 'vitamines', A12: 'vitamines', A13: 'vitamines',
    B01: 'cardiologie', B02: 'cardiologie',
    G01: 'gynecologie', G02: 'gynecologie', G03: 'gynecologie',
    J01: 'antibiotiques', J04: 'antibiotiques',
    J02: 'antifongiques',
    J05: 'antiviraux',
    J06: 'immunologie',
    J07: 'vaccins',
    L01: 'oncologie', L02: 'oncologie',
    L03: 'immunologie', L04: 'immunologie',
    N01: 'neurologie', N03: 'neurologie', N04: 'neurologie', N05: 'neurologie', N06: 'neurologie', N07: 'neurologie',
    R01: 'pneumologie', R02: 'pneumologie', R03: 'pneumologie', R05: 'pneumologie', R07: 'pneumologie',
    S01: 'ophtalmologie',
};

/** Level-1 (1-char) fallback — only for letters that are internally consistent across every observed sub-code. */
const ATC_LEVEL1: Record<string, string> = {
    C: 'cardiologie',
    D: 'dermatologie',
    H: 'endocrinologie',
    P: 'antiparasitaires',
    V: AUTRES_KEY,
};

/**
 * Classifies a drug by its WHO ATC code alone. Returns null when the code
 * is absent or doesn't map to a known bucket — callers should fall back to
 * text-based classification in that case, never guess here.
 */
export function classifyByAtc(atcCode?: string | null): string | null {
    const atc = (atcCode || '').trim().toUpperCase();
    if (!atc) return null;

    const lvl2 = atc.slice(0, 3);
    if (ATC_LEVEL2_OVERRIDES[lvl2]) return ATC_LEVEL2_OVERRIDES[lvl2];
    if (ATC_LEVEL2[lvl2]) return ATC_LEVEL2[lvl2];

    const lvl1 = atc.slice(0, 1);
    if (ATC_LEVEL1[lvl1]) return ATC_LEVEL1[lvl1];

    return null;
}

/**
 * Classifies a drug for the therapeutic-class browser. ATC code is the
 * primary, reliable signal (WHO standard, immune to corrupted free-text
 * fields). `therapeutic_group` is used only as a fallback when ATC is
 * absent/unmapped — and `drug_class` is deliberately never consulted here,
 * since it was found to occasionally hold copy-pasted, unrelated text
 * (see AMEP above). A drug with neither field usable is "Non classé"
 * rather than guessed.
 */
export function classifyDrug(params: {
    atc_code?: string | null;
    therapeutic_group?: string | null;
    drug_class?: string | null;
}): string {
    const byAtc = classifyByAtc(params.atc_code);
    if (byAtc) return byAtc;

    const tg = (params.therapeutic_group || '').trim();
    const dc = (params.drug_class || '').trim();
    if (!tg && !dc) return NON_CLASSE_KEY;

    for (const cat of THERAPEUTIC_CATEGORIES) {
        if (cat.keywords.test(tg)) return cat.key;
    }
    return AUTRES_KEY;
}

// ─── Official WHO ATC Level-1 (14 anatomical groups) — navigation system ──────
//
// Etape 2 (2026-08-28): replaces the 19-category system above as the primary
// browsing classification, integrated into components/PharmaDirectory.tsx's
// "Parcourir par catégorie" mode. The mapping above (THERAPEUTIC_CATEGORIES /
// classifyByAtc / classifyDrug) is kept as-is — components/admin/
// MedicamentEditor.tsx still uses classifyByAtc + THERAPEUTIC_CATEGORIES to
// suggest a therapeutic_group label while an admin types an ATC code — it is
// not dead code, just no longer the navigation taxonomy.
//
// Diagnostic (2,845 records across all medicament_[A-Z]_final.json): 99.7%
// have an atc_code whose first letter is one of the 14 official groups below.
// Level 1 is therefore atc_code-only — no therapeutic_group keyword fallback,
// no guessing. A drug lands in exactly one group, decided by its own
// atc_code; records without a usable atc_code go to "Non classé".

export interface AnatomicalGroupDef {
    key: string;   // single official ATC letter, e.g. 'A'
    label: string; // official French label
}

export const ANATOMICAL_GROUPS: AnatomicalGroupDef[] = [
    { key: 'A', label: 'Voies digestives et métabolisme' },
    { key: 'B', label: 'Sang et organes hématopoïétiques' },
    { key: 'C', label: 'Système cardiovasculaire' },
    { key: 'D', label: 'Dermatologie' },
    { key: 'G', label: 'Système génito-urinaire et hormones sexuelles' },
    { key: 'H', label: 'Hormones systémiques (hors hormones sexuelles)' },
    { key: 'J', label: 'Anti-infectieux (voie générale)' },
    { key: 'L', label: 'Antinéoplasiques et immunomodulateurs' },
    { key: 'M', label: 'Système musculosquelettique' },
    { key: 'N', label: 'Système nerveux' },
    { key: 'P', label: 'Antiparasitaires, insecticides et répulsifs' },
    { key: 'R', label: 'Système respiratoire' },
    { key: 'S', label: 'Organes sensoriels' },
    { key: 'V', label: 'Divers' },
];

const ANATOMICAL_GROUP_KEYS = new Set(ANATOMICAL_GROUPS.map(g => g.key));

/**
 * Level-1 classification: first letter of atc_code, checked against the 14
 * official WHO groups only. Returns null when atc_code is absent or its
 * first letter isn't one of the 14 — callers bucket those as "Non classé".
 */
export function classifyByAtcLevel1(atcCode?: string | null): string | null {
    const atc = (atcCode || '').trim().toUpperCase();
    if (!atc) return null;
    const letter = atc.charAt(0);
    return ANATOMICAL_GROUP_KEYS.has(letter) ? letter : null;
}

/** Classifies a drug into one of the 14 official anatomical groups, or NON_CLASSE_KEY. */
export function classifyDrugLevel1(params: { atc_code?: string | null }): string {
    return classifyByAtcLevel1(params.atc_code) ?? NON_CLASSE_KEY;
}

// ─── Level-2 sub-grouping (dynamic, from therapeutic_group text) ──────────────
//
// Inside a level-1 group, drugs are clustered by their therapeutic_group
// value rather than mapped to a fixed vocabulary — the diagnostic found
// therapeutic_group present on 99.9% of records but as heterogeneous free
// text, not a clean enum. Normalization is intentionally light (lowercase,
// trim, naive trailing-"s" strip) so trivial singular/plural variants
// collapse into the same bucket; the displayed label keeps the original text.

function normalizeSubClassKey(therapeuticGroup: string): string {
    return therapeuticGroup
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/s$/, '');
}

export interface SubClassBucket<T> {
    key: string;
    label: string;
    items: T[];
}

/**
 * Groups items by normalized therapeutic_group text, largest bucket first.
 * Items with no usable therapeutic_group are bucketed under "Non précisé".
 */
export function groupBySubClass<T extends { therapeutic_group?: string | null }>(
    items: T[],
): SubClassBucket<T>[] {
    const map = new Map<string, SubClassBucket<T>>();
    for (const item of items) {
        const raw = (item.therapeutic_group || '').trim();
        const key = raw ? normalizeSubClassKey(raw) : '__non-precise__';
        const label = raw || 'Non précisé';
        if (!map.has(key)) map.set(key, { key, label, items: [] });
        map.get(key)!.items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
}
