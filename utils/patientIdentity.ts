/** Civilité et sexe tels qu'imprimés sur les documents ; vide quand l'information est inconnue. */

export const PEDIATRIC_AGE_LIMIT = 15;

type SexInput = string | null | undefined;
type AgeInput = number | string | null | undefined;

const normalizeSex = (sex: SexInput): 'M' | 'F' | '' => {
  const s = (sex || '').trim().toUpperCase();
  if (s === 'F' || s.startsWith('FEM')) return 'F';
  if (s === 'M' || s === 'H' || s.startsWith('HOM') || s.startsWith('MAS')) return 'M';
  return '';
};

const ageYears = (age: AgeInput): number | undefined => {
  const n = typeof age === 'number' ? age : parseInt(String(age ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** « Enfant » (< 15 ans), sinon « M. » (homme) ou « Mme » (femme) ; rien si le sexe est inconnu. */
export function civility(sex: SexInput, age?: AgeInput, type?: string): 'M.' | 'Mme' | 'Enfant' | '' {
  const years = ageYears(age);
  if ((years !== undefined && years < PEDIATRIC_AGE_LIMIT) || type === 'Child') return 'Enfant';
  const s = normalizeSex(sex);
  return s === 'F' ? 'Mme' : s === 'M' ? 'M.' : '';
}

/** Valeur du champ « Sexe : » — M ou F, vide si inconnu. */
export function sexLetter(sex: SexInput): 'M' | 'F' | '' {
  return normalizeSex(sex);
}
