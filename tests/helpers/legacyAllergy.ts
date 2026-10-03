import type { Medicament } from '../../services/drugCatalogService';
import { mapMedicamentToMedicine } from '../../services/drugCatalogService';

/**
 * COPIE VERBATIM de l'ancienne logique d'allergie de services/drugRules.ts (INTERACTION_GROUPS,
 * ALLERGY_KEYWORDS et le bloc « Structured allergy tags vs. medicine identity »), conservée ici
 * uniquement pour le test de non-régression tests/allergyRegression.test.ts.
 * À supprimer avec ce test une fois la non-régression validée.
 */
export const LEGACY_INTERACTION_GROUPS = {
    AINS: ['DICLOFENAC', 'IBUPROFENE', 'MELOXICAM', 'NAPROXENE', 'CELECOXIB', 'AFLAMIC', 'VOLTARENE', 'ADVIL', 'SURGAM', 'PROFENID'],
    ASPIRINE: ['ASPIRINE', 'ACIDE ACETYLSALICYLIQUE', 'ACARD', 'ASPEGIC', 'KARDEGIC'],
};

export const LEGACY_ALLERGY_KEYWORDS: Record<string, string[]> = {
    'Pénicilline': ['PENICILLIN', 'PÉNICILLINE', 'AMOXICILLIN', 'AMOXICILLINE', 'AUGMENTIN', 'ACLAV', 'CLAVULIN', 'AMOXIL', 'ALFAMOX', 'ALMOXEL', 'BETALACTAM', 'BÊTA-LACTAM', 'BETA-LACTAM'],
    'Amoxicilline': ['AMOXICILLIN', 'AMOXICILLINE', 'AUGMENTIN', 'ACLAV', 'CLAVULIN', 'AMOXIL', 'ALFAMOX'],
    'Aspirine': LEGACY_INTERACTION_GROUPS.ASPIRINE,
    'AINS': LEGACY_INTERACTION_GROUPS.AINS,
    'Sulfamides': ['SULFAMIDE', 'SULFAMETHOXAZOLE', 'COTRIMOXAZOLE', 'BACTRIM', 'SULFA'],
    'Iode': ['IODE', 'IODÉ', 'PRODUIT DE CONTRASTE', 'CONTRASTE IODÉ'],
};

/** Texte dans lequel l'ancien code cherchait (nom prescrit, DCI, catégorie, groupe, notes de contre-indication, composition). */
export function legacyHaystack(m: Medicament): string {
    const dbMed = mapMedicamentToMedicine(m);
    const parts: Array<string | undefined> = [
        m.brand_name, dbMed.active_ingredient, dbMed.category, dbMed.interactionGroup, ...(dbMed.contraindicationNotes || []),
    ];
    if (m.composition && Array.isArray(m.composition)) parts.push(...m.composition);
    return parts.filter(Boolean).join(' ').toUpperCase();
}

/** Ancienne règle : mots-clés si la balise en a, sinon sous-chaîne de la balise elle-même. */
export function legacyMatches(tag: string, haystack: string, keywordFilter?: (k: string) => boolean): boolean {
    const keywords = LEGACY_ALLERGY_KEYWORDS[tag];
    return keywords
        ? keywords.filter(keywordFilter ?? (() => true)).some(k => haystack.includes(k))
        : haystack.includes(tag.toUpperCase());
}
