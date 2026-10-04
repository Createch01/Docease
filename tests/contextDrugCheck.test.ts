import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Patient, PrescriptionItem } from '../types';
import { drugRulesService } from '../services/drugRules';
import { LETTERS, loadLetter, getAllLoadedMedicines, type Medicament } from '../services/drugCatalogService';
import { makeEntry } from '../services/medicalReferentials';
import { withContext } from '../services/patientContext';

// Le catalogue réel (avec sa normalisation d'exécution) est chargé via loadLetter, fetch redirigé vers public/.
beforeAll(async () => {
    vi.stubGlobal('fetch', async (url: string) => {
        const file = path.resolve(__dirname, '../public', url.replace(/^\//, ''));
        const body = fs.readFileSync(file, 'utf8');
        return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body } as unknown as Response;
    });
    for (const l of LETTERS) await loadLetter(l);
}, 120_000);

const patient = (over: Partial<Patient> = {}): Patient =>
    ({ id: 'p1', name: 'DUPONT Jean', age: 60, sex: 'M', type: 'Adult', ...over } as Patient);
const item = (name: string, id = `i-${name}`): PrescriptionItem => ({ id, medicineName: name, dosage: '1 cp', frequency: '1 fois par jour', duration: '7 jours' } as PrescriptionItem);
const allergy = (id: string, label: string, reaction?: 'anaphylaxie' | 'eruption') =>
    makeEntry('allergy', { id, label }, { reaction, addedAt: '2026-10-03' });
const patho = (id: string, label: string) => makeEntry('pathology', { id, label }, { addedAt: '2026-10-03' });
const withCtx = (over: Partial<Patient>, ctx: Parameters<typeof withContext>[1]) =>
    withContext(patient(over), ctx) as Patient;

describe('allergie → alerte sur la DCI concernée', () => {
    it('Pénicillines (anaphylaxie) + amoxicilline : CRITIQUE, justification obligatoire, une seule alerte', () => {
        const p = withCtx({}, { allergyList: [allergy('ALG_PENICILLINES', 'Pénicillines', 'anaphylaxie')], pathologyList: [] });
        const alerts = drugRulesService.checkRules(p, [item('ALFAMOX')]).filter(a => a.title.includes('ALLERGIE'));
        expect(alerts).toHaveLength(1); // l'ancien code dupliquait cette alerte
        expect(alerts[0]).toMatchObject({ severity: 'CRITIQUE', requiresJustification: true, itemId: 'i-ALFAMOX' });
        expect(alerts[0].message).toContain('anaphylaxie');
    });

    it('même alerte pour un nom commercial différent (ACLAV, amoxicilline + acide clavulanique)', () => {
        const p = withCtx({}, { allergyList: [allergy('ALG_PENICILLINES', 'Pénicillines')], pathologyList: [] });
        const a = drugRulesService.checkRules(p, [item('ACLAV')]).filter(x => x.title.includes('ALLERGIE'));
        expect(a.map(x => x.severity)).toEqual(['CRITIQUE']);
        expect(a[0].requiresJustification).toBeUndefined();
    });

    it('retirer l\'allergie supprime l\'alerte (la vérification est relancée sur les mêmes médicaments)', () => {
        const items = [item('ALFAMOX')];
        const withA = withCtx({}, { allergyList: [allergy('ALG_PENICILLINES', 'Pénicillines')], pathologyList: [] });
        expect(drugRulesService.checkRules(withA, items).some(a => a.title.includes('ALLERGIE'))).toBe(true);
        const removed = withContext(withA, { allergyList: [] }) as Patient;
        expect(drugRulesService.checkRules(removed, items).some(a => a.title.includes('ALLERGIE'))).toBe(false);
    });

    it('ancien dossier (texte libre « Pénicilline », sans liste codée) : converti à la volée et détecté', () => {
        const legacy = patient({ allergies: 'Pénicilline' });
        const a = drugRulesService.checkRules(legacy, [item('ALFAMOX')]).filter(x => x.title.includes('ALLERGIE'));
        expect(a).toHaveLength(1);
        expect(a[0].severity).toBe('CRITIQUE');
        expect(legacy.allergyList).toBeUndefined(); // lecture seule : rien n'est écrit dans le dossier
    });

    it('allergie « non codée » : aucune alerte automatique, mais rappel de vérification manuelle', () => {
        const p = withCtx({}, { allergyList: [{ label: 'kiwi', coded: false, addedAt: '2026-10-03' }], pathologyList: [] });
        expect(drugRulesService.checkRules(p, [item('ALFAMOX')]).some(a => a.title.includes('ALLERGIE'))).toBe(false);
        const notice = drugRulesService.checkUnstructuredData(p, [item('ALFAMOX')]);
        expect(notice[0].message).toContain('kiwi');
    });

    it('allergie sans lien : pas d\'alerte (Povidone iodée ≠ produit de contraste)', () => {
        const p = withCtx({}, { allergyList: [allergy('ALG_IODE_CONTRASTE', 'Produits de contraste iodés')], pathologyList: [] });
        expect(drugRulesService.checkRules(p, [item('BETADINE')]).some(a => a.title.includes('ALLERGIE'))).toBe(false);
    });
});

describe('pathologies → règles du catalogue', () => {
    const catalog = (): Medicament[] => getAllLoadedMedicines();

    it('insuffisance rénale + stade : alerte de dosage quand la fiche l\'impose, avec le stade', () => {
        const drug = catalog().find(m => m.renal_adjustment?.required === true && m.renal_adjustment.rule && !/contre[- ]?indiqu|interdit|formellement/i.test(m.renal_adjustment.rule))!;
        expect(drug, 'une fiche avec ajustement rénal requis existe').toBeTruthy();
        const p = withCtx({}, { pathologyList: [patho('N18.9', 'Maladie rénale chronique')], renalStage: '15-29', allergyList: [] });
        const a = drugRulesService.checkRules(p, [item(drug.brand_name)]).filter(x => x.title === 'FONCTION RÉNALE');
        expect(a.length).toBeGreaterThan(0);
        expect(a[0].message).toContain('[DFG 15–29]');
    });

    it('DFG ≥ 60 seul : pas d\'alerte rénale de profil', () => {
        const drug = catalog().find(m => m.renal_adjustment?.required === true)!;
        const p = withCtx({}, { pathologyList: [patho('N18.9', 'Maladie rénale chronique')], renalStage: 'ge60', allergyList: [] });
        expect(drugRulesService.checkRules(p, [item(drug.brand_name)]).some(x => x.title === 'FONCTION RÉNALE')).toBe(false);
    });

    it('BAV (I44) + médicament flaggé CI_BAV : CRITIQUE nommant la pathologie', () => {
        const drug = catalog().find(m => m.smart_flags?.includes('CI_BAV'))!;
        expect(drug).toBeTruthy();
        const p = withCtx({}, { pathologyList: [patho('I44', 'Bloc auriculo-ventriculaire (BAV)')], allergyList: [] });
        const a = drugRulesService.checkRules(p, [item(drug.brand_name)]).filter(x => x.title.startsWith('PATHOLOGIE'));
        expect(a.map(x => x.severity)).toContain('CRITIQUE');
        expect(a[0].message).toContain('CI_BAV');
    });

    it('QT long (I45.81) + médicament à risque QT : alerte (une seule par flag, pas de doublon avec le profil cardiaque)', () => {
        const drug = catalog().find(m => m.smart_flags?.some(f => ['ALLONGEMENT_QT', 'QTC_RISQUE', 'QT_RISQUE'].includes(f)))!;
        expect(drug).toBeTruthy();
        const p = withCtx({}, { pathologyList: [patho('I45.81', 'QT long')], allergyList: [] });
        const msgs = drugRulesService.checkRules(p, [item(drug.brand_name)]).map(x => x.message);
        const qt = msgs.filter(m => /QT/.test(m));
        expect(qt.length).toBeGreaterThan(0);
        expect(new Set(qt).size).toBe(qt.length);
    });

    it('anticoagulation au long cours : médicament à risque hémorragique signalé', () => {
        const drug = catalog().find(m => m.smart_flags?.includes('RISQUE_HEMORRAGIE'))!;
        expect(drug).toBeTruthy();
        const p = withCtx({}, { pathologyList: [patho('Z79.01', 'Anticoagulation au long cours')], allergyList: [] });
        expect(drugRulesService.checkRules(p, [item(drug.brand_name)]).some(x => x.title.startsWith('PATHOLOGIE') && x.message.includes('RISQUE_HEMORRAGIE'))).toBe(true);
    });

    it('diabète codé (E11) active le profil diabétique existant', () => {
        const drug = catalog().find(m => m.smart_flags?.some(f => ['DIABETE_RISQUE', 'HYPOGLYCEMIE_RISQUE', 'SUIVI_GLYCEMIE'].includes(f)))!;
        const p = withCtx({}, { pathologyList: [patho('E11', 'Diabète de type 2')], allergyList: [] });
        expect(drugRulesService.checkRules(p, [item(drug.brand_name)]).some(x => x.title === 'DIABÈTE')).toBe(true);
    });
});
