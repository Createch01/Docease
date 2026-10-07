import { describe, it, expect } from 'vitest';
import { localDateStr, localMonthStr } from '../utils/localDate';
import { appSourceFiles } from './helpers/sourceFiles';

describe('dates locales', () => {
    it('le jour change à minuit LOCAL (quel que soit le fuseau de la machine de test)', () => {
        expect(localDateStr(new Date(2026, 9, 7, 0, 30))).toBe('2026-10-07');
        expect(localDateStr(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
        expect(localDateStr(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
        expect(localDateStr(new Date(2027, 0, 1, 0, 5))).toBe('2027-01-01');
        expect(localMonthStr(new Date(2026, 9, 1, 0, 10))).toBe('2026-10');
    });
});

describe('garde-fou : pas de « jour UTC » pour une date de cabinet', () => {
    it("aucun toISOString().split('T')[0] / slice(0, 10) / substring(0, 7|10) dans le code", () => {
        const bad = /toISOString\(\)\s*\.(split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]|slice\(\s*0\s*,\s*(10|7)\s*\)|substring\(\s*0\s*,\s*(10|7)\s*\))/;
        const offenders = appSourceFiles().filter(f => f.file !== 'utils/localDate.ts' && bad.test(f.text)).map(f => f.file);
        expect(offenders, `Utilisez utils/localDate (todayLocal, localDateStr) : ${offenders.join(', ')}`).toEqual([]);
    });
});
