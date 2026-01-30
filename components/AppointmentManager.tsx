
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  UserPlus, 
  Trash2, 
  Phone, 
  Clock, 
  Users, 
  CalendarRange, 
  Plus, 
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Zap,
  Check,
  Ban,
  Timer,
  AlertTriangle,
  UserCheck,
  UserCircle,
  RotateCcw,
  SearchCode,
  User,
  Edit2,
  Activity,
  BrainCircuit,
  Loader2
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Appointment, AppointmentPriority, AppointmentStatus, Patient } from '../types';

const AppointmentManager: React.FC = () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  
  // State for appointment form
  const [newApp, setNewApp] = useState({ patientName: '', phone: '', note: '', bookedByDoctor: true });
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState<Patient[]>([]);

  const [dailyLimit, setDailyLimit] = useState<number>(15);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Get all patients from database for autocomplete
  const allPatients = useMemo(() => {
     const data = localStorage.getItem('meddoc_patients');
     return data ? JSON.parse(data) as Patient[] : [];
  }, [isAdding, editingId]);

  const refreshData = () => {
    const apps = dataService.getAppointmentsByDate(selectedDate);
    const sorted = [...apps].sort((a, b) => {
      const pMap = { 'URGENT': 0, 'INITIAL': 1, 'ROUTINE': 2 };
      return pMap[a.priority] - pMap[b.priority];
    });
    setAppointments(sorted);
    setAllAppointments(dataService.getAppointments());
    setDailyLimit(dataService.getDailyCapacity(selectedDate));
  };

  // --- REAL-TIME MONITORING LOGIC ---
  useEffect(() => {
    refreshData();

    // Ecouter les mises à jour locales (même fenêtre)
    const handleLocalUpdate = (e: any) => {
      if (e.detail?.key === 'meddoc_appointments' || e.detail?.key === 'meddoc_capacities' || e.detail?.key === 'all') {
        refreshData();
      }
    };

    // Ecouter les mises à jour cross-tab (autres onglets)
    const handleStorageUpdate = (e: StorageEvent) => {
      if (e.key === 'meddoc_appointments' || e.key === 'meddoc_capacities') {
        refreshData();
      }
    };

    window.addEventListener('meddoc_data_update', handleLocalUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    return () => {
      window.removeEventListener('meddoc_data_update', handleLocalUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [selectedDate]);

  const handlePatientSearch = (val: string) => {
    setPatientSearch(val);
    setNewApp(prev => ({ ...prev, patientName: val }));
    if (val.length > 1 && !editingId) {
      const filtered = allPatients.filter(p => p.name.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
      setPatientSuggestions(filtered);
    } else {
      setPatientSuggestions([]);
    }
  };

  const selectPatient = (p: Patient) => {
    setNewApp({
      patientName: p.name,
      phone: p.phone || '',
      note: '',
      bookedByDoctor: true
    });
    setPatientSearch(p.name);
    setPatientSuggestions([]);
  };

  const startEdit = (app: Appointment) => {
    setEditingId(app.id);
    setNewApp({
      patientName: app.patientName,
      phone: app.phone,
      note: app.note,
      bookedByDoctor: app.bookedByDoctor || false
    });
    setPatientSearch(app.patientName);
    setIsAdding(true);
  };

  // Only count PENDING and CONFIRMED appointments for the quota
  const activeCount = useMemo(() => {
    return appointments.filter(a => a.status !== 'REJECTED').length;
  }, [appointments]);

  const handleSaveAppointment = async () => {
    if (!editingId && activeCount >= dailyLimit) {
      alert("Quota atteint ! Augmentez la capacité ou annulez un rendez-vous pour en ajouter un nouveau.");
      return;
    }
    
    if (!newApp.patientName || !newApp.note) return alert("Nom et raison requis");
    
    setIsClassifying(true);
    const classification = await dataService.classifyAppointmentPriority(newApp.note);
    
    const appointment: Appointment = {
      id: editingId || Date.now().toString(),
      patientName: newApp.patientName,
      phone: newApp.phone,
      date: selectedDate,
      note: newApp.note,
      priority: classification.priority,
      status: (editingId ? appointments.find(a => a.id === editingId)?.status : (newApp.bookedByDoctor ? 'CONFIRMED' : 'PENDING')) || 'PENDING',
      aiClassification: classification.reason,
      bookedByDoctor: newApp.bookedByDoctor
    };

    dataService.saveAppointment(appointment);
    setIsClassifying(false);
    setIsAdding(false);
    setEditingId(null);
    setNewApp({ patientName: '', phone: '', note: '', bookedByDoctor: true });
    setPatientSearch('');
  };

  const updateStatus = (id: string, status: AppointmentStatus) => {
    const apps = dataService.getAppointments();
    const app = apps.find(a => a.id === id);
    if (app) {
      app.status = status;
      dataService.saveAppointment(app);
    }
  };

  const handleDelete = (id: string) => {
    const app = appointments.find(a => a.id === id);
    if (window.confirm(`🚨 SUPPRESSION DÉFINITIVE :\nVoulez-vous vraiment effacer le rendez-vous de ${app?.patientName} ? Cette action est irréversible.`)) {
      dataService.deleteAppointment(id);
    }
  };

  const updateCapacity = (val: number) => {
    const newLimit = Math.max(1, val);
    setDailyLimit(newLimit);
    dataService.setDailyCapacity(selectedDate, newLimit);
  };

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const result = [];
    const padding = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < padding; i++) result.push(null);
    for (let i = 1; i <= days; i++) result.push(new Date(year, month, i));
    return result;
  }, [currentMonth]);

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const getDayStatus = (date: Date) => {
    const dStr = date.toISOString().split('T')[0];
    const count = allAppointments.filter(a => a.date === dStr && a.status !== 'REJECTED').length;
    const limit = dataService.getDailyCapacity(dStr);
    const isPast = dStr < todayStr;
    const isFull = count >= limit;
    return { count, limit, isPast, isFull, ratio: count / limit };
  };

  const filteredAppointments = useMemo(() => {
    if (!searchTerm.trim()) return appointments;
    return appointments.filter(app => 
      app.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.phone.includes(searchTerm)
    );
  }, [appointments, searchTerm]);

  const isSelectedDatePast = selectedDate < todayStr;
  const isSelectedDateFull = activeCount >= dailyLimit;

  return (
    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 text-black">
      
      {/* --- SIDEBAR: CALENDAR --- */}
      <div className="w-full lg:w-[400px] shrink-0 space-y-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
              <CalendarRange className="text-emerald-600" size={24} />
              {currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex gap-2">
              <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><ChevronLeft size={20} /></button>
              <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-4">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <span key={d} className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {daysInMonth.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} />;
              const dStr = date.toISOString().split('T')[0];
              const isSelected = selectedDate === dStr;
              const { count, isPast, isFull } = getDayStatus(date);
              
              return (
                <button
                  key={dStr}
                  onClick={() => setSelectedDate(dStr)}
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all group border ${
                    isSelected 
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg z-10 scale-105' 
                      : isFull 
                        ? 'bg-red-500 border-red-400 text-white' 
                        : isPast 
                          ? 'bg-gray-50 border-transparent text-gray-300 opacity-40' 
                          : 'bg-white border-transparent hover:bg-emerald-50 text-gray-700 hover:border-emerald-200'
                  }`}
                >
                  <span className="text-sm font-black">{date.getDate()}</span>
                  {count > 0 && !isFull && (
                    <div className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />
                  )}
                  {isFull && (
                    <span className="text-[7px] font-black uppercase mt-0.5">Complet</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend Panel */}
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 space-y-4">
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aide & Statuts</p>
           <div className="space-y-3">
             <div className="flex items-center gap-3">
               <Ban className="text-orange-500" size={16} />
               <span className="text-xs font-bold text-gray-600">Annuler = Libère la place</span>
             </div>
             <div className="flex items-center gap-3">
               <Trash2 className="text-red-500" size={16} />
               <span className="text-xs font-bold text-gray-600">Supprimer = Effacer l'historique</span>
             </div>
             <div className="flex items-center gap-3">
               <RotateCcw className="text-blue-500" size={16} />
               <span className="text-xs font-bold text-gray-600">Rétablir un patient annulé</span>
             </div>
           </div>
        </div>
      </div>

      {/* --- MAIN: LISTE DES RENDEZ-VOUS --- */}
      <div className="flex-1 space-y-6">
        
        {/* Header avec Quota */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
          
          {/* LIVE INDICATOR */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
             <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
             <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Surveillance Live</span>
          </div>

          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isSelectedDateFull ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <CalendarIcon size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {activeCount} Place{activeCount !== 1 ? 's' : ''} occupée{activeCount !== 1 ? 's' : ''} sur {dailyLimit}
                </p>
                {isSelectedDateFull && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[8px] font-black rounded uppercase animate-pulse">Saturé</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-3xl border border-gray-100">
             <div className="text-right">
               <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Capacité Max</p>
               <input 
                 type="number" 
                 value={dailyLimit} 
                 onChange={(e) => updateCapacity(parseInt(e.target.value) || 1)}
                 className="w-16 bg-white border border-gray-200 rounded-xl px-2 py-1 text-center font-black text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500"
               />
             </div>
             <div className="h-10 w-[1px] bg-gray-200" />
             <div className="relative w-16 h-16 flex items-center justify-center">
               <svg className="w-full h-full -rotate-90">
                 <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                 <circle cx="32" cy="32" r="28" fill="none" stroke={isSelectedDateFull ? '#ef4444' : '#10b981'} strokeWidth="6" strokeDasharray={175.9} strokeDashoffset={175.9 - (175.9 * Math.min(activeCount / dailyLimit, 1))} strokeLinecap="round" />
               </svg>
               <span className={`absolute text-[10px] font-black ${isSelectedDateFull ? 'text-red-600' : 'text-gray-700'}`}>{Math.round((activeCount / dailyLimit) * 100)}%</span>
             </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input type="text" placeholder="Rechercher nom ou note..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
          </div>
          
          <button 
            onClick={() => { setEditingId(null); setIsAdding(true); setNewApp({ patientName: '', phone: '', note: '', bookedByDoctor: true }); setPatientSearch(''); }} 
            disabled={isSelectedDatePast || isSelectedDateFull} 
            className={`w-full sm:w-auto px-6 py-3 font-black rounded-2xl shadow-xl uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ${isSelectedDatePast || isSelectedDateFull ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'}`}
          >
            <Plus size={18} /> Fixer un RDV
          </button>
        </div>

        {/* Liste des Rendez-vous */}
        <div className="grid grid-cols-1 gap-4">
          {filteredAppointments.length === 0 ? (
            <div className="bg-white py-20 rounded-[3rem] border-2 border-dashed border-gray-100 text-center">
              <Timer className="mx-auto text-gray-200 mb-4" size={48} />
              <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Agenda vide</p>
            </div>
          ) : (
            filteredAppointments.map((app) => (
              <div key={app.id} className={`p-6 rounded-[2rem] border shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 group transition-all relative overflow-hidden animate-in fade-in slide-in-from-left-2 duration-300 ${app.status === 'REJECTED' ? 'bg-gray-50 border-gray-200 opacity-60' : app.bookedByDoctor ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-gray-100 hover:border-emerald-200'}`}>
                {/* Priority Stripe */}
                <div className={`absolute left-0 top-0 bottom-0 w-2 ${
                  app.status === 'REJECTED' ? 'bg-gray-300' :
                  app.priority === 'URGENT' ? 'bg-red-500 animate-pulse' : 
                  app.priority === 'INITIAL' ? 'bg-blue-500' : 'bg-emerald-500'
                }`} />

                <div className="flex items-center gap-4 flex-1">
                   <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black shrink-0 ${
                     app.status === 'REJECTED' ? 'bg-gray-200 text-gray-500' :
                     app.priority === 'URGENT' ? 'bg-red-50 text-red-600' : 
                     app.priority === 'INITIAL' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                   }`}>
                     <span className="text-[10px] tracking-tighter">{app.priority.charAt(0)}</span>
                     <Zap size={16} />
                   </div>
                   <div className="space-y-1 flex-1 overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className={`font-black text-gray-900 uppercase tracking-tight truncate ${app.status === 'REJECTED' ? 'line-through' : ''}`}>{app.patientName}</h4>
                        {app.bookedByDoctor && (
                          <span className="flex items-center gap-1 text-[8px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">
                            <UserCheck size={10} /> Par Cabinet
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${
                          app.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 
                          app.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {app.status === 'CONFIRMED' ? 'Confirmé' : app.status === 'REJECTED' ? 'ANNULÉ' : 'En attente'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 font-bold italic line-clamp-1">"{app.note}"</p>
                        {app.aiClassification && (
                          <div className="flex items-start gap-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 animate-in slide-in-from-top-1">
                            <BrainCircuit size={12} className="text-indigo-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-indigo-700 font-semibold italic leading-snug">
                              Classification IA: {app.aiClassification}
                            </p>
                          </div>
                        )}
                      </div>
                   </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right mr-4 hidden md:block">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Phone size={12} />
                      <span className="text-[10px] font-black">{app.phone || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {/* RESTAURER (Si rejeté) */}
                    {app.status === 'REJECTED' && !isSelectedDatePast && (
                      <button 
                        onClick={() => updateStatus(app.id, 'CONFIRMED')}
                        className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all shadow-lg shadow-blue-100"
                        title="Rétablir ce rendez-vous"
                      >
                        <RotateCcw size={18} />
                      </button>
                    )}

                    {/* MODIFIER */}
                    {app.status !== 'REJECTED' && (
                      <button 
                        onClick={() => startEdit(app)}
                        className="w-10 h-10 bg-white border border-gray-100 text-blue-500 rounded-xl flex items-center justify-center hover:bg-blue-50 transition-all shadow-sm"
                        title="Modifier"
                      >
                        <Edit2 size={18} />
                      </button>
                    )}

                    {/* VALIDER (Si en attente) */}
                    {app.status === 'PENDING' && !isSelectedDatePast && (
                      <button 
                        onClick={() => updateStatus(app.id, 'CONFIRMED')}
                        className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                        title="Confirmer"
                      >
                        <Check size={18} />
                      </button>
                    )}

                    {/* ANNULER (Ne compte plus dans le quota) */}
                    {app.status !== 'REJECTED' && !isSelectedDatePast && (
                      <button 
                        onClick={() => updateStatus(app.id, 'REJECTED')}
                        className="w-10 h-10 bg-white border border-orange-200 text-orange-500 rounded-xl flex items-center justify-center hover:bg-orange-50 transition-all shadow-sm"
                        title="Annuler (Libère la place)"
                      >
                        <Ban size={18} />
                      </button>
                    )}

                    {/* SUPPRIMER DÉFINITIVEMENT */}
                    <button 
                      onClick={() => handleDelete(app.id)}
                      className="w-10 h-10 bg-gray-50 text-gray-300 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-200"
                      title="Supprimer définitivement"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- MODAL ADD / EDIT --- */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                   {editingId ? 'Modifier Rendez-vous' : 'Fixer Rendez-vous'}
                </h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {editingId ? 'Correction des informations' : 'Analyse automatique par IA activée'}
                </p>
              </div>
              <button onClick={() => {setIsAdding(false); setEditingId(null); setPatientSuggestions([]);}} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><X size={20} /></button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2 relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nom du Patient</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input 
                    type="text" 
                    value={patientSearch} 
                    onChange={e => handlePatientSearch(e.target.value)} 
                    className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black outline-none focus:ring-2 focus:ring-emerald-500" 
                    placeholder="Tapez le nom..." 
                  />
                </div>
                
                {/* Suggestions Dropdown (Only when adding new) */}
                {!editingId && patientSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
                    {patientSuggestions.map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-5 py-3 hover:bg-emerald-50 border-b border-gray-50 last:border-0 flex justify-between items-center group"
                      >
                        <div>
                          <p className="font-black text-gray-900 uppercase text-xs">{p.name}</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{p.phone || 'Sans tel'}</p>
                        </div>
                        <Plus size={14} className="text-emerald-300 group-hover:text-emerald-600 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Numéro de téléphone</label>
                <input 
                  type="text" 
                  value={newApp.phone} 
                  onChange={e => setNewApp({...newApp, phone: e.target.value})} 
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black outline-none focus:ring-2 focus:ring-emerald-500" 
                  placeholder="06..." 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                  <span>Raison / Note</span>
                  <span className="flex items-center gap-1 text-[8px] text-indigo-500 font-black animate-pulse">
                    <BrainCircuit size={10} /> Analyse IA
                  </span>
                </label>
                <textarea 
                  value={newApp.note} 
                  onChange={e => setNewApp({...newApp, note: e.target.value})} 
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black h-24 resize-none outline-none focus:ring-2 focus:ring-emerald-500" 
                  placeholder="Motif de la visite (ex: Douleur thoracique, Contrôle annuel...)" 
                />
              </div>

              <button 
                onClick={handleSaveAppointment}
                disabled={isClassifying}
                className={`w-full py-5 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}
              >
                {isClassifying ? <Loader2 className="animate-spin" size={20} /> : <Zap size={18} />}
                {isClassifying ? 'Classification IA en cours...' : editingId ? 'Mettre à jour' : 'Confirmer Rendez-vous'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentManager;
