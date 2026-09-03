
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
    <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 pb-20">
      <header className="flex flex-col lg:flex-row justify-between lg:items-end gap-8 pb-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
            {t('dashboard')}
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          </h2>
          <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] mt-3">
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
            className="group flex items-center justify-center gap-3 px-8 py-4 bg-white border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-50 transition-all active:scale-95 text-[10px] uppercase tracking-widest shadow-soft"
          >
            <Database size={16} className="text-slate-400 group-hover:text-amber-500 transition-colors" />
            {t('end_of_day')}
          </button>
          <button
            onClick={() => onNewPrescription()}
            className="flex items-center justify-center gap-3 px-10 py-4 gradient-primary text-white font-black rounded-2xl transition-all active:scale-95 shadow-premium text-[10px] uppercase tracking-widest hover:scale-[1.02]"
          >
            <Plus size={18} />
            {t('new_consultation')}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-10 rounded-[2.5rem] premium-border shadow-soft flex flex-col gap-8 group hover:scale-[1.02] transition-all duration-500 hover:shadow-premium relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-emerald-500/10 transition-all duration-700"></div>
            <div className="flex justify-between items-start relative z-10">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center bg-slate-50 ${stat.color} group-hover:scale-110 transition-smooth shadow-inner border border-slate-100/50`}>
                <stat.icon size={32} />
              </div>
              <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl ${stat.trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                {stat.trend}
              </span>
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-5xl font-black text-slate-900 tracking-tighter italic">{stat.value}</p>
              </div>
              <p className="text-[10px] font-bold text-slate-300 mt-2 uppercase tracking-widest">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Waiting List Section */}
        <div className="bg-white rounded-[3rem] shadow-soft premium-border overflow-hidden flex flex-col h-[550px] relative">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Users size={20} />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight italic">{t('waiting_room')}</h3>
            </div>
            <span className="px-4 py-1.5 bg-amber-50 text-amber-600 border border-amber-100/50 rounded-xl text-[10px] font-black uppercase tracking-widest">
              {queue.length} {t('in_waiting')}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50 scrollbar-hide">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-8 animate-pulse border border-slate-100">
                  <Users size={40} />
                </div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-3">{t('no_patients')}</h4>
                <p className="text-[10px] font-bold text-slate-400 max-w-[220px] leading-relaxed uppercase tracking-widest">{t('no_patients_desc')}</p>
              </div>
            ) : (
              queue.map((p, i) => (
                <div key={p.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-smooth group cursor-pointer">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-black shadow-inner border border-amber-100">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 uppercase tracking-tight group-hover:text-emerald-900 transition-colors">{p.name}</p>
                      <div className="flex items-center gap-3 mt-1 opacity-60">
                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">ID: {p.id}</p>
                        <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{p.age} ans • {p.weight || '---'}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onNewPrescription(p)}
                    className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Consultations Section */}
        <div className="bg-white rounded-[3rem] shadow-soft premium-border overflow-hidden flex flex-col h-[550px] relative">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <UserCheck size={20} />
              </div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight italic">{t('recent_activity')}</h3>
            </div>
            <button className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] hover:text-emerald-600 transition-colors">{t('view_history')}</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
            {todaysList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
                  <Archive size={40} />
                </div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-3">{t('today')}</h4>
                <p className="text-[10px] font-bold text-slate-400 max-w-[220px] leading-relaxed uppercase tracking-widest">{t('work_done_desc')}</p>
              </div>
            ) : (
              todaysList.slice().reverse().map((p, i) => (
                <div
                  key={i}
                  onClick={() => onViewDossier(p.patientId)}
                  className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-[2rem] hover:border-emerald-200 hover:shadow-soft transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black group-hover:scale-110 transition-smooth">
                      <Clock size={16} />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 uppercase tracking-tight group-hover:text-emerald-950">{dataService.getPatientProfile(p.patientId)?.name || p.patientId}</p>
                      <div className="flex items-center gap-3 mt-1 opacity-60">
                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{p.items.length} médicaments</p>
                        <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{p.patientType}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <p className="font-black text-slate-300 text-[9px] uppercase tracking-widest group-hover:text-emerald-600 transition-colors">{t('open_dossier')}</p>
                    <ArrowRight size={16} className={`text-slate-200 group-hover:text-emerald-400 transform group-hover:translate-x-${lang === 'ar' ? '-1' : '1'} transition-all`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Speed Dial */}
      <div className="fixed bottom-10 right-10 flex flex-col-reverse items-end gap-4 z-50 group">
        <button
          className="w-16 h-16 gradient-primary text-white rounded-[2rem] shadow-premium flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-500 relative z-20 group-hover:rotate-45"
        >
          <Plus size={32} />
        </button>

        {/* Speed Dial Menu Items */}
        <div className="flex flex-col gap-4 mb-2 opacity-0 translate-y-10 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-500">
          {[
            { label: 'Nouv. Patient', icon: Users, color: 'bg-emerald-500', onClick: () => onNavigate('patients') },
            { label: 'Rendez-vous', icon: CalendarDays, color: 'bg-blue-500', onClick: () => onNavigate('appointments') },
            { label: 'Ordonnance', icon: Plus, color: 'bg-emerald-600', onClick: () => onNewPrescription() },
            { label: 'Statistiques', icon: TrendingUp, color: 'bg-violet-500', onClick: () => onNavigate('analytics') },
          ].map((action, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="px-4 py-2 bg-slate-900 text-white shadow-soft rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10">
                {action.label}
              </span>
              <button
                onClick={action.onClick}
                className={`w-12 h-12 ${action.color} text-white rounded-2xl shadow-soft flex items-center justify-center hover:scale-110 transition-transform active:scale-90`}
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
