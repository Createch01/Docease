import { describe, expect, it } from 'vitest';
import { REASON_LABELS, composeReason } from '../components/ReasonPicker';
import { rxHeaderNameConflicts, rxMakeElement } from '../components/editor/rxEditorModel';

describe('composeReason (même règle que reasons.rs)', () => {
    it('accepte chaque libellé de la liste, précision facultative', () => {
        for (const l of REASON_LABELS.filter(x => x !== 'Autre')) {
            expect(composeReason(l, '')).toBe(l);
            expect(composeReason(l, '  une  précision ')).toBe(`${l} — une précision`);
        }
    });
    it('« Autre » exige 10 caractères', () => {
        expect(composeReason('Autre', '')).toBe('');
        expect(composeReason('Autre', '123456789')).toBe('');
        expect(composeReason('Autre', '1234567890')).toBe('Autre — 1234567890');
    });
    it('refuse un libellé hors liste', () => {
        expect(composeReason('erreur de saisie', '')).toBe('');
    });
});

describe('rxHeaderNameConflicts', () => {
    const text = (t: string, extra = {}) => rxMakeElement('text', { text: t, bind: '', ...extra });
    it('signale un nom arabe ou français différent de l\'identité', () => {
        const els = [text('د. أحمد العلوي'), text('Dr Ahmed ALAOUI')];
        expect(rxHeaderNameConflicts(els, { nameFr: 'Dr Salma BENNANI', nameAr: 'د. سلمى بناني' })).toHaveLength(2);
    });
    it('ne signale ni nom identique, ni champ lié, ni texte quelconque, ni élément masqué', () => {
        const els = [text('د. سلمى بناني'), text('Dr Salma BENNANI'), text('Drainage lymphatique'), text('Dr Autre', { bind: 'name' }), text('Dr Caché', { visible: false })];
        expect(rxHeaderNameConflicts(els, { nameFr: 'Dr Salma BENNANI', nameAr: 'د. سلمى بناني' })).toEqual([]);
    });
});
