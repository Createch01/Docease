import { describe, it, expect } from 'vitest';
import { buildRecoverySheet } from '../services/recoverySheet';

describe('fiche de secours', () => {
    it('contient date, cabinet, phrase et les consignes hors cabinet', () => {
        const m = buildRecoverySheet('une phrase de passe solide', '  Dr Alami  ', new Date(2026, 9, 4));
        expect(m.cabinet).toBe('Dr Alami');
        expect(m.dateLabel).toContain('2026');
        expect(m.phrase).toBe('une phrase de passe solide');
        expect(m.instructions.join(' ')).toMatch(/HORS du cabinet/);
        expect(m.instructions.join(' ')).toMatch(/irrécupérables/);
    });

    it('prévoit un libellé quand le nom du cabinet est vide', () => {
        expect(buildRecoverySheet('x'.repeat(12), undefined).cabinet).toMatch(/non renseigné/);
        expect(buildRecoverySheet('x'.repeat(12), '   ').cabinet).toMatch(/non renseigné/);
    });
});
