import { Patient, PrescriptionItem } from '../types';
import { getAllLoadedMedicines, mapMedicamentToMedicine, type Medicament } from './drugCatalogService';
import { checkGroupAgainstProfile, getDocumentedSafetyCategories, type SafetyCategory } from './drugSafetyCheck';
import type { ActivePatientProfile } from './activeProfileService';

// Finds, for a set of prescribed items, which patient-status categories (renal/hepatic/
// cardiac/pregnancy/breastfeeding/diabete) at least one of them actually documents safety
// data for — so "missing data" is only raised when it could change how one of THESE
// medications is used, not as a blanket checklist run against every prescription regardless
// of content.
function documentedCategoriesForItems(items: PrescriptionItem[]): Set<SafetyCategory> {
    const categories = new Set<SafetyCategory>();
    if (!items.length) return categories;
    const rawCatalog = getAllLoadedMedicines();
    items.forEach(item => {
        const prescribedNorm = item.medicineName.trim().toUpperCase();
        // Strip trailing dosage/strength/form suffixes (e.g. "DOLIPRANE 1000 mg" → "DOLIPRANE")
        // to correctly match the catalog entry "DOLIPRANE".
        const prescribedFirstWord = prescribedNorm.split(/[\s\d]/)[0];
        const rawMed = rawCatalog.find((m: Medicament) => {
            const brandNorm = m.brand_name.toUpperCase();
            // Exact match first
            if (brandNorm === prescribedNorm) return true;
            // Prescribed name starts with brand (e.g. "DOLIPRANE 1000 MG" starts with "DOLIPRANE")
            if (prescribedNorm.startsWith(brandNorm + ' ') || prescribedNorm.startsWith(brandNorm + '\t')) return true;
            // Brand starts with first word of prescribed name (handles abbreviated entries)
            if (brandNorm === prescribedFirstWord) return true;
            // Generic name match (fallback)
            if (m.generic_name && prescribedNorm.includes(m.generic_name.toUpperCase())) return true;
            return false;
        });
        if (!rawMed) return;
        getDocumentedSafetyCategories(rawMed).forEach(c => categories.add(c));
    });
    return categories;
}

export interface DrugAlert {
    severity: 'CRITIQUE' | 'ATTENTION' | 'INFO';
    title: string;
    message: string;
    type: 'REGLE_SYSTEME' | 'INTERACTION' | 'CONTRE_INDICATION' | 'DOUBLON' | 'ENFANT_INTERDIT' | 'DONNEE_MANQUANTE';
}

/**
 * Builds the same profile shape PharmaDirectory's safety check uses (services/activeProfileService.ts)
 * from a real saved Patient record, so checkGroupAgainstProfile — the single authoritative
 * contraindication engine — can run identically for both screens instead of PrescriptionEditor
 * relying on its own weaker, partial flag checks.
 */
function patientToActiveProfile(patient: Patient, isChild: boolean, ptAge: number): ActivePatientProfile {
    return {
        isChild,
        childAgeYears: ptAge > 0 ? ptAge : undefined,
        isPregnant: patient.isPregnant,
        pregnancyWeeks: patient.pregnancyWeeks,
        isBreastfeeding: patient.isBreastfeeding,
        isRenalImpaired: patient.isKidneyPatient,
        isHepaticImpaired: patient.isLiverPatient,
        isCardiac: patient.isHeartPatient,
        isDiabetic: !!(patient.pathologyTags?.some(t => t.toUpperCase().startsWith('DIABÈTE')) || patient.pathologiesOtherTags?.some(t => t.toUpperCase().includes('DIABÈTE'))),
    };
}

// Mirrors PharmaDirectory's CATEGORY_LABEL (components/PharmaDirectory.tsx) — plain category
// names, since severity (CRITIQUE/ATTENTION/INFO) already conveys how serious the alert is;
// prefixing every title with "CONTRE-INDICATION" would mislabel the benign/INFO cases.
const SAFETY_CATEGORY_TITLES: Record<string, string> = {
    grossesse: 'GROSSESSE',
    allaitement: 'ALLAITEMENT',
    enfant: 'PÉDIATRIE',
    renal: 'FONCTION RÉNALE',
    hepatique: 'FONCTION HÉPATIQUE',
    cardiaque: 'CARDIAQUE',
    diabete: 'DIABÈTE',
};

interface DrugRule {
    id: string;
    keywords: string[];
    strengthPattern?: RegExp; // Regex to find relevant strength
    minAge?: number;
    minWeight?: number;
    severity: 'CRITIQUE' | 'ATTENTION';
    message: string;
}

// Basic normalized parsing helpers
const normalizeName = (name: string) => name.trim().toUpperCase().replace(/\s+/g, ' ');

// Regex Patterns
const STRENGTH_PATTERNS = {
    ADULT_AMOX: /1\s*g|1000\s*mg|875\/125|1g\/125mg/i,
    PEDIATRIC_AMOX: /500\/62\.5|100\/12\.5|400\/57|250\/62\.5/i
};

const INTERACTION_GROUPS = {
    AINS: ['DICLOFENAC', 'IBUPROFENE', 'MELOXICAM', 'NAPROXENE', 'CELECOXIB', 'AFLAMIC', 'VOLTARENE', 'ADVIL', 'SURGAM', 'PROFENID'],
    ASPIRINE: ['ASPIRINE', 'ACIDE ACETYLSALICYLIQUE', 'ACARD', 'ASPEGIC', 'KARDEGIC'],
    ANTICOAGULANT: ['WARFARINE', 'HEPARINE', 'COUMADINE', 'PREVISCAN', 'SINTROM', 'XARELTO', 'ELIQUIS', 'LOVENOX', 'INNOHEP'],
    MACROLIDE: ['CLARITHROMYCINE', 'ERYTHROMYCINE', 'TELLITROMYCINE', 'ZECLAR', 'KLACID', 'PYOSTACINE'],
    STATINE: ['ATORVASTATINE', 'SIMVASTATINE', 'ROSUVASTATINE', 'TAHOR', 'ZOCOR', 'CRESTOR', 'LIPITOR'],
    IEC_SARTAN: ['RAMIPRIL', 'LISINOPRIL', 'ENALAPRIL', 'VALSARTAN', 'LOSARTAN', 'IRBESARTAN', 'TRIATEC', 'ZESTRIL', 'COZAAR', 'DIOVAN', 'APROVEL'],
    EPARGNE_POTASSIUM: ['SPIRONOLACTONE', 'ALDACTONE', 'SOLDACTONE', 'AMILORIDE'],
    BETA_BLOQUANT: ['BISOPROLOL', 'METOPROLOL', 'ATENOLOL', 'CARVEDILOL', 'CONCOR', 'SELOKEN', 'TENORMINE', 'DETENSIC'],
    INC_BRADYCARDIANT: ['VERAPAMIL', 'DILTIAZEM', 'ISOPTINE', 'TILDIEM'],
    METHOTREXATE: ['METHOTREXATE', 'METOJECT', 'IMETH'],
    LITHIUM: ['LITHIUM', 'TERALITHE']
};

// Maps each structured allergy tag (from constants/medicalData.ts COMMON_ALLERGIES) to
// keywords matched against the medicine name/active ingredient/category/interaction group
// and its free-text contraindication notes. Food/contact allergies have no drug-name
// equivalent, so they only match via contraindicationNotes.
const ALLERGY_KEYWORDS: Record<string, string[]> = {
    'Pénicilline': ['PENICILLIN', 'PÉNICILLINE', 'AMOXICILLIN', 'AMOXICILLINE', 'AUGMENTIN', 'ACLAV', 'CLAVULIN', 'AMOXIL', 'ALFAMOX', 'ALMOXEL', 'BETALACTAM', 'BÊTA-LACTAM', 'BETA-LACTAM'],
    'Amoxicilline': ['AMOXICILLIN', 'AMOXICILLINE', 'AUGMENTIN', 'ACLAV', 'CLAVULIN', 'AMOXIL', 'ALFAMOX'],
    'Aspirine': INTERACTION_GROUPS.ASPIRINE,
    'AINS': INTERACTION_GROUPS.AINS,
    'Sulfamides': ['SULFAMIDE', 'SULFAMETHOXAZOLE', 'COTRIMOXAZOLE', 'BACTRIM', 'SULFA'],
    'Iode': ['IODE', 'IODÉ', 'PRODUIT DE CONTRASTE', 'CONTRASTE IODÉ'],
};
// Tags without a keyword entry above (food/contact allergies like Latex, Arachides...)
// fall back to a plain substring match against the haystack — mainly useful when the
// catalog's free-text contraindicationNotes mention them explicitly.

const DRUG_RULES: DrugRule[] = [
    {
        id: 'amox-1g-pediatric',
        keywords: ['ACLAV', 'AUGMENTIN', 'CLAVULIN', 'CO-AMOXICLAV', 'AMOXIL', 'AMOXICILLINE'],
        strengthPattern: STRENGTH_PATTERNS.ADULT_AMOX,
        minAge: 12,
        minWeight: 40,
        severity: 'CRITIQUE',
        message: "STRICTEMENT INTERDIT : La forme 1g est purement réservée aux adultes (>40kg). Risque de surdosage grave chez l'enfant. Utiliser une forme pédiatrique (Nourrisson/Enfant)."
    },
    {
        id: 'aspirine-pediatric',
        keywords: ['ASPIRINE', 'ASPEGIC', 'KARDEGIC'],
        minAge: 16,
        severity: 'CRITIQUE',
        message: "ALERTE ROUGE : Risque de Syndrome de Reye mortel. L'aspirine est formellement interdite chez l'enfant de moins de 16 ans sauf indication spécialisée."
    },
    {
        id: 'fluoroquinolones-pediatric',
        keywords: ['CIPRO', 'CIPROFLOXACINE', 'OFLOXACINE', 'TIFLOX', 'LEVOFLOXACINE', 'AVELOX', 'MOXIFLOXACINE'],
        minAge: 15,
        severity: 'CRITIQUE',
        message: "INTERDIT : Risque de toxicité sur les cartilages de croissance. Utiliser une alternative thérapeutique."
    },
    {
        id: 'tetracyclines-pediatric',
        keywords: ['DOXY', 'DOXYCYCLINE', 'VIBRAMYCINE', 'GRANUDOXY'],
        minAge: 8,
        severity: 'CRITIQUE',
        message: "CONTRE-INDIQUÉ : Risque de coloration permanente des dents et hypoplasie de l'émail dentaire avant 8 ans."
    },
    {
        id: 'codeine-pediatric',
        keywords: ['CODEINE', 'CODALIPRANE', 'DAFALGAN CODEINE', 'EFFERALGAN CODEINE', 'KLIPAL'],
        minAge: 12,
        severity: 'CRITIQUE',
        message: "STRICTEMENT INTERDIT : La codéine est interdite chez l'enfant de moins de 12 ans en raison du risque de dépression respiratoire mortelle (métaboliseurs ultra-rapides)."
    },
    {
        id: 'diclofenac-pediatric',
        keywords: ['VOLTARENE', 'DICLOFENAC', 'DICLO', 'VOFLEN'],
        minAge: 6,
        severity: 'ATTENTION',
        message: "ATTENTION : Les AINS type Diclofénac sont à utiliser avec prudence chez l'enfant. Vérifiez si une alternative type Paracétamol ou Ibuprofène (sirop) est préférable."
    }
];

export const drugRulesService = {
    // Flags patient-profile fields that are simply unknown (never entered) rather than
    // negated, so the doctor is told to check instead of silently getting no alert at all.
    // Must be run against the real saved Patient record — the prescription form always
    // collapses undefined booleans to `false`, which would hide the "unknown" state.
    // Only raised once a medication is prescribed, and only for the statuses that medication
    // actually documents safety data for — an empty ordonnance or a drug with no renal/hepatic/
    // cardiac data attached should never produce a "missing data" notice.
    checkMissingData: (patient: Patient | null, items: PrescriptionItem[] = []): DrugAlert[] => {
        const alerts: DrugAlert[] = [];
        if (!patient || !items.length) return alerts;
        const relevant = documentedCategoriesForItems(items);

        if (patient.sex === 'F') {
            const age = patient.age || 0;
            const isReproductiveAge = age >= 12 && age <= 50;
            if (isReproductiveAge) {
                if (relevant.has('grossesse') && patient.isPregnant === undefined) {
                    alerts.push({
                        severity: 'ATTENTION',
                        title: 'DONNÉE MANQUANTE : GROSSESSE',
                        message: 'Statut grossesse non renseigné — vérifier avant prescription si applicable.',
                        type: 'DONNEE_MANQUANTE'
                    });
                }
                if (relevant.has('allaitement') && patient.isBreastfeeding === undefined) {
                    alerts.push({
                        severity: 'ATTENTION',
                        title: 'DONNÉE MANQUANTE : ALLAITEMENT',
                        message: 'Statut allaitement non renseigné — vérifier avant prescription si applicable.',
                        type: 'DONNEE_MANQUANTE'
                    });
                }
            }
        }

        if (relevant.has('renal') && patient.isKidneyPatient === undefined) {
            alerts.push({
                severity: 'ATTENTION',
                title: 'DONNÉE MANQUANTE : FONCTION RÉNALE',
                message: 'Statut rénal non renseigné — vérifier avant prescription de médicaments à élimination rénale.',
                type: 'DONNEE_MANQUANTE'
            });
        }
        if (relevant.has('hepatique') && patient.isLiverPatient === undefined) {
            alerts.push({
                severity: 'ATTENTION',
                title: 'DONNÉE MANQUANTE : FONCTION HÉPATIQUE',
                message: 'Statut hépatique non renseigné — vérifier avant prescription de médicaments à métabolisme hépatique.',
                type: 'DONNEE_MANQUANTE'
            });
        }
        if (relevant.has('cardiaque') && patient.isHeartPatient === undefined) {
            alerts.push({
                severity: 'ATTENTION',
                title: 'DONNÉE MANQUANTE : CARDIAQUE',
                message: 'Statut cardiaque non renseigné — vérifier avant prescription si applicable.',
                type: 'DONNEE_MANQUANTE'
            });
        }
        return alerts;
    },

    // Flags any pathologies/allergies entries that were never matched to the structured
    // reference list — "Autre" tags, or legacy free-text patients that predate the tag
    // fields — since these are not (and cannot be) auto-verified against the drug catalog.
    // Only relevant once a medication is actually being prescribed against that profile.
    checkUnstructuredData: (patient: Patient | null, items: PrescriptionItem[] = []): DrugAlert[] => {
        const alerts: DrugAlert[] = [];
        if (!patient || !items.length) return alerts;

        const unstructuredAllergies = [
            ...(patient.allergiesOtherTags || []),
            ...((!patient.allergyTags?.length && !patient.allergiesOtherTags?.length && patient.allergies) ? [patient.allergies] : [])
        ];
        const unstructuredPathologies = [
            ...(patient.pathologiesOtherTags || []),
            ...((!patient.pathologyTags?.length && !patient.pathologiesOtherTags?.length && patient.pathologies) ? [patient.pathologies] : [])
        ];

        if (unstructuredAllergies.length) {
            alerts.push({
                severity: 'ATTENTION',
                title: 'ALLERGIE NON STRUCTURÉE — VÉRIFICATION MANUELLE',
                message: `Entrée(s) non reconnue(s) par la liste de référence : ${unstructuredAllergies.join(', ')}. Non vérifiable automatiquement — à croiser manuellement avec l'ordonnance.`,
                type: 'DONNEE_MANQUANTE'
            });
        }
        if (unstructuredPathologies.length) {
            alerts.push({
                severity: 'ATTENTION',
                title: 'PATHOLOGIE NON STRUCTURÉE — VÉRIFICATION MANUELLE',
                message: `Entrée(s) non reconnue(s) par la liste de référence : ${unstructuredPathologies.join(', ')}. Non vérifiable automatiquement.`,
                type: 'DONNEE_MANQUANTE'
            });
        }
        return alerts;
    },

    // Helper to extract info from raw drug string "ACLAV 1g/125mg SA"
    parseMedicine: (rawName: string) => {
        const normalized = normalizeName(rawName);
        return {
            name: normalized,
            hasAdultStrength: STRENGTH_PATTERNS.ADULT_AMOX.test(normalized),
        };
    },

    checkRules: (patient: Patient, items: PrescriptionItem[], currentMedications?: PrescriptionItem[]): DrugAlert[] => {
        const alerts: DrugAlert[] = [];

        // Patient Profile Parsing
        const ptAge = patient.age || 0;
        const ptWeight = patient.weight
            ? parseFloat(String(patient.weight).replace(/[^0-9.]/g, ''))
            : 0;

        // Determine strict "Child" context for these rules
        const isChild = patient.type === 'Child' || (ptAge > 0 && ptAge < 12) || (ptWeight > 0 && ptWeight < 40);

        // Load all medicines from database to check custom restrictions
        const customMedicines = (window as any).dataService?.getMedicines() || [];
        const rawCatalog = getAllLoadedMedicines();
        const loadedCatalog = rawCatalog.map(mapMedicamentToMedicine);
        const dbMedicines = [...customMedicines, ...loadedCatalog];

        // Pre-map items to DB medicines for efficiency
        const itemsWithMedData = items.map(item => ({
            item,
            dbMed: dbMedicines.find((m: any) =>
                m.name.toUpperCase() === item.medicineName.toUpperCase() ||
                (m.active_ingredient && item.medicineName.toUpperCase().includes(m.active_ingredient.toUpperCase()))
            ),
            // Raw catalog record (undiluted pregnancy/children/renal_adjustment/smart_flags), matched
            // separately from `dbMed` above because mapMedicamentToMedicine() collapses those fields
            // into a handful of lossy booleans that miss trimester- or condition-specific contraindications.
            rawMed: rawCatalog.find((m: Medicament) =>
                m.brand_name.toUpperCase() === item.medicineName.toUpperCase() ||
                (m.generic_name && item.medicineName.toUpperCase().includes(m.generic_name.toUpperCase()))
            )
        }));

        // 0. Authoritative contraindication check — same checkGroupAgainstProfile() engine
        // PharmaDirectory uses, run here against the real saved patient profile so a doctor
        // writing directly in PrescriptionEditor gets the identical pregnancy/breastfeeding/
        // renal/hepatic/cardiac/diabetic alerts, not just the narrower legacy flag checks below.
        const activeProfile = patientToActiveProfile(patient, isChild, ptAge);
        itemsWithMedData.forEach(({ item, rawMed }) => {
            if (!rawMed) return;
            checkGroupAgainstProfile(rawMed, activeProfile).forEach(safetyAlert => {
                alerts.push({
                    severity: safetyAlert.severity,
                    title: SAFETY_CATEGORY_TITLES[safetyAlert.category] || 'CONTRE-INDICATION',
                    message: `${item.medicineName} : ${safetyAlert.message}`,
                    type: safetyAlert.severity === 'INFO' ? 'DONNEE_MANQUANTE' : 'CONTRE_INDICATION',
                });
            });
        });

        // 1. Check for Duplicate Active Ingredients
        const activeIngredients = new Map<string, string[]>();
        itemsWithMedData.forEach(({ item, dbMed }) => {
            const ingredient = dbMed?.active_ingredient || item.medicineName.split(' ')[0].toUpperCase();
            if (!activeIngredients.has(ingredient)) {
                activeIngredients.set(ingredient, []);
            }
            activeIngredients.get(ingredient)?.push(item.medicineName);
        });

        activeIngredients.forEach((names, ingredient) => {
            if (names.length > 1) {
                alerts.push({
                    severity: 'CRITIQUE',
                    title: "DOUBLON THÉRAPEUTIQUE",
                    message: `Risque de surdosage : Plusieurs médicaments contiennent ${ingredient} (${names.join(', ')}).`,
                    type: 'DOUBLON'
                });
            }
        });

        // 1b. Check for Group-based Interactions (AINS + Aspirin, etc.)
        const groupsFound = new Map<string, string[]>();
        items.forEach(item => {
            const name = item.medicineName.toUpperCase();
            Object.entries(INTERACTION_GROUPS).forEach(([group, keywords]) => {
                if (keywords.some(k => name.includes(k))) {
                    if (!groupsFound.has(group)) groupsFound.set(group, []);
                    groupsFound.get(group)?.push(item.medicineName);
                }
            });
        });

        if (groupsFound.has('AINS') && groupsFound.has('ASPIRINE')) {
            alerts.push({
                severity: 'ATTENTION',
                title: "INTERACTION : AINS + ASPIRINE",
                message: `L'association de ${groupsFound.get('AINS')?.join(', ')} avec ${groupsFound.get('ASPIRINE')?.join(', ')} augmente majoritairement le risque d'ulcère et d'hémorragie digestive.`,
                type: 'INTERACTION'
            });
        }

        if (groupsFound.has('AINS') && groupsFound.has('ANTICOAGULANT')) {
            alerts.push({
                severity: 'CRITIQUE',
                title: "INTERACTION MAJEURE : AINS + ANTICOAGULANT",
                message: `L'association de ${groupsFound.get('AINS')?.join(', ')} avec ${groupsFound.get('ANTICOAGULANT')?.join(', ')} présente un risque hémorragique TRÈS ÉLEVÉ.`,
                type: 'INTERACTION'
            });
        }

        if (groupsFound.has('MACROLIDE') && groupsFound.has('STATINE')) {
            alerts.push({
                severity: 'CRITIQUE',
                title: "INTERACTION : MACROLIDE + STATINE",
                message: `Risque accru de rhabdomyolyse (atteinte musculaire grave) par inhibition du métabolisme des statines.`,
                type: 'INTERACTION'
            });
        }

        if (groupsFound.has('IEC_SARTAN') && groupsFound.has('EPARGNE_POTASSIUM')) {
            alerts.push({
                severity: 'ATTENTION',
                title: "INTERACTION : IEC/SARTAN + ÉPARGNE POTASSIUM",
                message: `Risque d'hyperkaliémie (excès de potassium) potentiellement grave. Surveillance du ionogramme recommandée.`,
                type: 'INTERACTION'
            });
        }

        if (groupsFound.has('BETA_BLOQUANT') && groupsFound.has('INC_BRADYCARDIANT')) {
            alerts.push({
                severity: 'CRITIQUE',
                title: "INTERACTION : BÊTA-BLOQUANT + VÉRAPAMIL/DILTIAZEM",
                message: `Risque de bradycardie sévère et de troubles de la conduction cardiaque (bloc auriculo-ventriculaire).`,
                type: 'INTERACTION'
            });
        }

        if (groupsFound.has('AINS') && groupsFound.has('METHOTREXATE')) {
            alerts.push({
                severity: 'CRITIQUE',
                title: "INTERACTION : AINS + MÉTHOTREXATE",
                message: `Augmentation de la toxicité du méthotrexate (hématologique et rénale). Association contre-indiquée ou nécessitant une surveillance étroite.`,
                type: 'INTERACTION'
            });
        }

        if (groupsFound.has('AINS') && groupsFound.has('LITHIUM')) {
            alerts.push({
                severity: 'CRITIQUE',
                title: "INTERACTION : AINS + LITHIUM",
                message: `Augmentation de la lithémie (toxicité du lithium). Risque de surdosage en lithium.`,
                type: 'INTERACTION'
            });
        }

        if ((groupsFound.get('AINS')?.length || 0) > 1) {
            alerts.push({
                severity: 'CRITIQUE',
                title: "DOUBLON AINS",
                message: `Plusieurs anti-inflammatoires (AINS) détectés : ${groupsFound.get('AINS')?.join(', ')}. Risque rénal et digestif majeur.`,
                type: 'DOUBLON'
            });
        }

        // 1c. Check new prescriptions against current medications
        if (currentMedications && currentMedications.length > 0) {
            const currentMedNames = currentMedications.map(m => m.medicineName.toUpperCase());
            items.forEach(item => {
                const newMedName = item.medicineName.toUpperCase();
                currentMedNames.forEach(currentMedName => {
                    // Check interaction groups
                    Object.entries(INTERACTION_GROUPS).forEach(([group, keywords]) => {
                        const newMedInGroup = keywords.some(k => newMedName.includes(k));
                        const currentMedInGroup = keywords.some(k => currentMedName.includes(k));

                        if (newMedInGroup && currentMedInGroup && group === 'AINS') {
                            alerts.push({
                                severity: 'CRITIQUE',
                                title: "INTERACTION : AINS (traitement actuel) + AINS (nouveau)",
                                message: `${item.medicineName} (nouveau) s'ajoute à un AINS existant. Risque hémorragique majeur.`,
                                type: 'INTERACTION'
                            });
                        } else if (newMedInGroup && currentMedInGroup && group === 'ANTICOAGULANT') {
                            alerts.push({
                                severity: 'CRITIQUE',
                                title: "INTERACTION MAJEURE : Anticoagulant + Nouveau médicament",
                                message: `${item.medicineName} peut interagir avec votre traitement anticoagulant actuel (${currentMedName}).`,
                                type: 'INTERACTION'
                            });
                        }
                    });
                });
            });
        }

        itemsWithMedData.forEach(({ item, dbMed, rawMed }) => {
            const { name, hasAdultStrength } = drugRulesService.parseMedicine(item.medicineName);
            const doseInfo = item.dosage.toLowerCase();

            // 2. Check Database-level Interactions & Contraindications
            if (dbMed) {
                // Drug-Drug Interactions
                if (dbMed.majorInteractions) {
                    itemsWithMedData.forEach(({ item: otherItem, dbMed: otherDbMed }) => {
                        if (item.id === otherItem.id) return;

                        // Check if the other medicine (or its group/ingredient) is in the interaction list
                        const interaction = dbMed.majorInteractions?.find((inter: any) =>
                            otherItem.medicineName.toUpperCase().includes(inter.with.toUpperCase()) ||
                            (otherDbMed?.interactionGroup && inter.with.toUpperCase().includes(otherDbMed.interactionGroup.toUpperCase())) ||
                            (otherDbMed?.active_ingredient && inter.with.toUpperCase().includes(otherDbMed.active_ingredient.toUpperCase()))
                        );

                        if (interaction) {
                            alerts.push({
                                severity: interaction.severity === 'absolute' ? 'CRITIQUE' : 'ATTENTION',
                                title: "INTERACTION MÉDICAMENTEUSE",
                                message: `${item.medicineName} + ${otherItem.medicineName} : ${interaction.risk}`,
                                type: 'INTERACTION'
                            });
                        }
                    });
                }

                // Structured allergy tags vs. medicine identity/composition/contraindication notes
                // Enhanced to check: brand name, active ingredient (DCI), composition, interaction group, contraindication notes
                (patient.allergyTags || []).forEach(tag => {
                    const haystackParts = [
                        item.medicineName,
                        dbMed.active_ingredient,
                        dbMed.category,
                        dbMed.interactionGroup,
                        ...(dbMed.contraindicationNotes || [])
                    ];

                    // Add composition from raw medicament if available
                    if (rawMed?.composition && Array.isArray(rawMed.composition)) {
                        haystackParts.push(...rawMed.composition);
                    }

                    const haystack = haystackParts.filter(Boolean).join(' ').toUpperCase();

                    const keywords = ALLERGY_KEYWORDS[tag];
                    const matched = keywords
                        ? keywords.some(k => haystack.includes(k))
                        : haystack.includes(tag.toUpperCase());

                    if (matched) {
                        alerts.push({
                            severity: 'CRITIQUE',
                            title: `CONTRE-INDICATION ALLERGIE : ${tag.toUpperCase()}`,
                            message: `${item.medicineName} : patient allergique à ${tag}, ce médicament appartient à cette famille ou la contient.`,
                            type: 'CONTRE_INDICATION'
                        });
                    }
                });

                // Contraindications from Array
                if (dbMed.contraindications) {
                    dbMed.contraindications.forEach((c: any) => {
                        let violation = false;
                        if (c.type === 'pregnancy' && patient.isPregnant) {
                            if (c.minWeeks && patient.pregnancyWeeks && patient.pregnancyWeeks >= c.minWeeks) violation = true;
                            else if (c.maxWeeks && patient.pregnancyWeeks && patient.pregnancyWeeks <= c.maxWeeks) violation = true;
                            else if (!c.minWeeks && !c.maxWeeks) violation = true;
                        }
                        else if (c.type === 'breastfeeding' && patient.isBreastfeeding) violation = true;
                        else if (c.type === 'heart' && patient.isHeartPatient) violation = true;
                        else if (c.type === 'kidney' && patient.isKidneyPatient) violation = true;
                        else if (c.type === 'liver' && patient.isLiverPatient) violation = true;

                        if (violation) {
                            alerts.push({
                                severity: c.severity === 'absolute' ? 'CRITIQUE' : 'ATTENTION',
                                title: `CONTRE-INDICATION ${c.type.toUpperCase()}`,
                                message: `${item.medicineName} : ${c.message}`,
                                type: 'CONTRE_INDICATION'
                            });
                        }
                    });
                }

                // Structured allergy tags vs. medicine identity/contraindication notes
                (patient.allergyTags || []).forEach(tag => {
                    const haystack = [
                        item.medicineName,
                        dbMed.active_ingredient,
                        dbMed.category,
                        dbMed.interactionGroup,
                        ...(dbMed.contraindicationNotes || [])
                    ].filter(Boolean).join(' ').toUpperCase();

                    const keywords = ALLERGY_KEYWORDS[tag];
                    const matched = keywords
                        ? keywords.some(k => haystack.includes(k))
                        : haystack.includes(tag.toUpperCase());

                    if (matched) {
                        alerts.push({
                            severity: 'CRITIQUE',
                            title: `CONTRE-INDICATION ALLERGIE : ${tag.toUpperCase()}`,
                            message: `${item.medicineName} : patient allergique à ${tag}, ce médicament appartient à cette famille ou la contient.`,
                            type: 'CONTRE_INDICATION'
                        });
                    }
                });

                // Legacy Boolean Flags (Redundancy check)
                if (dbMed.isAdultOnly && isChild) {
                    alerts.push({
                        severity: 'CRITIQUE',
                        title: "RESTRICTION ADULTE",
                        message: `${item.medicineName} : Ce médicament est marqué comme réservé aux adultes.`,
                        type: 'ENFANT_INTERDIT'
                    });
                }

                if (dbMed.isPregnantForbidden && patient.isPregnant && !alerts.some(a => a.type === 'CONTRE_INDICATION' && a.message.includes('grossesse'))) {
                    alerts.push({
                        severity: 'CRITIQUE',
                        title: "CONTRE-INDICATION GROSSESSE",
                        message: `${item.medicineName} : Ce médicament est formellement interdit pendant la grossesse.`,
                        type: 'CONTRE_INDICATION'
                    });
                }

                if (dbMed.isHeartForbidden && patient.isHeartPatient) {
                    alerts.push({
                        severity: 'CRITIQUE',
                        title: "CONTRE-INDICATION CARDIAQUE",
                        message: `${item.medicineName} : Ce médicament est contre-indiqué en cas de pathologie cardiaque.`,
                        type: 'CONTRE_INDICATION'
                    });
                }

                if (dbMed.isKidneyForbidden && patient.isKidneyPatient) {
                    alerts.push({
                        severity: 'ATTENTION',
                        title: "PRÉCAUTION RÉNALE",
                        message: `${item.medicineName} : Attention, ce médicament nécessite une adaptation de dose ou un suivi en cas d'insuffisance rénale.`,
                        type: 'CONTRE_INDICATION'
                    });
                }

                if (dbMed.isLiverForbidden && patient.isLiverPatient) {
                    alerts.push({
                        severity: 'ATTENTION',
                        title: "PRÉCAUTION HÉPATIQUE",
                        message: `${item.medicineName} : Attention, ce médicament nécessite une surveillance ou est déconseillé en cas d'insuffisance hépatique.`,
                        type: 'CONTRE_INDICATION'
                    });
                }

                if (dbMed.restriction && isChild) {
                    const { minAge, maxAge, reason } = dbMed.restriction;
                    if (minAge && ptAge > 0 && ptAge < minAge) {
                        alerts.push({
                            severity: 'CRITIQUE',
                            title: "ÂGE MINIMUM NON ATTEINT",
                            message: `${item.medicineName} : Âge minimum requis est ${minAge} ans. ${reason || ''}`,
                            type: 'ENFANT_INTERDIT'
                        });
                    }
                }
            }

            // 3. Static System Rules (Pediatric)
            if (!isChild && patient.type !== 'Child') return;

            DRUG_RULES.forEach(rule => {
                const matchKeyword = rule.keywords.some(k => name.includes(k));
                if (!matchKeyword) return;

                let matchStrength = true;
                if (rule.strengthPattern) {
                    matchStrength = rule.strengthPattern.test(name) || rule.strengthPattern.test(doseInfo);
                }

                if (matchStrength) {
                    const ageViolation = rule.minAge && (ptAge > 0 && ptAge < rule.minAge);
                    const weightViolation = rule.minWeight && (ptWeight > 0 && ptWeight < rule.minWeight);

                    if (ageViolation || weightViolation) {
                        alerts.push({
                            severity: rule.severity,
                            title: "Vérification Système",
                            message: `${item.medicineName} : ${rule.message}`,
                            type: 'ENFANT_INTERDIT'
                        });
                    }
                }
            });
        });

        return alerts;
    }
};
