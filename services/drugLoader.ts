import { Medicine } from '../types';

// Load organized medicaments JSON files recursively
const drugFiles = import.meta.glob('../medicaments/organized/**/*.json', { eager: true });

const cleanCategoryName = (name: string): string => {
    if (!name) return 'Médicament';

    // 1. Remove ATC codes: letter + 2 digits + optional letters/digits
    const atcPattern = /[A-Z][0-9]{2}[A-Z]?[0-9]?/g;

    // 2. Remove common abbreviations in caps (2-4 chars)
    const abbrPattern = /\b[A-Z]{2,4}\b/g;

    let cleaned = name
        .replace(atcPattern, '')
        .replace(abbrPattern, '')
        // Handle parenthesis robustly - remove any text inside () if it matches certain patterns
        // and also handle unmatched open parentheses at the start
        .replace(/^\s*\(\s*/, '')
        .replace(/\s*\([^)]*\)/g, (match) => {
            const content = match.slice(1, -1).trim();
            if (content.length <= 5 || /[0-9]/.test(content) || /^[A-Z\s]+$/.test(content)) return '';
            return ' ' + content;
        })
        .replace(/^\s*[-_:/,]\s*/, '')
        .replace(/\s*[-_:/,]\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return 'Médicament';

    // Capitalize first letter
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

let cachedDrugs: Medicine[] = [];

export const loadMoroccanDrugs = (): Medicine[] => {
    if (cachedDrugs.length > 0) return cachedDrugs;

    const allDrugs: Medicine[] = [];
    const seenIds = new Set<string>();

    Object.values(drugFiles).forEach((module: any) => {
        const data = module.default || module;

        const processMed = (m: any) => {
            const id = m.id || `M-${Math.random().toString(36).substr(2, 9)}`;
            if (seenIds.has(id)) return;

            const dosage = m.dosing?.[0]?.doseText || m.indications?.[0] || m.strength || '';
            const category = cleanCategoryName(m.atc_class || m.productType || m.therapeutic_group || m.drug_class || 'Médicament');

            allDrugs.push({
                id: id,
                name: m.raw_label || m.brand_name || m.name || (m.brand && m.generic ? `${m.brand} (${m.generic})` : m.brand) || 'Inconnu',
                category: category,
                form: m.form,
                strength: m.strength,
                active_ingredient: m.active_ingredient || m.generic_name || m.generic,
                defaultDosage: dosage,
                defaultTiming: 'Indifférent',
                isAdultOnly: m.smart_flags?.dangerous_for_children || m.isAdultOnly || false,
                isPregnantForbidden: m.smart_flags?.dangerous_in_pregnancy || m.smart_flags?.contraindicated_pregnancy || m.isPregnantForbidden || false,
                isBreastfeedingForbidden: m.isBreastfeedingForbidden || false,
                isHeartForbidden: m.smart_flags?.cardiac_monitoring_required || m.isHeartForbidden || false,
                isKidneyForbidden: m.smart_flags?.renal_caution || m.isKidneyForbidden || false,
                isLiverForbidden: m.smart_flags?.hepatic_caution || m.isLiverForbidden || false,
                interactionGroup: m.interaction_group || m.active_ingredient || m.generic_name || m.interactionGroup || undefined,
                majorInteractions: m.major_interactions?.map((inter: any) => ({
                    with: inter.with || inter.substance || inter.type,
                    risk: inter.risk || inter.message,
                    severity: inter.severity || 'absolute'
                })) || m.interactions?.map((i: any) => ({
                    with: i.drug,
                    risk: i.effect,
                    severity: i.severity === 'majeure' ? 'absolute' : 'relative'
                })),
                contraindications: m.contraindications?.map((c: any) => ({
                    type: c.type || (typeof c === 'string' ? c : ''),
                    severity: c.severity || 'absolute',
                    message: c.message || (typeof c === 'string' ? c : ''),
                    minWeeks: c.minWeeks,
                    maxWeeks: c.maxWeeks
                })),
                pregnancyLactation: m.pregnancy_lactation || m.pregnancy || m.alerts || m.smart_flags
            });
            seenIds.add(id);
        };

        // Direct array of medicines in each class file
        if (Array.isArray(data)) {
            data.forEach(processMed);
        }
        // Fallback for standard "items" structure if any remains
        else if (data.items && Array.isArray(data.items)) {
            data.items.forEach(processMed);
        }
    });

    console.log(`Loaded ${allDrugs.length} drugs from organized database.`);
    cachedDrugs = allDrugs;
    return allDrugs;
};
