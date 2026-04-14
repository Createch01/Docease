import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff, User, ArrowLeft, ChevronRight } from 'lucide-react';
import { dataService } from '../services/dataService';
import { AppUser } from '../types';

interface PinDialogProps {
  onAuthenticated: () => void;
}

const PinDialog: React.FC<PinDialogProps> = ({ onAuthenticated }) => {
  const [selectedUser, setSelectedUser] = useState<AppUser | 'admin' | null>(null);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');

  const doctor = dataService.getDoctorInfo();
  const collaborators = dataService.getUsers();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let isAuthenticated = false;
    let authUser: AppUser | undefined;

    if (selectedUser === 'admin') {
      if (pin === doctor.pin) {
        isAuthenticated = true;
        authUser = {
          id: 'admin',
          name: doctor.nameFr,
          pin: doctor.pin || '',
          role: 'Admin',
          createdAt: new Date().toISOString()
        };
      }
    } else if (selectedUser && typeof selectedUser !== 'string') {
      if (pin === selectedUser.pin) {
        isAuthenticated = true;
        authUser = selectedUser;
      }
    }

    if (isAuthenticated) {
      dataService.setActiveUser(authUser);
      onAuthenticated();
    } else {
      setError('Code PIN incorrect. Veuillez réessayer.');
      setPin('');
    }
  };

  if (!selectedUser) {
    return (
      <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="bg-emerald-500/10 p-5 rounded-full mb-6 mx-auto w-fit ring-8 ring-emerald-500/5">
              <ShieldCheck className="w-16 h-16 text-emerald-500" />
            </div>
            <h1 className="text-4xl font-black text-white mb-3 tracking-tight">DocEase</h1>
            <p className="text-emerald-100/60 font-bold uppercase tracking-[0.3em] text-xs">Système d'accès sécurisé</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            {/* Admin Option */}
            <button
              onClick={() => setSelectedUser('admin')}
              className="group bg-white/5 hover:bg-emerald-600 border border-white/10 hover:border-emerald-500 p-8 rounded-[2.5rem] transition-all duration-300 text-left relative overflow-hidden active:scale-95"
            >
              <div className="relative z-10">
                <div className="text-emerald-500 group-hover:text-white mb-4 bg-white/5 group-hover:bg-white/20 p-4 rounded-2xl w-fit transition-colors">
                  <User size={32} />
                </div>
                <h3 className="text-xl font-black text-white mb-1 uppercase">Administrateur</h3>
                <p className="text-white/40 group-hover:text-white/70 text-sm font-bold">{doctor.nameFr}</p>
                <ChevronRight className="absolute right-0 top-1/2 -translate-y-1/2 text-white/20 group-hover:text-white group-hover:translate-x-2 transition-all" size={24} />
              </div>
            </button>

            {/* Collaborators */}
            {collaborators.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className="group bg-white/5 hover:bg-emerald-600 border border-white/10 hover:border-emerald-500 p-8 rounded-[2.5rem] transition-all duration-300 text-left relative overflow-hidden active:scale-95"
              >
                <div className="relative z-10">
                  <div className="text-emerald-400 group-hover:text-white mb-4 bg-white/5 group-hover:bg-white/20 p-4 rounded-2xl w-fit transition-colors">
                    <User size={32} />
                  </div>
                  <h3 className="text-xl font-black text-white mb-1 uppercase">{u.name}</h3>
                  <p className="text-white/40 group-hover:text-white/70 text-sm font-bold">Collaborateur</p>
                  <ChevronRight className="absolute right-0 top-1/2 -translate-y-1/2 text-white/20 group-hover:text-white group-hover:translate-x-2 transition-all" size={24} />
                </div>
              </button>
            ))}
          </div>

          <p className="text-center text-white/20 text-[10px] font-black uppercase tracking-[0.4em] mt-16">
            Protection des données de santé © 2026
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full p-10 text-center animate-in zoom-in-95 duration-300">
        <button
          onClick={() => { setSelectedUser(null); setError(''); setPin(''); }}
          className="absolute left-8 top-8 p-3 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit">
          <Lock className="w-12 h-12 text-emerald-600" />
        </div>

        <h2 className="text-3xl font-black text-gray-900 mb-2 uppercase tracking-tight">
          {selectedUser === 'admin' ? 'Admin' : (selectedUser as AppUser).name}
        </h2>
        <p className="text-gray-500 mb-10 font-bold">Veuillez saisir votre code PIN</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              className="w-full py-6 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-black text-4xl text-center outline-none transition-all tracking-[0.5em] text-black"
              maxLength={6}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors"
            >
              {showPin ? <EyeOff size={24} /> : <Eye size={24} />}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl font-black text-xs uppercase tracking-widest animate-in shake duration-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pin.length < 4}
            className="w-full px-6 py-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-3xl text-xl transition-all shadow-xl shadow-emerald-900/10 active:scale-95 uppercase tracking-widest"
          >
            S'identifier
          </button>
        </form>

        <p className="text-[10px] text-gray-400 mt-10 font-bold uppercase tracking-widest">
          Session sécurisée
        </p>
      </div>
    </div>
  );
};

export default PinDialog;
