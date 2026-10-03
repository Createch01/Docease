import type { ContextEntry, RenalStage } from '../types';
import type { Medicament } from './drugCatalogService';
import {
    AllergyRef, CrossReactivity, allergyById, normalizeText, pathologyById, SafetySeverity,
} from './medicalReferentials';

// ─── Vérification de sécurité pilotée par les référentiels ───────────────────
// Lien allergie → médicament par code ATC / DCI / nom commercial (jamais par simple
// sous-chaîne), lien pathologie → médicament par smart_flags existantes du catalogue.
// Aucun appel externe : tout est local et déterministe.

/** Identité d'un médicament, que l'on parte d'une fiche du catalogue ou d'une ligne d'ordonnance seule. */
export interface DrugIdentity {
    name: string;                       // nom tel que prescrit
    brandName?: string;
    genericName?: string;
    composition?: string[];
    atcCode?: string;
    classText?: string[];               // drug_class / therapeutic_group, pour l'affichage uniquement
    contraindications?: string[];
    smartFlags?: string[];
}

export interface ContextAlert {
    severity: 'CRITIQUE' | 'ATTENTION';
    title: string;
    message: string;
    type: 'CONTRE_INDICATION';
    /** Identifiant stable : une alerte déjà justifiée ne réapparaît pas quand l'ordonnance change. */
    id: string;
    requiresJustification?: boolean;
}

export type AllergyMatchKind = 'direct' | 'cross' | 'mention';

export interface AllergyMatch {
    kind: AllergyMatchKind;
    /** Pour 'cross' : nom de la famille croisée ; pour 'mention' : la phrase exacte de la fiche. */
    detail?: string;
    note?: string;
    /** 'mention' : la phrase vient de la classe thérapeutique de la fiche et non d'une contre-indication. */
    fromClass?: boolean;
}

/** Identité à partir d'une fiche du catalogue (`name` = nom tel que prescrit). */
export function identityFromMedicament(m: Medicament, name: string = m.brand_name): DrugIdentity {
    return {
        name, brandName: m.brand_name, genericName: m.generic_name, composition: m.composition, atcCode: m.atc_code,
        classText: [m.therapeutic_group, m.drug_class].filter((x): x is string => !!x),
        contraindications: m.contraindications, smartFlags: m.smart_flags,
    };
}

// ─── Correspondance ──────────────────────────────────────────────────────────

/** Normalise pour la comparaison : sans accents, « + » et « / » traités comme des séparateurs de mots. */
const forMatch = (s: string) => normalizeText(s).replace(/[+/]/g, ' ').replace(/\s+/g, ' ').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Terme présent comme début de mot (ex. « amoxicillin » ⊂ « amoxicilline », mais pas « sulfa » dans « polysulfate »). */
function hasWordPrefix(haystack: string, term: string): boolean {
    const t = forMatch(term);
    return !!t && (' ' + haystack).includes(' ' + t);
}

/** Pour le texte libre des fiches : les termes courts doivent être un mot entier (évite « ains » dans « ainsi »). */
function hasTextTerm(haystack: string, term: string): boolean {
    const t = forMatch(term);
    if (!t) return false;
    const re = new RegExp('(?:^| )' + escapeRe(t) + (t.length <= 4 ? 's?(?: |$)' : ''));
    return re.test(haystack);
}

function directMatch(id: DrugIdentity, atc: string[], dci: string[], brands: string[] = []): boolean {
    const code = (id.atcCode || '').toUpperCase();
    if (code && atc.some(p => code.startsWith(p.toUpperCase()))) return true;
    const hay = forMatch([id.name, id.brandName, id.genericName, ...(id.composition || [])].filter(Boolean).join(' '));
    return [...dci, ...brands].some(t => hasWordPrefix(hay, t));
}

function crossTarget(c: CrossReactivity): { atc: string[]; dci: string[]; brands: string[] } {
    const target = allergyById(c.ref);
    return {
        atc: [...(target?.match.atc ?? []), ...(c.atc ?? [])],
        dci: [...(target?.match.dci ?? []), ...(c.dci ?? [])],
        brands: target?.match.brands ?? [],
    };
}

/** Meilleure correspondance d'une allergie du référentiel avec un médicament (direct > croisée > mention dans la fiche). */
export function matchAllergy(ref: AllergyRef, drug: DrugIdentity): AllergyMatch | null {
    if (directMatch(drug, ref.match.atc, ref.match.dci, ref.match.brands)) return { kind: 'direct' };

    for (const c of ref.crossReactivity ?? []) {
        const t = crossTarget(c);
        if (directMatch(drug, t.atc, t.dci, t.brands)) return { kind: 'cross', detail: c.label, note: c.note };
    }

    for (const sentence of drug.contraindications ?? []) {
        const hay = forMatch(sentence);
        if (ref.match.text.some(t => hasTextTerm(hay, t))) return { kind: 'mention', detail: sentence };
    }

    // Classe thérapeutique de la fiche (ex. « Diurétique, sulfamide », « produit de contraste »).
    for (const cls of drug.classText ?? []) {
        const hay = forMatch(cls);
        if (ref.match.text.some(t => hasTextTerm(hay, t))) return { kind: 'mention', detail: cls, fromClass: true };
    }
    return null;
}

const REACTION_LABEL: Record<string, string> = {
    eruption: 'éruption', oedeme: 'œdème', anaphylaxie: 'anaphylaxie', inconnue: 'réaction inconnue',
};

// ─── Alertes allergie ────────────────────────────────────────────────────────

export function checkAllergies(entries: ContextEntry[], drug: DrugIdentity): ContextAlert[] {
    const alerts: ContextAlert[] = [];
    for (const e of entries) {
        if (!e.coded) continue;                       // « non codé » : jamais vérifié automatiquement
        const ref = allergyById(e.ref);
        if (!ref) continue;
        const m = matchAllergy(ref, drug);
        if (!m) continue;
        const id = `ctx:allergie:${e.ref}:${normalizeText(drug.name)}`;
        const reaction = e.reaction ? ` (${REACTION_LABEL[e.reaction] ?? e.reaction})` : '';
        if (m.kind === 'direct') {
            const anaphylaxis = e.reaction === 'anaphylaxie';
            alerts.push({
                severity: 'CRITIQUE', type: 'CONTRE_INDICATION', id,
                title: `CONTRE-INDICATION ALLERGIE : ${ref.label.toUpperCase()}`,
                message: `${drug.name} : patient allergique à ${ref.label}${reaction}, ce médicament appartient à cette famille ou la contient.`
                    + (anaphylaxis ? ' Réaction anaphylactique : une justification clinique est obligatoire pour maintenir cette prescription.' : ''),
                ...(anaphylaxis ? { requiresJustification: true } : {}),
            });
        } else if (m.kind === 'cross') {
            alerts.push({
                severity: 'ATTENTION', type: 'CONTRE_INDICATION', id,
                title: `ALLERGIE : RÉACTIVITÉ CROISÉE (${ref.label.toUpperCase()})`,
                message: `${drug.name} : patient allergique à ${ref.label}${reaction} ; ce médicament relève de la famille ${m.detail}${m.note ? ` (${m.note})` : ''}.`,
            });
        } else {
            alerts.push({
                severity: 'ATTENTION', type: 'CONTRE_INDICATION', id,
                title: `ALLERGIE : MENTION DANS LA FICHE (${ref.label.toUpperCase()})`,
                message: `${drug.name} : patient allergique à ${ref.label}${reaction} ; ${m.fromClass ? 'la fiche classe ce médicament' : 'la fiche du médicament indique'} : « ${(m.detail || '').slice(0, 240)} ».`,
            });
        }
    }
    return alerts;
}

// ─── Alertes pathologie (smart_flags documentées par le catalogue) ───────────

export function checkPathologyFlags(entries: ContextEntry[], drug: DrugIdentity, alreadyReported: string[] = []): ContextAlert[] {
    const alerts: ContextAlert[] = [];
    const flags = new Set(drug.smartFlags ?? []);
    const seen = new Set<string>();
    for (const e of entries) {
        if (!e.coded) continue;
        const ref = pathologyById(e.ref);
        if (!ref) continue;
        for (const rule of ref.rules.flags) {
            if (!flags.has(rule.flag)) continue;
            const key = `${rule.flag}`;
            // La même smart_flag déjà signalée par le contrôle de profil, ou par une autre pathologie, n'est pas répétée.
            if (seen.has(key) || alreadyReported.some(m => m.includes(`Signal système : ${rule.flag}`))) continue;
            seen.add(key);
            alerts.push({
                severity: rule.severity as SafetySeverity, type: 'CONTRE_INDICATION',
                id: `ctx:pathologie:${e.ref}:${rule.flag}:${normalizeText(drug.name)}`,
                title: `PATHOLOGIE : ${ref.label.toUpperCase()}`,
                message: `${drug.name} : Signal système : ${rule.flag} (patient : ${ref.label}).`,
            });
        }
    }
    return alerts;
}

// ─── Profil de sécurité dérivé du contexte ───────────────────────────────────

export const RENAL_STAGE_LABEL: Record<RenalStage, string> = {
    'ge60': 'DFG ≥ 60', '30-59': 'DFG 30–59', '15-29': 'DFG 15–29', 'lt15': 'DFG < 15',
};

/** Allergies non codées / pathologies non codées : à croiser à la main avec l'ordonnance. */
export function uncodedLabels(entries: ContextEntry[] | undefined): string[] {
    return (entries ?? []).filter(e => !e.coded).map(e => e.label);
}
