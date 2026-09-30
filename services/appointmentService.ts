/**
 * Règles métier du module Rendez-vous. Fonctions pures (réglages et RDV passés
 * en paramètre) : la prise de RDV et le déplacement passent par les mêmes
 * contrôles (checkBooking).
 */
import { Appointment, AppointmentSettings, AppointmentTypeDef, DaySchedule, Patient } from '../types';
import { dataService } from './dataService';
import { calculateAgeYears, getAgeCategory } from '../utils/formatters';

// ─── Dates en heure locale (toISOString donne la date UTC : décalée d'un jour au Maroc) ───
const pad = (n: number) => String(n).padStart(2, '0');
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayStr = () => toDateStr(new Date());
export const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};
export const mondayOf = (s: string) => {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateStr(d);
};
export const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const toTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const formatDayLong = (s: string) => {
  const t = parseDate(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** RDV qui occupent une place (annulé = place libérée). */
export const isActive = (a: Appointment) => a.status !== 'REJECTED';
export const DEFAULT_DURATION = 30;

export interface PeriodInfo { count: number; cap: number | null }
export interface DayInfo {
  date: string;
  closed: boolean;
  closedReason?: string;
  schedule: DaySchedule;
  active: number;          // tous les RDV non annulés (urgences comprises)
  normalActive: number;    // hors urgences : comparés à normalCap
  emergencyActive: number;
  max: number;             // capacité du jour
  reserved: number;        // places réservées
  normalCap: number;       // max - réservées : plafond de la prise de RDV normale
  reservedUsed: number;
  full: boolean;           // plus de place en prise de RDV normale
  morning: PeriodInfo;
  afternoon: PeriodInfo;
}

export const closureFor = (date: string, s: AppointmentSettings) =>
  s.closures.find(c => c.from <= date && date <= (c.to || c.from));

export const periodOf = (time: string, schedule: DaySchedule): 'morning' | 'afternoon' => {
  const m = toMinutes(time);
  if (schedule.morning && m < toMinutes(schedule.morning.end)) return 'morning';
  if (schedule.afternoon) return 'afternoon';
  return m < 12 * 60 ? 'morning' : 'afternoon';
};

const periodOfAppointment = (a: Appointment, schedule: DaySchedule): 'morning' | 'afternoon' =>
  a.period || (a.time ? periodOf(a.time, schedule) : 'morning');

export const getDayInfo = (date: string, apps: Appointment[], s: AppointmentSettings): DayInfo => {
  const schedule = s.weekly[parseDate(date).getDay()];
  const closure = closureFor(date, s);
  const noHours = !schedule.morning && !schedule.afternoon;
  const closed = !!closure || schedule.closed || noHours;
  const closedReason = closure ? (closure.label || 'Fermeture') : closed ? 'Cabinet fermé' : undefined;

  const active = apps.filter(a => a.date === date && isActive(a));
  const normal = active.filter(a => !a.isEmergency);
  const emergency = active.filter(a => a.isEmergency);
  const max = s.dayOverrides[date]?.maxPerDay ?? s.maxPerDay;
  const reserved = Math.min(s.reservedPerDay, Math.max(0, max - 1));
  const normalCap = max - reserved;
  const count = (p: 'morning' | 'afternoon') => normal.filter(a => periodOfAppointment(a, schedule) === p).length;

  return {
    date, closed, closedReason, schedule,
    active: active.length, normalActive: normal.length, emergencyActive: emergency.length,
    max, reserved, normalCap,
    reservedUsed: emergency.length,
    full: normal.length >= normalCap,
    morning: { count: count('morning'), cap: s.maxPerHalfDay.morning },
    afternoon: { count: count('afternoon'), cap: s.maxPerHalfDay.afternoon },
  };
};

export const getType = (s: AppointmentSettings, a: Pick<Appointment, 'typeId' | 'consultationType'>): AppointmentTypeDef | undefined =>
  s.types.find(t => t.id === a.typeId) || s.types.find(t => t.name === a.consultationType);

export const durationOf = (a: Appointment, s: AppointmentSettings) =>
  a.duration || getType(s, a)?.duration || DEFAULT_DURATION;

export const FALLBACK_TYPE_COLOR = '#718096';
export const colorOf = (a: Appointment, s: AppointmentSettings) => getType(s, a)?.color || FALLBACK_TYPE_COLOR;

/** Créneaux de départ libres pour une durée donnée (mode « par heure »). */
export interface Slot { time: string; period: 'morning' | 'afternoon' }
export const getFreeSlots = (
  date: string, duration: number, apps: Appointment[], s: AppointmentSettings, excludeId?: string,
): Slot[] => {
  const info = getDayInfo(date, apps, s);
  if (info.closed) return [];
  const busy = apps
    .filter(a => a.date === date && isActive(a) && a.time && a.id !== excludeId)
    .map(a => ({ from: toMinutes(a.time!), to: toMinutes(a.time!) + durationOf(a, s) }));
  const now = new Date();
  const minStart = date === toDateStr(now) ? now.getHours() * 60 + now.getMinutes() : -1;
  const slots: Slot[] = [];
  (['morning', 'afternoon'] as const).forEach(period => {
    const range = info.schedule[period];
    if (!range) return;
    const cap = info[period].cap;
    if (cap != null && info[period].count >= cap) return;
    for (let t = toMinutes(range.start); t + duration <= toMinutes(range.end); t += s.slotStep) {
      if (t < minStart) continue;
      if (busy.some(b => t < b.to && t + duration > b.from)) continue;
      slots.push({ time: toTime(t), period });
    }
  });
  return slots;
};

/** Prochain numéro d'ordre du jour (les annulés ne sont jamais réattribués). */
export const nextQueueNumber = (date: string, apps: Appointment[], excludeId?: string) =>
  apps.filter(a => a.date === date && a.id !== excludeId).reduce((m, a) => Math.max(m, a.queueNumber || 0), 0) + 1;

export type BookingProblem = 'past' | 'closed' | 'full' | 'halfFull' | 'conflict' | 'noTime';
export interface BookingCheck { ok: boolean; problem?: BookingProblem; message?: string }

export interface BookingRequest {
  date: string;
  time?: string;
  period?: 'morning' | 'afternoon';
  duration: number;
  excludeId?: string;
}

/**
 * Contrôle commun création / déplacement. `force` n'outrepasse que la capacité
 * et la fermeture (urgence) ; une date passée reste refusée.
 */
export const checkBooking = (req: BookingRequest, apps: Appointment[], s: AppointmentSettings, force = false): BookingCheck => {
  if (req.date < todayStr()) return { ok: false, problem: 'past', message: 'Cette date est passée.' };
  const others = req.excludeId ? apps.filter(a => a.id !== req.excludeId) : apps;
  const info = getDayInfo(req.date, others, s);
  if (!force) {
    if (info.closed) return { ok: false, problem: 'closed', message: `${info.closedReason} : prise de rendez-vous impossible.` };
    if (info.full) return { ok: false, problem: 'full', message: 'Journée complète.' };
    const period = req.period || (req.time ? periodOf(req.time, info.schedule) : undefined);
    if (period) {
      const p = info[period];
      if (p.cap != null && p.count >= p.cap) {
        return { ok: false, problem: 'halfFull', message: `${period === 'morning' ? 'Matinée' : 'Après-midi'} complète.` };
      }
    }
    if (s.mode === 'time') {
      if (!req.time) return { ok: false, problem: 'noTime', message: 'Choisissez un créneau.' };
      const free = getFreeSlots(req.date, req.duration, others, s).some(sl => sl.time === req.time);
      if (!free) return { ok: false, problem: 'conflict', message: 'Ce créneau n\'est plus disponible.' };
    }
  }
  return { ok: true };
};

/** Premier jour réservable (non fermé, non complet, avec un créneau libre en mode heure). */
export const firstAvailableDate = (from: string, duration: number, apps: Appointment[], s: AppointmentSettings, maxDays = 180) => {
  let d = from < todayStr() ? todayStr() : from;
  for (let i = 0; i < maxDays; i++, d = addDays(d, 1)) {
    const info = getDayInfo(d, apps, s);
    if (info.closed || info.full) continue;
    if (s.mode === 'order') {
      const periodsOpen = (['morning', 'afternoon'] as const).some(p => info.schedule[p] && (info[p].cap == null || info[p].count < info[p].cap!));
      if (!periodsOpen) continue;
      const now = new Date();
      if (d === toDateStr(now)) {
        const last = info.schedule.afternoon?.end || info.schedule.morning?.end;
        if (last && toMinutes(last) <= now.getHours() * 60 + now.getMinutes()) continue;
      }
      return d;
    }
    if (getFreeSlots(d, duration, apps, s).length > 0) return d;
  }
  return null;
};

export const sortDay = (list: Appointment[]) =>
  [...list].sort((a, b) => {
    const rank = (x: Appointment) => (x.isEmergency && !x.time ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return (a.queueNumber || 0) - (b.queueNumber || 0);
  });

// ─── Patients ───
const cleanPhone = (p: string) => p.replace(/\D/g, '');

export const searchPatients = (term: string): Patient[] => {
  const t = term.trim().toLowerCase();
  if (t.length < 2) return [];
  const digits = cleanPhone(t);
  return dataService.getAllPatients()
    .filter(p => p.name.toLowerCase().includes(t) || (digits.length >= 3 && cleanPhone(p.phone || '').includes(digits)))
    .slice(0, 6);
};

export interface NewPatientInput {
  lastName: string; firstName: string; phone: string; dateOfBirth?: string; sex?: 'M' | 'F';
}

/** Crée le dossier dans le fichier patients commun (sans l'ajouter à la salle d'attente). */
export const createPatient = async (input: NewPatientInput): Promise<Patient> => {
  const lastName = input.lastName.trim();
  const firstName = input.firstName.trim();
  const sex = input.sex || 'M'; // champ obligatoire du dossier ; à corriger dans le dossier si besoin
  const cat = getAgeCategory(input.dateOfBirth);
  const isMinor = cat ? cat.isPediatric : false;
  return dataService.savePatientProfile({
    id: Date.now().toString(),
    name: `${lastName.toUpperCase()} ${firstName}`.trim(),
    lastName, firstName,
    phone: input.phone.trim(),
    dateOfBirth: input.dateOfBirth || undefined,
    age: calculateAgeYears(input.dateOfBirth) ?? 0,
    sex,
    type: isMinor ? 'Child' : sex === 'F' ? 'Woman' : 'Adult',
    registeredDate: new Date().toISOString(),
  });
};

export const findDuplicatePhone = (phone: string): Patient | undefined => dataService.findPatientsByPhone(phone)[0];

/** RDV actifs d'un patient à une date (alerte « déjà un RDV ce jour »). */
export const appointmentsOfPatientOn = (patient: Patient | undefined, date: string, apps: Appointment[], excludeId?: string) =>
  !patient ? [] : apps.filter(a => a.date === date && isActive(a) && a.id !== excludeId && (a.patientId === patient.id));

// ─── Statuts ───
export const STATUS_LABEL: Record<Appointment['status'], string> = {
  PENDING: 'Prévu', CONFIRMED: 'Prévu', ARRIVED: 'Arrivé', IN_CONSULTATION: 'En consultation',
  DONE: 'Terminé', NO_SHOW: 'Absent', REJECTED: 'Annulé',
};

/** Un statut de départ peut passer à : (la suite normale en premier). */
export const nextStatuses = (st: Appointment['status']): Appointment['status'][] => {
  switch (st) {
    case 'PENDING': case 'CONFIRMED': return ['ARRIVED', 'NO_SHOW', 'REJECTED'];
    case 'ARRIVED': return ['IN_CONSULTATION', 'NO_SHOW', 'REJECTED'];
    case 'IN_CONSULTATION': return ['DONE'];
    case 'NO_SHOW': case 'REJECTED': return ['CONFIRMED'];
    default: return [];
  }
};

/**
 * Change le statut d'un RDV. « Arrivé » ajoute le patient à la salle d'attente ;
 * sortir de « Arrivé » (absent, annulé, rétabli) l'en retire.
 * Un RDV sans dossier lié est rattaché au patient trouvé par son téléphone,
 * sinon un dossier minimal est créé.
 */
export const setAppointmentStatus = async (app: Appointment, status: Appointment['status']): Promise<Appointment> => {
  let patientId = app.patientId;
  if (status === 'ARRIVED') {
    let patient = patientId ? dataService.getPatientProfile(patientId) : null;
    if (!patient && app.phone) patient = dataService.findPatientsByPhone(app.phone)[0] || null;
    if (!patient) patient = dataService.getPatientProfile(app.patientName);
    if (!patient) {
      const parts = app.patientName.trim().split(/\s+/);
      patient = await createPatient({ lastName: parts[0] || app.patientName, firstName: parts.slice(1).join(' '), phone: app.phone });
    }
    patientId = patient.id;
    await dataService.saveToQueue(patient);
  } else if (['NO_SHOW', 'REJECTED', 'CONFIRMED', 'PENDING'].includes(status) && app.status === 'ARRIVED' && patientId) {
    await dataService.deleteFromQueue(patientId);
  }
  const updated = { ...app, status, patientId };
  await dataService.saveAppointment(updated);
  return updated;
};

// ─── Teinte de la pastille de capacité : vert < 70 %, orange < 100 %, rouge = complet ───
export type CapacityTone = 'ok' | 'warn' | 'full';
export const capacityTone = (active: number, max: number): CapacityTone =>
  active >= max ? 'full' : active / max >= 0.7 ? 'warn' : 'ok';
export const TONE_STYLE: Record<CapacityTone, { bg: string; fg: string; dot: string }> = {
  ok: { bg: 'var(--color-secondary-50)', fg: '#1F7A5C', dot: 'var(--color-secondary)' },
  warn: { bg: 'var(--color-warning-50)', fg: 'var(--color-warning-800)', dot: 'var(--color-warning-hover)' },
  full: { bg: 'var(--color-danger-50)', fg: 'var(--color-danger-700)', dot: 'var(--color-danger)' },
};
