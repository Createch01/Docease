// Centralized display formatters. These only affect rendering — never mutate
// stored values (dates, ages, names stay as-entered in the data layer).

export function formatDate(date?: string | Date | null, withTime = false): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const datePart = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (!withTime) return datePart;

  const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `${datePart} à ${timePart}`;
}

export function calculateAgeYears(dateOfBirth?: string | null): number | undefined {
  if (!dateOfBirth) return undefined;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return undefined;

  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) years -= 1;
  return Math.max(years, 0);
}

export interface BMIResult {
  value: number; // rounded to 1 decimal
  interpretation: 'Maigreur' | 'Normal' | 'Surpoids' | 'Obésité';
}

export function calculateIMC(weightKg?: number, heightCm?: number): BMIResult | undefined {
  if (!weightKg || !heightCm) return undefined;
  const heightM = heightCm / 100;
  if (heightM <= 0) return undefined;

  const raw = weightKg / (heightM * heightM);
  const value = Math.round(raw * 10) / 10;

  let interpretation: BMIResult['interpretation'];
  if (value < 18.5) interpretation = 'Maigreur';
  else if (value < 25) interpretation = 'Normal';
  else if (value < 30) interpretation = 'Surpoids';
  else interpretation = 'Obésité';

  return { value, interpretation };
}

export type AgeCategoryKey = 'newborn' | 'infant' | 'child' | 'adolescent' | 'adult' | 'senior';

export interface AgeCategory {
  key: AgeCategoryKey;
  label: string;
  /** True for the pediatric buckets (newborn through adolescent) — mirrors the <18y "Child" cutoff used elsewhere. */
  isPediatric: boolean;
}

const AGE_CATEGORY_LABELS: Record<AgeCategoryKey, string> = {
  newborn: 'Nouveau-né',
  infant: 'Nourrisson',
  child: 'Enfant',
  adolescent: 'Adolescent',
  adult: 'Adulte',
  senior: 'Senior',
};

/**
 * Age category is always derived from dateOfBirth — never stored or manually
 * selected — so it can never drift from the patient's real age. Returns null
 * when dateOfBirth is absent: callers must show an explicit "unknown" state
 * rather than defaulting to Adult.
 */
export function getAgeCategory(dateOfBirth?: string | null): AgeCategory | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24));
  if (ageInDays < 0) return null;

  const years = calculateAgeYears(dateOfBirth) ?? 0;

  let key: AgeCategoryKey;
  if (ageInDays <= 28) key = 'newborn';
  else if (years < 2) key = 'infant';
  else if (years <= 11) key = 'child';
  else if (years <= 17) key = 'adolescent';
  else if (years <= 64) key = 'adult';
  else key = 'senior';

  return {
    key,
    label: AGE_CATEGORY_LABELS[key],
    isPediatric: key === 'newborn' || key === 'infant' || key === 'child' || key === 'adolescent',
  };
}

export function formatAge(patient: { dateOfBirth?: string | null; age?: number | null }): string {
  if (patient.dateOfBirth) {
    const dob = new Date(patient.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const now = new Date();
      let years = now.getFullYear() - dob.getFullYear();
      let months = now.getMonth() - dob.getMonth();
      let days = now.getDate() - dob.getDate();

      if (days < 0) {
        months -= 1;
        days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      }
      if (months < 0) {
        years -= 1;
        months += 12;
      }

      const totalMonths = years * 12 + months;
      if (years >= 2) return `${years} ans`;
      if (totalMonths >= 1) return `${totalMonths} mois`;
      return `${Math.max(days, 0)} jour${days > 1 ? 's' : ''}`;
    }
  }

  if (patient.age !== undefined && patient.age !== null && patient.age > 0) return `${patient.age} ans`;
  return 'Âge inconnu';
}

export function formatNom(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
