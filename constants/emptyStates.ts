// Centralized empty-state copy for the patient record — keep wording consistent
// across every section that can render "no data yet" for these fields.
export const EMPTY_STATES = {
  allergies: 'Aucune allergie connue',
  chronicDiseases: 'Aucune maladie déclarée',
  activeTreatment: 'Aucun traitement en cours',
} as const;
