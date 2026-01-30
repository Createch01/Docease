
import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  TrendingUp, 
  Users, 
  CreditCard, 
  ArrowUpRight, 
  Calendar, 
  Activity, 
  TrendingDown, 
  Heart,
  ArrowRight
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Prescription } from '../types';

type TimeRange = 'Jour' | 'Semaine' | 'Mois' | 'Année';

interface DataPoint {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('Jour');
  const reports = dataService.getDailyReports();
  const prescriptions = dataService.getPrescriptions();
  const doctor = dataService.getDoctorInfo();

  // Helper pour générer des dates passées
  const getPastDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  // Helper pour formater les labels du graphique
  const formatLabel = (dateStr: string, range: TimeRange) => {
    const d = new Date(dateStr);
    try {
      if (range === 'Jour') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      if (range === 'Mois') return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      if (range === 'Année') return d.getFullYear().toString();
      if (range === 'Semaine') {
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const weekNum = Math.ceil((d.getDay() + 1 + numberOfDays) / 7);
        return `Sem. ${weekNum}`;
      }
    } catch (e) {
      return dateStr;
    }
    return dateStr;
  };

  // Moteur d'agrégation intelligent
  const stats = useMemo(() => {
    const dataMap: Record<string, DataPoint> = {};
    const now = new Date();
    
    // 1. Initialiser les périodes pour avoir un graphique continu (sans trous)
    if (timeRange === 'Jour') {
      for (let i = 13; i >= 0; i--) {
        const d = getPastDate(i);
        dataMap[d] = { key: d, label: formatLabel(d, 'Jour'), count: 0, revenue: 0 };
      }
    } else if (timeRange === 'Mois') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().substring(0, 7);
        dataMap[key] = { key, label: formatLabel(d.toISOString(), 'Mois'), count: 0, revenue: 0 };
      }
    }

    // 2. Remplir avec les données réelles
    prescriptions.forEach(p => {
      let key = p.date;
      if (timeRange === 'Mois') key = p.date.substring(0, 7);
      if (timeRange === 'Année') key = p.date.substring(0, 4);
      if (timeRange === 'Semaine') {
        // Calcul simple de la semaine pour le groupement
        const d = new Date(p.date);
        const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
        const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${weekNum}`;
      }

      if (dataMap[key]) {
        dataMap[key].count += 1;
        dataMap[key].revenue += p.amount;
      } else if (timeRange === 'Année' || timeRange === 'Semaine') {
        // Pour Année et Semaine on ajoute dynamiquement car les plages sont variables
        if (!dataMap[key]) {
          dataMap[key] = { key, label: formatLabel(p.date, timeRange), count: 0, revenue: 0 };
        }
        dataMap[key].count += 1;
        dataMap[key].revenue += p.amount;
      }
    });

    return Object.values(dataMap).sort((a, b) => a.key.localeCompare(b.key));
  }, [prescriptions, timeRange]);

  const maxVal = Math.max(...stats.map(s => s.count), 1);
  const totalRevenue = stats.reduce((sum, s) => sum + s.revenue, 0);
  const totalPatients = stats.reduce((sum, s) => sum + s.count, 0);

  // Calcul de croissance (comparaison simplifiée)
  const growth = useMemo(() => {
    if (stats.length < 2) return 0;
    const current = stats[stats.length - 1].count;
    const previous = stats[stats.length - 2].count;
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }, [stats]);

  const kpis = [
    { 
      label: 'Chiffre d\'Affaires', 
      value: `${totalRevenue.toLocaleString()} ${doctor.currency}`, 
      sub: 'Sur la période',
      icon: CreditCard, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50' 
    },
    { 
      label: 'Volume Patients', 
      value: totalPatients, 
      sub: `${stats.length} ${timeRange.toLowerCase()}s suivis`,
      icon: Users, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50' 
    },
    { 
      label: 'Performance', 
      value: `${growth > 0 ? '+' : ''}${growth}%`, 
      sub: growth >= 0 ? 'Tendance positive' : 'En baisse',
      icon: growth >= 0 ? TrendingUp : TrendingDown, 
      color: growth >= 0 ? 'text-emerald-600' : 'text-red-600', 
      bg: growth >= 0 ? 'bg-emerald-50' : 'bg-red-50' 
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Tableau de Bord</h2>
          <p className="text-gray-500 font-medium">Analyses détaillées de votre activité par {timeRange.toLowerCase()}.</p>
        </div>
        
        <div className="flex p-1.5 bg-gray-100 rounded-[1.5rem] border border-gray-200 shadow-inner">
          {(['Jour', 'Semaine', 'Mois', 'Année'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                timeRange === range 
                ? 'bg-white text-emerald-600 shadow-md ring-1 ring-gray-200' 
                : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 group hover:border-emerald-200 transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-900/5">
            <div className={`w-14 h-14 rounded-2xl ${kpi.bg} ${kpi.color} flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
              <kpi.icon size={28} />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{kpi.label}</p>
            <p className="text-3xl font-black text-gray-900 tracking-tight mb-1">{kpi.value}</p>
            <p className="text-xs text-gray-400 font-bold">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Graphique d'activité Interactif */}
      <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-emerald-600 text-white rounded-3xl shadow-lg shadow-emerald-200">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Flux Patientèle</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Variation temporelle du volume de consultations</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Volume Patients</span>
             </div>
          </div>
        </div>

        <div className="h-[400px] w-full flex items-end gap-2 md:gap-4 px-2 relative">
          {/* Lignes de repère horizontales */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.03] px-2 mb-10">
            {[...Array(5)].map((_, i) => <div key={i} className="w-full border-t-2 border-black"></div>)}
          </div>

          {stats.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-4">
              <BarChart size={64} className="opacity-10" />
              <p className="font-black uppercase tracking-widest text-sm">Données insuffisantes</p>
            </div>
          ) : (
            stats.map((data, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-6 group relative">
                <div className="w-full relative flex flex-col items-center">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-16 bg-gray-900 text-white p-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-20 scale-90 group-hover:scale-100">
                    <p className="text-[10px] font-black uppercase text-emerald-400 mb-1">{data.label}</p>
                    <p className="text-sm font-black whitespace-nowrap">{data.count} Patients</p>
                    <p className="text-[10px] font-bold text-gray-400">{data.revenue.toLocaleString()} {doctor.currency}</p>
                  </div>
                  
                  {/* Bar */}
                  <div 
                    className="w-full max-w-[48px] rounded-2xl transition-all duration-700 ease-out bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-500 group-hover:to-emerald-300 shadow-xl shadow-emerald-900/5 group-hover:shadow-emerald-900/10"
                    style={{ height: `${(data.count / maxVal) * 320 + 10}px` }}
                  >
                    <div className="w-full h-full bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </div>
                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-tighter group-hover:text-emerald-600 transition-colors">
                  {data.label}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Historique de Performance */}
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
              <Calendar size={22} className="text-emerald-600" />
              Récapitulatif de Période
            </h3>
            <TrendingUp size={20} className="text-gray-200" />
          </div>
          
          <div className="space-y-4">
            {stats.slice().reverse().slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl group hover:bg-emerald-50 transition-all duration-300 border border-transparent hover:border-emerald-100">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm font-black text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-black text-gray-900 uppercase tracking-tight text-sm">{s.label}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{s.count} consultations enregistrées</p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                   <div className="text-right">
                     <p className="font-black text-lg text-emerald-700">{s.revenue.toLocaleString()} {doctor.currency}</p>
                     <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">CA Généré</p>
                   </div>
                   <div className="p-2.5 bg-white rounded-xl shadow-sm text-emerald-500 group-hover:translate-x-1 transition-transform">
                     <ArrowRight size={18} />
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribution par Profil */}
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
              <Users size={22} className="text-emerald-600" />
              Segmentation Patientèle
            </h3>
            <Activity size={20} className="text-gray-200" />
          </div>

          <div className="space-y-12 py-4">
            {[
              { label: 'Hommes (Adultes)', count: prescriptions.filter(p => p.patientType === 'Adult').length, color: 'bg-blue-500', icon: TrendingUp },
              { label: 'Enfants / Pédiatrie', count: prescriptions.filter(p => p.patientType === 'Child').length, color: 'bg-emerald-500', icon: Activity },
              { label: 'Femmes / Gynéco', count: prescriptions.filter(p => p.patientType === 'Woman').length, color: 'bg-pink-500', icon: Heart },
            ].map((s, i) => {
              const total = Math.max(1, prescriptions.length);
              const percentage = Math.round((s.count / total) * 100);
              return (
                <div key={i} className="space-y-4 group">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-3">
                       <div className={`w-3 h-3 rounded-full ${s.color} shadow-lg shadow-gray-200`}></div>
                       <p className="font-black text-gray-700 uppercase tracking-tighter text-sm">{s.label}</p>
                    </div>
                    <div className="text-right">
                       <span className="text-sm font-black text-gray-900">{s.count}</span>
                       <span className="text-[10px] text-gray-400 font-bold ml-2 uppercase tracking-widest">({percentage}%)</span>
                    </div>
                  </div>
                  <div className="w-full h-5 bg-gray-50 rounded-full overflow-hidden border border-gray-100 shadow-inner p-1">
                    <div 
                      className={`h-full ${s.color} rounded-full transition-all duration-1000 ease-in-out relative`} 
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent"></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
