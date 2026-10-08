import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('components/Analytics.tsx', 'utf8');

describe('Comptabilité C0 — résultat de trésorerie', () => {
    it('le résultat se calcule sur l\'encaissé, jamais sur le facturé', () => {
        expect(src).toContain('const netProfit = recettesEncaissees - totalExpensesPeriod;');
        expect(src).not.toMatch(/netProfit\s*=\s*recettesFacturees/);
    });
    it('libellé « Résultat (encaissé − dépenses) », facturé affiché à part', () => {
        expect(src).toContain("label: 'Résultat (encaissé − dépenses)'");
        expect(src).toContain("label: 'Facturé'");
        expect(src).toContain("label: 'Encaissé'");
    });
    it('le PDF liste les notes annulées à part, comme le CSV', () => {
        expect(src).toContain('Notes annulées (hors totaux) : {cancelledInPeriod');
        expect(src).toContain("Notes annulées (hors totaux)')}");
    });
    it('périodes en jours locaux : aucune comparaison d\'instants UTC', () => {
        expect(src).not.toMatch(/new Date\(dateStr\)/);
        expect(src).not.toContain('toISOString');
        expect(src).toContain('localDateStr(start)');
    });
    it('le graphique trace l\'encaissé et les dépenses (facturé en option)', () => {
        expect(src).toContain('dataMap[key].collected += collectedOf(n);');
        expect(src).toContain('showInvoiced');
    });
    it('titres et onglets : casse normale, ni extra-bold ni majuscules forcées', () => {
        expect(src).not.toMatch(/font-black|font-extrabold|\buppercase\b/);
    });
});
