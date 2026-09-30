import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Appointment, AppointmentSettings } from '../../types';
import {
  addDays, capacityTone, formatDayLong, getDayInfo, isActive, mondayOf, parseDate, sortDay, toDateStr, todayStr, TONE_STYLE,
} from '../../services/appointmentService';
import { STATUS_LABEL } from '../../services/appointmentService';
import { slotLabel } from './AppointmentBits';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface CalProps {
  selected: string;
  appointments: Appointment[];
  settings: AppointmentSettings;
  onSelect: (date: string) => void;
}

/**
 * Mini-calendrier compact. Jours passés lisibles et cliquables (historique) ;
 * jours des mois voisins affichés pour compléter les lignes ; point de couleur
 * selon le remplissage ; jours fermés / fériés barrés.
 */
export const MiniCalendar: React.FC<CalProps> = ({ selected, appointments, settings, onSelect }) => {
  const [month, setMonth] = useState(() => selected.slice(0, 7));
  // Suit la date choisie ailleurs (navigation de l'en-tête, « Aujourd'hui »).
  useEffect(() => setMonth(selected.slice(0, 7)), [selected]);

  const today = todayStr();
  const days = useMemo(() => {
    const first = `${month}-01`;
    const start = mondayOf(first);
    const last = toDateStr(new Date(parseDate(first).getFullYear(), parseDate(first).getMonth() + 1, 0));
    const weeks = Math.round((parseDate(mondayOf(last)).getTime() - parseDate(start).getTime()) / 864e5 / 7) + 1; // round : les changements d'heure décalent de quelques heures
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  }, [month]);

  const shiftMonth = (n: number) => {
    const d = parseDate(`${month}-01`);
    d.setMonth(d.getMonth() + n);
    setMonth(toDateStr(d).slice(0, 7));
  };
  const title = parseDate(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>{title.charAt(0).toUpperCase() + title.slice(1)}</h3>
        <div className="flex gap-1">
          <button type="button" aria-label="Mois précédent" title="Mois précédent" onClick={() => shiftMonth(-1)} className="p-1 rounded-md hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-muted)' }}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Mois suivant" title="Mois suivant" onClick={() => shiftMonth(1)} className="p-1 rounded-md hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-muted)' }}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center mb-1">
        {WEEKDAYS.map((d, i) => <span key={i} className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(d => {
          const info = getDayInfo(d, appointments, settings);
          const inMonth = d.startsWith(month);
          const isSel = d === selected;
          const isToday = d === today;
          const tone = capacityTone(info.active, info.max);
          const title = info.closed ? `${formatDayLong(d)} : ${info.closedReason?.toLowerCase()}` : `${formatDayLong(d)} : ${info.normalActive}/${info.normalCap} places`;
          return (
            <button key={d} type="button" title={title} aria-label={title} aria-current={isSel ? 'date' : undefined} onClick={() => onSelect(d)}
                    className="h-9 rounded-md flex flex-col items-center justify-center gap-0.5 transition-colors relative"
                    style={{
                      background: isSel ? 'var(--color-primary)' : 'transparent',
                      color: isSel ? '#fff' : inMonth ? (info.closed ? 'var(--color-text-faint)' : 'var(--color-text)') : 'var(--color-text-faint)',
                      boxShadow: isToday && !isSel ? 'inset 0 0 0 1.5px var(--color-primary)' : undefined,
                      fontWeight: isSel || isToday ? 600 : 400,
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--color-surface-alt)'; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
              <span className="text-[13px] leading-none tabular-nums" style={{ textDecoration: info.closed ? 'line-through' : undefined }}>{parseDate(d).getDate()}</span>
              <span className="w-1 h-1 rounded-full" style={{ background: info.closed || info.active === 0 ? 'transparent' : isSel ? '#fff' : TONE_STYLE[tone].dot }} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Prochains patients : 4 prochains rendez-vous à venir, tous jours confondus. */
export const UpcomingList: React.FC<{
  appointments: Appointment[]; settings: AppointmentSettings; onOpen: (a: Appointment) => void; limit?: number;
}> = ({ appointments, settings, onOpen, limit = 4 }) => {
  const today = todayStr();
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = useMemo(() => {
    const live = appointments.filter(a => isActive(a) && ['PENDING', 'CONFIRMED', 'ARRIVED', 'IN_CONSULTATION'].includes(a.status) && a.date >= today);
    const dates = [...new Set(live.map(a => a.date))].sort();
    return dates.flatMap(d => sortDay(live.filter(a => a.date === d))
      .filter(a => d > today || a.status === 'ARRIVED' || a.status === 'IN_CONSULTATION' || !a.time || a.time >= nowTime))
      .slice(0, limit);
  }, [appointments, today, nowTime, limit]);

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}>
      <h3 className="text-[14px] font-semibold mb-2" style={{ color: 'var(--color-text)' }}>Prochains patients</h3>
      {upcoming.length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--color-text-subtle)' }}>Aucun rendez-vous à venir.</p>
      ) : (
        <ul className="-mx-2">
          {upcoming.map(a => (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a)} title={`Voir ${a.patientName}`}
                      className="w-full text-left px-2 py-2 rounded-md flex items-center gap-3 hover:bg-[var(--color-surface-alt)]">
                <span className="w-12 shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--color-primary)' }}>{slotLabel(a)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</span>
                  <span className="block text-[12px] truncate" style={{ color: 'var(--color-text-subtle)' }}>
                    {a.date === today ? 'Aujourd\'hui' : formatDayLong(a.date).replace(/^\S+ /, '')} · {a.status === 'PENDING' || a.status === 'CONFIRMED' ? (a.consultationType || 'Consultation') : STATUS_LABEL[a.status]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
