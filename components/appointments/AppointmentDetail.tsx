import React, { useEffect, useState } from 'react';
import { CalendarClock, FolderOpen, Phone, Stethoscope, Trash2, X, Zap } from 'lucide-react';
import { Appointment, AppointmentSettings, Patient } from '../../types';
import { dataService } from '../../services/dataService';
import WhatsAppConsentField from '../WhatsAppConsentField';
import WhatsAppSendModal from './WhatsAppSendModal';
import { canSendWhatsApp, refusalOf, REFUSAL_MESSAGE } from '../../services/messaging/consent';
import { KIND_LABEL, SENT_FIELDS } from '../../services/messaging/send';
import { MessageKind } from '../../services/messaging/types';
import { formatDayLong, nextStatuses, todayStr } from '../../services/appointmentService';
import { AgendaActions, STATUS_ACTION, StatusBadge, TypeChip, slotLabel } from './AppointmentBits';

interface Props {
  appointment: Appointment;
  appointments: Appointment[];
  settings: AppointmentSettings;
  actions: AgendaActions;
  onClose: () => void;
}

const btn = 'h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center justify-center gap-1.5 bg-white transition-colors hover:bg-[var(--color-surface-alt)]';
const btnStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' } as React.CSSProperties;

/** Détail d'un rendez-vous : statuts en un clic, dossier, consultation, déplacement. */
const AppointmentDetail: React.FC<Props> = ({ appointment: a, appointments, settings, actions, onClose }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sending, setSending] = useState(false);
  // Dossier lié (consentement WhatsApp) ; relu après chaque changement.
  const [patient, setPatient] = useState<Patient | null>(() => (a.patientId ? dataService.getPatientProfile(a.patientId) : null));
  const changeConsent = async (v: 'yes' | 'no' | undefined) => { if (patient) setPatient(await dataService.setWhatsAppConsent(patient.id, v)); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const live = a.status === 'PENDING' || a.status === 'CONFIRMED' || a.status === 'ARRIVED' || a.status === 'IN_CONSULTATION';
  const isPast = a.date < todayStr();
  const run = async (s: Appointment['status']) => { await actions.changeStatus(a, s, appointments, settings); onClose(); };
  const next = nextStatuses(a.status);
  const primary = next[0];
  const secondary = next.slice(1);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
         onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Rendez-vous de ${a.patientName}`} className="w-full max-w-[440px] rounded-xl border"
           style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5"><StatusBadge status={a.status} />
              {a.isEmergency && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}><Zap size={12} /> Urgence</span>}
            </div>
            <h3 className="text-[18px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</h3>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {formatDayLong(a.date)} · {slotLabel(a)}{a.time && a.duration ? ` (${a.duration} min)` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-md hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-subtle)' }}><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-2 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          <TypeChip a={a} settings={settings} />
          {a.phone && <p className="flex items-center gap-2"><Phone size={14} style={{ color: 'var(--color-text-faint)' }} />{a.phone}</p>}
          {patient
            ? <div className="pt-1"><WhatsAppConsentField compact value={patient.whatsappConsent} at={patient.whatsappConsentAt} onChange={v => void changeConsent(v)} /></div>
            : <p className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>Rendez-vous non lié à un dossier : pas de message WhatsApp.</p>}
          {(['confirmation', 'reminder', 'change'] as MessageKind[]).filter(k => a[SENT_FIELDS[k].at]).map(k => (
            <p key={k} className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
              {KIND_LABEL[k]} envoyé(e) par WhatsApp le {new Date(a[SENT_FIELDS[k].at] as string).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {a[SENT_FIELDS[k].by] ? ` · ${a[SENT_FIELDS[k].by]}` : ''}
            </p>
          ))}
          {a.note && <p className="italic">« {a.note} »</p>}
        </div>

        <div className="px-6 pb-5 space-y-2">
          {primary && (
            <button type="button" title={STATUS_ACTION[primary].tip} onClick={() => run(primary)}
                    className="w-full h-10 rounded-lg text-[14px] font-medium text-white" style={{ background: primary === 'CONFIRMED' ? 'var(--color-text-muted)' : 'var(--color-primary)' }}>
              {STATUS_ACTION[primary].label}
            </button>
          )}
          {live && a.patientId && (() => {
            const check = canSendWhatsApp(patient, a);
            return (
              <div>
                <button type="button" disabled={!check.ok} onClick={() => setSending(true)}
                        className="w-full h-10 rounded-lg border text-[14px] font-medium disabled:opacity-50" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'white' }}>
                  Envoyer sur WhatsApp
                </button>
                {refusalOf(check) && <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-faint)' }}>{REFUSAL_MESSAGE[refusalOf(check)!]}</p>}
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btn} style={btnStyle} title="Ouvrir le dossier du patient" onClick={() => { actions.openDossier(a); onClose(); }}><FolderOpen size={15} /> Dossier</button>
            {live && <button type="button" className={btn} style={btnStyle} title="Ouvrir la consultation (passe le patient en consultation)"
                             onClick={async () => { await actions.startConsultation(a, appointments, settings); onClose(); }}><Stethoscope size={15} /> Consultation</button>}
            {live && !isPast && <button type="button" className={btn} style={btnStyle} title="Changer la date, le créneau, le motif ou la note" onClick={() => { actions.edit(a); onClose(); }}><CalendarClock size={15} /> Déplacer / modifier</button>}
            {secondary.map(s => (
              <button key={s} type="button" title={STATUS_ACTION[s].tip} onClick={() => run(s)} className={btn}
                      style={s === 'REJECTED' ? { borderColor: 'var(--color-warning-100)', color: 'var(--color-warning-800)' } : btnStyle}>
                {STATUS_ACTION[s].label}
              </button>
            ))}
          </div>
          <div className="pt-1">
            {!confirmDelete ? (
              <button type="button" title="Supprimer définitivement ce rendez-vous" onClick={() => setConfirmDelete(true)}
                      className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-danger)' }}>
                <Trash2 size={13} /> Supprimer définitivement
              </button>
            ) : (
              <div className="flex items-center gap-3 text-[12px] p-2.5 rounded-md" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>
                Supprimer ce rendez-vous de l'historique ?
                <button type="button" className="font-semibold underline" onClick={() => { actions.remove(a); onClose(); }}>Supprimer</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Garder</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {sending && <WhatsAppSendModal appointment={a} settings={settings} onClose={() => setSending(false)} onLeave={() => { setSending(false); onClose(); }} />}
    </div>
  );
};

export default AppointmentDetail;
