import { invoke } from '@tauri-apps/api/core';
import { Patient } from '../types';
import { sessionService } from './sessionService';
import { vaccinationService } from './vaccinationService';

export type TodoSeverity = 'critical' | 'todo' | 'info';
export type TodoAction = 'open_dossier' | 'open_appointments' | 'open_reminders' | 'backup_now' | 'open_backup_settings' | 'open_billing' | 'open_receipts_settings';

/** Élément du panneau « À faire » (construit et filtré par rôle côté Rust : `notifications/mod.rs`). */
export interface TodoItem {
    id: string;
    kind: string;
    severity: TodoSeverity;
    patientId?: string | null;
    patientName?: string | null;
    title: string;
    lines: string[];
    count: number;
    action: TodoAction;
    fingerprint: string;
    dismissible: boolean;
}

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

/**
 * Vaccins en retard, regroupés par patient. Calculés ici (le calendrier vit dans
 * vaccinationService) mais seulement pour le médecin et seulement si le module est activé ;
 * Rust refuse de toute façon ces éléments pour l'assistante.
 * `getVaccinationStatus` ne renvoie rien pour un patient non suivi, sans date de naissance
 * ou si le module est désactivé : un adulte sans calendrier ne produit aucune alerte.
 */
export function vaccineItems(patients: Patient[]): TodoItem[] {
    if (!sessionService.isMedecin() || !vaccinationService.isModuleEnabled()) return [];
    const out: TodoItem[] = [];
    for (const patient of patients) {
        const overdue = vaccinationService.getVaccinationStatus(patient).filter(s => s.status === 'OVERDUE');
        if (overdue.length === 0) continue;
        out.push({
            id: `vaccines:${patient.id}`,
            kind: 'vaccines',
            severity: 'todo',
            patientId: patient.id,
            patientName: patient.name,
            title: `${patient.name} — ${overdue.length} vaccin${overdue.length > 1 ? 's' : ''} en retard`,
            lines: overdue.map(s => s.vaccine.name),
            count: overdue.length,
            action: 'open_dossier',
            fingerprint: overdue.map(s => s.vaccine.id).sort().join(','),
            dismissible: true,
        });
    }
    return out;
}

export const notificationsService = {
    /** Éléments déjà filtrés par Rust selon le rôle de la session et l'état Reporter / Ignorer. */
    list: async (patients: Patient[] = []): Promise<TodoItem[]> => {
        if (!isTauri()) return [];
        return invoke<TodoItem[]>('notifications_list', { extra: vaccineItems(patients) });
    },
    snooze: (item: TodoItem) => invoke<void>('notifications_set_state', { id: item.id, fingerprint: item.fingerprint, action: 'snooze' }),
    dismiss: (item: TodoItem) => invoke<void>('notifications_set_state', { id: item.id, fingerprint: item.fingerprint, action: 'dismiss' }),
    restore: (item: TodoItem) => invoke<void>('notifications_set_state', { id: item.id, fingerprint: item.fingerprint, action: 'restore' }),
};

/** Évènement : demande de rafraîchissement du panneau (après une sauvegarde, un changement d'état…). */
export const TODO_REFRESH_EVENT = 'docease_todo_refresh';
