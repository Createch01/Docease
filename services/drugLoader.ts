import { Medicine } from '../types';

// Load all medicaments JSON files
const drugFiles = import.meta.glob('../medicaments/*.json', { eager: true });

let cachedDrugs: Medicine[] = [];

export const loadMoroccanDrugs = (): Medicine[] => {
    if (cachedDrugs.length > 0) return cachedDrugs;

    const allDrugs: Medicine[] = [];

    Object.values(drugFiles).forEach((module: any) => {
        // Handle standard "items" structure (medicaments *.json)
        if (module.items && Array.isArray(module.items)) {
            module.items.forEach((item: any) => {
                const dosage = item.dosing?.[0]?.doseText ||
                    item.indications?.[0] ||
                    item.strength ||
                    '';

                allDrugs.push({
                    id: item.id || `M-${Math.random().toString(36).substr(2, 9)}`,
                    name: item.raw_label || item.brand_name || 'Inconnu',
                    category: item.atc_class || item.productType || 'Médicament',
                    form: item.form,
                    strength: item.strength,
                    active_ingredient: item.active_ingredient,
                    defaultDosage: dosage,
                    defaultTiming: 'Indifférent',
                    interactionGroup: item.interaction_group || item.active_ingredient || undefined,
                    majorInteractions: item.major_interactions?.map((inter: any) => ({
                        with: inter.with,
                        risk: inter.risk,
                        severity: inter.severity || 'absolute'
                    })),
                    contraindications: item.contraindications?.map((c: any) => ({
                        type: c.type,
                        severity: c.severity || 'absolute',
                        message: c.message,
                        minWeeks: c.minWeeks,
                        maxWeeks: c.maxWeeks
                    })),
                    pregnancyLactation: item.pregnancy_lactation
                });
            });
        }
        // Handle "page/content" structure (medicament *.json) or plain array of medications
        else if (Array.isArray(module.default)) {
            module.default.forEach((m: any) => {
                if (m.content) {
                    try {
                        const parsed = JSON.parse(m.content);
                        if (parsed.medications && Array.isArray(parsed.medications)) {
                            parsed.medications.forEach((med: any) => {
                                const dosage = med.dosing?.[0]?.doseText || med.indications?.[0] || med.strength || '';
                                allDrugs.push({
                                    id: med.id || `M-${Math.random().toString(36).substr(2, 9)}`,
                                    name: med.brand || (med.activeSubstances?.map((s: any) => s.name).join(' + ')) || 'Inconnu',
                                    category: med.productType || 'Médicament',
                                    form: med.form,
                                    strength: med.strength,
                                    active_ingredient: med.activeSubstances?.[0]?.name,
                                    defaultDosage: dosage,
                                    defaultTiming: 'Indifférent',
                                    interactionGroup: med.activeSubstances?.map((s: any) => s.name).join(', ') || undefined,
                                    majorInteractions: med.interactions?.map((inter: any) => ({
                                        with: inter.with || inter.substance || inter.type,
                                        risk: inter.risk || inter.message,
                                        severity: inter.severity || 'absolute'
                                    })),
                                    contraindications: med.contraindications?.map((c: any) => ({
                                        type: c.type,
                                        severity: c.severity || 'absolute',
                                        message: c.message,
                                        minWeeks: c.minWeeks,
                                        maxWeeks: c.maxWeeks
                                    })),
                                    pregnancyLactation: med.alerts  // Alerts often contain pregnancy info in this structure
                                });
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing drug content:', e);
                    }
                } else if (m.brand_name || m.generic_name || m.name || m.raw_label) {
                    // Handle plain array of medications (like the newly formatted medicament 1.json)
                    const dosage = m.dosing?.[0]?.doseText || m.indications?.[0] || m.strength || '';
                    allDrugs.push({
                        id: m.id || `M-${Math.random().toString(36).substr(2, 9)}`,
                        name: m.raw_label || m.brand_name || m.name || 'Inconnu',
                        category: m.atc_class || m.productType || m.drug_class || 'Médicament',
                        form: m.form,
                        strength: m.strength,
                        active_ingredient: m.active_ingredient || m.generic_name,
                        defaultDosage: dosage,
                        defaultTiming: 'Indifférent',
                        interactionGroup: m.interaction_group || m.active_ingredient || m.generic_name || undefined,
                        majorInteractions: m.major_interactions?.map((inter: any) => ({
                            with: inter.with,
                            risk: inter.risk,
                            severity: inter.severity || 'absolute'
                        })),
                        contraindications: m.contraindications?.map((c: any) => ({
                            type: c.type,
                            severity: c.severity || 'absolute',
                            message: c.message,
                            minWeeks: c.minWeeks,
                            maxWeeks: c.maxWeeks
                        })),
                        pregnancyLactation: m.pregnancy_lactation || m.pregnancy
                    });
                }
            });
        }
    });

    console.log(`Loaded ${allDrugs.length} drugs from Moroccan Database.`);
    cachedDrugs = allDrugs;
    return allDrugs;
};
