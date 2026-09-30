import React, { useMemo, useState } from 'react';
import { CalendarOff, FolderOpen, MoreHorizontal, Plus, Search, Stethoscope } from 'lucide-react';
import { Appointment, AppointmentSettings } from '../../types';
import {
  addDays, capacityTone, colorOf, durationOf, formatDayLong, getDayInfo, isActive, mondayOf, nextStatuses, parseDate,
  sortDay, toMinutes, todayStr, TONE_STYLE,
} from '../../services/appointmentService';
import { AgendaActions, STATUS_ACTION, StatusBadge, TypeChip, slotLabel } from './AppointmentBits';

const card = 'rounded-xl border';
const cardStyle = { background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' } as React.CSSProperties;

interface ViewProps {
  appointments: Appointment[];
  settings: AppointmentSettings;
  actions: AgendaActions;
  onOpen: (a: Appointment) => void;
  onNew: (date: string, time?: string) => void;
}

const iconBtn = 'w-8 h-8 rounded-md flex items-center justify-center hover:bg-[var(--color-surface-alt)] transition-colors';

// ─────────────────────────────── Vue Jour ───────────────────────────────
export const DayView: React.FC<ViewProps & { date: string }> = ({ date, appointments, settings, actions, onOpen, onNew }) => {
  const info = getDayInfo(date, appointments, settings);
  const list = useMemo(() => sortDay(appointments.filter(a => a.date === date && a.status !== 'REJECTED')), [appointments, date]);
  const cancelled = useMemo(() => appointments.filter(a => a.date === date && a.status === 'REJECTED'), [appointments, date]);
  const isPast = date < todayStr();

  return (
    <div className="space-y-3">
      {info.closed && (
        <div className={`${card} px-4 py-3 flex items-center gap-2.5 text-[13px]`} style={{ ...cardStyle, color: 'var(--color-text-muted)' }}>
          <CalendarOff size={16} /> {info.closedReason}. {list.length === 0 ? 'Aucun rendez-vous.' : ''}
        </div>
      )}
      <div className={card} style={cardStyle}>
        {list.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>Aucun rendez-vous ce jour</p>
            {!isPast && !info.closed && (
              <button type="button" onClick={() => onNew(date)} className="mt-3 h-9 px-4 rounded-lg text-[13px] font-medium text-white inline-flex items-center gap-1.5" style={{ background: 'var(--color-primary)' }}>
                <Plus size={15} /> Nouveau RDV
              </button>
            )}
          </div>
        ) : (
          <ul>
            {list.map((a, i) => {
              const next = nextStatuses(a.status)[0];
              const live = a.status !== 'DONE' && a.status !== 'NO_SHOW' && a.status !== 'REJECTED';
              return (
                <li key={a.id} className="flex items-center gap-4 px-4 py-3" style={{ borderTop: i ? '1px solid var(--color-border)' : undefined, opacity: a.status === 'DONE' || a.status === 'NO_SHOW' ? 0.75 : 1 }}>
                  <span className="w-14 shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: a.isEmergency ? 'var(--color-danger)' : 'var(--color-primary)' }}>{slotLabel(a)}</span>
                  <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: colorOf(a, settings) }} />
                  <button type="button" onClick={() => onOpen(a)} className="min-w-0 flex-1 text-left" title="Voir le détail du rendez-vous">
                    <span className="block text-[14px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</span>
                    <span className="flex items-center gap-2 text-[12px] min-w-0" style={{ color: 'var(--color-text-subtle)' }}>
                      <TypeChip a={a} settings={settings} />
                      {a.note && <span className="truncate">· {a.note}</span>}
                    </span>
                  </button>
                  <StatusBadge status={a.status} />
                  <div className="flex items-center gap-1 shrink-0">
                    {next && (
                      <button type="button" title={STATUS_ACTION[next].tip} onClick={() => actions.changeStatus(a, next, appointments, settings)}
                              className="h-8 px-3 rounded-md text-[13px] font-medium mr-1"
                              style={next === 'CONFIRMED'
                                ? { border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', background: '#fff' }
                                : { background: 'var(--color-primary)', color: '#fff' }}>
                        {STATUS_ACTION[next].label}
                      </button>
                    )}
                    <button type="button" className={iconBtn} style={{ color: 'var(--color-text-muted)' }} title="Ouvrir le dossier du patient" aria-label="Ouvrir le dossier" onClick={() => actions.openDossier(a)}><FolderOpen size={16} /></button>
                    {live && <button type="button" className={iconBtn} style={{ color: 'var(--color-text-muted)' }} title="Démarrer la consultation" aria-label="Démarrer la consultation" onClick={() => actions.startConsultation(a, appointments, settings)}><Stethoscope size={16} /></button>}
                    <button type="button" className={iconBtn} style={{ color: 'var(--color-text-muted)' }} title="Plus d'actions : déplacer, absent, annuler, supprimer" aria-label="Plus d'actions" onClick={() => onOpen(a)}><MoreHorizontal size={16} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {cancelled.length > 0 && (
        <p className="text-[12px] px-1" style={{ color: 'var(--color-text-subtle)' }}>
          {cancelled.length} rendez-vous annulé{cancelled.length > 1 ? 's' : ''} ·{' '}
          {cancelled.map((a, i) => <button key={a.id} type="button" onClick={() => onOpen(a)} className="underline mr-1">{a.patientName}{i < cancelled.length - 1 ? ',' : ''}</button>)}
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────── Vue Semaine ───────────────────────────────
const PX_PER_MIN = 1.5;
const GUTTER = 44;

const workRanges = (date: string, settings: AppointmentSettings) => {
  const s = getDayInfo(date, [], settings);
  return s.closed ? [] : [s.schedule.morning, s.schedule.afternoon].filter(Boolean).map(r => ({ from: toMinutes(r!.start), to: toMinutes(r!.end) }));
};

export const WeekView: React.FC<ViewProps & { date: string; onPickDay: (d: string) => void }> = ({ date, appointments, settings, onOpen, onNew, onPickDay }) => {
  const today = todayStr();
  const monday = mondayOf(date);
  // Jours ouverts selon les horaires du cabinet (+ tout jour fermé portant un rendez-vous).
  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    return all.filter(d => !settings.weekly[parseDate(d).getDay()].closed || appointments.some(a => a.date === d && isActive(a)));
  }, [monday, settings, appointments]);

  const apptsOf = (d: string) => appointments.filter(a => a.date === d && a.status !== 'REJECTED');

  // Bornes de la grille : plus petite ouverture / plus grande fermeture de la semaine, arrondies à l'heure.
  const { startMin, endMin } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    days.forEach(d => {
      workRanges(d, settings).forEach(r => { lo = Math.min(lo, r.from); hi = Math.max(hi, r.to); });
      apptsOf(d).filter(a => a.time).forEach(a => { lo = Math.min(lo, toMinutes(a.time!)); hi = Math.max(hi, toMinutes(a.time!) + durationOf(a, settings)); });
    });
    if (!isFinite(lo)) { lo = 8 * 60; hi = 18 * 60; }
    return { startMin: Math.floor(lo / 60) * 60, endMin: Math.ceil(hi / 60) * 60 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, settings, appointments]);

  const cols = { display: 'grid', gridTemplateColumns: `${settings.mode === 'time' ? `${GUTTER}px ` : ''}repeat(${days.length}, minmax(0, 1fr))` } as React.CSSProperties;
  const height = (endMin - startMin) * PX_PER_MIN;
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin + i * 60);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const header = (
    <div style={cols} className="sticky top-0 z-10 border-b" >
      {settings.mode === 'time' && <div style={{ background: 'var(--color-surface)' }} />}
      {days.map(d => {
        const info = getDayInfo(d, appointments, settings);
        const tone = capacityTone(info.active, info.max);
        const isToday = d === today;
        return (
          <button key={d} type="button" onClick={() => onPickDay(d)} title={`Ouvrir ${formatDayLong(d)} en vue Jour`}
                  className="py-2 px-1 text-center border-l min-w-0" style={{ borderColor: 'var(--color-border)', background: isToday ? 'var(--color-primary-50)' : 'var(--color-surface)' }}>
            <span className="block text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>{parseDate(d).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</span>
            <span className="block text-[16px] font-semibold leading-tight" style={{ color: isToday ? 'var(--color-primary)' : 'var(--color-text)' }}>{parseDate(d).getDate()}</span>
            <span className="block text-[11px] mt-0.5 truncate" style={{ color: info.closed ? 'var(--color-text-faint)' : TONE_STYLE[tone].fg }}>
              {info.closed ? 'Fermé' : `${info.active}/${info.max}`}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ─── Mode « par ordre d'arrivée » : colonnes-listes numérotées ───
  if (settings.mode === 'order') {
    return (
      <div className={`${card} overflow-hidden`} style={cardStyle}>
        {header}
        <div style={cols} className="min-h-[320px]">
          {days.map(d => {
            const info = getDayInfo(d, appointments, settings);
            const list = sortDay(apptsOf(d));
            return (
              <div key={d} className="border-l p-1.5 space-y-1.5 min-w-0" style={{ borderColor: 'var(--color-border)', background: info.closed ? 'var(--color-surface-alt)' : undefined }}>
                {list.map(a => (
                  <button key={a.id} type="button" onClick={() => onOpen(a)} title={`${a.patientName} · ${a.consultationType || ''}`}
                          className="w-full text-left rounded-md px-2 py-1.5 flex items-center gap-1.5 min-w-0"
                          style={{ background: `${colorOf(a, settings)}1F`, borderLeft: `3px solid ${colorOf(a, settings)}`, opacity: a.status === 'DONE' || a.status === 'NO_SHOW' ? 0.55 : 1 }}>
                    <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: a.isEmergency ? 'var(--color-danger)' : 'var(--color-text)' }}>{a.queueNumber || '·'}</span>
                    <span className="text-[12px] truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</span>
                  </button>
                ))}
                {!info.closed && d >= today && (
                  <button type="button" onClick={() => onNew(d)} title={`Nouveau rendez-vous le ${formatDayLong(d)}`} className="w-full h-7 rounded-md flex items-center justify-center hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-subtle)' }}>
                    <Plus size={14} />
                  </button>
                )}
                {info.closed && list.length === 0 && <p className="text-[11px] text-center pt-2" style={{ color: 'var(--color-text-faint)' }}>{info.closedReason}</p>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Mode « par heure » : grille horaire selon les horaires du cabinet ───
  const untimed = days.map(d => apptsOf(d).filter(a => !a.time));
  return (
    <div className={`${card} overflow-hidden`} style={cardStyle}>
      {header}
      {untimed.some(l => l.length) && (
        <div style={cols} className="border-b" >
          <div className="text-[11px] flex items-center justify-center text-center leading-tight" style={{ color: 'var(--color-text-faint)' }}>Sans heure</div>
          {untimed.map((l, i) => (
            <div key={days[i]} className="border-l p-1 flex flex-wrap gap-1 min-w-0" style={{ borderColor: 'var(--color-border)' }}>
              {l.map(a => (
                <button key={a.id} type="button" onClick={() => onOpen(a)} className="px-1.5 py-0.5 rounded text-[11px] truncate max-w-full" style={{ background: a.isEmergency ? 'var(--color-danger-50)' : 'var(--color-surface-alt)', color: a.isEmergency ? 'var(--color-danger-700)' : 'var(--color-text)' }}>
                  {a.queueNumber ? `${a.queueNumber} · ` : ''}{a.patientName}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={{ ...cols, height }}>
        <div className="relative">
          {hours.map(h => (
            <span key={h} className={`absolute right-1.5 text-[11px] tabular-nums ${h === startMin ? 'translate-y-1' : '-translate-y-1/2'}`} style={{ top: (h - startMin) * PX_PER_MIN, color: 'var(--color-text-faint)' }}>
              {String(h / 60).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {days.map(d => {
          const ranges = workRanges(d, settings);
          // Zones hors horaires : complément des plages d'ouverture.
          const off: { from: number; to: number }[] = [];
          let cursor = startMin;
          ranges.forEach(r => { if (r.from > cursor) off.push({ from: cursor, to: r.from }); cursor = Math.max(cursor, r.to); });
          if (cursor < endMin) off.push({ from: cursor, to: endMin });
          const timed = apptsOf(d).filter(a => a.time);
          return (
            <div key={d} className="relative border-l min-w-0" style={{
              borderColor: 'var(--color-border)', cursor: d >= today ? 'pointer' : 'default',
              backgroundImage: `repeating-linear-gradient(to bottom, var(--color-border) 0, var(--color-border) 1px, transparent 1px, transparent ${60 * PX_PER_MIN}px)`,
            }}
                 onClick={e => {
                   if (d < today) return;
                   const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                   const m = startMin + Math.floor(y / PX_PER_MIN / settings.slotStep) * settings.slotStep;
                   const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
                   onNew(d, t);
                 }}>
              {off.map((z, i) => (
                <div key={i} className="absolute inset-x-0 pointer-events-none" style={{ top: (z.from - startMin) * PX_PER_MIN, height: (z.to - z.from) * PX_PER_MIN, background: 'rgba(113,128,150,0.09)' }} />
              ))}
              {d === today && nowMin >= startMin && nowMin <= endMin && (
                <div className="absolute inset-x-0 pointer-events-none z-[2]" style={{ top: (nowMin - startMin) * PX_PER_MIN, borderTop: '2px solid var(--color-danger)' }} />
              )}
              {timed.map(a => {
                const top = (toMinutes(a.time!) - startMin) * PX_PER_MIN;
                const h = Math.max(durationOf(a, settings) * PX_PER_MIN - 2, 26);
                const color = colorOf(a, settings);
                return (
                  <button key={a.id} type="button" onClick={e => { e.stopPropagation(); onOpen(a); }}
                          title={`${a.time} · ${a.patientName} · ${a.consultationType || ''} (${durationOf(a, settings)} min)`}
                          className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-left overflow-hidden z-[1]"
                          style={{ top, height: h, background: `${color}26`, borderLeft: `3px solid ${color}`, opacity: a.status === 'DONE' || a.status === 'NO_SHOW' ? 0.55 : 1 }}>
                    <span className="block text-[12px] font-semibold leading-tight truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</span>
                    {h >= 40 && <span className="block text-[11px] leading-tight truncate" style={{ color: 'var(--color-text-muted)' }}>{a.time} · {a.consultationType}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────── Vue Liste ───────────────────────────────
export const ListView: React.FC<Omit<ViewProps, 'onNew' | 'actions'>> = ({ appointments, settings, onOpen }) => {
  const [term, setTerm] = useState('');
  const [past, setPast] = useState(false);
  const today = todayStr();
  const t = term.trim().toLowerCase();
  const digits = t.replace(/\D/g, '');

  const groups = useMemo(() => {
    const rows = appointments.filter(a => {
      if (t) return a.patientName.toLowerCase().includes(t) || (digits.length >= 3 && (a.phone || '').replace(/\D/g, '').includes(digits));
      return past || a.date >= today;
    });
    const dates = [...new Set(rows.map(a => a.date))].sort((x, y) => past || t ? y.localeCompare(x) : x.localeCompare(y));
    return dates.slice(0, 60).map(d => ({ date: d, items: sortDay(rows.filter(a => a.date === d)) }));
  }, [appointments, t, digits, past, today]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-faint)' }} />
          <input type="text" value={term} onChange={e => setTerm(e.target.value)} placeholder="Rechercher un patient ou un téléphone" aria-label="Rechercher"
                 className="w-full h-10 pl-9 pr-3 rounded-md border text-[14px] outline-none bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }} />
        </div>
        <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={past} onChange={e => setPast(e.target.checked)} /> Inclure l'historique
        </label>
      </div>
      {groups.length === 0 ? (
        <div className={`${card} py-14 text-center text-[14px]`} style={{ ...cardStyle, color: 'var(--color-text-subtle)' }}>Aucun rendez-vous.</div>
      ) : groups.map(g => (
        <div key={g.date} className={`${card} overflow-hidden`} style={cardStyle}>
          <div className="px-4 py-2 text-[13px] font-semibold border-b" style={{ background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            {formatDayLong(g.date)} <span className="font-normal" style={{ color: 'var(--color-text-subtle)' }}>· {g.items.filter(a => a.status !== 'REJECTED').length} rendez-vous</span>
          </div>
          <ul>
            {g.items.map((a, i) => (
              <li key={a.id}>
                <button type="button" onClick={() => onOpen(a)} className="w-full text-left px-4 py-2.5 flex items-center gap-4 hover:bg-[var(--color-surface-alt)]" style={{ borderTop: i ? '1px solid var(--color-border)' : undefined }}>
                  <span className="w-14 shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--color-primary)' }}>{slotLabel(a)}</span>
                  <span className="flex-1 min-w-0 text-[14px] truncate" style={{ color: 'var(--color-text)', textDecoration: a.status === 'REJECTED' ? 'line-through' : undefined }}>{a.patientName}</span>
                  <span className="hidden md:block"><TypeChip a={a} settings={settings} /></span>
                  <span className="hidden lg:block w-28 text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>{a.phone}</span>
                  <StatusBadge status={a.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
