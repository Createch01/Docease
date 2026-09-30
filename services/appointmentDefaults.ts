import { AppointmentSettings, AppointmentTypeDef, DaySchedule } from '../types';

export const DEFAULT_APPOINTMENT_TYPES: AppointmentTypeDef[] = [
  { id: 'consultation', name: 'Consultation', duration: 20, color: '#1A6B8A' },
  { id: 'controle', name: 'Contrôle', duration: 15, color: '#2ECC9A' },
  { id: 'ecg-echo', name: 'ECG / Échographie', duration: 30, color: '#8B5CF6' },
];

const workDay = (): DaySchedule => ({
  closed: false,
  morning: { start: '09:00', end: '13:00' },
  afternoon: { start: '15:00', end: '19:00' },
});

// Indices 0 (dimanche) à 6 (samedi).
const defaultWeek = (): DaySchedule[] => [
  { closed: true, morning: null, afternoon: null },
  workDay(), workDay(), workDay(), workDay(), workDay(),
  { closed: false, morning: { start: '09:00', end: '13:00' }, afternoon: null },
];

export const defaultAppointmentSettings = (): AppointmentSettings => ({
  version: 1,
  mode: 'time',
  weekly: defaultWeek(),
  slotStep: 10,
  maxPerDay: 15,
  maxPerHalfDay: { morning: null, afternoon: null },
  reservedPerDay: 2,
  types: DEFAULT_APPOINTMENT_TYPES.map(t => ({ ...t })),
  closures: [],
  dayOverrides: {},
});

/**
 * Complète un enregistrement partiel ou ancien avec les valeurs par défaut :
 * ne jette jamais de données, ne fait que combler les champs manquants.
 * `legacyCapacities` = ancien meddoc_capacities ({ 'YYYY-MM-DD': limite }).
 */
export const normalizeAppointmentSettings = (raw: any, legacyCapacities?: any): AppointmentSettings => {
  const base = defaultAppointmentSettings();
  const s: AppointmentSettings = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...base, ...raw } : base;
  if (!Array.isArray(s.weekly) || s.weekly.length !== 7) s.weekly = base.weekly;
  if (!Array.isArray(s.types) || s.types.length === 0) s.types = base.types;
  if (!Array.isArray(s.closures)) s.closures = [];
  s.maxPerHalfDay = { ...base.maxPerHalfDay, ...(s.maxPerHalfDay || {}) };
  s.dayOverrides = { ...(s.dayOverrides || {}) };
  if (legacyCapacities && typeof legacyCapacities === 'object' && !Array.isArray(legacyCapacities)) {
    Object.entries(legacyCapacities).forEach(([date, limit]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof limit === 'number' && limit > 0 && !s.dayOverrides[date]) {
        s.dayOverrides[date] = { maxPerDay: limit };
      }
    });
  }
  return s;
};
