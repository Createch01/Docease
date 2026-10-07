/**
 * Rappels WhatsApp de demain — envoi un par un. Ouvert depuis le panneau « À faire » (cloche),
 * pour le médecin comme pour l'assistante : seuls nom et heure s'affichent, aucune donnée
 * médicale. La liste se vide quand un envoi est marqué (reminderSentAt posé par Rust).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Appointment } from '../../types';
import { dataService } from '../../services/dataService';
import { todayStr } from '../../services/appointmentService';
import { selectTomorrowReminders } from '../../services/messaging/reminders';
import WhatsAppSendModal from './WhatsAppSendModal';

const RemindersModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tick, setTick] = useState(0);
  const [sending, setSending] = useState<Appointment | null>(null);

  useEffect(() => {
    const refresh = () => setTick(t => t + 1);
    window.addEventListener('meddoc_data_update', refresh);
    return () => window.removeEventListener('meddoc_data_update', refresh);
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, sending]);

  const list = useMemo(() => {
    const items = selectTomorrowReminders(dataService.getAppointments(), dataService.getAllPatients(), todayStr());
    return [...items].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || (a.queueNumber || 0) - (b.queueNumber || 0));
  }, [tick]);

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
         onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Rappels de demain" className="w-full max-w-[460px] max-h-[88vh] flex flex-col rounded-xl border"
           style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-[17px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}><MessageCircle size={18} /> Rappels de demain</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-md hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-subtle)' }}><X size={18} /></button>
        </div>
        <div className="px-6 pb-5 overflow-y-auto">
          {list.length === 0 ? (
            <p className="py-8 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Tous les rappels de demain sont faits.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {list.map(a => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-[13px]" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="w-14 shrink-0 tabular-nums font-medium" style={{ color: 'var(--color-text-muted)' }}>{a.time || (a.queueNumber ? `n° ${a.queueNumber}` : '—')}</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--color-text)' }}>{a.patientName}</span>
                  <button type="button" onClick={() => setSending(a)} className="h-8 px-3 rounded-md text-[12px] font-medium text-white" style={{ background: 'var(--color-primary)' }}>Envoyer</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {sending && <WhatsAppSendModal appointment={sending} settings={dataService.getAppointmentSettings()} initialKind="reminder" onClose={() => setSending(null)} onLeave={() => { setSending(null); onClose(); }} />}
    </div>
  );
};

export default RemindersModal;
