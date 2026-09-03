// ─── Medicament form validation (spec §2) ────────────────────────────────────
//
// Pure, framework-free so it's directly unit-testable and reused identically
// by the create and edit flows. Every rule here is a HARD block — the caller
// must refuse to save while errors.length > 0. Warnings (e.g. composition/
// generic_name mismatch, spec §4) are handled separately in
// medicamentAdminService.checkCompositionConsistency — non-blocking by design.

import type { Medicament } from './drugCatalogService';

export interface ValidationError {
    field: string;
    message: string;
}

function hasNonEmptyCompositionName(composition: Medicament['composition']): boolean {
    if (!Array.isArray(composition)) return false;
    return composition.some(c => (typeof c === 'string' ? c : (c as any)?.name)?.trim());
}

/** pregnancy is "documented" once any sub-field carries an explicit value — including a literal "Non documenté" note. */
export function isPregnancyDocumented(p: Medicament['pregnancy'] | undefined): boolean {
    return !!(p && (p.category?.trim() || p.warning?.trim() || p.breastfeeding?.trim()));
}

/** children is "documented" once allowed is explicitly set (true/false) or a warning/dose_rule note exists. */
export function isChildrenDocumented(c: Medicament['children'] | undefined): boolean {
    return !!(c && (c.allowed !== undefined || c.warning?.trim() || c.dose_rule?.trim()));
}

export interface MedicamentDraft extends Medicament {
    /** Explicit "aucune contre-indication connue" checkbox — must be deliberately checked, never defaulted. */
    noKnownContraindications?: boolean;
    /** Explicit justification for a missing ATC code (spec §2/§3). */
    noAtcJustified?: boolean;
}

export function validateMedicament(draft: MedicamentDraft): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!draft.brand_name?.trim()) {
        errors.push({ field: 'brand_name', message: 'Le nom commercial est obligatoire.' });
    }

    if (!hasNonEmptyCompositionName(draft.composition)) {
        errors.push({
            field: 'composition',
            message: 'La composition doit contenir au moins un principe actif nommé.',
        });
    }

    if (!draft.atc_code?.trim() && !draft.noAtcJustified) {
        errors.push({
            field: 'atc_code',
            message: 'Code ATC manquant : cochez une justification (complément alimentaire, dispositif médical…) ou renseignez-le.',
        });
    }

    const hasContraindications = Array.isArray(draft.contraindications) && draft.contraindications.some(c => c?.trim());
    if (!hasContraindications && !draft.noKnownContraindications) {
        errors.push({
            field: 'contraindications',
            message: 'Renseignez les contre-indications, ou cochez explicitement "aucune contre-indication connue".',
        });
    }

    if (!isPregnancyDocumented(draft.pregnancy)) {
        errors.push({
            field: 'pregnancy',
            message: 'Le champ grossesse doit être renseigné, même avec "non documenté".',
        });
    }

    if (!isChildrenDocumented(draft.children)) {
        errors.push({
            field: 'children',
            message: 'Le champ enfants doit être renseigné, même avec "non documenté".',
        });
    }

    return errors;
}
