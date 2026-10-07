/**
 * Dates « du jour » en heure LOCALE du poste (Africa/Casablanca au cabinet).
 * Le jour UTC (via toISOString) renvoie la veille entre minuit et 1 h, heure locale :
 * ne jamais s'en servir pour une date de cabinet (tests/localDate.test.ts le vérifie).
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD du jour local de `d`. */
export const localDateStr = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM du mois local de `d`. */
export const localMonthStr = (d: Date = new Date()): string => localDateStr(d).slice(0, 7);

export const todayLocal = (): string => localDateStr();
