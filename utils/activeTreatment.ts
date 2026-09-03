import { Prescription } from '../types';

// A prescription counts as "current treatment" if it was written within its own
// longest item duration (best-effort parse of "7 jours" / "1 mois" style strings).
// Single source of truth — reused by every screen that needs to know a patient's
// active treatment (dossier overview, dossier header, safety alerts).
export const parseDurationDays = (duration?: string): number | null => {
  if (!duration) return null;
  const match = duration.match(/(\d+)\s*(jour|semaine|mois)/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('jour')) return n;
  if (unit.startsWith('semaine')) return n * 7;
  if (unit.startsWith('mois')) return n * 30;
  return null;
};

/** Most recent prescription still within its longest item duration (sorted DESC by date, most recent first). */
export const getActiveTreatment = (prescriptionsDesc: Prescription[]): Prescription | null => {
  const last = prescriptionsDesc[0];
  if (!last) return null;
  const maxDays = Math.max(0, ...last.items.map(i => parseDurationDays(i.duration) ?? 0));
  if (maxDays === 0) return last; // unknown duration: show it, don't hide it
  const rxDate = new Date(last.date);
  const expiry = new Date(rxDate.getTime() + maxDays * 86400000);
  return expiry >= new Date() ? last : null;
};
