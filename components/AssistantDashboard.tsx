import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Users, Wallet, Clock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { sessionService } from '../services/sessionService';

interface Props {
  onNavigate: (view: any) => void;
}

// Tableau de bord de l'assistante : rendez-vous du jour et salle d'attente. Aucun
// chiffre financier, aucune donnée médicale.
const AssistantDashboard: React.FC<Props> = ({ onNavigate }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = () => setTick(t => t + 1);
    window.addEventListener('meddoc_data_update', h);
    return () => window.removeEventListener('meddoc_data_update', h);
  }, []);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const appointments = useMemo(
    () => dataService.getAppointmentsByDate(today)
      .filter(a => a.status !== 'REJECTED' && a.status !== 'NO_SHOW')
      .sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [today, tick],
  );
  const queue = dataService.getTodayQueue();
  const name = sessionService.get()?.name || '';

  const tile = (icon: React.ReactNode, label: string, value: number | string, view: string) => (
    <button type="button" onClick={() => onNavigate(view)}
      className="bg-white rounded-xl border p-5 text-left transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>{icon}{label}</div>
      <div className="text-[30px] font-bold tabular-nums mt-2" style={{ color: 'var(--color-text)' }}>{value}</div>
    </button>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-[22px] font-semibold" style={{ color: 'var(--color-text)' }}>Bonjour {name}</h1>
        <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-subtle)' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {tile(<CalendarRange size={15} />, 'Rendez-vous du jour', appointments.length, 'appointments')}
        {tile(<Users size={15} />, "En salle d'attente", queue.length, 'patients')}
        {tile(<Wallet size={15} />, 'Encaissement', 'Ouvrir', 'cashier')}
      </div>

      <div className="bg-white rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="px-5 py-3 text-[13px] font-semibold border-b" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
          Prochains rendez-vous
        </div>
        {appointments.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] italic" style={{ color: 'var(--color-text-faint)' }}>Aucun rendez-vous aujourd'hui.</div>
        ) : (
          <ul>
            {appointments.slice(0, 12).map(a => (
              <li key={a.id} className="px-5 py-3 flex items-center gap-3 text-[13px] border-t first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
                <span className="flex items-center gap-1.5 w-16 tabular-nums" style={{ color: 'var(--color-text-subtle)' }}>
                  <Clock size={13} />{a.time || '—'}
                </span>
                <span className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AssistantDashboard;
