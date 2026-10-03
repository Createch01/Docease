import { describe, it, expect } from 'vitest';
import { toSuggestItems, suggestedItems, groupItems, frequentIds, PATHOLOGY_REFS, ALLERGY_REFS } from '../services/medicalReferentials';

const allergies = toSuggestItems('allergy');
const patho = toSuggestItems('pathology');
const labels = (l: { label: string; short?: string }[]) => l.map(i => i.short ?? i.label);

describe('suggestions au clic', () => {
    it('allergies : 10 plus fréquentes, dans l\'ordre de la liste', () => {
        const s = suggestedItems(allergies, 'allergy');
        expect(s).toHaveLength(10);
        expect(labels(s).slice(0, 7)).toEqual(['Pénicillines', 'AINS', 'Aspirine', 'Sulfamides', 'Céphalosporines', 'Produits de contraste iodés', 'Codéine / opioïdes']);
        expect(labels(s)).toContain('Latex');
    });

    it('pathologies : liste cardiologie vs liste générale', () => {
        const cardio = labels(suggestedItems(patho, 'pathology', {}, 'cardiologie'));
        expect(cardio.slice(0, 5)).toEqual(['HTA', 'Diabète de type 2', 'Insuffisance cardiaque', 'Fibrillation auriculaire', 'Cardiopathie ischémique']);
        expect(cardio).toEqual(expect.arrayContaining(['Dyslipidémie', 'Cardiopathie rhumatismale', 'Asthme']));
        expect(labels(suggestedItems(patho, 'pathology', {}, undefined))).toContain('BPCO');
    });

    it('les plus utilisés par ce médecin passent d\'abord, sans dépasser 10', () => {
        const s = suggestedItems(patho, 'pathology', { K29: 9, F10: 4 }, 'cardiologie');
        expect(s.map(i => i.id).slice(0, 2)).toEqual(['K29', 'F10']);
        expect(s).toHaveLength(10);
    });

    it('chaque identifiant « fréquent » existe dans le référentiel', () => {
        const ids = new Set([...ALLERGY_REFS, ...PATHOLOGY_REFS].map(i => i.id));
        for (const id of [...frequentIds('allergy'), ...frequentIds('pathology'), ...frequentIds('pathology', 'cardiologie')]) expect(ids.has(id)).toBe(true);
    });

    it('« Voir tout » : toutes les entrées, groupées par catégorie', () => {
        const a = groupItems(allergies, 'allergy');
        expect(a.map(g => g.label)).toEqual(['Médicamenteuses', 'Non médicamenteuses']);
        expect(a.reduce((n, g) => n + g.items.length, 0)).toBe(ALLERGY_REFS.length);
        const p = groupItems(patho, 'pathology');
        expect(p[0].label).toBe('Cardio');
        expect(p.map(g => g.label)).toEqual(expect.arrayContaining(['Rénal', 'Hépatique', 'Endocrino', 'Respiratoire', 'Digestif', 'Neuro / psy']));
        expect(p.reduce((n, g) => n + g.items.length, 0)).toBe(PATHOLOGY_REFS.length);
    });
});
