import { describe, it, expect } from 'vitest';
import {
    ALLERGY_REFS, PATHOLOGY_REFS, toSuggestItems, searchSuggestions, itemMatches, normalizeText,
    migrateLegacyContext, deriveProfileFlags, findExactRef, makeEntry,
} from '../services/medicalReferentials';
import { loadCatalog } from './helpers/catalog';

const patho = toSuggestItems('pathology');
const allergy = toSuggestItems('allergy');
const labels = (r: { label: string }[]) => r.map(x => x.label);

describe('référentiels — intégrité', () => {
    it('identifiants uniques et libellés non vides', () => {
        for (const list of [ALLERGY_REFS, PATHOLOGY_REFS]) {
            const ids = list.map(i => i.id);
            expect(new Set(ids).size).toBe(ids.length);
            list.forEach(i => expect(i.label.trim()).not.toBe(''));
        }
    });

    it('toute smart_flag citée par une pathologie existe dans le catalogue (aucun lien inventé)', () => {
        const known = new Set(loadCatalog().flatMap(m => m.smart_flags ?? []));
        const missing = PATHOLOGY_REFS.flatMap(p => p.rules.flags.map(f => f.flag).filter(f => !known.has(f)).map(f => `${p.id}:${f}`));
        expect(missing).toEqual([]);
    });

    it('chaque préfixe ATC des allergies médicamenteuses correspond à au moins une fiche', () => {
        const atcs = loadCatalog().map(m => (m.atc_code || '').toUpperCase());
        const orphans = ALLERGY_REFS.flatMap(a => a.match.atc.filter(p => !atcs.some(c => c.startsWith(p))).map(p => `${a.id}:${p}`));
        expect(orphans).toEqual([]);
    });

    it('iode : contraste iodé, povidone iodée et crustacés sont indépendants', () => {
        const get = (id: string) => ALLERGY_REFS.find(a => a.id === id)!;
        for (const id of ['ALG_IODE_CONTRASTE', 'ALG_POVIDONE_IODEE', 'ALG_CRUSTACES']) {
            expect(get(id).crossReactivity ?? []).toEqual([]);
        }
        expect(get('ALG_IODE_CONTRASTE').match.atc).toEqual(['V08A']);
        expect(get('ALG_POVIDONE_IODEE').match.atc).toEqual(['D08AG']);
    });

    it('réactivités croisées demandées : IEC→sartans/sacubitril, AINS↔aspirine', () => {
        const iec = ALLERGY_REFS.find(a => a.id === 'ALG_IEC')!;
        expect(iec.crossReactivity!.flatMap(c => c.atc ?? [])).toEqual(expect.arrayContaining(['C09C', 'C09D', 'C09DX04']));
        expect(ALLERGY_REFS.find(a => a.id === 'ALG_AINS')!.crossReactivity!.map(c => c.ref)).toContain('ALG_ASPIRINE');
        expect(ALLERGY_REFS.find(a => a.id === 'ALG_ASPIRINE')!.crossReactivity!.map(c => c.ref)).toContain('ALG_AINS');
    });
});

describe('recherche', () => {
    it('ne propose rien avant 2 caractères', () => {
        expect(searchSuggestions(patho, 'h')).toEqual([]);
        expect(searchSuggestions(patho, ' ')).toEqual([]);
    });

    it('insensible aux accents et à la casse', () => {
        const a = labels(searchSuggestions(allergy, 'penicilline'));
        const b = labels(searchSuggestions(allergy, 'PÉNICILLINE'));
        expect(a).toContain('Pénicillines');
        expect(b).toEqual(a);
        expect(labels(searchSuggestions(allergy, 'oeuf'))).toContain('Œufs');
        expect(labels(searchSuggestions(allergy, 'œuf'))).toContain('Œufs');
        expect(labels(searchSuggestions(patho, 'ulcere'))).toContain('Ulcère gastro-duodénal');
    });

    it('trouve par synonyme, abréviation et code CIM-10', () => {
        expect(labels(searchSuggestions(patho, 'hta'))).toContain('Hypertension artérielle (HTA)');
        expect(labels(searchSuggestions(patho, 'tension'))).toContain('Hypertension artérielle (HTA)');
        expect(labels(searchSuggestions(patho, 'sucre'))).toEqual(expect.arrayContaining(['Diabète de type 2', 'Diabète de type 1']));
        expect(labels(searchSuggestions(patho, 'I10'))).toContain('Hypertension artérielle (HTA)');
        expect(labels(searchSuggestions(patho, 'qt long'))).toContain('QT long (syndrome du QT long)');
        expect(labels(searchSuggestions(allergy, 'augmentin'))).toContain('Pénicillines');
        expect(labels(searchSuggestions(allergy, 'ibuprofene'))).toContain('AINS (anti-inflammatoires non stéroïdiens)');
    });

    it('ordre : usage du médecin, puis spécialité (cardiologie), puis alphabétique', () => {
        const base = searchSuggestions(patho, 'insuffisance', { specialty: 'cardiologie', limit: 50 }).map(i => i.id);
        // rang cardiologie 1 (I25, I50, I38) → rang 2 (N18.9) → sans rang, alphabétique par libellé (K72.9 puis J96)
        expect(base.slice(0, 3)).toEqual(['I25', 'I50', 'I38']);
        expect(base[3]).toBe('N18.9');
        expect(base.indexOf('K72.9')).toBeLessThan(base.indexOf('J96'));

        const used = searchSuggestions(patho, 'insuffisance', { specialty: 'cardiologie', usage: { 'K72.9': 5 }, limit: 50 });
        expect(used[0].id).toBe('K72.9');

        const alpha = searchSuggestions(allergy, 'ine', { limit: 50 }).map(i => i.label);
        expect(alpha).toEqual([...alpha].sort((x, y) => x.localeCompare(y, 'fr')));
    });

    it('exclut les entrées déjà choisies', () => {
        expect(searchSuggestions(patho, 'hta', { exclude: ['I10'] }).map(i => i.id)).not.toContain('I10');
    });

    it('à 2 caractères, seul un début de terme ou de mot correspond ; normalisation', () => {
        expect(itemMatches(patho.find(i => i.id === 'E11')!, 'be')).toBe(false);
        expect(normalizeText('Diabète  Type 2')).toBe('diabete type 2');
    });
});

describe("migration de l'ancien texte libre", () => {
    it("code si correspondance exacte, sinon « non codé » ; conserve le texte d'origine", () => {
        const r = migrateLegacyContext('allergy', ['Pénicilline, Poussières', 'Kiwi'], '2026-01-01');
        expect(r).toEqual([
            { ref: 'ALG_PENICILLINES', label: 'Pénicillines', coded: true, addedAt: '2026-01-01', note: 'Pénicilline' },
            { ref: 'ALG_ACARIENS', label: 'Acariens / poussières', coded: true, addedAt: '2026-01-01', note: 'Poussières' },
            { label: 'Kiwi', coded: false, addedAt: '2026-01-01' },
        ]);
    });

    it('fusionne tags et texte, sans doublon, séparateurs , ; et retours à la ligne', () => {
        const r = migrateLegacyContext('pathology', [['Hypertension artérielle (HTA)', 'Asthme'], 'HTA; asthme\nreins fragiles'], '2026-01-01');
        expect(r.map(e => [e.ref ?? null, e.coded])).toEqual([['I10', true], ['J45', true], [null, false]]);
        expect(r[2].label).toBe('reins fragiles');
    });

    it("un libellé presque identique n'est PAS codé (pas de correspondance floue)", () => {
        expect(migrateLegacyContext('pathology', 'hta sévère')[0].coded).toBe(false);
        expect(findExactRef('pathology', 'HTA')?.id).toBe('I10');
    });

    it("n'altère pas les sources et accepte les valeurs vides", () => {
        const tags = ['Asthme'];
        migrateLegacyContext('pathology', [tags, undefined, '']);
        expect(tags).toEqual(['Asthme']);
        expect(migrateLegacyContext('allergy', [undefined, ''])).toEqual([]);
    });
});

describe('indicateurs de profil dérivés', () => {
    const e = (id: string) => makeEntry('pathology', { id, label: id });
    it('cardiaque / rénal / hépatique / diabète selon les pathologies codées', () => {
        expect(deriveProfileFlags([e('I50'), e('E11')])).toMatchObject({ isHeartPatient: true, isDiabetic: true, isKidneyPatient: false, isLiverPatient: false });
        expect(deriveProfileFlags([e('K74')]).isLiverPatient).toBe(true);
    });
    it('rénal : stade inconnu ou < 60 active, ≥ 60 seul non', () => {
        expect(deriveProfileFlags([e('N18.9')]).isKidneyPatient).toBe(true);
        expect(deriveProfileFlags([e('N18.9')], '30-59').isKidneyPatient).toBe(true);
        expect(deriveProfileFlags([e('N18.9')], 'ge60').isKidneyPatient).toBe(false);
    });
    it("une entrée non codée n'active rien", () => {
        expect(deriveProfileFlags([{ label: 'cœur fragile', coded: false, addedAt: '2026-01-01' }]).isHeartPatient).toBe(false);
    });
});
