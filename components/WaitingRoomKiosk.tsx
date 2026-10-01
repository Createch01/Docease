import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Users, Lock, Clock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { securityService } from '../services/securityService';

interface WaitingRoomKioskProps {
  onExit: () => void;
}

interface KioskEntry {
  number: number;
  label: string; // « Amine B. »
}

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

// "Nom Prénom" → « Prénom N. » (aperçu navigateur seulement ; sous Tauri c'est Rust
// qui compose l'affichage et ne renvoie rien d'autre).
const previewLabel = (name: string) => {
  const [last = '', ...first] = name.trim().split(/\s+/);
  return `${first.join(' ')} ${last.charAt(0).toUpperCase()}.`.trim();
};

// Affichage de la salle d'attente, lancé depuis une session ouverte. Il ne montre que
// le numéro d'ordre et « Prénom I. » — ni motif, ni heure, ni donnée médicale : il ne
// reçoit rien de plus (commande Rust `kiosk_queue`). En sortir demande le mot de
// passe de la session, pour qu'un patient ne puisse pas revenir à l'application.
const WaitingRoomKiosk: React.FC<WaitingRoomKioskProps> = ({ onExit }) => {
  const [entries, setEntries] = useState<KioskEntry[]>([]);
  const [now, setNow] = useState(new Date());
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const rows = isTauri()
          ? await invoke<KioskEntry[]>('kiosk_queue')
          : dataService.getTodayQueue().map((p, i) => ({ number: i + 1, label: previewLabel(p.name) }));
        if (alive) setEntries(rows);
      } catch { /* session verrouillée : on garde l'affichage précédent */ }
    };
    void refresh();
    const poll = setInterval(refresh, 5000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => { alive = false; clearInterval(poll); clearInterval(clock); };
  }, []);

  const tryExit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (await securityService.verifyPassword(password)) { onExit(); return; }
      setError('Mot de passe incorrect.');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Vérification impossible.');
    }
    setPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50 p-8 text-white">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/10 p-4 rounded-2xl ring-4 ring-emerald-500/5">
            <Users className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Salle d'attente</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-white/50 font-bold text-sm">
            <Clock size={16} />
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {askPassword ? (
            <form onSubmit={tryExit} className="flex items-center gap-2">
              <input
                type="password" autoFocus value={password} maxLength={64} placeholder="Mot de passe"
                onChange={e => { setPassword(e.target.value); setError(''); }}
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl text-sm font-bold">OK</button>
              <button type="button" onClick={() => { setAskPassword(false); setPassword(''); setError(''); }} className="text-white/50 text-sm px-2">Annuler</button>
            </form>
          ) : (
            <button
              onClick={() => setAskPassword(true)}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              <Lock size={16} /> Quitter
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-red-400 text-sm font-bold mb-4 text-right">{error}</p>}

      {entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/20 font-black uppercase tracking-[0.3em] text-sm">
          Aucun patient en attente
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
          {entries.map(e => (
            <div key={e.number} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-black text-xl shrink-0">
                {e.number}
              </div>
              <p className="font-bold text-2xl truncate">{e.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WaitingRoomKiosk;
