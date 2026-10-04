import type { ContextEntry, Patient, RenalStage } from '../types';
import { deriveProfileFlags, makeEntry, migrateLegacyContext } from './medicalReferentials';

// ─── Contexte patient codé : construction, synchronisation, enregistrement ───
// Logique pure (sans React ni stockage) pour que l'écran de consultation et les tests
// partagent exactement les mêmes règles.

export interface ContextState {
    allergyList: ContextEntry[];
    pathologyList: ContextEntry[];
    noKnownAllergy?: boolean;
    renalStage?: RenalStage;
}

/** Entrées génériques ajoutées pour les anciens indicateurs Cardiaque / Rénal / Hépatique. */
export const SHORTCUT_REFS = {
    cardiac: { id: 'I51.9', label: 'Cardiopathie (sans précision)' },
    renal: { id: 'N18.9', label: 'Maladie rénale chronique' },
    hepatic: { id: 'K72.9', label: 'Insuffisance hépatique' },
} as const;
export type ShortcutKey = keyof typeof SHORTCUT_REFS;

const SHORTCUT_PROFILE: Record<ShortcutKey, 'isHeartPatient' | 'isKidneyPatient' | 'isLiverPatient'> = {
    cardiac: 'isHeartPatient', renal: 'isKidneyPatient', hepatic: 'isLiverPatient',
};

export interface BuiltContext extends ContextState {
    /** true quand le contexte vient d'être converti depuis l'ancien format (à enregistrer par le médecin). */
    migrated: boolean;
}

/** Lit le contexte d'un dossier ; convertit l'ancien texte libre / tags / indicateurs si la liste codée n'existe pas encore. */
export function buildContextFromPatient(p: Patient, today?: string): BuiltContext {
    const migrated = !p.allergyList || !p.pathologyList;
    const allergyList = p.allergyList
        ?? migrateLegacyContext('allergy', [p.allergyTags, p.allergiesOtherTags, p.allergies], today);

    let pathologyList = p.pathologyList
        ?? migrateLegacyContext('pathology', [p.pathologyTags, p.pathologiesOtherTags, p.pathologies, p.chronicDiseases], today);

    if (!p.pathologyList) {
        // Les anciens boutons Cardiaque / Rénal / Hépatique n'avaient pas de pathologie associée.
        let derived = deriveProfileFlags(pathologyList, p.renalStage);
        (Object.keys(SHORTCUT_REFS) as ShortcutKey[]).forEach(k => {
            const flag = SHORTCUT_PROFILE[k];
            if (p[flag] && !derived[flag]) {
                pathologyList = [...pathologyList, { ...makeEntry('pathology', SHORTCUT_REFS[k], today ? { addedAt: today } : {}), note: `indicateur « ${k === 'cardiac' ? 'cardiaque' : k === 'renal' ? 'rénal' : 'hépatique'} » de l'ancien dossier` }];
                derived = deriveProfileFlags(pathologyList, p.renalStage);
            }
        });
    }
    return { allergyList, pathologyList, noKnownAllergy: p.noKnownAllergy, renalStage: p.renalStage, migrated };
}

/** Applique un changement de contexte à l'état patient en recalculant les indicateurs dérivés. */
export function withContext<T extends Partial<Patient>>(patient: T, next: Partial<ContextState>): T {
    const merged = { ...patient, ...next } as T;
    const flags = deriveProfileFlags(merged.pathologyList, merged.renalStage);
    return {
        ...merged,
        isHeartPatient: flags.isHeartPatient,
        isKidneyPatient: flags.isKidneyPatient,
        isLiverPatient: flags.isLiverPatient,
        // Ajouter une allergie annule « aucune allergie connue ».
        ...((next.allergyList && next.allergyList.length > 0) ? { noKnownAllergy: false } : {}),
    };
}

/** Raccourci actif quand une pathologie codée portant ce profil est présente. */
export function shortcutActive(p: Partial<Patient>, key: ShortcutKey): boolean {
    return !!withContext(p, {})[SHORTCUT_PROFILE[key]];
}

/** Bascule un raccourci : ajoute / retire l'entrée générique. Un raccourci actif via d'autres pathologies n'est pas désactivé. */
export function toggleShortcut(p: Partial<Patient>, key: ShortcutKey): Partial<Patient> {
    const list = p.pathologyList || [];
    const ref = SHORTCUT_REFS[key];
    const hasGeneric = list.some(e => e.ref === ref.id);
    if (hasGeneric) {
        const next = withContext(p, { pathologyList: list.filter(e => e.ref !== ref.id) });
        return key === 'renal' && !deriveProfileFlags(next.pathologyList).isKidneyPatient ? { ...next, renalStage: undefined } : next;
    }
    if (shortcutActive(p, key)) return p;
    return withContext(p, { pathologyList: [...list, makeEntry('pathology', ref)] });
}

const labelsOf = (list: ContextEntry[], coded: boolean) => list.filter(e => e.coded === coded).map(e => e.label);

/**
 * Dossier mis à jour avec le contexte saisi, ou null si rien n'a changé.
 * Les champs historiques (texte, tags, indicateurs) sont resynchronisés car d'autres écrans
 * (liste, dossier, ordonnance imprimée) ne lisent que ceux-là ; le texte d'origine reste
 * retrouvable dans `legacyContext` et dans la `note` de chaque entrée migrée.
 */
export function buildContextSave(
    profile: Patient,
    state: ContextState,
    author: string,
    now: string = new Date().toISOString(),
): Patient | null {
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const unchanged = !!profile.allergyList && !!profile.pathologyList
        && same(profile.allergyList, state.allergyList) && same(profile.pathologyList, state.pathologyList)
        && !!profile.noKnownAllergy === !!state.noKnownAllergy && profile.renalStage === state.renalStage;
    if (unchanged) return null;

    const flags = deriveProfileFlags(state.pathologyList, state.renalStage);
    const hadLegacy = !!(profile.allergies || profile.pathologies || profile.allergyTags?.length || profile.pathologyTags?.length
        || profile.allergiesOtherTags?.length || profile.pathologiesOtherTags?.length);
    return {
        ...profile,
        allergyList: state.allergyList,
        pathologyList: state.pathologyList,
        noKnownAllergy: state.allergyList.length > 0 ? false : !!state.noKnownAllergy,
        renalStage: deriveProfileFlags(state.pathologyList).isKidneyPatient ? state.renalStage : undefined,
        isHeartPatient: flags.isHeartPatient,
        isKidneyPatient: flags.isKidneyPatient,
        isLiverPatient: flags.isLiverPatient,
        allergyTags: labelsOf(state.allergyList, true),
        allergiesOtherTags: labelsOf(state.allergyList, false),
        pathologyTags: labelsOf(state.pathologyList, true),
        pathologiesOtherTags: labelsOf(state.pathologyList, false),
        allergies: state.allergyList.map(e => e.label).join(', '),
        pathologies: state.pathologyList.map(e => e.label).join(', '),
        contextUpdatedAt: now,
        contextUpdatedBy: author,
        ...(!profile.legacyContext && hadLegacy ? {
            legacyContext: {
                allergies: profile.allergies, pathologies: profile.pathologies,
                allergyTags: profile.allergyTags, allergiesOtherTags: profile.allergiesOtherTags,
                pathologyTags: profile.pathologyTags, pathologiesOtherTags: profile.pathologiesOtherTags,
                chronicDiseases: profile.chronicDiseases,
            },
        } : {}),
    };
}
