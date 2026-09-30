/**
 * Prise de rendez-vous rapide (aussi utilisée pour modifier / déplacer).
 * Clavier : Entrée = valider, Échap = fermer, ↑/↓ + Entrée dans la recherche patient.
 * Les contrôles de capacité passent par appointmentService.checkBooking, les
 * mêmes qu'au déplacement d'un rendez-vous existant.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Search, UserPlus, X, Zap } from 'lucide-react';
import { Appointment, AppointmentSettings, Patient } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import {
  appointmentsOfPatientOn, checkBooking, createPatient, findDuplicatePhone, firstAvailableDate,
  formatDayLong, getDayInfo, getFreeSlots, nextQueueNumber, parseDate, periodOf, searchPatients, todayStr,
  capacityTone, TONE_STYLE, STATUS_LABEL,
} from '../../services/appointmentService';

interface Props {
  appointments: Appointment[];
  settings: AppointmentSettings;
  initialDate?: string;
  initialTime?: string;
  editing?: Appointment; // modification / déplacement : le patient est figé
  onClose: () => void;
  onSaved?: (a: Appointment) => void;
}

const label = 'block text-[12px] font-medium mb-1.5';
const labelStyle = { color: 'var(--color-text-muted)' } as React.CSSProperties;
const field = 'w-full h-10 px-3 rounded-md border text-[14px] outline-none bg-white';
const fieldStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;

const QuickBookingModal: React.FC<Props> = ({ appointments, settings, initialDate, initialTime, editing, onClose, onSaved }) => {
  const types = settings.types;
  const initialType = (editing && (types.find(t => t.id === editing.typeId) || types.find(t => t.name === editing.consultationType))) || types[0];

  // ─── Patient ───
  const [term, setTerm] = useState('');
  const [patient, setPatient] = useState<Patient | undefined>(() => editing?.patientId ? dataService.getPatientProfile(editing.patientId) || undefined : undefined);
  const [creating, setCreating] = useState(false);
  const [hi, setHi] = useState(0);
  const [np, setNp] = useState({ lastName: '', firstName: '', phone: '', dateOfBirth: '', sex: '' as '' | 'M' | 'F' });
  const [dupAccepted, setDupAccepted] = useState(false);

  // ─── Rendez-vous ───
  const [typeId, setTypeId] = useState(initialType?.id);
  const type = types.find(t => t.id === typeId) || types[0];
  const duration = type?.duration || 20;
  const [date, setDate] = useState(() => editing?.date || initialDate || todayStr());
  const [time, setTime] = useState<string | undefined>(editing?.time || initialTime);
  const [period, setPeriod] = useState<'morning' | 'afternoon' | undefined>(editing?.period);
  const [note, setNote] = useState(editing?.note || '');
  const [forceAsk, setForceAsk] = useState(false);
  const [forced, setForced] = useState(false);
  const [forcedTime, setForcedTime] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const datePicked = useRef(!!(editing || initialDate));

  const others = useMemo(() => editing ? appointments.filter(a => a.id !== editing.id) : appointments, [appointments, editing]);
  const info = useMemo(() => getDayInfo(date, others, settings), [date, others, settings]);
  const slots = useMemo(
    () => settings.mode === 'time' ? getFreeSlots(date, duration, others, settings) : [],
    [date, duration, others, settings],
  );

  // Premier jour disponible par défaut (tant que l'utilisateur n'a pas choisi de date).
  useEffect(() => {
    if (datePicked.current) return;
    const d = firstAvailableDate(todayStr(), duration, others, settings);
    if (d) setDate(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Créneau : garder la sélection si elle reste libre, sinon proposer le premier.
  useEffect(() => {
    if (settings.mode !== 'time' || forced) return;
    setTime(cur => (cur && slots.some(s => s.time === cur)) ? cur : slots[0]?.time);
  }, [slots, settings.mode, forced]);

  // Ordre d'arrivée : demi-journée par défaut = première non complète (et pas déjà finie aujourd'hui).
  useEffect(() => {
    if (settings.mode !== 'order') return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const ok = (p: 'morning' | 'afternoon') => {
      const r = info.schedule[p];
      if (!r) return false;
      if (info[p].cap != null && info[p].count >= info[p].cap!) return false;
      if (date === todayStr() && Number(r.end.slice(0, 2)) * 60 + Number(r.end.slice(3)) <= nowMin) return false;
      return true;
    };
    setPeriod(cur => (cur && ok(cur)) ? cur : (['morning', 'afternoon'] as const).find(ok));
  }, [info, date, settings.mode]);

  // Un changement de date annule une demande de « forcer ».
  useEffect(() => { setForceAsk(false); setForced(false); }, [date]);

  // Échap = fermer
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);

  const matches = useMemo(() => patient || creating ? [] : searchPatients(term), [term, patient, creating]);
  useEffect(() => setHi(0), [term]);

  // Le champ de recherche disparaît : le focus passe sur « Enregistrer » pour que Entrée valide aussitôt.
  const pickPatient = (p: Patient) => { setPatient(p); setTerm(''); setCreating(false); setTimeout(() => submitRef.current?.focus(), 0); };
  const startCreating = () => {
    const digits = term.replace(/\D/g, '');
    const isPhone = digits.length >= 4 && /^[\d\s+().-]+$/.test(term.trim());
    setNp(n => ({ ...n, phone: isPhone ? term.trim() : n.phone, lastName: isPhone ? n.lastName : term.trim().toUpperCase() }));
    setCreating(true); setDupAccepted(false);
  };

  const phoneDigits = np.phone.replace(/\D/g, '');
  const duplicate = creating && phoneDigits.length >= 6 ? findDuplicatePhone(np.phone) : undefined;
  const newPatientValid = np.lastName.trim() && np.firstName.trim() && phoneDigits.length >= 8;
  const patientReady = !!patient || (creating && !!newPatientValid && (!duplicate || dupAccepted));

  const sameDay = appointmentsOfPatientOn(patient, date, appointments, editing?.id);

  // ─── Blocage ───
  const blocked = info.closed || info.full
    || (settings.mode === 'time' && slots.length === 0)
    || (settings.mode === 'order' && !period);
  const blockedMessage = info.closed ? `${info.closedReason} : prise de rendez-vous impossible.`
    : info.full ? 'Journée complète.'
    : settings.mode === 'time' && slots.length === 0 ? 'Aucun créneau libre ce jour-là.'
    : settings.mode === 'order' && !period ? 'Plus de place sur les demi-journées restantes.' : '';

  const tone = capacityTone(info.active, info.max);
  const counterLabel = info.closed ? info.closedReason : `${info.normalActive}/${info.normalCap} places`;

  const canSubmit = patientReady && !!type && date >= todayStr()
    && (forced || !blocked)
    && (forced || settings.mode !== 'time' || !!time);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || saving) return;
    const effTime = forced ? (forcedTime || undefined) : (settings.mode === 'time' ? time : undefined);
    const check = checkBooking({ date, time: effTime, period: forced ? undefined : period, duration, excludeId: editing?.id }, appointments, settings, forced);
    if (!check.ok) { toastService.warning(check.message || 'Rendez-vous impossible.'); return; }
    setSaving(true);
    try {
      let target = patient;
      if (!target) target = await createPatient({
        lastName: np.lastName, firstName: np.firstName, phone: np.phone,
        dateOfBirth: np.dateOfBirth || undefined, sex: np.sex || undefined,
      });
      const finalPeriod = forced ? (effTime ? periodOf(effTime, info.schedule) : undefined) : (settings.mode === 'time' && effTime ? periodOf(effTime, info.schedule) : period);
      const needsNumber = forced ? !effTime : settings.mode === 'order';
      const keepNumber = editing && editing.date === date && editing.queueNumber;
      const appt: Appointment = {
        ...(editing || {}),
        id: editing?.id || Date.now().toString(),
        patientId: target.id,
        patientName: target.name,
        phone: target.phone || '',
        date,
        time: effTime,
        duration,
        consultationType: type.name,
        typeId: type.id,
        note: note.trim(),
        priority: forced ? 'URGENT' : 'ROUTINE',
        status: editing?.status || 'CONFIRMED',
        bookedByDoctor: true,
        period: finalPeriod,
        queueNumber: needsNumber ? (keepNumber || nextQueueNumber(date, appointments, editing?.id)) : undefined,
        isEmergency: forced || (editing?.isEmergency && editing.date === date) || undefined,
      };
      await dataService.saveAppointment(appt);
      toastService.success(editing ? 'Rendez-vous modifié' : forced ? 'Rendez-vous d\'urgence enregistré' : 'Rendez-vous enregistré');
      onSaved?.(appt);
      onClose();
    } catch (err) {
      console.error('Enregistrement du rendez-vous :', err);
      toastService.error('Le rendez-vous n\'a pas pu être enregistré.');
      setSaving(false);
    }
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[hi]) pickPatient(matches[hi]);
      else if (term.trim().length >= 2) startCreating();
    }
  };

  const periodBlocks = (['morning', 'afternoon'] as const).map(p => ({
    p, name: p === 'morning' ? 'Matin' : 'Après-midi', list: slots.filter(s => s.period === p),
  })).filter(b => b.list.length);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
         onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={editing ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
            className="w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-xl border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-[18px] font-semibold" style={{ color: 'var(--color-text)' }}>
            {editing ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-md hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-subtle)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* ── Patient ── */}
          <section>
            <span className={label} style={labelStyle}>Patient</span>
            {patient ? (
              <div className="flex items-center justify-between h-10 px-3 rounded-md border" style={{ borderColor: 'var(--color-primary-100)', background: 'var(--color-primary-50)' }}>
                <span className="text-[14px] font-medium truncate" style={{ color: 'var(--color-primary)' }}>
                  {patient.name}{patient.phone ? <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}> · {patient.phone}</span> : null}
                </span>
                {!editing && <button type="button" onClick={() => { setPatient(undefined); setTimeout(() => searchRef.current?.focus(), 0); }}
                                     className="text-[12px] font-medium" style={{ color: 'var(--color-primary)' }}>Changer</button>}
              </div>
            ) : creating ? (
              <div className="space-y-3 p-4 rounded-lg border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text)' }}><UserPlus size={15} /> Nouveau patient</span>
                  <button type="button" className="text-[12px] font-medium" style={{ color: 'var(--color-primary)' }} onClick={() => { setCreating(false); setTimeout(() => searchRef.current?.focus(), 0); }}>Rechercher plutôt</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={label} style={labelStyle}>Nom *</label>
                    <input autoFocus className={field} style={fieldStyle} value={np.lastName} onChange={e => setNp({ ...np, lastName: e.target.value })} /></div>
                  <div><label className={label} style={labelStyle}>Prénom *</label>
                    <input className={field} style={fieldStyle} value={np.firstName} onChange={e => setNp({ ...np, firstName: e.target.value })} /></div>
                </div>
                <div><label className={label} style={labelStyle}>Téléphone *</label>
                  <input type="tel" inputMode="tel" placeholder="06 00 00 00 00" className={field} style={fieldStyle} value={np.phone} onChange={e => { setNp({ ...np, phone: e.target.value }); setDupAccepted(false); }} /></div>
                {duplicate && !dupAccepted && (
                  <div role="alert" className="p-3 rounded-md text-[13px] space-y-2" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}>
                    <p className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />Ce numéro existe déjà : <strong>{duplicate.name}</strong>.</p>
                    <div className="flex gap-3">
                      <button type="button" className="font-semibold underline" onClick={() => pickPatient(duplicate)}>Utiliser ce patient</button>
                      <button type="button" className="underline" onClick={() => setDupAccepted(true)}>Créer quand même (autre personne)</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={label} style={labelStyle}>Date de naissance</label>
                    <input type="date" max={todayStr()} className={field} style={fieldStyle} value={np.dateOfBirth} onChange={e => setNp({ ...np, dateOfBirth: e.target.value })} /></div>
                  <div><label className={label} style={labelStyle}>Sexe</label>
                    <select className={field} style={fieldStyle} value={np.sex} onChange={e => setNp({ ...np, sex: e.target.value as '' | 'M' | 'F' })}>
                      <option value="">Non précisé</option><option value="M">Homme</option><option value="F">Femme</option>
                    </select></div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-faint)' }} />
                <input ref={searchRef} autoFocus type="text" value={term} onChange={e => setTerm(e.target.value)} onKeyDown={onSearchKey}
                       placeholder="Nom ou téléphone du patient" aria-label="Rechercher un patient" autoComplete="off"
                       className={`${field} pl-9`} style={fieldStyle} />
                {term.trim().length >= 2 && (
                  <ul role="listbox" className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border overflow-hidden"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                    {matches.map((p, i) => (
                      <li key={p.id} role="option" aria-selected={i === hi}>
                        <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pickPatient(p)}
                                className="w-full text-left px-3 py-2 text-[14px] flex justify-between gap-3"
                                style={{ background: i === hi ? 'var(--color-row-hover)' : 'transparent', color: 'var(--color-text)' }}>
                          <span className="truncate">{p.name}</span>
                          <span className="text-[12px] shrink-0" style={{ color: 'var(--color-text-subtle)' }}>{p.phone || 'Sans téléphone'}</span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button type="button" onClick={startCreating} className="w-full text-left px-3 py-2 text-[14px] flex items-center gap-2 border-t"
                              style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)', fontWeight: 500 }}>
                        <UserPlus size={15} /> Nouveau patient « {term.trim()} »
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* ── Motif ── */}
          <section>
            <span className={label} style={labelStyle}>Motif</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de consultation">
              {types.map(t => {
                const on = t.id === type?.id;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setTypeId(t.id)}
                          className="h-9 pl-3 pr-3.5 rounded-full border text-[13px] font-medium flex items-center gap-2 transition-colors"
                          style={{ borderColor: on ? t.color : 'var(--color-border)', background: on ? `${t.color}1A` : 'var(--color-surface)', color: 'var(--color-text)' }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                    {t.name}<span style={{ color: 'var(--color-text-subtle)', fontWeight: 400 }}>{t.duration} min</span>
                  </button>
                );
              })}
            </div>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={140} placeholder="Note (facultatif)" aria-label="Note"
                   className={`${field} mt-2`} style={fieldStyle} />
          </section>

          {/* ── Date, compteur, créneau ── */}
          <section>
            <div className="flex items-end justify-between gap-3 mb-1.5">
              <label htmlFor="rdv-date" className="text-[12px] font-medium" style={labelStyle}>Date</label>
              <span role="status" className="text-[12px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5"
                    style={{ background: info.closed ? 'var(--color-surface-alt)' : TONE_STYLE[tone].bg, color: info.closed ? 'var(--color-text-muted)' : TONE_STYLE[tone].fg }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: info.closed ? 'var(--color-text-faint)' : TONE_STYLE[tone].dot }} />
                {formatDayLong(date).replace(/ (\S+)$/, '')} : {counterLabel}
                {!info.closed && info.reserved > 0 && <span style={{ opacity: 0.75 }}>· +{info.reserved} réservées</span>}
              </span>
            </div>
            <div className="flex gap-2">
              <input id="rdv-date" type="date" min={todayStr()} value={date} className={`${field} flex-1`} style={fieldStyle}
                     onChange={e => { if (e.target.value) { datePicked.current = true; setDate(e.target.value); } }} />
              <button type="button" title="Premier jour disponible" onClick={() => { const d = firstAvailableDate(todayStr(), duration, others, settings); if (d) { datePicked.current = true; setDate(d); } else toastService.info('Aucun jour disponible prochainement.'); }}
                      className="h-10 px-3 rounded-md border text-[13px] font-medium flex items-center gap-1.5 bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                <CalendarDays size={15} /> Premier dispo
              </button>
            </div>
            <p className="text-[12px] mt-1.5" style={{ color: 'var(--color-text-subtle)' }}>{formatDayLong(date)}</p>

            {blocked && !forced ? (
              <div role="alert" className="mt-3 p-3 rounded-lg border space-y-2" style={{ borderColor: 'var(--color-danger-100)', background: 'var(--color-danger-50)' }}>
                <p className="text-[13px] font-medium flex items-center gap-2" style={{ color: 'var(--color-danger-700)' }}><AlertTriangle size={15} />{blockedMessage}</p>
                {!forceAsk ? (
                  <button type="button" onClick={() => setForceAsk(true)} className="h-8 px-3 rounded-md text-[12px] font-semibold border bg-white"
                          style={{ borderColor: 'var(--color-danger-100)', color: 'var(--color-danger-700)' }}>
                    Forcer (urgence)
                  </button>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Ajouter ce patient en urgence, hors capacité ?</span>
                    <button type="button" onClick={() => { setForced(true); setForceAsk(false); }} className="h-8 px-3 rounded-md text-[12px] font-semibold text-white" style={{ background: 'var(--color-danger)' }}>Confirmer l'urgence</button>
                    <button type="button" onClick={() => setForceAsk(false)} className="text-[12px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Annuler</button>
                  </div>
                )}
              </div>
            ) : forced ? (
              <div className="mt-3 p-3 rounded-lg border flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--color-danger-100)', background: 'var(--color-danger-50)' }}>
                <span className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-danger-700)' }}><Zap size={14} /> Rendez-vous d'urgence</span>
                <label className="text-[12px] flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>Heure (facultatif)
                  <input type="time" value={forcedTime} onChange={e => setForcedTime(e.target.value)} className="h-8 px-2 rounded-md border bg-white text-[13px]" style={fieldStyle} />
                </label>
                <button type="button" onClick={() => setForced(false)} className="ml-auto text-[12px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Annuler l'urgence</button>
              </div>
            ) : settings.mode === 'time' ? (
              <div className="mt-3 space-y-2.5" role="radiogroup" aria-label="Créneau">
                {periodBlocks.map(b => (
                  <div key={b.p}>
                    <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-subtle)' }}>{b.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {b.list.map(s => {
                        const on = s.time === time;
                        return (
                          <button key={s.time} type="button" role="radio" aria-checked={on} onClick={() => setTime(s.time)}
                                  className="h-8 px-2.5 rounded-md border text-[13px] tabular-nums transition-colors"
                                  style={{ borderColor: on ? 'var(--color-primary)' : 'var(--color-border)', background: on ? 'var(--color-primary)' : 'var(--color-surface)', color: on ? '#fff' : 'var(--color-text)', fontWeight: on ? 600 : 400 }}>
                            {s.time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-[14px]" style={{ color: 'var(--color-text)' }}>
                  Numéro d'ordre : <strong className="text-[16px]">n° {editing && editing.date === date && editing.queueNumber ? editing.queueNumber : nextQueueNumber(date, appointments, editing?.id)}</strong>
                </span>
                {info.schedule.morning && info.schedule.afternoon && (
                  <div className="flex rounded-md p-0.5" style={{ background: 'var(--color-border)' }} role="radiogroup" aria-label="Demi-journée">
                    {(['morning', 'afternoon'] as const).map(p => {
                      const cap = info[p].cap; const full = cap != null && info[p].count >= cap;
                      return (
                        <button key={p} type="button" role="radio" aria-checked={period === p} disabled={full} onClick={() => setPeriod(p)}
                                className="px-3 py-1 rounded text-[12px] font-medium disabled:opacity-40"
                                style={period === p ? { background: '#fff', color: 'var(--color-primary)' } : { color: 'var(--color-text-subtle)' }}>
                          {p === 'morning' ? 'Matin' : 'Après-midi'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {sameDay.length > 0 && (
              <p role="alert" className="mt-3 text-[13px] p-2.5 rounded-md flex items-start gap-2" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                Ce patient a déjà un rendez-vous ce jour-là ({sameDay.map(a => `${a.time || (a.queueNumber ? `n° ${a.queueNumber}` : 'sans heure')} · ${STATUS_LABEL[a.status].toLowerCase()}`).join(', ')}).
              </p>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t rounded-b-xl" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <span className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
            <kbd className="px-1.5 py-0.5 rounded border text-[11px]" style={{ borderColor: 'var(--color-border)' }}>Entrée</kbd> valider · <kbd className="px-1.5 py-0.5 rounded border text-[11px]" style={{ borderColor: 'var(--color-border)' }}>Échap</kbd> fermer
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>Annuler</button>
            <button ref={submitRef} type="submit" disabled={!canSubmit || saving} className="h-10 px-5 rounded-lg text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: forced ? 'var(--color-danger)' : 'var(--color-primary)' }}>
              {editing ? 'Enregistrer' : forced ? 'Enregistrer l\'urgence' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default QuickBookingModal;
