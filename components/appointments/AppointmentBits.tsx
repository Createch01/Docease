import React from 'react';
import { Appointment, AppointmentSettings, Patient } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import { colorOf, getDayInfo, setAppointmentStatus, STATUS_LABEL } from '../../services/appointmentService';

export const STATUS_STYLE: Record<Appointment['status'], { bg: string; fg: string }> = {
  PENDING: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary)' },
  CONFIRMED: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary)' },
  ARRIVED: { bg: 'var(--color-secondary-50)', fg: '#1F7A5C' },
  IN_CONSULTATION: { bg: 'var(--color-warning-50)', fg: 'var(--color-warning-800)' },
  DONE: { bg: 'var(--color-surface-alt)', fg: 'var(--color-text-subtle)' },
  NO_SHOW: { bg: 'var(--color-danger-50)', fg: 'var(--color-danger-700)' },
  REJECTED: { bg: 'var(--color-surface-alt)', fg: 'var(--color-text-faint)' },
};

export const StatusBadge: React.FC<{ status: Appointment['status'] }> = ({ status }) => (
  <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap"
        style={{ background: STATUS_STYLE[status].bg, color: STATUS_STYLE[status].fg }}>
    {STATUS_LABEL[status]}
  </span>
);

/** Libellé de la position : heure, sinon numéro d'ordre, sinon « Urgence ». */
export const slotLabel = (a: Appointment) =>
  a.time || (a.queueNumber ? `n° ${a.queueNumber}` : a.isEmergency ? 'Urgence' : '—');

export const TypeChip: React.FC<{ a: Appointment; settings: AppointmentSettings }> = ({ a, settings }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(a, settings) }} />
    {a.consultationType || 'Consultation'}
  </span>
);

// Un clic = un statut. Étiquette du bouton et infobulle de chaque transition.
export const STATUS_ACTION: Record<Appointment['status'], { label: string; tip: string }> = {
  ARRIVED: { label: 'Arrivé', tip: 'Patient arrivé : l\'ajoute à la salle d\'attente' },
  IN_CONSULTATION: { label: 'Démarrer', tip: 'Commencer la consultation' },
  DONE: { label: 'Terminer', tip: 'Marquer la consultation terminée' },
  NO_SHOW: { label: 'Absent', tip: 'Marquer le patient absent (le retire de la salle d\'attente)' },
  REJECTED: { label: 'Annuler', tip: 'Annuler le rendez-vous (libère la place)' },
  CONFIRMED: { label: 'Rétablir', tip: 'Rétablir le rendez-vous' },
  PENDING: { label: 'Prévu', tip: 'Remettre à « prévu »' },
};

export interface AgendaActions {
  changeStatus: (a: Appointment, s: Appointment['status'], all: Appointment[], settings: AppointmentSettings) => Promise<void>;
  openDossier: (a: Appointment) => void;
  startConsultation: (a: Appointment, all: Appointment[], settings: AppointmentSettings) => Promise<void>;
  edit: (a: Appointment) => void;
  remove: (a: Appointment) => void;
}

const patientOf = (a: Appointment): Patient | null =>
  (a.patientId && dataService.getPatientProfile(a.patientId)) || dataService.getPatientProfile(a.patientName);

export const makeActions = (
  handlers: { onOpenDossier?: (p: Patient) => void; onStartConsultation?: (p: Patient) => void; edit: (a: Appointment) => void; remove: (a: Appointment) => void },
): AgendaActions => {
  const changeStatus: AgendaActions['changeStatus'] = async (a, status, all, settings) => {
    // Rétablir un RDV annulé/absent ne doit pas dépasser la capacité du jour.
    // (un « absent » garde sa place : seul un RDV annulé en libérait une)
    if (a.status === 'REJECTED' && status === 'CONFIRMED' && !a.isEmergency) {
      const info = getDayInfo(a.date, all.filter(x => x.id !== a.id), settings);
      if (info.closed || info.full) {
        toastService.warning(info.closed ? `${info.closedReason} : rétablissement impossible.` : 'Journée complète : rétablissement impossible.');
        return;
      }
    }
    try {
      await setAppointmentStatus(a, status);
      toastService.info(`${a.patientName} : ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (e) {
      console.error('Changement de statut :', e);
      toastService.error('Le statut n\'a pas pu être modifié.');
    }
  };
  return {
    changeStatus,
    edit: handlers.edit,
    remove: handlers.remove,
    openDossier: a => {
      const p = patientOf(a);
      if (!p) { toastService.warning('Aucun dossier lié à ce rendez-vous.'); return; }
      handlers.onOpenDossier?.(p);
    },
    startConsultation: async (a, all, settings) => {
      // Un patient « prévu » passe d'abord par « Arrivé » (salle d'attente), puis en consultation.
      let current = a;
      if (a.status === 'PENDING' || a.status === 'CONFIRMED') {
        current = await setAppointmentStatus(a, 'ARRIVED');
      }
      if (current.status === 'ARRIVED') current = await setAppointmentStatus(current, 'IN_CONSULTATION');
      const p = patientOf(current);
      if (!p) { toastService.warning('Aucun dossier lié à ce rendez-vous.'); return; }
      handlers.onStartConsultation?.(p);
    },
  };
};
