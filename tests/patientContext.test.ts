import { describe, it, expect } from 'vitest';
import type { Patient } from '../types';
import { buildContextFromPatient, buildContextSave, shortcutActive, toggleShortcut, withContext } from '../services/patientContext';
import { makeEntry } from '../services/medicalReferentials';

const base = (over: Partial<Patient> = {}): Patient => ({ id: 'p1', name: 'DUPONT Jean', age: 60, sex: 'M', type: 'Adult', ...over } as Patient);
const D = '2026-10-03';

describe('lecture du contexte (migration)', () => {
    it("convertit l'ancien texte libre, les tags et les indicateurs", () => {
        const p = base({
            allergies: 'Pénicilline, Kiwi', allergyTags: ['AINS'],
            pathologies: 'HTA', pathologyTags: ['Asthme'], chronicDiseases: ['Diabète type 2'],
            isHeartPatient: true, isKidneyPatient: true,
        });
        const c = buildContextFromPatient(p, D);
        expect(c.migrated).toBe(true);
        expect(c.allergyList.map(e => [e.ref ?? e.label, e.coded])).toEqual([
            ['ALG_AINS', true], ['ALG_PENICILLINES', true], ['Kiwi', false],
        ]);
        expect(c.pathologyList.map(e => [e.ref ?? e.label, e.coded])).toEqual([
            ['J45', true], ['I10', true], ['E11', true], ['I51.9', true], ['N18.9', true],
        ]);
        // les champs d'origine ne sont pas modifiés
        expect(p.allergies).toBe('Pénicilline, Kiwi');
    });

    it('un indicateur déjà couvert par une pathologie codée ne crée pas de doublon générique', () => {
        const c = buildContextFromPatient(base({ pathologies: 'Insuffisance cardiaque', isHeartPatient: true }), D);
        expect(c.pathologyList.map(e => e.ref)).toEqual(['I50']);
    });

    it('relit tel quel un dossier déjà codé', () => {
        const allergyList = [makeEntry('allergy', { id: 'ALG_LATEX', label: 'Latex' }, { reaction: 'anaphylaxie' })];
        const c = buildContextFromPatient(base({ allergyList, pathologyList: [], noKnownAllergy: false }), D);
        expect(c.migrated).toBe(false);
        expect(c.allergyList).toBe(allergyList);
    });
});

describe('raccourcis Cardiaque / Rénal / Hépatique et indicateurs dérivés', () => {
    it('bascule ajoute puis retire l\'entrée générique et synchronise les booléens', () => {
        let p: Partial<Patient> = withContext({ pathologyList: [], allergyList: [] }, {});
        p = toggleShortcut(p, 'cardiac');
        expect(p.isHeartPatient).toBe(true);
        expect(shortcutActive(p, 'cardiac')).toBe(true);
        p = toggleShortcut(p, 'cardiac');
        expect(p.isHeartPatient).toBe(false);
        expect(p.pathologyList).toEqual([]);
    });

    it("un raccourci actif via une pathologie précise n'est pas désactivé en silence", () => {
        const p = withContext({ pathologyList: [makeEntry('pathology', { id: 'I50', label: 'Insuffisance cardiaque' })], allergyList: [] }, {});
        expect(shortcutActive(p, 'cardiac')).toBe(true);
        expect(toggleShortcut(p, 'cardiac')).toBe(p);
    });

    it('rénal : le stade ≥ 60 seul ne déclenche pas l\'indicateur ; retirer le raccourci efface le stade', () => {
        let p: Partial<Patient> = withContext({ pathologyList: [], allergyList: [] }, {});
        p = toggleShortcut(p, 'renal');
        expect(p.isKidneyPatient).toBe(true);
        p = withContext(p, { renalStage: 'ge60' });
        expect(p.isKidneyPatient).toBe(false);
        p = withContext(p, { renalStage: '15-29' });
        expect(p.isKidneyPatient).toBe(true);
        p = toggleShortcut(p, 'renal');
        expect(p.renalStage).toBeUndefined();
        expect(p.isKidneyPatient).toBe(false);
    });

    it('ajouter une allergie annule « aucune allergie connue »', () => {
        const p = withContext({ noKnownAllergy: true, allergyList: [], pathologyList: [] }, { allergyList: [makeEntry('allergy', { id: 'ALG_LATEX', label: 'Latex' })] });
        expect(p.noKnownAllergy).toBe(false);
    });
});

describe('enregistrement dans le dossier', () => {
    const state = () => ({
        allergyList: [makeEntry('allergy', { id: 'ALG_PENICILLINES', label: 'Pénicillines' }, { reaction: 'anaphylaxie', addedAt: D })],
        pathologyList: [makeEntry('pathology', { id: 'N18.9', label: 'Maladie rénale chronique' }, { addedAt: D }), { label: 'reins fragiles', coded: false, addedAt: D }],
        noKnownAllergy: false,
        renalStage: '30-59' as const,
    });

    it('écrit listes, indicateurs, miroirs historiques, date et auteur', () => {
        const profile = base({ allergies: 'pénicilline', pathologies: 'insuffisance rénale' });
        const out = buildContextSave(profile, state(), 'Dr Alami', '2026-10-03T10:00:00.000Z')!;
        expect(out.allergyList).toHaveLength(1);
        expect(out.isKidneyPatient).toBe(true);
        expect(out.renalStage).toBe('30-59');
        expect(out.contextUpdatedAt).toBe('2026-10-03T10:00:00.000Z');
        expect(out.contextUpdatedBy).toBe('Dr Alami');
        expect(out.allergies).toBe('Pénicillines');
        expect(out.pathologyTags).toEqual(['Maladie rénale chronique']);
        expect(out.pathologiesOtherTags).toEqual(['reins fragiles']);
        // l'ancien texte reste retrouvable
        expect(out.legacyContext).toMatchObject({ allergies: 'pénicilline', pathologies: 'insuffisance rénale' });
    });

    it("ne touche pas au dossier (null) si rien n'a changé, et ne réécrit pas legacyContext", () => {
        const first = buildContextSave(base({ allergies: 'x' }), state(), 'Dr A', 'T1')!;
        expect(buildContextSave(first, state(), 'Dr B', 'T2')).toBeNull();
        const changed = buildContextSave(first, { ...state(), renalStage: 'lt15' }, 'Dr B', 'T2')!;
        expect(changed.contextUpdatedBy).toBe('Dr B');
        expect(changed.legacyContext).toEqual(first.legacyContext);
    });

    it('« aucune allergie connue » est enregistré distinctement de « non renseigné »', () => {
        const none = buildContextSave(base(), { allergyList: [], pathologyList: [], noKnownAllergy: true }, 'Dr A', 'T1')!;
        expect(none.noKnownAllergy).toBe(true);
        expect(none.allergies).toBe('');
        const unset = buildContextSave(base({ allergyList: [], pathologyList: [], noKnownAllergy: true }), { allergyList: [], pathologyList: [], noKnownAllergy: false }, 'Dr A', 'T2')!;
        expect(unset.noKnownAllergy).toBe(false);
    });
});
