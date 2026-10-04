import { describe, it, expect } from 'vitest';
import { COMMON_ALLERGIES } from '../constants/medicalData';
import { checkAllergies, identityFromMedicament } from '../services/contextSafety';
import { makeEntry, allergyById, normalizeText } from '../services/medicalReferentials';
import type { Medicament } from '../services/drugCatalogService';
import { loadCatalog } from './helpers/catalog';
import { LEGACY_ALLERGY_KEYWORDS, legacyHaystack, legacyMatches } from './helpers/legacyAllergy';

/**
 * Non-régression : tout ce que l'ancien contrôle d'allergie (ALLERGY_KEYWORDS + bloc dupliqué de
 * drugRules.ts) détectait doit l'être par le nouveau moteur ATC / DCI, à deux exceptions
 * volontaires et documentées (EXCEPTIONS ci-dessous).
 */

// Ancienne balise → entrées du référentiel qui la recouvrent.
const TAG_TO_REFS: Record<string, string[]> = {
    'AINS': ['ALG_AINS'], 'Amiodarone': ['ALG_AMIODARONE'], 'Amoxicilline': ['ALG_PENICILLINES'], 'Ampicilline': ['ALG_PENICILLINES'],
    'Arachides': ['ALG_ARACHIDES'], 'Aspirine': ['ALG_ASPIRINE'], 'Bêta-bloquants': ['ALG_BETABLOQUANTS'],
    'Céphalosporines': ['ALG_CEPHALOSPORINES'], 'Ciprofloxacine': ['ALG_QUINOLONES'], 'Clarithromycine': ['ALG_MACROLIDES'],
    'Codéine': ['ALG_OPIOIDES'], 'Cotrimoxazole': ['ALG_SULFAMIDES'], 'Crustacés': ['ALG_CRUSTACES'], 'Diclofénac': ['ALG_AINS'],
    'Érythromycine': ['ALG_MACROLIDES'], 'Ibuprofène': ['ALG_AINS'], 'IEC (captopril, enalapril...)': ['ALG_IEC'],
    'Insuline': ['ALG_INSULINE'], 'Kétoprofène': ['ALG_AINS'], 'Lait': ['ALG_LAIT'], 'Latex': ['ALG_LATEX'],
    'Métformine': ['ALG_METFORMINE'], 'Métronidazole': ['ALG_NITROIMIDAZOLES'], 'Morphine': ['ALG_OPIOIDES'], 'Œufs': ['ALG_OEUFS'],
    'Paracétamol': ['ALG_PARACETAMOL'], 'Pénicilline': ['ALG_PENICILLINES'], 'Poissons': ['ALG_POISSONS'], 'Pollens': ['ALG_POLLENS'],
    'Poussières': ['ALG_ACARIENS'], 'Produits de contraste iodés': ['ALG_IODE_CONTRASTE'], 'Statines': ['ALG_STATINES'],
    'Sulfamides': ['ALG_SULFAMIDES'], 'Tramadol': ['ALG_OPIOIDES'], 'Warfarine': ['ALG_AVK'],
    'Iode': ['ALG_IODE_CONTRASTE'], // balise historique à mots-clés seulement (absente de COMMON_ALLERGIES)
};

/**
 * Exceptions VOLONTAIRES (aucune autre n'est tolérée). Chacune est un faux positif de l'ancien code :
 *  1. 'IODE' / 'IODÉ' : l'ancien code reliait « iode » à tout médicament contenant le mot (povidone iodée,
 *     amiodarone, vitamines iodées…). Décision produit : produits de contraste iodés (V08A), povidone iodée (D08AG)
 *     et fruits de mer n'ont AUCUN lien entre eux. Les mots-clés 'PRODUIT DE CONTRASTE' / 'CONTRASTE IODÉ' restent détectés.
 *  2. 'SULFA' : sous-chaîne trop large — elle correspondait aussi à « sulfate », « sulfite », « sulfure »
 *     (sulfate de magnésium/zinc/fer…), sans rapport avec les sulfamides. Les vrais sulfamides restent détectés.
 *  3. Mot-clé cité seulement comme médicament à ne pas associer (« Association avec ciprofloxacine… »,
 *     « Association à … tramadol… ») : c'est une interaction, pas une allergie à ce médicament.
 *  4. 'LAIT' dans « lait maternel » (passage dans le lait maternel) : l'allaitement n'est pas une allergie au lait.
 */
const norm = (t: string) => normalizeText(t).replace(/[+/]/g, ' ').replace(/\s+/g, ' ');
type Exception = { tag?: string; keyword?: string; why: string; applies: (m: Medicament, keyword: string) => boolean };
const sentencesWith = (m: Medicament, keyword: string) => (m.contraindications ?? []).filter(c => (' ' + norm(c)).includes(' ' + norm(keyword)));
const EXCEPTIONS: Exception[] = [
    { tag: 'Iode', keyword: 'IODE', why: 'iode ≠ produits de contraste (décision produit)', applies: () => true },
    { tag: 'Iode', keyword: 'IODÉ', why: 'iode ≠ produits de contraste (décision produit)', applies: () => true },
    {
        tag: 'Sulfamides', keyword: 'SULFA', why: 'sulfate/sulfite/sulfure ≠ sulfamide',
        applies: (m) => { const w = norm(legacyHaystack(m)).split(' ').filter(x => x.startsWith('sulfa')); return w.length > 0 && w.every(x => /^sulf(ate|ates|ite|ites|ure|ures)/.test(x)); },
    },
    {
        why: 'médicament cité comme association à éviter, pas comme allergène',
        applies: (m, k) => { const s = sentencesWith(m, k); return s.length > 0 && s.every(x => /^\s*(association|interaction)/i.test(x)); },
    },
    {
        tag: 'Lait', keyword: 'LAIT', why: 'lait maternel ≠ allergie au lait de vache',
        applies: (m) => /(^| )lait( |$)/.test(norm(legacyHaystack(m))) && !/(^| )lait (?!maternel)/.test(norm(legacyHaystack(m))),
    },
];
/** Mots-clés qui, seuls, ne doivent PLUS suffire (exceptions 1 et 2 ci-dessus). */
const BARE_KEYWORD_EXCEPTIONS = [{ tag: 'Iode', keyword: 'IODE' }, { tag: 'Iode', keyword: 'IODÉ' }, { tag: 'Sulfamides', keyword: 'SULFA' }];
const findException = (tag: string, keyword: string, m: Medicament) =>
    EXCEPTIONS.find(e => (!e.tag || e.tag === tag) && (!e.keyword || e.keyword === keyword) && e.applies(m, keyword));

const record = (over: Partial<Medicament>): Medicament => ({ id: 'x', brand_name: 'X', generic_name: 'x', strength: null, form: 'cp', ...over } as Medicament);

function newEngineDetects(tag: string, m: Medicament): boolean {
    const entries = TAG_TO_REFS[tag].map(id => makeEntry('allergy', { id, label: allergyById(id)!.label }));
    return checkAllergies(entries, identityFromMedicament(m)).length > 0;
}

describe('non-régression allergies : mots-clés de l\'ancien ALLERGY_KEYWORDS', () => {
    const rows = Object.entries(LEGACY_ALLERGY_KEYWORDS).flatMap(([tag, kws]) => kws.map(k => ({ tag, k })));

    it.each(rows)('$tag / $k', ({ tag, k }) => {
        const asName = record({ brand_name: k, generic_name: k });
        const asNotice = record({ brand_name: 'ZZ', generic_name: 'zz', contraindications: [`Contre-indiqué en cas d'allergie : ${k}.`] });
        // sanity : l'ancien code détectait bien ce mot-clé
        expect(legacyMatches(tag, legacyHaystack(asName))).toBe(true);
        const detected = newEngineDetects(tag, asName) || newEngineDetects(tag, asNotice);
        if (BARE_KEYWORD_EXCEPTIONS.some(e => e.tag === tag && e.keyword === k)) {
            expect(detected, `exception volontaire ${tag}/${k}`).toBe(false);
        } else {
            expect(detected, `${tag}/${k} doit être détecté par le moteur ATC/DCI`).toBe(true);
        }
    });
});

describe('non-régression allergies : catalogue complet (anciennes détections ⊆ nouvelles)', () => {
    const catalog = loadCatalog();
    const tags = [...COMMON_ALLERGIES, 'Iode'];

    it('chaque ancienne balise est couverte par le référentiel', () => {
        expect(tags.filter(t => !TAG_TO_REFS[t])).toEqual([]);
    });

    it('aucune ancienne détection réelle n\'est perdue', { timeout: 120_000 }, () => {
        const report: string[] = [];
        const lost: string[] = [];
        for (const tag of tags) {
            let oldCount = 0, newCount = 0, both = 0, substringOnly = 0, excepted = 0;
            for (const m of catalog) {
                const hay = legacyHaystack(m);
                const old = legacyMatches(tag, hay);
                const now = newEngineDetects(tag, m);
                if (old) oldCount++;
                if (now) newCount++;
                if (old && now) both++;
                if (!old) continue;
                if (now) continue;
                // ancien-seulement : exception volontaire ? faux positif de sous-chaîne ? sinon perte réelle.
                const keptKeywords = (LEGACY_ALLERGY_KEYWORDS[tag] ?? [tag.toUpperCase()]).filter(k => hay.includes(k));
                const realKeywords = keptKeywords.filter(k => !findException(tag, k, m));
                if (realKeywords.length === 0) { excepted++; continue; }
                const strict = realKeywords.some(k => (' ' + norm(hay)).includes(' ' + norm(k)));
                if (!strict) { substringOnly++; continue; }
                lost.push(`${tag} → ${m.brand_name} (${m.generic_name}) [${realKeywords.join(', ')}]`);
            }
            report.push(`${tag.padEnd(34)} ancien=${String(oldCount).padStart(4)} nouveau=${String(newCount).padStart(4)} communs=${String(both).padStart(4)} exceptions=${excepted} sous-chaîne=${substringOnly}`);
        }
        // eslint-disable-next-line no-console
        console.log('\nRÉSULTAT DE NON-RÉGRESSION (catalogue ' + catalog.length + ' fiches)\n' + report.join('\n') + (lost.length ? '\nPERTES RÉELLES :\n' + lost.join('\n') : '\nPERTES RÉELLES : aucune'));
        expect(lost).toEqual([]);
    });
});

describe('moteur ATC/DCI : comportements demandés', () => {
    const med = (brand: string, generic: string, atc: string, ci: string[] = []) => record({ brand_name: brand, generic_name: generic, atc_code: atc, contraindications: ci });
    const alerts = (refId: string, m: Medicament, reaction?: 'anaphylaxie' | 'eruption') =>
        checkAllergies([makeEntry('allergy', { id: refId, label: allergyById(refId)!.label }, { reaction })], identityFromMedicament(m));

    it('pénicilline + amoxicilline → CRITIQUE', () => {
        const a = alerts('ALG_PENICILLINES', med('ALFAMOX', 'Amoxicilline', 'J01CA04'));
        expect(a).toHaveLength(1);
        expect(a[0].severity).toBe('CRITIQUE');
    });

    it('anaphylaxie : même famille CRITIQUE avec justification obligatoire ; sans anaphylaxie, pas d\'obligation', () => {
        const ana = alerts('ALG_PENICILLINES', med('ACLAV', 'Amoxicilline + Acide clavulanique', 'J01CR02'), 'anaphylaxie');
        expect(ana[0]).toMatchObject({ severity: 'CRITIQUE', requiresJustification: true });
        expect(alerts('ALG_PENICILLINES', med('ACLAV', 'Amoxicilline + Acide clavulanique', 'J01CR02'), 'eruption')[0].requiresJustification).toBeUndefined();
    });

    it('pénicillines → céphalosporines : réactivité croisée ATTENTION (jamais CRITIQUE)', () => {
        const a = alerts('ALG_PENICILLINES', med('ROCEPHINE', 'Ceftriaxone', 'J01DD04'), 'anaphylaxie');
        expect(a).toHaveLength(1);
        expect(a[0].severity).toBe('ATTENTION');
        expect(a[0].requiresJustification).toBeUndefined();
    });

    it('IEC → sartans et sacubitril : ATTENTION (angio-œdème) ; IEC → IEC : CRITIQUE', () => {
        for (const [brand, generic, atc] of [['COZAAR', 'Losartan', 'C09CA01'], ['ENTRESTO', 'Sacubitril + Valsartan', 'C09DX04']]) {
            const a = alerts('ALG_IEC', med(brand, generic, atc));
            expect(a.map(x => x.severity)).toEqual(['ATTENTION']);
            expect(a[0].message).toContain('angio-œdème');
        }
        expect(alerts('ALG_IEC', med('TRIATEC', 'Ramipril', 'C09AA05'))[0].severity).toBe('CRITIQUE');
    });

    it('AINS ↔ aspirine : réactivité croisée ATTENTION dans les deux sens', () => {
        expect(alerts('ALG_AINS', med('KARDEGIC', 'Acetylsalicylate de lysine', 'N02BA01'))[0].severity).toBe('ATTENTION');
        expect(alerts('ALG_ASPIRINE', med('VOLTARENE', 'Diclofenac', 'M01AB05'))[0].severity).toBe('ATTENTION');
        expect(alerts('ALG_AINS', med('VOLTARENE', 'Diclofenac', 'M01AB05'))[0].severity).toBe('CRITIQUE');
    });

    it('iode : contraste iodé (V08A) ≠ povidone iodée (D08AG) ≠ amiodarone ≠ gadolinium ; fruits de mer sans lien', () => {
        const contrast = med('VISIPAQUE', 'Iodixanol (produit de contraste)', 'V08AB09');
        const povidone = med('BETADINE', 'Povidone iodee', 'D08AG02');
        const amio = med('CORDARONE', 'Amiodarone', 'C01BD01');
        const gado = med('DOTAREM', 'Acide gadotérique', 'V08CA02');
        expect(alerts('ALG_IODE_CONTRASTE', contrast)[0].severity).toBe('CRITIQUE');
        for (const m of [povidone, amio, gado]) expect(alerts('ALG_IODE_CONTRASTE', m)).toEqual([]);
        expect(alerts('ALG_POVIDONE_IODEE', povidone)[0].severity).toBe('CRITIQUE');
        for (const m of [contrast, amio]) expect(alerts('ALG_POVIDONE_IODEE', m)).toEqual([]);
        for (const m of [contrast, povidone]) expect(alerts('ALG_CRUSTACES', m)).toEqual([]);
    });

    it('nouvelles allergies : héparines (B01AB) et allopurinol (M04AA01) ; fébuxostat non concerné', () => {
        expect(alerts('ALG_HEPARINES_TIH', med('LOVENOX', 'Enoxaparine', 'B01AB05'))[0].severity).toBe('CRITIQUE');
        expect(alerts('ALG_ALLOPURINOL', med('ZYLORIC', 'Allopurinol', 'M04AA01'))[0].severity).toBe('CRITIQUE');
        expect(alerts('ALG_ALLOPURINOL', med('ADENURIC', 'Fébuxostat', 'M04AA03'))).toEqual([]);
    });

    it('statines (intolérance) : libellé renommé et détection par ATC', () => {
        expect(allergyById('ALG_STATINES')!.label).toBe('Statines (intolérance)');
        expect(alerts('ALG_STATINES', med('TAHOR', 'Atorvastatine', 'C10AA05'))[0].severity).toBe('CRITIQUE');
    });

    it('une entrée non codée n\'est jamais vérifiée automatiquement', () => {
        const free = [{ label: 'pénicilline maison', coded: false, addedAt: '2026-01-01' }];
        expect(checkAllergies(free, identityFromMedicament(med('ALFAMOX', 'Amoxicilline', 'J01CA04')))).toEqual([]);
    });
});
