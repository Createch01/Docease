import React, { useEffect, useState } from 'react';
import { Users, ArrowLeft, Clock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Patient } from '../types';

interface WaitingRoomKioskProps {
  onExit: () => void;
}

// Public, PIN-free display of today's queue — names and arrival order only, no
// medical data (allergies, pathologies, etc. never reach this component). Meant
// to stay on screen continuously at reception without forcing staff to
// re-authenticate just to glance at who's waiting.
const WaitingRoomKiosk: React.FC<WaitingRoomKioskProps> = ({ onExit }) => {
  const [queue, setQueue] = useState<Patient[]>(dataService.getTodayQueue());
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail?.key === 'meddoc_today_queue' || e.detail?.key === 'all') {
        setQueue(dataService.getTodayQueue());
      }
    };
    window.addEventListener('meddoc_data_update', handleUpdate);
    const clock = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => {
      window.removeEventListener('meddoc_data_update', handleUpdate);
      clearInterval(clock);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50 p-8 text-white">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/10 p-4 rounded-2xl ring-4 ring-emerald-500/5">
            <Users className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Salle d'attente</h1>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Accès libre — sans PIN</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-white/50 font-bold text-sm">
            <Clock size={16} />
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
          >
            <ArrowLeft size={16} /> Se connecter
          </button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/20 font-black uppercase tracking-[0.3em] text-sm">
          Aucun patient en attente
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
          {queue.map((p, i) => (
            <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-black text-lg shrink-0">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-lg truncate">{p.name}</p>
                <p className="text-white/40 text-xs font-bold uppercase tracking-wider">{p.type === 'Child' ? 'Enfant' : p.type === 'Woman' ? 'Femme' : 'Adulte'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WaitingRoomKiosk;
