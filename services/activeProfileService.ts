// ─── Active patient profile ──────────────────────────────────────────────────
//
// A lightweight, standalone safety profile for browsing the drug catalogue —
// distinct from a saved `Patient` record (see types.ts). Lets a clinician
// flag "the patient I'm about to look drugs up for is pregnant / a child /
// renal-impaired / etc." without opening a dossier, so contraindications can
// be cross-checked live while searching.

export interface ActivePatientProfile {
    isChild: boolean;
    childAgeYears?: number;
    // Pregnancy/breastfeeding/organ-status are tri-state: `undefined` means "non renseigné"
    // (unknown), which must never be treated the same as an explicit `false` (known-absent) —
    // a missing status is a data gap to flag, not a green light. See drugRules.ts::checkMissingData.
    isPregnant: boolean | undefined;
    pregnancyWeeks?: number;
    isBreastfeeding: boolean | undefined;
    isRenalImpaired: boolean | undefined;
    isHepaticImpaired: boolean | undefined;
    isCardiac: boolean | undefined;
    isDiabetic: boolean;
}

export const EMPTY_PROFILE: ActivePatientProfile = {
    isChild: false,
    isPregnant: false,
    isBreastfeeding: false,
    isRenalImpaired: false,
    isHepaticImpaired: false,
    isCardiac: false,
    isDiabetic: false,
};

// Profil gardé en mémoire uniquement (jamais écrit sur disque ni dans le localStorage) :
// il décrit l'état de santé du patient en consultation (grossesse, enfant, rénal…).
// Il est remis à zéro à chaque changement de patient et au verrouillage (voir App.tsx).
const LEGACY_STORAGE_KEY = 'docease_active_patient_profile';

/** Supprime l'ancienne copie persistée du profil (à appeler au démarrage). */
export function purgeLegacyActiveProfile(): void {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* stockage indisponible */ }
}

export function isProfileActive(profile: ActivePatientProfile): boolean {
    return (
        profile.isChild || profile.isPregnant || profile.isBreastfeeding ||
        profile.isRenalImpaired || profile.isHepaticImpaired ||
        profile.isCardiac || profile.isDiabetic
    );
}
