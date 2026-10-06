import { invoke } from '@tauri-apps/api/core';
import { Appointment } from '../../types';
import { dataService } from '../dataService';
import { MessageKind } from './types';

/** Un RDV est marqué comme envoyé par Rust seul : l'interface reçoit le RDV mis à jour. */
export async function markMessageSent(appointmentId: string, kind: MessageKind): Promise<Appointment> {
    const updated = await invoke<Appointment>('appointment_mark_sent', { id: appointmentId, kind });
    dataService.applyServerAppointment(updated);
    return updated;
}

export const SENT_FIELDS: Record<MessageKind, { at: keyof Appointment; by: keyof Appointment }> = {
    confirmation: { at: 'confirmationSentAt', by: 'confirmationSentBy' },
    reminder: { at: 'reminderSentAt', by: 'reminderSentBy' },
    change: { at: 'changeNoticeSentAt', by: 'changeNoticeSentBy' },
};

export const KIND_LABEL: Record<MessageKind, string> = {
    confirmation: 'Confirmation', reminder: 'Rappel', change: 'Changement',
};

/** Type proposé selon l'état : rien d'envoyé → confirmation ; confirmation envoyée → rappel. */
export function suggestedKind(a: Appointment): MessageKind {
    if (!a.confirmationSentAt) return 'confirmation';
    if (!a.reminderSentAt) return 'reminder';
    return 'change';
}
