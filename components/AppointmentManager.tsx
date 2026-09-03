
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
  Loader2,
  List,
  LayoutGrid,
  Stethoscope,
  CheckCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { toastService } from '../services/toastService';
import { Appointment, AppointmentPriority, AppointmentStatus, AppointmentType, Patient } from '../types';

type CalendarViewMode = 'week' | 'day' | 'list';

const TIME_SLOTS_WEEK: string[] = (() => {
  const slots: string[] = [];
  for (let h = 8; h < 19; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  slots.push('19:00');
  return slots;
})();

const TIME_SLOTS_DAY: string[] = (() => {
  const slots: string[] = [];
  for (let h = 8; h < 19; h++) {
    for (let m = 0; m < 60; m += 15) slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  slots.push('19:00');
  return slots;
})();

const AGENDA_START_MIN = 8 * 60;
const AGENDA_END_MIN = 19 * 60;
const SLOT_PX = 24; // pixels per 15-minute unit

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const getMonday = (dateStr: string): Date => {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const STATUS_META: Record<AppointmentStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: 'En attente', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  CONFIRMED: { label: 'Planifié', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  ARRIVED: { label: 'Patient arrivé', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
  IN_CONSULTATION: { label: 'En consultation', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  DONE: { label: 'Terminé', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
  REJECTED: { label: 'Annulé', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
};

const CONSULTATION_TYPES: AppointmentType[] = ['Consultation', 'Contrôle', 'Urgence', 'Vaccination', 'Autre'];

const AppointmentManager: React.FC = () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);

  // State for appointment form
  const [newApp, setNewApp] = useState({
    patientId: undefined as string | undefined,
    patientName: '', phone: '', note: '', bookedByDoctor: true,
    date: todayStr, time: '', duration: 30, consultationType: 'Consultation' as AppointmentType,
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState<Patient[]>([]);

  const [dailyLimit, setDailyLimit] = useState<number>(15);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Get all patients from database for autocomplete
  const allPatients = useMemo(() => {
    return dataService.getAllPatients();
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
    setNewApp(prev => ({
      ...prev,
      patientId: p.id,
      patientName: p.name,
      phone: p.phone || '',
    }));
    setPatientSearch(p.name);
    setPatientSuggestions([]);
  };

  const resetForm = (date = selectedDate) => setNewApp({
    patientId: undefined, patientName: '', phone: '', note: '', bookedByDoctor: true,
    date, time: '', duration: 30, consultationType: 'Consultation',
  });

  const openCreateModal = (date: string, time?: string) => {
    setEditingId(null);
    resetForm(date);
    if (time) setNewApp(prev => ({ ...prev, time }));
    setPatientSearch('');
    setIsAdding(true);
  };

  const startEdit = (app: Appointment) => {
    setEditingId(app.id);
    setNewApp({
      patientId: app.patientId,
      patientName: app.patientName,
      phone: app.phone,
      note: app.note,
      bookedByDoctor: app.bookedByDoctor || false,
      date: app.date,
      time: app.time || '',
      duration: app.duration || 30,
      consultationType: app.consultationType || 'Consultation',
    });
    setPatientSearch(app.patientName);
    setDetailAppointment(null);
    setIsAdding(true);
  };

  // Only count non-cancelled appointments for the quota
  const activeCount = useMemo(() => {
    return appointments.filter(a => a.status !== 'REJECTED').length;
  }, [appointments]);

  const handleSaveAppointment = async () => {
    const targetDate = newApp.date || selectedDate;
    const existingForDate = editingId ? appointments : dataService.getAppointmentsByDate(targetDate);
    const activeForDate = existingForDate.filter(a => a.status !== 'REJECTED' && a.id !== editingId).length;
    const limitForDate = dataService.getDailyCapacity(targetDate);
    if (!editingId && activeForDate >= limitForDate) {
      toastService.warning("Quota atteint ! Augmentez la capacité ou annulez un rendez-vous.");
      return;
    }

    if (!newApp.patientName || !newApp.note) {
      toastService.info("Nom et raison requis");
      return;
    }

    setIsClassifying(true);
    const classification = await dataService.classifyAppointmentPriority(newApp.note);

    const appointment: Appointment = {
      id: editingId || Date.now().toString(),
      patientId: newApp.patientId,
      patientName: newApp.patientName,
      phone: newApp.phone,
      date: targetDate,
      time: newApp.time || undefined,
      duration: newApp.duration,
      consultationType: newApp.consultationType,
      note: newApp.note,
      priority: classification.priority,
      status: (editingId ? appointments.find(a => a.id === editingId)?.status : (newApp.bookedByDoctor ? 'CONFIRMED' : 'PENDING')) || 'PENDING',
      aiClassification: classification.reason,
      bookedByDoctor: newApp.bookedByDoctor
    };

    dataService.saveAppointment(appointment);
    toastService.success(editingId ? "Rendez-vous mis à jour" : "Rendez-vous confirmé");

    setIsClassifying(false);
    setIsAdding(false);
    setEditingId(null);
    resetForm();
    setPatientSearch('');
  };

  const handleMarkAsArrived = async (app: Appointment) => {
    // 1. Check if patient exists
    let patient = dataService.getPatientProfile(app.patientName);

    // If not found by name, try to find any patient with same name (case insensitive)
    if (!patient) {
      const allPatients = dataService.getAllPatients();
      patient = allPatients.find(p => p.name.toUpperCase() === app.patientName.toUpperCase()) || null;
    }

    let patientId = patient?.id;
    if (!patient) {
      // 2. Create new patient if doesn't exist
      const newPatient: Patient = {
        id: Date.now().toString(),
        name: app.patientName,
        phone: app.phone,
        age: 0,
        sex: 'M',
        type: 'Adult',
        registeredDate: new Date().toISOString()
      };
      await dataService.registerPatient(newPatient);
      patientId = newPatient.id;
      toastService.success(`Nouveau dossier créé pour ${app.patientName}`);
    } else {
      // 3. Just add to queue if exists
      await dataService.saveToQueue(patient);
      toastService.success(`${app.patientName} ajouté à la salle d'attente`);
    }

    // 4. Update appointment status to reflect arrival, link the patient record
    const apps = dataService.getAppointments();
    const target = apps.find(a => a.id === app.id);
    if (target) {
      target.status = 'ARRIVED';
      target.patientId = patientId;
      dataService.saveAppointment(target);
    }
    setDetailAppointment(null);
  };

  const updateStatus = (id: string, status: AppointmentStatus) => {
    const apps = dataService.getAppointments();
    const app = apps.find(a => a.id === id);
    if (app) {
      app.status = status;
      dataService.saveAppointment(app);
      toastService.info(`Rendez-vous : ${STATUS_META[status].label.toLowerCase()}`);
    }
    setDetailAppointment(null);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId) {
      dataService.deleteAppointment(deleteId);
      toastService.error("Rendez-vous supprimé définitivement");
      setDeleteId(null);
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

  // --- Vue Semaine / Jour : grille horaire 08h-19h ---
  const weekDays = useMemo(() => {
    const monday = getMonday(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [selectedDate]);

  const daysForGrid = viewMode === 'day' ? [new Date(selectedDate + 'T00:00:00')] : weekDays;
  const gridTimeSlots = viewMode === 'day' ? TIME_SLOTS_DAY : TIME_SLOTS_WEEK;

  const shiftDate = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toDateStr(d);
  };

  const goToToday = () => setSelectedDate(todayStr);
  const navigateGrid = (offset: number) => {
    setSelectedDate(shiftDate(selectedDate, viewMode === 'day' ? offset : offset * 7));
  };

  const isArrivingSoon = (app: Appointment) => {
    if (!app.time || app.date !== todayStr) return false;
    if (app.status === 'DONE' || app.status === 'REJECTED') return false;
    const start = timeToMinutes(app.time);
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return start >= now && start - now <= 30;
  };

  const appointmentsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    daysForGrid.forEach(d => { map[toDateStr(d)] = allAppointments.filter(a => a.date === toDateStr(d)); });
    return map;
  }, [allAppointments, daysForGrid]);

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
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all group border ${isSelected
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
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
            {([
              { id: 'week', label: 'Semaine', icon: LayoutGrid },
              { id: 'day', label: 'Jour', icon: CalendarIcon },
              { id: 'list', label: 'Liste', icon: List },
            ] as { id: CalendarViewMode; label: string; icon: any }[]).map(v => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${viewMode === v.id ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <v.icon size={14} /> {v.label}
              </button>
            ))}
          </div>

          {(viewMode === 'week' || viewMode === 'day') && (
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
              <button onClick={() => navigateGrid(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><ChevronLeft size={18} /></button>
              <button onClick={goToToday} className="px-3 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors">Aujourd'hui</button>
              <button onClick={() => navigateGrid(1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><ChevronRight size={18} /></button>
            </div>
          )}

          {viewMode === 'list' && (
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Rechercher nom ou note..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-black outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
            </div>
          )}

          <button
            onClick={() => openCreateModal(selectedDate)}
            disabled={isSelectedDatePast || isSelectedDateFull}
            className={`w-full sm:w-auto px-6 py-3 font-black rounded-2xl shadow-xl uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ${isSelectedDatePast || isSelectedDateFull ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'}`}
          >
            <Plus size={18} /> Fixer un RDV
          </button>
        </div>

        {/* Vue Semaine / Jour : grille horaire */}
        {(viewMode === 'week' || viewMode === 'day') && (
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <div style={{ minWidth: viewMode === 'week' ? '900px' : '260px' }}>
                {/* En-têtes des jours */}
                <div className="flex border-b border-gray-100 sticky top-0 bg-white z-10">
                  <div className="w-16 shrink-0" />
                  {daysForGrid.map(d => {
                    const dStr = toDateStr(d);
                    const isToday = dStr === todayStr;
                    return (
                      <div key={dStr} className={`flex-1 text-center py-3 border-l border-gray-100 ${isToday ? 'bg-emerald-50' : ''}`}>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</p>
                        <p className={`text-sm font-black ${isToday ? 'text-emerald-600' : 'text-gray-800'}`}>{d.getDate()}</p>
                      </div>
                    );
                  })}
                </div>

                {/* RDV sans horaire */}
                {daysForGrid.some(d => (appointmentsByDay[toDateStr(d)] || []).some(a => !a.time)) && (
                  <div className="flex border-b border-gray-100 bg-gray-50/50">
                    <div className="w-16 shrink-0 flex items-center justify-center text-[8px] font-black text-gray-300 uppercase">Sans<br />horaire</div>
                    {daysForGrid.map(d => {
                      const dStr = toDateStr(d);
                      const untimed = (appointmentsByDay[dStr] || []).filter(a => !a.time);
                      return (
                        <div key={dStr} className="flex-1 border-l border-gray-100 p-1.5 flex flex-wrap gap-1">
                          {untimed.map(a => (
                            <button
                              key={a.id}
                              onClick={() => setDetailAppointment(a)}
                              className="px-2 py-0.5 rounded-md text-[9px] font-bold truncate max-w-full"
                              style={{ background: STATUS_META[a.status].bg, color: STATUS_META[a.status].color, border: `1px solid ${STATUS_META[a.status].border}` }}
                            >
                              {a.patientName}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Grille horaire */}
                <div className="flex relative" style={{ height: ((AGENDA_END_MIN - AGENDA_START_MIN) / 15) * SLOT_PX }}>
                  {/* Gouttière des heures */}
                  <div className="w-16 shrink-0 relative">
                    {gridTimeSlots.filter(t => t.endsWith(':00')).map(t => (
                      <div
                        key={t}
                        className="absolute left-0 right-0 text-[9px] font-black text-gray-300 -translate-y-1/2 pr-2 text-right"
                        style={{ top: ((timeToMinutes(t) - AGENDA_START_MIN) / 15) * SLOT_PX }}
                      >
                        {t}
                      </div>
                    ))}
                  </div>

                  {daysForGrid.map(d => {
                    const dStr = toDateStr(d);
                    const dayApps = (appointmentsByDay[dStr] || []).filter(a => a.time);
                    const isPastDay = dStr < todayStr;
                    return (
                      <div key={dStr} className="flex-1 border-l border-gray-100 relative">
                        {/* Lignes horaires cliquables */}
                        {gridTimeSlots.map(t => (
                          <button
                            key={t}
                            onClick={() => !isPastDay && openCreateModal(dStr, t)}
                            disabled={isPastDay}
                            className={`absolute left-0 right-0 border-t border-gray-50 hover:bg-emerald-50/40 transition-colors ${t.endsWith(':00') ? 'border-t-gray-100' : ''}`}
                            style={{ top: ((timeToMinutes(t) - AGENDA_START_MIN) / 15) * SLOT_PX, height: SLOT_PX }}
                          />
                        ))}

                        {/* RDV positionnés */}
                        {dayApps.map(a => {
                          const start = timeToMinutes(a.time!);
                          const dur = a.duration || 30;
                          const top = ((start - AGENDA_START_MIN) / 15) * SLOT_PX;
                          const height = Math.max((dur / 15) * SLOT_PX - 2, SLOT_PX - 2);
                          const soon = isArrivingSoon(a);
                          return (
                            <button
                              key={a.id}
                              onClick={() => setDetailAppointment(a)}
                              className={`absolute left-1 right-1 rounded-lg px-2 py-1 text-left overflow-hidden shadow-sm transition-all hover:shadow-md z-[1] ${soon ? 'ring-2 ring-yellow-400 animate-pulse' : ''} ${a.status === 'REJECTED' ? 'opacity-50' : ''}`}
                              style={{ top, height, background: soon ? '#fef9c3' : STATUS_META[a.status].bg, borderLeft: `3px solid ${STATUS_META[a.status].color}` }}
                            >
                              <p className={`text-[9px] font-black truncate ${a.status === 'REJECTED' ? 'line-through' : ''}`} style={{ color: STATUS_META[a.status].color }}>
                                {a.time} · {a.patientName}
                              </p>
                              {height > 28 && <p className="text-[8px] text-gray-500 truncate">{a.consultationType || a.note}</p>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Liste des Rendez-vous */}
        {viewMode === 'list' && (
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
                <div className={`absolute left-0 top-0 bottom-0 w-2 ${app.status === 'REJECTED' ? 'bg-gray-300' :
                  app.priority === 'URGENT' ? 'bg-red-500 animate-pulse' :
                    app.priority === 'INITIAL' ? 'bg-blue-500' : 'bg-emerald-500'
                  }`} />

                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black shrink-0 ${app.status === 'REJECTED' ? 'bg-gray-200 text-gray-500' :
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
                      <span
                        className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase"
                        style={{ background: STATUS_META[app.status].bg, color: STATUS_META[app.status].color }}
                      >
                        {STATUS_META[app.status].label}
                      </span>
                      {app.time && (
                        <span className="text-[10px] font-black text-gray-400">{app.time}</span>
                      )}
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

                    {/* VALIDER / ARRIVÉ (Si planifié) */}
                    {!isSelectedDatePast && (app.status === 'PENDING' || app.status === 'CONFIRMED') && (
                      <button
                        onClick={() => handleMarkAsArrived(app)}
                        className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                        title="Marquer comme arrivé (Salle d'attente)"
                      >
                        <UserCheck size={18} />
                      </button>
                    )}

                    {/* EN CONSULTATION (Si arrivé) */}
                    {app.status === 'ARRIVED' && (
                      <button
                        onClick={() => updateStatus(app.id, 'IN_CONSULTATION')}
                        className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center hover:bg-amber-600 transition-all shadow-lg shadow-amber-100"
                        title="Marquer en consultation"
                      >
                        <Stethoscope size={18} />
                      </button>
                    )}

                    {/* TERMINÉ (Si en consultation) */}
                    {app.status === 'IN_CONSULTATION' && (
                      <button
                        onClick={() => updateStatus(app.id, 'DONE')}
                        className="w-10 h-10 bg-gray-500 text-white rounded-xl flex items-center justify-center hover:bg-gray-600 transition-all shadow-lg shadow-gray-100"
                        title="Marquer terminé"
                      >
                        <CheckCircle size={18} />
                      </button>
                    )}

                    {/* ANNULER (Ne compte plus dans le quota) */}
                    {app.status !== 'REJECTED' && app.status !== 'DONE' && !isSelectedDatePast && (
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
        )}
      </div>

      {/* --- MODAL ADD / EDIT --- */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                  {editingId ? 'Modifier Rendez-vous' : 'Fixer Rendez-vous'}
                </h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                  {editingId ? 'Correction des informations' : 'Analyse automatique par IA activée'}
                </p>
              </div>
              <button onClick={() => { setIsAdding(false); setEditingId(null); setPatientSuggestions([]); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><X size={20} /></button>
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
                  onChange={e => setNewApp({ ...newApp, phone: e.target.value })}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="06..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date</label>
                  <input
                    type="date"
                    value={newApp.date}
                    onChange={e => setNewApp({ ...newApp, date: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Heure</label>
                  <input
                    type="time"
                    value={newApp.time}
                    onChange={e => setNewApp({ ...newApp, time: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Durée</label>
                  <select
                    value={newApp.duration}
                    onChange={e => setNewApp({ ...newApp, duration: parseInt(e.target.value, 10) })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {[15, 30, 45, 60].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Type</label>
                  <select
                    value={newApp.consultationType}
                    onChange={e => setNewApp({ ...newApp, consultationType: e.target.value as AppointmentType })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-black text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {CONSULTATION_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>
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
                  onChange={e => setNewApp({ ...newApp, note: e.target.value })}
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
      {/* --- DETAIL PANEL (clic sur un RDV dans la grille) --- */}
      {detailAppointment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span
                  className="inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase mb-2"
                  style={{ background: STATUS_META[detailAppointment.status].bg, color: STATUS_META[detailAppointment.status].color }}
                >
                  {STATUS_META[detailAppointment.status].label}
                </span>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">{detailAppointment.patientName}</h3>
                <p className="text-[11px] font-bold text-gray-400 mt-0.5">
                  {new Date(detailAppointment.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {detailAppointment.time ? ` · ${detailAppointment.time}` : ''}
                  {detailAppointment.duration ? ` (${detailAppointment.duration} min)` : ''}
                </p>
              </div>
              <button onClick={() => setDetailAppointment(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-black"><X size={18} /></button>
            </div>

            <div className="space-y-3 mb-6">
              {detailAppointment.consultationType && (
                <p className="text-xs font-bold text-gray-600 flex items-center gap-2"><Stethoscope size={13} className="text-gray-300" />{detailAppointment.consultationType}</p>
              )}
              {detailAppointment.phone && (
                <p className="text-xs font-bold text-gray-600 flex items-center gap-2"><Phone size={13} className="text-gray-300" />{detailAppointment.phone}</p>
              )}
              <p className="text-xs text-gray-500 italic">"{detailAppointment.note}"</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {detailAppointment.status !== 'REJECTED' && (
                <button
                  onClick={() => startEdit(detailAppointment)}
                  className="py-3 bg-white border border-gray-200 text-blue-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center justify-center gap-1.5"
                >
                  <Edit2 size={14} /> Modifier
                </button>
              )}
              {(detailAppointment.status === 'PENDING' || detailAppointment.status === 'CONFIRMED') && (
                <button
                  onClick={() => handleMarkAsArrived(detailAppointment)}
                  className="py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <UserCheck size={14} /> Arrivé
                </button>
              )}
              {detailAppointment.status === 'ARRIVED' && (
                <button
                  onClick={() => updateStatus(detailAppointment.id, 'IN_CONSULTATION')}
                  className="py-3 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 transition-all flex items-center justify-center gap-1.5"
                >
                  <Stethoscope size={14} /> En consultation
                </button>
              )}
              {detailAppointment.status === 'IN_CONSULTATION' && (
                <button
                  onClick={() => updateStatus(detailAppointment.id, 'DONE')}
                  className="py-3 bg-gray-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-600 transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={14} /> Terminé
                </button>
              )}
              {detailAppointment.status !== 'REJECTED' && detailAppointment.status !== 'DONE' && (
                <button
                  onClick={() => updateStatus(detailAppointment.id, 'REJECTED')}
                  className="py-3 bg-white border border-orange-200 text-orange-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-50 transition-all flex items-center justify-center gap-1.5"
                >
                  <Ban size={14} /> Annuler
                </button>
              )}
              <button
                onClick={() => { handleDelete(detailAppointment.id); setDetailAppointment(null); }}
                className="py-3 bg-white border border-red-200 text-red-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-1.5 col-span-2"
              >
                <Trash2 size={14} /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={40} />
            </div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Suppression Définitive</h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">
              Êtes-vous sûr ? Cette action est irréversible et effacera toutes les données de ce rendez-vous.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-black rounded-2xl transition-all uppercase text-[10px] tracking-widest"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-red-100 uppercase text-[10px] tracking-widest"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentManager;
