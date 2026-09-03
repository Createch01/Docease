import type { DrugGroup, ClinicalDivergence } from './pharmaDirService';
import type { ActivePatientProfile } from './activeProfileService';

/**
 * Structural subset of `DrugGroup` this module actually reads. A raw, ungrouped
 * `Medicament` record (services/drugCatalogService.ts) satisfies this directly —
 * it carries the same clinical fields — so the exact same check can run against
 * a single catalog record (PrescriptionEditor) or a consolidated brand group
 * (PharmaDirectory) without duplicating the logic.
 */
export type SafetyCheckable = Pick<DrugGroup, 'pregnancy' | 'children' | 'renal_adjustment' | 'smart_flags' | 'contraindications' | 'needs_manual_review' | 'adverse_effects'> & {
    divergences?: ClinicalDivergence[];
};

export type SafetyCategory =
    | 'grossesse' | 'allaitement' | 'enfant' | 'renal' | 'hepatique' | 'cardiaque' | 'diabete';

export interface SafetyAlert {
    severity: 'CRITIQUE' | 'ATTENTION' | 'INFO';
    category: SafetyCategory;
    /** Exact text pulled from the drug's data — never invented. */
    message: string;
    /** True when this category's clinical field differs between the drug's presentations — message lists each. */
    divergent?: boolean;
}

const CI_TEXT = /contre[- ]?indiqu|interdit|formellement/i;

/** ~40-tag controlled vocabulary confirmed by data audit; free-text/emoji entries are shown separately, never auto-parsed. */
const FLAGS = {
    pregnancy: ['GROSSESSE_CONTRE_INDIQUE', 'GROSSESSE_INTERDIT', 'GROSSESSE_DANGER', 'CI_GROSSESSE', 'TERATOGENE', 'TERATOGENE_MAJEUR', 'GROSSESSE_CATEGORIE_D'],
    pregnancyCaution: ['GROSSESSE_PRUDENCE'],
    breastfeedingForbidden: ['ALLAITEMENT_CONTRE_INDIQUE', 'ALLAITEMENT_INTERDIT'],
    breastfeedingCaution: ['ALLAITEMENT_PRUDENCE'],
    childForbidden: ['ENFANT_INTERDIT', 'ADULTE_SEULEMENT', 'SYNDROME_REYE'],
    childCaution: ['ENFANT_PRUDENCE', 'ENFANT_AVIS_SPECIALISTE'],
    renalForbidden: ['INSUFFISANCE_RENALE_CONTRE_INDIQUE'],
    renalCaution: ['RENAL_PRUDENCE', 'AJUSTEMENT_RENAL', 'SUIVI_RENAL'],
    hepaticForbidden: ['INSUFFISANCE_HEPATIQUE'],
    hepaticCaution: ['HEPATIQUE_PRUDENCE', 'BILAN_HEPATIQUE'],
    cardiacCaution: ['CARDIAQUE_PRUDENCE', 'ALLONGEMENT_QT', 'QTC_RISQUE', 'QT_RISQUE', 'CARDIOPATHIE', 'SUIVI_ECG_QT'],
    diabeticCaution: ['DIABETE_RISQUE', 'HYPOGLYCEMIE_RISQUE', 'SUIVI_GLYCEMIE'],
};

function hasFlag(group: SafetyCheckable, flags: string[]): string | null {
    const found = (group.smart_flags ?? []).find(f => flags.includes(f));
    return found ?? null;
}

/** Scans the free-text contraindications list for a keyword — quotes the exact matching sentence, never paraphrased. */
function findContraindicationMentioning(group: SafetyCheckable, keywordRe: RegExp): string | null {
    return (group.contraindications ?? []).find(c => keywordRe.test(c)) ?? null;
}

/** Scans adverse_effects for a keyword. Returns true if any entry matches. */
function findAdverseEffectMentioning(group: SafetyCheckable, keywordRe: RegExp): boolean {
    return (group.adverse_effects ?? []).some(a => keywordRe.test(a));
}

function divergenceFor(group: SafetyCheckable, field: string) {
    return (group.divergences ?? []).find(d => d.field === field);
}

/**
 * Returns true only when this drug has a *real* renal constraint — i.e. the
 * renal_adjustment field is present AND signals that action is required, or a
 * smart_flag / contraindication mentions renal risk.
 *
 * `{ required: false, rule: null }` and `{ required: false, rule: "Pas d'ajustement nécessaire" }`
 * are the JSON encoding of "no concern" and must NOT trigger the alert.
 */
function hasRealRenalAdjustment(group: SafetyCheckable): boolean {
    if (hasFlag(group, FLAGS.renalForbidden) || hasFlag(group, FLAGS.renalCaution)) return true;
    if (findContraindicationMentioning(group, /r[ée]nal|n[ée]phro|DFG|clairance.*cr[ée]atinine/i)) return true;
    const ra = group.renal_adjustment;
    if (!ra) return false;
    // required: true always signals a real constraint
    if (ra.required === true) return true;
    // required: false with a non-trivial rule (not null, not empty, not "no adjustment needed")
    const NO_ADJUSTMENT_RE = /aucun|pas d['']ajustement|sans objet|non n[ée]cessaire|non requis|ajustement.*non.*n[ée]cessaire|normal|identique|inchang[ée]/i;
    if (ra.required === false && (!ra.rule || NO_ADJUSTMENT_RE.test(ra.rule))) return false;
    // required is undefined/null but rule text is present — treat as relevant
    if (ra.rule && ra.rule.trim().length > 0 && !NO_ADJUSTMENT_RE.test(ra.rule)) return true;
    return false;
}

/**
 * Categories this specific drug carries documented safety data for, independent of any
 * patient profile — used to decide whether an unfilled patient status (renal/hepatic/
 * cardiaque/grossesse/allaitement/diabete) is even worth flagging for the medications
 * actually prescribed, instead of asking about every status for every prescription.
 *
 * Rule: absence of documented data → absence of alert. No data invented.
 */
export function getDocumentedSafetyCategories(group: SafetyCheckable): SafetyCategory[] {
    const categories: SafetyCategory[] = [];
    if (group.pregnancy || hasFlag(group, FLAGS.pregnancy) || hasFlag(group, FLAGS.pregnancyCaution)) {
        categories.push('grossesse');
    }
    if (group.pregnancy?.breastfeeding || hasFlag(group, FLAGS.breastfeedingForbidden) || hasFlag(group, FLAGS.breastfeedingCaution)) {
        categories.push('allaitement');
    }
    if (group.renal_adjustment || hasFlag(group, FLAGS.renalForbidden) || hasFlag(group, FLAGS.renalCaution) || findContraindicationMentioning(group, /r[ée]nal/i)) {
        categories.push('renal');
    }
    if (hasFlag(group, FLAGS.hepaticForbidden) || hasFlag(group, FLAGS.hepaticCaution) || findContraindicationMentioning(group, /h[ée]pat/i)) {
        categories.push('hepatique');
    }
    if (hasFlag(group, FLAGS.cardiacCaution) || findContraindicationMentioning(group, /cardia|cardiovasculaire/i)) {
        categories.push('cardiaque');
    }
    return categories;
}

/**
 * Cross-references a consolidated drug against the active patient profile
 * using only structured fields already present in the data (contraindications,
 * pregnancy, children, renal_adjustment, and the controlled smart_flags
 * vocabulary). Returns every relevant alert — nothing found in the data is
 * hidden, and nothing not found in the data is invented.
 */
export function checkGroupAgainstProfile(group: SafetyCheckable, profile: ActivePatientProfile): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // ── Grossesse ────────────────────────────────────────────────────────────
    if (profile.isPregnant) {
        const div = divergenceFor(group, 'pregnancy');
        if (div) {
            alerts.push({
                severity: 'CRITIQUE',
                category: 'grossesse',
                divergent: true,
                message: `Données de grossesse DIFFÉRENTES selon la présentation — à vérifier avant prescription : ${div.values.map(v => JSON.stringify(v.value)).join(' | ')}`,
            });
        } else if (group.pregnancy) {
            const { category, warning } = group.pregnancy;
            const worstLetter = category && /[DX]/.test(category) ? 'D/X' : null;
            if (warning && CI_TEXT.test(warning)) {
                alerts.push({ severity: 'CRITIQUE', category: 'grossesse', message: warning });
            } else if (worstLetter) {
                alerts.push({ severity: 'CRITIQUE', category: 'grossesse', message: `Catégorie grossesse ${category}${warning ? ' — ' + warning : ''}` });
            } else if (warning) {
                alerts.push({ severity: 'ATTENTION', category: 'grossesse', message: warning });
            } else if (category) {
                alerts.push({ severity: 'ATTENTION', category: 'grossesse', message: `Catégorie grossesse ${category}` });
            }
        } else if (hasFlag(group, FLAGS.pregnancy)) {
            alerts.push({ severity: 'CRITIQUE', category: 'grossesse', message: `Signal système : ${hasFlag(group, FLAGS.pregnancy)}` });
        } else if (hasFlag(group, FLAGS.pregnancyCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'grossesse', message: `Signal système : ${hasFlag(group, FLAGS.pregnancyCaution)}` });
        } else {
            alerts.push({ severity: 'INFO', category: 'grossesse', message: 'Grossesse : donnée non renseignée pour ce médicament.' });
        }
    }

    // ── Allaitement ──────────────────────────────────────────────────────────
    if (profile.isBreastfeeding) {
        const bf = group.pregnancy?.breastfeeding;
        if (bf && CI_TEXT.test(bf)) {
            alerts.push({ severity: 'CRITIQUE', category: 'allaitement', message: bf });
        } else if (hasFlag(group, FLAGS.breastfeedingForbidden)) {
            alerts.push({ severity: 'CRITIQUE', category: 'allaitement', message: `Signal système : ${hasFlag(group, FLAGS.breastfeedingForbidden)}` });
        } else if (bf) {
            alerts.push({ severity: 'ATTENTION', category: 'allaitement', message: bf });
        } else if (hasFlag(group, FLAGS.breastfeedingCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'allaitement', message: `Signal système : ${hasFlag(group, FLAGS.breastfeedingCaution)}` });
        } else {
            alerts.push({ severity: 'INFO', category: 'allaitement', message: 'Allaitement : donnée non renseignée pour ce médicament.' });
        }
    }

    // ── Enfant ───────────────────────────────────────────────────────────────
    if (profile.isChild) {
        const div = divergenceFor(group, 'children');
        if (div) {
            alerts.push({
                severity: 'CRITIQUE',
                category: 'enfant',
                divergent: true,
                message: `Données pédiatriques DIFFÉRENTES selon la présentation — à vérifier avant prescription : ${div.values.map(v => JSON.stringify(v.value)).join(' | ')}`,
            });
        } else if (group.children) {
            const { allowed, min_age, warning } = group.children;
            const ageViolation = min_age != null && profile.childAgeYears != null && profile.childAgeYears < min_age;
            if (allowed === false) {
                alerts.push({ severity: 'CRITIQUE', category: 'enfant', message: warning || `Contre-indiqué chez l'enfant.` });
            } else if (ageViolation) {
                alerts.push({ severity: 'CRITIQUE', category: 'enfant', message: `Âge minimum requis : ${min_age} ans. ${warning || ''}`.trim() });
            } else if (warning) {
                alerts.push({ severity: 'ATTENTION', category: 'enfant', message: warning });
            }
        } else if (hasFlag(group, FLAGS.childForbidden)) {
            alerts.push({ severity: 'CRITIQUE', category: 'enfant', message: `Signal système : ${hasFlag(group, FLAGS.childForbidden)}` });
        } else if (hasFlag(group, FLAGS.childCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'enfant', message: `Signal système : ${hasFlag(group, FLAGS.childCaution)}` });
        } else {
            alerts.push({ severity: 'INFO', category: 'enfant', message: 'Pédiatrie : donnée non renseignée pour ce médicament.' });
        }
    }

    // ── Rénal ────────────────────────────────────────────────────────────────
    // Only fires when the patient IS renally impaired AND the drug documents a real renal constraint.
    // Drugs with no renal data are silent — not flagged as "data missing".
    if (profile.isRenalImpaired) {
        const div = divergenceFor(group, 'renal_adjustment');
        if (div) {
            alerts.push({
                severity: 'ATTENTION',
                category: 'renal',
                divergent: true,
                message: `Données rénales DIFFÉRENTES selon la présentation — à vérifier : ${div.values.map(v => JSON.stringify(v.value)).join(' | ')}`,
            });
        } else if (group.renal_adjustment?.required) {
            const rule = group.renal_adjustment.rule;
            if (rule && CI_TEXT.test(rule)) {
                alerts.push({ severity: 'CRITIQUE', category: 'renal', message: rule });
            } else {
                alerts.push({ severity: 'ATTENTION', category: 'renal', message: rule || 'Adaptation posologique requise en cas d\'insuffisance rénale.' });
            }
        } else if (hasFlag(group, FLAGS.renalForbidden)) {
            alerts.push({ severity: 'CRITIQUE', category: 'renal', message: `Signal système : ${hasFlag(group, FLAGS.renalForbidden)}` });
        } else if (hasFlag(group, FLAGS.renalCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'renal', message: `Signal système : ${hasFlag(group, FLAGS.renalCaution)}` });
        } else {
            const ci = findContraindicationMentioning(group, /r[ée]nal|n[ée]phro|DFG|clairance/i);
            if (ci) alerts.push({ severity: 'ATTENTION', category: 'renal', message: ci });
            // No else: absence of documented renal data = no alert (rule: no data invented)
        }
    }

    // ── Hépatique ────────────────────────────────────────────────────────────
    // Only fires when the drug explicitly documents a hepatic risk.
    if (profile.isHepaticImpaired) {
        if (hasFlag(group, FLAGS.hepaticForbidden)) {
            alerts.push({ severity: 'CRITIQUE', category: 'hepatique', message: `Signal système : ${hasFlag(group, FLAGS.hepaticForbidden)}` });
        } else if (hasFlag(group, FLAGS.hepaticCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'hepatique', message: `Signal système : ${hasFlag(group, FLAGS.hepaticCaution)}` });
        } else {
            const ci = findContraindicationMentioning(group, /h[ée]pat|foie/i);
            if (ci) alerts.push({ severity: 'ATTENTION', category: 'hepatique', message: ci });
            // No else: absence of hepatic data = no alert
        }
    }

    // ── Cardiaque ────────────────────────────────────────────────────────────
    // Only fires when the drug explicitly documents a cardiac risk.
    if (profile.isCardiac) {
        if (hasFlag(group, FLAGS.cardiacCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'cardiaque', message: `Signal système : ${hasFlag(group, FLAGS.cardiacCaution)}` });
        } else {
            const ci = findContraindicationMentioning(group, /cardia|cardiovasculaire|bradycard|tachycard|allongement.*qt|trouble.*rythme|QT/i);
            if (ci) alerts.push({ severity: 'ATTENTION', category: 'cardiaque', message: ci });
            // No else: absence of cardiac data = no alert
        }
    }

    // ── Diabète ──────────────────────────────────────────────────────────────
    // Only fires when the drug explicitly documents a glycaemic risk.
    if (profile.isDiabetic) {
        if (hasFlag(group, FLAGS.diabeticCaution)) {
            alerts.push({ severity: 'ATTENTION', category: 'diabete', message: `Signal système : ${hasFlag(group, FLAGS.diabeticCaution)}` });
        } else {
            const ci = findContraindicationMentioning(group, /diab[eè]t|glyc[ée]mi/i);
            if (ci) alerts.push({ severity: 'ATTENTION', category: 'diabete', message: ci });
            // No else: absence of diabetic data = no alert
        }
    }

    // ── Données nécessitant une vérification manuelle ───────────────────────
    if (group.needs_manual_review) {
        alerts.push({
            severity: 'ATTENTION',
            category: 'diabete',
            message: `Données de sécurité de ce médicament nécessitent une vérification manuelle. Consultation médicale recommandée.`,
        });
    }

    // CRITIQUE first, then ATTENTION, then INFO.
    const order = { CRITIQUE: 0, ATTENTION: 1, INFO: 2 };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
