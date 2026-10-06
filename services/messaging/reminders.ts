import { ConsentAppointment, ConsentPatient, canSendWhatsApp } from './consent';

export interface ReminderAppointment extends ConsentAppointment {
    id: string;
    date: string;
    status: string;
    reminderSentAt?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Lendemain d'une date YYYY-MM-DD (calendrier local). */
export const nextDay = (day: string): string => {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(y, m - 1, d + 1, 12);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

/**
 * Rappels de demain : PENDING ou CONFIRMED, consentement « oui », numéro valide, pas encore rappelé.
 * Reflet de `notifications/reminders_source.rs` (qui fait foi pour le panneau « À faire »).
 */
export function selectTomorrowReminders<A extends ReminderAppointment>(appointments: A[], patients: ConsentPatient[], today: string): A[] {
    const tomorrow = nextDay(today);
    return appointments.filter(a =>
        a.date === tomorrow &&
        (a.status === 'PENDING' || a.status === 'CONFIRMED') &&
        !a.reminderSentAt &&
        canSendWhatsApp(patients.find(p => p.id === a.patientId), a).ok);
}

export interface SentTrace {
    date?: string; time?: string;
    confirmationSentAt?: string; confirmationSentBy?: string;
    reminderSentAt?: string; reminderSentBy?: string;
}

/**
 * Reprogrammation (date ou heure modifiée) : remise à zéro de la confirmation et du rappel.
 * Miroir de la règle appliquée par Rust dans `save_json` (qui fait foi) ; sert à garder
 * l'état local cohérent avant relecture.
 */
export function resetSentOnReschedule<T extends SentTrace>(before: T, after: T): T {
    if (before.date === after.date && before.time === after.time) return after;
    const { confirmationSentAt, confirmationSentBy, reminderSentAt, reminderSentBy, ...rest } = after;
    return rest as T;
}
