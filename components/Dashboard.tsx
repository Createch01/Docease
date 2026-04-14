
import React, { useState, useEffect } from 'react';
import { Plus, Archive, UserCheck, CalendarDays, TrendingUp, Users, ArrowRight, Clock, Database } from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { Patient } from '../types';

interface DashboardProps {
  onNewPrescription: (patient?: Patient) => void;
  onNavigate: (view: any) => void;
  onViewDossier: (patientId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNewPrescription, onNavigate, onViewDossier }) => {
  const { t, lang } = useI18n();
  const doctor = dataService.getDoctorInfo();
  const prescriptions = dataService.getPrescriptions();
  const [queue, setQueue] = useState<Patient[]>(dataService.getTodayQueue());
  const today = new Date().toISOString().split('T')[0];
  const todaysList = prescriptions.filter(p => p.date === today);
  const revenue = todaysList.reduce((sum, p) => sum + p.amount, 0);

  useEffect(() => {
    const loadQueue = () => setQueue(dataService.getTodayQueue());
    loadQueue();

    const handleUpdate = (e: any) => {
      if (e.detail?.key === 'meddoc_today_queue' || e.detail?.key === 'all') {
        loadQueue();
      }
    };

    window.addEventListener('meddoc_data_update', handleUpdate);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate);
  }, []);

  const stats = [
    { label: t('consultations'), value: todaysList.length, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: '+12%', sub: t('today') },
    { label: t('waiting_room'), value: queue.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', trend: 'Stable', sub: t('queue_description') },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 text-black">
      <header className="flex flex-col lg:flex-row justify-between lg:items-center gap-8">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            {t('dashboard')}
          </h2>
          <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">
            {t('welcome')}, {lang === 'ar' ? doctor.nameAr : doctor.nameFr}
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => {
              if (window.confirm("Voulez-vous effectuer la sauvegarde et archiver la journée ?\n\nCette action téléchargera une sauvegarde de vos données et videra la salle d'attente.")) {
                dataService.exportFullBackup();
                dataService.archiveDay();
                setQueue([]);
              }
            }}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-orange-50 border border-orange-100 text-orange-600 font-black rounded-2xl hover:bg-orange-100 transition-all active:scale-95 text-xs uppercase tracking-widest shadow-sm group"
          >
            <Database size={18} className="group-hover:scale-110 transition-transform" />
            {t('end_of_day')}
          </button>
          <button
            onClick={() => onNewPrescription()}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl shadow-emerald-100/50 text-xs uppercase tracking-widest"
          >
            <Plus size={18} />
            {t('new_consultation')}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col gap-6 group hover:border-emerald-200 transition-all hover:shadow-xl hover:shadow-emerald-500/5 active:scale-[0.98]">
            <div className="flex justify-between items-start">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform shadow-inner`}>
                <stat.icon size={28} />
              </div>
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${stat.trend.startsWith('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-black text-gray-900 tracking-tighter">{stat.value}</p>
              </div>
              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase opacity-60">{stat.sub}</p>
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
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">{t('waiting_room')}</h3>
            </div>
            <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-xs font-black">
              {queue.length} {t('in_waiting')}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 bg-blue-50 rounded-[2rem] flex items-center justify-center text-blue-200 mb-6 animate-pulse">
                  <Users size={48} />
                </div>
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">{t('no_patients')}</h4>
                <p className="text-xs font-bold text-gray-400 max-w-[200px] leading-relaxed">{t('no_patients_desc')}</p>
              </div>
            ) : (
              queue.map((p, i) => (
                <div key={p.id} className="p-5 flex items-center justify-between hover:bg-orange-50/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-black">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-black text-gray-950 uppercase tracking-tight">{p.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">ID: {p.id}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Âge: {p.age} ans • {p.weight || 'Poids inconnu'}</p>
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
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">{t('recent_activity')}</h3>
            </div>
            <span className="text-xs text-emerald-600 font-black uppercase tracking-widest cursor-pointer hover:underline">{t('view_history')}</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {todaysList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 bg-emerald-50 rounded-[2rem] flex items-center justify-center text-emerald-200 mb-6">
                  <Archive size={48} />
                </div>
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">{t('today')}</h4>
                <p className="text-xs font-bold text-gray-400 max-w-[200px] leading-relaxed">{t('work_done_desc')}</p>
              </div>
            ) : (
              todaysList.slice().reverse().map((p, i) => (
                <div
                  key={i}
                  onClick={() => onViewDossier(p.patientId)}
                  className="flex items-center justify-between p-4 bg-gray-50/50 border border-gray-100 rounded-2xl hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black group-hover:bg-emerald-200 transition-colors">
                      <Clock size={16} />
                    </div>
                    <div>
                      <p className="font-black text-gray-950 uppercase tracking-tight group-hover:text-emerald-950">{dataService.getPatientProfile(p.patientId)?.name || p.patientId}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">ID: {p.patientId}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{p.items.length} médicaments • {p.patientType}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <p className="font-black text-gray-400 text-sm group-hover:text-emerald-600 transition-colors">{t('open_dossier')}</p>
                    <ArrowRight size={16} className={`text-gray-300 group-hover:text-emerald-500 transform group-hover:translate-x-${lang === 'ar' ? '-1' : '1'} transition-all`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Speed Dial */}
      <div className="fixed bottom-10 right-10 flex flex-col-reverse items-end gap-3 z-50 group">
        <button
          className="w-16 h-16 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 relative z-20 group-hover:rotate-45"
        >
          <Plus size={32} />
        </button>

        {/* Speed Dial Menu Items */}
        <div className="flex flex-col gap-3 mb-2 opacity-0 translate-y-10 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300">
          {[
            { label: 'Nouv. Patient', icon: Users, color: 'bg-emerald-500', onClick: () => onNavigate('patients') },
            { label: 'Rendez-vous', icon: CalendarDays, color: 'bg-blue-500', onClick: () => onNavigate('appointments') },
            { label: 'Ordonnance', icon: Plus, color: 'bg-emerald-600', onClick: () => onNewPrescription() },
            { label: 'Statistiques', icon: TrendingUp, color: 'bg-violet-500', onClick: () => onNavigate('analytics') },
          ].map((action, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-white shadow-md rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-600">
                {action.label}
              </span>
              <button
                onClick={action.onClick}
                className={`w-12 h-12 ${action.color} text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform`}
              >
                <action.icon size={20} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
