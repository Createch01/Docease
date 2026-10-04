import { describe, it, expect } from 'vitest';
import { cabinetSetupState } from '../services/cabinetSetup';

describe('cabinetSetupState', () => {
    it('est incomplet tant que le nom ou l’INPE est vide', () => {
        expect(cabinetSetupState({}).complete).toBe(false);
        expect(cabinetSetupState({ nameFr: 'Dr X', inpe: '' }).complete).toBe(false);
        expect(cabinetSetupState({ nameFr: '  ', inpe: '123' }).complete).toBe(false);
    });
    it('est complet avec nom et INPE', () => {
        const s = cabinetSetupState({ nameFr: 'Dr X', inpe: '123456' });
        expect(s.complete).toBe(true);
        expect(s.hasContact).toBe(false);
        expect(s.hasLogo).toBe(false);
    });
});
