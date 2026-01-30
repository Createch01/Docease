
import React, { useState, useEffect } from 'react';
import { Plus, Archive, UserCheck, CalendarDays, TrendingUp, Users, ArrowRight, Clock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Patient } from '../types';

interface DashboardProps {
  onNewPrescription: (patient?: Patient) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNewPrescription }) => {
  const doctor = dataService.getDoctorInfo();
  const prescriptions = dataService.getPrescriptions();
  const [queue, setQueue] = useState<Patient[]>(dataService.getTodayQueue());
  const today = new Date().toISOString().split('T')[0];
  const todaysList = prescriptions.filter(p => p.date === today);
  const revenue = todaysList.reduce((sum, p) => sum + p.amount, 0);

  useEffect(() => {
    setQueue(dataService.getTodayQueue());
  }, []);

  const stats = [
    { label: 'Consultations Aujourd\'hui', value: todaysList.length, icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Salle d\'Attente', value: queue.length, icon: Users, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: `Chiffre d'Affaires (${doctor.currency})`, value: revenue.toLocaleString(), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 text-black">
      <header className="flex flex-col lg:flex-row justify-between lg:items-center gap-8">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            Tableau de Bord
          </h2>
          <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">
            Bienvenue, {doctor.nameFr}
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => {
              dataService.archiveDay();
              setQueue([]);
            }}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-gray-200 text-gray-600 font-black rounded-2xl hover:bg-gray-50 transition-all active:scale-95 text-xs uppercase tracking-widest shadow-sm"
          >
            <Archive size={18} />
            Archiver
          </button>
          <button
            onClick={() => onNewPrescription()}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl shadow-emerald-100/50 text-xs uppercase tracking-widest"
          >
            <Plus size={18} />
            Nouvelle Consultation
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col gap-6 group hover:border-emerald-200 transition-all hover:shadow-lg hover:shadow-gray-100 active:scale-[0.98]">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform shadow-inner`}>
              <stat.icon size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className="text-4xl font-black text-gray-900 tracking-tighter">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Waiting List Section */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Users className="text-orange-500" size={20} />
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Salle d'Attente</h3>
            </div>
            <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-xs font-black">
              {queue.length} EN ATTENTE
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
                <Users size={48} className="opacity-10 mb-4" />
                <p className="font-bold text-gray-300">Aucun patient en attente</p>
              </div>
            ) : (
              queue.map((p, i) => (
                <div key={p.id} className="p-5 flex items-center justify-between hover:bg-orange-50/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-black">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-black text-gray-900 uppercase tracking-tight">{p.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Âge: {p.age} ans • {p.weight || 'Poids inconnu'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onNewPrescription(p)}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all group"
                  >
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Consultations Section */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
            <div className="flex items-center gap-2">
              <UserCheck className="text-emerald-500" size={20} />
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Activité Récente</h3>
            </div>
            <span className="text-xs text-emerald-600 font-black uppercase tracking-widest cursor-pointer hover:underline">Voir Historique</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {todaysList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
                <Archive size={48} className="opacity-10 mb-4" />
                <p className="font-bold text-gray-300">Aucune consultation aujourd'hui</p>
              </div>
            ) : (
              todaysList.slice().reverse().map((p, i) => (
                <div key={i} className="p-5 flex items-center justify-between hover:bg-emerald-50/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                      <Clock size={16} />
                    </div>
                    <div>
                      <p className="font-black text-gray-900 uppercase tracking-tight">{p.patientId}</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{p.items.length} médicaments • {p.patientType}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-emerald-700">{p.amount} {doctor.currency}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
