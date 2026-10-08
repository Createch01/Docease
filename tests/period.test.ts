import { describe, it, expect, beforeEach } from 'vitest';
import {
    Period, addDays, canGoNext, chartRangeFor, customPeriod, daysInclusive, getPeriod, isFuture, isValidPeriod, mondayOf,
    monthsOf, periodAround, periodLabel, periodToday, resetPeriodStore, setPeriod, shiftPeriod, validateCustom,
} from '../utils/period';

const TODAY = '2026-10-08'; // jeudi

describe('période — semaine ISO (lundi → dimanche)', () => {
    it('la semaine du jeudi 8 octobre 2026 va du 5 au 11 octobre', () => {
        const w = periodAround('week', TODAY);
        expect([w.from, w.to]).toEqual(['2026-10-05', '2026-10-11']);
        expect(periodLabel(w)).toBe('Semaine du 5 au 11 octobre 2026');
    });
    it("un dimanche appartient à la semaine qui se termine ce jour ; un lundi ouvre la sienne", () => {
        expect(mondayOf('2026-10-11')).toBe('2026-10-05');
        expect(mondayOf('2026-10-12')).toBe('2026-10-12');
        expect(periodAround('week', '2026-10-11').to).toBe('2026-10-11');
    });
    it('semaine à cheval sur deux mois et sur deux années : libellé complet', () => {
        expect(periodLabel(periodAround('week', '2026-09-30'))).toBe('Semaine du 28 septembre au 4 octobre 2026');
        const y = periodAround('week', '2025-12-31');
        expect([y.from, y.to]).toEqual(['2025-12-29', '2026-01-04']);
        expect(periodLabel(y)).toBe('Semaine du 29 décembre 2025 au 4 janvier 2026');
    });
});

describe('période — mois, année, jour', () => {
    it('février bissextile : 29 jours ; année non bissextile : 28', () => {
        expect(periodAround('month', '2024-02-10').to).toBe('2024-02-29');
        expect(periodAround('month', '2026-02-10').to).toBe('2026-02-28');
        expect(periodAround('month', '2100-02-10').to).toBe('2100-02-28'); // 2100 n'est pas bissextile
        expect(periodAround('month', '2000-02-10').to).toBe('2000-02-29');
    });
    it('mois : bornes et libellé', () => {
        const m = periodAround('month', '2026-10-17');
        expect([m.from, m.to, periodLabel(m)]).toEqual(['2026-10-01', '2026-10-31', 'Octobre 2026']);
    });
    it('année : 1er janvier → 31 décembre', () => {
        const y = periodAround('year', '2026-10-08');
        expect([y.from, y.to, periodLabel(y)]).toEqual(['2026-01-01', '2026-12-31', 'Année 2026']);
    });
    it('jour : libellé complet avec le jour de la semaine', () => {
        expect(periodLabel(periodAround('day', TODAY))).toBe('Jeudi 8 octobre 2026');
    });
    it('personnalisée : libellé jj/mm/aaaa', () => {
        expect(periodLabel(customPeriod('2026-09-01', '2026-10-08'))).toBe('Du 01/09/2026 au 08/10/2026');
    });
    it('mois touchés par une période (badge « Mois clôturé »)', () => {
        expect(monthsOf(customPeriod('2026-08-20', '2026-10-02'))).toEqual(['2026-08', '2026-09', '2026-10']);
        expect(monthsOf(periodAround('day', TODAY))).toEqual(['2026-10']);
    });
});

describe('période personnalisée — validation', () => {
    it('fin avant début, date inexistante, format libre : refusés', () => {
        expect(validateCustom('2026-10-08', '2026-10-07')).toMatch(/postérieure/);
        expect(validateCustom('2026-02-31', '2026-03-01')).toMatch(/valides/);
        expect(validateCustom('08/10/2026', '2026-10-09')).toMatch(/valides/);
        expect(validateCustom('', '')).toMatch(/valides/);
        expect(() => customPeriod('2026-10-08', '2026-10-07')).toThrow();
    });
    it('366 jours au plus, bornes comprises', () => {
        expect(validateCustom('2026-01-01', '2026-12-31')).toBeNull(); // 365 j
        expect(validateCustom('2024-01-01', '2024-12-31')).toBeNull(); // 366 j (bissextile)
        expect(daysInclusive('2024-01-01', '2024-12-31')).toBe(366);
        expect(validateCustom('2026-01-01', '2027-01-01')).toBeNull(); // 366 jours inclus
        expect(validateCustom('2026-01-01', '2027-01-02')).toMatch(/366/); // 367 jours : refusé
    });
});

describe('période — ‹ et › aux bornes', () => {
    it('jour : › désactivé le jour même, actif la veille', () => {
        expect(canGoNext(periodAround('day', TODAY), TODAY)).toBe(false);
        expect(canGoNext(periodAround('day', '2026-10-07'), TODAY)).toBe(true);
        expect(shiftPeriod(periodAround('day', '2026-10-31'), 1).from).toBe('2026-11-01');
        expect(shiftPeriod(periodAround('day', '2026-03-01'), -1).from).toBe('2026-02-28');
        expect(shiftPeriod(periodAround('day', '2024-03-01'), -1).from).toBe('2024-02-29');
    });
    it("semaine : › désactivé pour la semaine en cours ; ‹ traverse le changement d'année", () => {
        expect(canGoNext(periodAround('week', TODAY), TODAY)).toBe(false);
        expect(canGoNext(periodAround('week', '2026-10-01'), TODAY)).toBe(true);
        const prev = shiftPeriod(periodAround('week', '2026-01-02'), -1);
        expect([prev.from, prev.to]).toEqual(['2025-12-22', '2025-12-28']);
    });
    it('mois : › désactivé pour le mois en cours, actif pour septembre ; passages d\'année', () => {
        expect(canGoNext(periodAround('month', TODAY), TODAY)).toBe(false);
        expect(canGoNext(periodAround('month', '2026-09-15'), TODAY)).toBe(true);
        const dec = shiftPeriod(periodAround('month', '2026-01-20'), -1);
        expect([dec.from, dec.to]).toEqual(['2025-12-01', '2025-12-31']);
        const jan = shiftPeriod(periodAround('month', '2026-12-20'), 1);
        expect([jan.from, jan.to]).toEqual(['2027-01-01', '2027-01-31']);
    });
    it("année : › désactivé pour l'année en cours", () => {
        expect(canGoNext(periodAround('year', TODAY), TODAY)).toBe(false);
        expect(canGoNext(periodAround('year', '2025-05-05'), TODAY)).toBe(true);
        expect(shiftPeriod(periodAround('year', TODAY), -1).from).toBe('2025-01-01');
    });
    it('personnalisée : décalage de sa propre longueur ; › désactivé si la suivante est dans le futur', () => {
        const p = customPeriod('2026-09-01', '2026-09-10'); // 10 jours
        const next = shiftPeriod(p, 1);
        expect([next.from, next.to]).toEqual(['2026-09-11', '2026-09-20']);
        const prev = shiftPeriod(p, -1);
        expect([prev.from, prev.to]).toEqual(['2026-08-22', '2026-08-31']);
        expect(canGoNext(p, TODAY)).toBe(true);
        expect(canGoNext(customPeriod('2026-09-01', TODAY), TODAY)).toBe(false);
    });
    it("« entièrement dans le futur » : une période commencée avant ou aujourd'hui ne l'est pas", () => {
        expect(isFuture(periodAround('day', '2026-10-09'), TODAY)).toBe(true);
        expect(isFuture(periodAround('week', TODAY), TODAY)).toBe(false);
    });
    it("« Aujourd'hui » : même type, contenant le jour", () => {
        expect(periodToday('month', TODAY).from).toBe('2026-10-01');
        const c = periodToday('custom', TODAY, customPeriod('2026-09-01', '2026-09-10'));
        expect([c.from, c.to]).toEqual(['2026-09-29', TODAY]);
    });
});

describe('période — graphique et mémoire de session', () => {
    it('tranches du graphique : relatives à la période choisie', () => {
        expect(chartRangeFor(periodAround('day', TODAY))).toEqual({ from: '2026-09-25', to: TODAY, gran: 'day' });
        expect(chartRangeFor(periodAround('week', TODAY)).gran).toBe('week');
        expect(chartRangeFor(periodAround('month', TODAY))).toEqual({ from: '2025-11-01', to: '2026-10-31', gran: 'month' });
        expect(chartRangeFor(periodAround('year', TODAY))).toEqual({ from: '2022-01-01', to: '2026-12-31', gran: 'year' });
        expect(chartRangeFor(customPeriod('2026-09-01', '2026-10-08')).gran).toBe('day');
        expect(chartRangeFor(customPeriod('2026-01-01', '2026-06-30')).gran).toBe('week');
        expect(chartRangeFor(customPeriod('2025-10-01', '2026-09-30')).gran).toBe('month');
    });
    it("addDays traverse les fins de mois et d'année", () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
    beforeEach(() => resetPeriodStore());
    it('la période choisie est mémorisée pour la session ; une valeur incohérente est refusée', () => {
        const p: Period = periodAround('month', '2026-09-10');
        setPeriod(p);
        expect(getPeriod(TODAY)).toEqual(p);
        setPeriod({ kind: 'month', from: '2026-09-02', to: '2026-09-30' }); // bornes incohérentes : refusé
        expect(getPeriod(TODAY)).toEqual(p);
        expect(isValidPeriod({ kind: 'day', from: '2026-02-31', to: '2026-02-31' })).toBe(false);
        expect(isValidPeriod('x')).toBe(false);
    });
    it('par défaut : le jour courant', () => {
        expect(getPeriod(TODAY)).toEqual(periodAround('day', TODAY));
    });
});
