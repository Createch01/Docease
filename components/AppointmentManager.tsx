/**
 * Agenda des rendez-vous — coordinateur. La logique (capacité, créneaux,
 * statuts) vit dans services/appointmentService ; les vues dans components/appointments/.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Appointment, AppointmentSettings, Patient } from '../types';
import { dataService } from '../services/dataService';
import { toastService } from '../services/toastService';
import {
  addDays, capacityTone, formatDayLong, getDayInfo, mondayOf, parseDate, todayStr, TONE_STYLE,
} from '../services/appointmentService';
import QuickBookingModal from './appointments/QuickBookingModal';
import WhatsAppSendModal from './appointments/WhatsAppSendModal';
import { canSendWhatsApp } from '../services/messaging/consent';
import { MessageKind } from '../services/messaging/types';
import AppointmentDetail from './appointments/AppointmentDetail';
import { MiniCalendar, UpcomingList } from './appointments/MiniCalendar';
import { DayView, WeekView, ListView } from './appointments/AgendaViews';
import { makeActions } from './appointments/AppointmentBits';

type ViewMode = 'day' | 'week' | 'list';
const VIEW_KEY = 'docease_agenda_view';
const VIEWS: { id: ViewMode; label: string }[] = [{ id: 'day', label: 'Jour' }, { id: 'week', label: 'Semaine' }, { id: 'list', label: 'Liste' }];

const loadView = (): ViewMode => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'day' || v === 'week' || v === 'list') return v;
  } catch { /* stockage indisponible : vue Jour */ }
  return 'day';
};

interface Props {
  onOpenDossier?: (patient: Patient) => void;
  onStartConsultation?: (patient: Patient) => void;
}

const AppointmentManager: React.FC<Props> = ({ onOpenDossier, onStartConsultation }) => {
  const [date, setDate] = useState(todayStr());
  const [view, setViewState] = useState<ViewMode>(loadView);
  const [appointments, setAppointments] = useState<Appointment[]>(() => dataService.getAppointments());
  const [settings, setSettings] = useState<AppointmentSettings>(() => dataService.getAppointmentSettings());
  const [modal, setModal] = useState<{ date?: string; time?: string; editing?: Appointment } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [wa, setWa] = useState<{ appointment: Appointment; kind: MessageKind } | null>(null);

  // Après enregistrement : proposition d'envoi (jamais automatique). Nouveau RDV → confirmation ;
  // RDV déplacé alors qu'un message avait été envoyé → avis de changement. Consentement « non » : rien.
  const proposeMessage = (saved: Appointment, previous?: Appointment) => {
    const a = dataService.getAppointments().find(x => x.id === saved.id) || saved;
    if (!a.patientId) return;
    const patient = dataService.getPatientProfile(a.patientId);
    if (!patient || patient.whatsappConsent === 'no') return;
    if (previous) {
      const moved = previous.date !== a.date || previous.time !== a.time;
      if (!moved || !(previous.confirmationSentAt || previous.reminderSentAt)) return;
      if (!canSendWhatsApp(patient, a).ok) return;
      setWa({ appointment: a, kind: 'change' });
      return;
    }
    // Consentement « oui » : proposer si le numéro est valide ; non renseigné : l'écran d'envoi demande le consentement en un clic.
    if (patient.whatsappConsent === 'yes' && !canSendWhatsApp(patient, a).ok) return;
    setWa({ appointment: a, kind: 'confirmation' });
  };

  const setView = (v: ViewMode) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* préférence non mémorisée */ }
  };

  // Actualisation en direct : rendez-vous, réglages, autres onglets.
  useEffect(() => {
    const refresh = () => {
      setAppointments(dataService.getAppointments());
      setSettings(dataService.getAppointmentSettings());
    };
    const onUpdate = (e: Event) => {
      const key = (e as CustomEvent).detail?.key;
      if (key === 'meddoc_appointments' || key === 'meddoc_appointment_settings' || key === 'all') refresh();
    };
    window.addEventListener('meddoc_data_update', onUpdate);
    const tick = setInterval(refresh, 60_000); // « maintenant », prochains patients
    return () => { window.removeEventListener('meddoc_data_update', onUpdate); clearInterval(tick); };
  }, []);

  const openNew = useCallback((d?: string, time?: string) => setModal({ date: d, time }), []);

  // Raccourci N : nouveau rendez-vous (hors saisie de texte).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (modal) return;
      e.preventDefault();
      openNew();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [modal, openNew]);

  const actions = useMemo(() => makeActions({
    onOpenDossier, onStartConsultation,
    edit: a => setModal({ editing: a }),
    remove: a => { dataService.deleteAppointment(a.id); toastService.info('Rendez-vous supprimé'); },
  }), [onOpenDossier, onStartConsultation]);

  const info = getDayInfo(date, appointments, settings);
  const tone = capacityTone(info.active, info.max);
  const step = view === 'week' ? 7 : 1;
  const detail = detailId ? appointments.find(a => a.id === detailId) : undefined;

  const monday = mondayOf(date);
  const weekTitle = `${parseDate(monday).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${parseDate(addDays(monday, 6)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  const title = view === 'week' ? weekTitle : formatDayLong(date);

  const pill = info.closed
    ? { bg: 'var(--color-surface-alt)', fg: 'var(--color-text-muted)', dot: 'var(--color-text-faint)', text: `Fermé · ${info.closedReason}` }
    : { ...TONE_STYLE[tone], text: `${info.active}/${info.max}${info.reserved > 0 ? ` · Réservées ${Math.min(info.reservedUsed, info.reserved)}/${info.reserved}` : ''}` };

  const navBtn = 'h-9 w-9 flex items-center justify-center rounded-md hover:bg-[var(--color-surface-alt)] transition-colors';

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-in">
      {/* En-tête sur une ligne */}
      <header className="rounded-xl border px-4 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap xl:flex-nowrap"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}>
        <div className="flex items-center rounded-lg border shrink-0" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <button type="button" className={navBtn} aria-label={view === 'week' ? 'Semaine précédente' : 'Jour précédent'} title={view === 'week' ? 'Semaine précédente' : 'Jour précédent'} onClick={() => setDate(addDays(date, -step))}><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => setDate(todayStr())} title="Revenir à aujourd'hui"
                  className="h-9 px-3 text-[13px] font-medium border-x hover:bg-[var(--color-surface-alt)]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>Aujourd'hui</button>
          <button type="button" className={navBtn} aria-label={view === 'week' ? 'Semaine suivante' : 'Jour suivant'} title={view === 'week' ? 'Semaine suivante' : 'Jour suivant'} onClick={() => setDate(addDays(date, step))}><ChevronRight size={18} /></button>
        </div>

        <h1 className="text-[18px] font-semibold min-w-0 truncate" style={{ color: 'var(--color-text)' }}>{title}</h1>

        <span role="status" title={`${formatDayLong(date)} : places occupées sur la capacité du jour, places réservées utilisées`}
              className="shrink-0 h-8 px-3 rounded-full text-[13px] font-medium flex items-center gap-2 whitespace-nowrap"
              style={{ background: pill.bg, color: pill.fg }}>
          <span className="w-2 h-2 rounded-full" style={{ background: pill.dot }} />{pill.text}
        </span>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="flex rounded-lg p-1" role="radiogroup" aria-label="Vue" style={{ background: 'var(--color-border)' }}>
            {VIEWS.map(v => (
              <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}
                      className="h-7 px-2.5 rounded-md text-[13px] font-medium transition-all"
                      style={view === v.id ? { background: '#fff', color: 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--color-text-subtle)' }}>
                {v.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => openNew()} title="Nouveau rendez-vous (N)"
                  className="h-9 px-4 rounded-lg text-[13px] font-medium text-white flex items-center gap-2 whitespace-nowrap shadow-soft hover:shadow-card active:scale-[0.98] transition-all"
                  style={{ background: 'var(--color-primary)' }}>
            <Plus size={16} /> Nouveau RDV
            <kbd className="hidden min-[1440px]:inline text-[11px] px-1.5 rounded" style={{ background: 'rgba(255,255,255,0.22)' }}>N</kbd>
          </button>
        </div>
      </header>

      <div className="grid gap-5 items-start lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <MiniCalendar selected={date} appointments={appointments} settings={settings} onSelect={setDate} />
          <UpcomingList appointments={appointments} settings={settings} onOpen={a => { setDate(a.date); setDetailId(a.id); }} />
        </aside>

        <section className="min-w-0">
          {view === 'day' && <DayView date={date} appointments={appointments} settings={settings} actions={actions} onOpen={a => setDetailId(a.id)} onNew={openNew} />}
          {view === 'week' && <WeekView date={date} appointments={appointments} settings={settings} actions={actions} onOpen={a => setDetailId(a.id)} onNew={openNew}
                                        onPickDay={d => { setDate(d); setView('day'); }} />}
          {view === 'list' && <ListView appointments={appointments} settings={settings} onOpen={a => setDetailId(a.id)} />}
        </section>
      </div>

      {modal && (
        <QuickBookingModal appointments={appointments} settings={settings} initialDate={modal.date} initialTime={modal.time} editing={modal.editing}
                           onClose={() => setModal(null)} onSaved={a => { setDate(a.date); proposeMessage(a, modal.editing); }} />
      )}
      {wa && <WhatsAppSendModal appointment={wa.appointment} settings={settings} initialKind={wa.kind} onClose={() => setWa(null)} />}
      {detail && <AppointmentDetail appointment={detail} appointments={appointments} settings={settings} actions={actions} onClose={() => setDetailId(null)} />}
    </div>
  );
};

export default AppointmentManager;
