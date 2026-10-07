import { normalizeWhatsAppNumber } from './phone';

/** Vues minimales : ni le motif ni aucun champ médical n'entrent dans ce module. */
export interface ConsentPatient { id: string; phone?: string; whatsappConsent?: 'yes' | 'no' }
export interface ConsentAppointment { patientId?: string; phone?: string }

export type SendRefusal = 'no_record' | 'consent_unset' | 'consent_refused' | 'no_valid_number';

export interface Recipient { e164: string; source: 'patient' | 'appointment' }
export type SendCheck =
    | { ok: true; candidates: Recipient[]; /** Deux numéros valides et différents : l'utilisateur choisit. */ needsChoice: boolean }
    | { ok: false; reason: SendRefusal };

export const REFUSAL_MESSAGE: Record<SendRefusal, string> = {
    no_record: "Le rendez-vous n'est pas lié à un dossier patient.",
    consent_unset: 'Consentement WhatsApp non renseigné.',
    consent_refused: "Le patient a refusé d'être contacté par WhatsApp.",
    no_valid_number: 'Aucun numéro mobile valide.',
};

/** Numéro du patient lié en priorité, `phone` du RDV en repli ; les deux si valides et différents. */
export function recipientCandidates(patient: ConsentPatient, appointment: ConsentAppointment): Recipient[] {
    const out: Recipient[] = [];
    const p = normalizeWhatsAppNumber(patient.phone);
    if (p.ok) out.push({ e164: p.e164, source: 'patient' });
    const a = normalizeWhatsAppNumber(appointment.phone);
    if (a.ok && !out.some(r => r.e164 === a.e164)) out.push({ e164: a.e164, source: 'appointment' });
    return out;
}

export function canSendWhatsApp(patient: ConsentPatient | undefined | null, appointment: ConsentAppointment): SendCheck {
    if (!appointment.patientId || !patient || patient.id !== appointment.patientId) return { ok: false, reason: 'no_record' };
    if (patient.whatsappConsent === 'no') return { ok: false, reason: 'consent_refused' };
    if (patient.whatsappConsent !== 'yes') return { ok: false, reason: 'consent_unset' };
    const candidates = recipientCandidates(patient, appointment);
    if (candidates.length === 0) return { ok: false, reason: 'no_valid_number' };
    return { ok: true, candidates, needsChoice: candidates.length > 1 };
}

/** Motif de refus, ou undefined si l'envoi est possible. */
export const refusalOf = (c: SendCheck): SendRefusal | undefined => ('reason' in c ? c.reason : undefined);
