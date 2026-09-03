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

const STORAGE_KEY = 'docease_active_patient_profile';

export function loadActiveProfile(): ActivePatientProfile {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...EMPTY_PROFILE };
        return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
    } catch {
        return { ...EMPTY_PROFILE };
    }
}

export function saveActiveProfile(profile: ActivePatientProfile): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearActiveProfile(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/** True if any safety-relevant flag is set (used to decide whether to show the safety UI at all). */
export function isProfileActive(profile: ActivePatientProfile): boolean {
    return (
        profile.isChild || profile.isPregnant || profile.isBreastfeeding ||
        profile.isRenalImpaired || profile.isHepaticImpaired ||
        profile.isCardiac || profile.isDiabetic
    );
}
