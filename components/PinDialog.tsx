import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { dataService } from '../services/dataService';

interface PinDialogProps {
  onAuthenticated: () => void;
}

const PinDialog: React.FC<PinDialogProps> = ({ onAuthenticated }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const doctor = dataService.getDoctorInfo();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === doctor.pin) {
      onAuthenticated();
    } else {
      setError('Code PIN incorrect. Veuillez réessayer.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="bg-emerald-50 p-6 rounded-full mb-6 mx-auto w-fit">
          <ShieldCheck className="w-12 h-12 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Accès Sécurisé</h2>
        <p className="text-gray-600 mb-6">Entrez votre code PIN pour accéder à l'application</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Code PIN"
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-xl text-center outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              maxLength={6}
              autoFocus
            />
          </div>
          
          {error && (
            <p className="text-red-600 font-bold text-sm">{error}</p>
          )}
          
          <button
            type="submit"
            className="w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-lg transition-all shadow-lg active:scale-95"
          >
            Accéder
          </button>
        </form>
        
        <p className="text-xs text-gray-400 mt-6">
          Application médicale sécurisée - Accès réservé au personnel autorisé
        </p>
      </div>
    </div>
  );
};

export default PinDialog;