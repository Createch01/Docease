import React, { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, FileText, X, Users, Scale, Clock, Wallet, Edit2, Phone, UserCircle, Baby, Heart, ArrowRight, Plus, CreditCard, MapPin, LayoutList, LayoutGrid, User } from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { Patient, PatientType } from '../types';
import { formatAge, formatDate, calculateAgeYears, getAgeCategory } from '../utils/formatters';

interface PatientManagerProps {
  onConsult?: (p: Patient) => void;
}

const PatientManager: React.FC<PatientManagerProps> = ({ onConsult }) => {
  const { t, lang, dir } = useI18n();
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const doctor = dataService.getDoctorInfo();
  const blankPatient: Partial<Patient> = {
    name: '',
    age: 0,
    dateOfBirth: '',
    cin: '',
    phone: '',
    address: '',
    weight: '',
    allergies: '',
    pathologies: '',
    pathologyTags: [],
    pathologiesOtherTags: [],
    allergyTags: [],
    allergiesOtherTags: [],
    sex: undefined,
    consultationFee: doctor.standardConsultationFee || 0
  };
  const [newPatient, setNewPatient] = useState<Partial<Patient>>(blankPatient);

  const [queue, setQueue] = useState<Patient[]>(dataService.getTodayQueue());

  useEffect(() => {
    const loadQueue = () => setQueue(dataService.getTodayQueue());
    loadQueue();

    // Listen for updates from other components
    const handleUpdate = (e: any) => {
      if (e.detail?.key === 'meddoc_today_queue' || e.detail?.key === 'all') {
        loadQueue();
      }
    };

    window.addEventListener('meddoc_data_update', handleUpdate);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate);
  }, []);

  const handleRegister = async () => {
    if (!newPatient.name) return alert("Nom requis");
    if (newPatient.sex !== 'M' && newPatient.sex !== 'F') return alert("Genre requis (Homme / Femme)");

    try {
      const ageCategory = getAgeCategory(newPatient.dateOfBirth);
      const isMinor = ageCategory ? ageCategory.isPediatric : ((newPatient.age || 0) > 0 && (newPatient.age || 0) < 18);
      // `type` (Adult/Woman/Child) is kept only for legacy display badges and drugRules.ts's
      // isChild OR-condition — it's derived automatically here, never chosen manually, so it
      // can never be set incorrectly for the age it's meant to reflect.
      const type: PatientType = isMinor ? 'Child' : (newPatient.sex === 'F' ? 'Woman' : 'Adult');
      const patient: Patient = {
        id: editingId || Date.now().toString(),
        name: newPatient.name,
        age: (!isMinor ? calculateAgeYears(newPatient.dateOfBirth) : undefined) ?? newPatient.age ?? 0,
        dateOfBirth: newPatient.dateOfBirth || undefined,
        cin: !isMinor ? (newPatient.cin || undefined) : undefined,
        sex: newPatient.sex,
        type,
        phone: newPatient.phone,
        address: newPatient.address || undefined,
        weight: newPatient.weight,
        allergies: newPatient.allergies,
        pathologies: newPatient.pathologies,
        pathologyTags: newPatient.pathologyTags || [],
        pathologiesOtherTags: newPatient.pathologiesOtherTags || [],
        allergyTags: newPatient.allergyTags || [],
        allergiesOtherTags: newPatient.allergiesOtherTags || [],
        isPregnant: newPatient.sex === 'F' ? newPatient.isPregnant : undefined,
        pregnancyWeeks: newPatient.sex === 'F' ? newPatient.pregnancyWeeks : undefined,
        isBreastfeeding: newPatient.sex === 'F' ? newPatient.isBreastfeeding : undefined,
        consultationFee: newPatient.consultationFee || 0,
        registeredDate: (newPatient as Patient).registeredDate || new Date().toISOString()
      };

      if (newPatient.sex === 'F' && newPatient.isPregnant && !newPatient.pregnancyWeeks) {
        alert("Semaines d'aménorrhée (SA) requises pour une patiente enceinte");
        return;
      }

      if (editingId) {
        await dataService.updatePatientInQueue(editingId, patient);
        setEditingId(null);
      } else {
        await dataService.registerPatient(patient);
      }

      setQueue(dataService.getTodayQueue());
      setIsRegistering(false);
      setNewPatient(blankPatient);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement:", error);
      alert("Une erreur est survenue lors de l'enregistrement du patient.");
    }
  };

  const startEdit = (p: Patient) => {
    setNewPatient(p);
    setEditingId(p.id);
    setIsRegistering(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePatient = (id: string) => {
    if (window.confirm("Supprimer ce patient de la file d'attente ?")) {
      dataService.deleteFromQueue(id);
      setQueue(dataService.getTodayQueue());
    }
  };

  const filteredQueue = useMemo(() => {
    return queue.filter(p =>
      p.name.toLowerCase().includes(localSearch.toLowerCase()) ||
      (p.phone && p.phone.includes(localSearch))
    );
  }, [queue, localSearch]);

  const existingPatientsResults = useMemo(() => {
    if (!localSearch || localSearch.length < 2) return [];
    const all = dataService.getAllPatients();
    // Filter out patients already in queue
    return all.filter(p =>
      (p.name.toLowerCase().includes(localSearch.toLowerCase()) || (p.phone && p.phone.includes(localSearch))) &&
      !queue.some(qp => qp.id === p.id)
    ).slice(0, 3);
  }, [localSearch, queue]);

  const registrationMatches = useMemo(() => {
    if (!isRegistering || editingId || !newPatient.name || newPatient.name.length < 2) return [];
    const all = dataService.getAllPatients();
    return all.filter(p =>
      p.name.toLowerCase().includes(newPatient.name!.toLowerCase())
    ).slice(0, 3);
  }, [newPatient.name, isRegistering, editingId]);

  const addToQueue = async (p: Patient) => {
    await dataService.saveToQueue(p);
    setQueue(dataService.getTodayQueue());
    setLocalSearch('');
  };

  const ageCategory = getAgeCategory(newPatient.dateOfBirth);
  const isChild = ageCategory ? ageCategory.isPediatric : ((newPatient.age || 0) > 0 && (newPatient.age || 0) < 18);

  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in slide-in-from-left-8 duration-1000 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 pb-6 border-b border-emerald-500/5">
        <div>
          <h2 className="text-4xl font-black text-slate-950 tracking-tight flex items-center gap-4 italic uppercase">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-inner">
              <Users size={32} />
            </div>
            {t('waiting_room')}
          </h2>
          <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] mt-4">
            {t('waiting_room_desc')} • {new Date().toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto relative">
          <div className="relative flex-grow group max-w-xl">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
              <Search size={20} className={localSearch ? 'text-emerald-500' : 'text-gray-500'} />
            </div>
            <input
              type="text"
              placeholder={t('search_patient')}
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className="w-full sm:w-[400px] pl-14 pr-12 py-5 bg-white border border-slate-300 rounded-2xl focus:ring-8 focus:ring-emerald-500/10 focus:border-emerald-500/30 outline-none shadow-soft transition-all font-bold text-gray-900 text-xl placeholder:text-gray-600 placeholder:font-semibold"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 rounded-xl text-slate-300 transition-colors"
              >
                <X size={18} />
              </button>
            )}
            {/* Search Results Dropdown */}
            {existingPatientsResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-emerald-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="p-3 bg-emerald-50 border-b border-emerald-100">
                  <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">{t('patients_database')}</span>
                </div>
                {existingPatientsResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToQueue(p)}
                    className="w-full p-4 flex items-center justify-between hover:bg-emerald-50 transition-colors text-left border-b border-gray-50 last:border-0 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                        <UserCircle size={24} />
                      </div>
                      <div>
                        <p className="font-black text-gray-900 uppercase text-sm">{p.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                            {p.phone || 'Sans téléphone'}
                          </span>
                          {p.registeredDate && (
                            <span className="text-[9px] font-medium text-emerald-600 flex items-center gap-1">
                              <Clock size={10} />
                              Inscrit le {formatDate(p.registeredDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 bg-white px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm font-black text-[10px] uppercase group-hover:bg-emerald-600 group-hover:text-white transition-all">
                      <Plus size={14} /> {t('add_patient')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              if (editingId) {
                setEditingId(null);
                setNewPatient({ name: '', age: 0, dateOfBirth: '', cin: '', phone: '', weight: '', allergies: '', pathologies: '', sex: undefined, consultationFee: 0 });
              }
            }}
            className={`flex items-center justify-center gap-2 px-8 py-4 font-black rounded-[1.5rem] transition-all shadow-lg active:scale-95 uppercase tracking-widest text-xs
              ${isRegistering
                ? 'bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 shadow-red-100'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'}`}
          >
            {isRegistering ? <X size={20} /> : <UserPlus size={20} />}
            {isRegistering ? t('close') : t('add_patient')}
          </button>
        </div>
      </div>

      {isRegistering && (
        <div className="bg-white p-12 rounded-[3.5rem] shadow-premium premium-border animate-in zoom-in-95 duration-500 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 gradient-primary"></div>
          <div className="flex items-center justify-between mb-12">
            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-4 italic uppercase tracking-tight">
              {editingId ? (
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                  <Edit2 size={24} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <UserPlus size={24} />
                </div>
              )}
              {editingId ? t('edit_info') : t('new_registration')}
            </h3>
            <button
              onClick={() => setIsRegistering(false)}
              className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Gender Selection (medical sex, independent from age category) */}
            <div className="md:col-span-3 space-y-4">
              <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">{t('sex')}</label>
              <div className="flex flex-wrap gap-4">
                {[
                  { id: 'M' as const, label: t('male'), icon: User, color: 'blue' },
                  { id: 'F' as const, label: t('female'), icon: Heart, color: 'rose' },
                ].map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setNewPatient(prev => ({
                      ...prev,
                      sex: g.id,
                      ...(g.id === 'M' ? { isPregnant: undefined, pregnancyWeeks: undefined, isBreastfeeding: undefined } : {})
                    }))}
                    className={`flex items-center gap-4 px-8 py-5 rounded-[2rem] border-2 transition-all font-black uppercase text-[10px] tracking-widest active:scale-95 ${newPatient.sex === g.id
                      ? `bg-${g.color}-50/50 border-${g.color}-500 text-${g.color}-700 shadow-soft`
                      : 'bg-white border-slate-300 text-gray-700 hover:border-slate-400'
                      }`}
                  >
                    <g.icon size={20} strokeWidth={2.5} />
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {newPatient.sex === 'F' && (
              <div className="md:col-span-3 space-y-4 bg-rose-50/40 border border-rose-100 rounded-[2rem] p-6">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setNewPatient({ ...newPatient, isPregnant: !newPatient.isPregnant, pregnancyWeeks: !newPatient.isPregnant ? newPatient.pregnancyWeeks : undefined })}
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 ${newPatient.isPregnant
                      ? 'bg-rose-500 border-rose-500 text-white shadow-soft'
                      : 'bg-white border-slate-300 text-gray-700 hover:border-rose-300'
                      }`}
                  >
                    <Heart size={18} strokeWidth={2.5} />
                    {t('pregnant')}
                  </button>

                  {newPatient.isPregnant && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Semaines d'aménorrhée (SA)</label>
                      <input
                        type="number"
                        min={0}
                        max={45}
                        placeholder="EX: 28"
                        value={newPatient.pregnancyWeeks ?? ''}
                        onChange={e => setNewPatient({ ...newPatient, pregnancyWeeks: parseInt(e.target.value) || undefined })}
                        className="w-24 px-4 py-3 bg-white border border-rose-300 rounded-xl focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none font-semibold text-gray-900"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setNewPatient({ ...newPatient, isBreastfeeding: !newPatient.isBreastfeeding })}
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 ${newPatient.isBreastfeeding
                      ? 'bg-rose-500 border-rose-500 text-white shadow-soft'
                      : 'bg-white border-slate-300 text-gray-700 hover:border-rose-300'
                      }`}
                  >
                    <Baby size={18} strokeWidth={2.5} />
                    {t('breastfeeding')}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3 md:col-span-2">
              <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">{t('full_name')}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                  <UserCircle size={20} className="text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder="NOM ET PRÉNOM"
                  value={newPatient.name}
                  onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                  className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 text-lg placeholder:text-gray-300 placeholder:font-normal transition-all"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">{t('phone_required')}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                  <Phone size={18} className="text-gray-500" />
                </div>
                <input
                  type="tel"
                  placeholder="06 XX XX XX XX"
                  value={newPatient.phone}
                  onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                  className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal transition-all"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">Adresse / Quartier (optionnel)</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                  <MapPin size={18} className="text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder="Ex: Hay Mohammadi, Agadir"
                  value={newPatient.address || ''}
                  onChange={e => setNewPatient({ ...newPatient, address: e.target.value })}
                  className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal transition-all"
                />
              </div>
            </div>

            {isChild ? (
              <>
                <div className="space-y-3">
                  <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">
                    {t('age')} ({t('age_required')})
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                      <Clock size={18} className="text-emerald-700" />
                    </div>
                    <input
                      type="number"
                      placeholder="EX: 5"
                      value={newPatient.age || ''}
                      onChange={e => setNewPatient({ ...newPatient, age: parseInt(e.target.value) || 0 })}
                      className="w-full pl-14 pr-6 py-5 border rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal transition-all bg-emerald-50/50 border-emerald-300"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">Date de naissance (optionnel)</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                      <Baby size={18} className="text-gray-500" />
                    </div>
                    <input
                      type="date"
                      value={newPatient.dateOfBirth || ''}
                      onChange={e => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 transition-all"
                    />
                  </div>
                  {ageCategory ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {ageCategory.label} — {formatAge({ dateOfBirth: newPatient.dateOfBirth })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-400 border border-slate-200">
                      Catégorie inconnue
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">Date de naissance (requis)</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                      <Baby size={18} className="text-gray-500" />
                    </div>
                    <input
                      type="date"
                      value={newPatient.dateOfBirth || ''}
                      onChange={e => setNewPatient({ ...newPatient, dateOfBirth: e.target.value, age: calculateAgeYears(e.target.value) ?? newPatient.age })}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">{t('age')} (calculé)</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                      <Clock size={18} className="text-gray-500" />
                    </div>
                    <div className={`w-full pl-14 pr-6 py-5 bg-slate-50/80 border border-slate-300 rounded-[1.5rem] font-semibold ${newPatient.dateOfBirth ? 'text-gray-900' : 'text-gray-400'}`}>
                      {newPatient.dateOfBirth ? formatAge({ dateOfBirth: newPatient.dateOfBirth }) : '--'}
                    </div>
                  </div>
                  {ageCategory ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {ageCategory.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-400 border border-slate-200">
                      Catégorie inconnue
                    </span>
                  )}
                </div>
              </>
            )}

            <div className="space-y-3">
              <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">{t('weight_child')}</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                  <Scale size={18} className="text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder="EX: 75 KG"
                  value={newPatient.weight}
                  onChange={e => setNewPatient({ ...newPatient, weight: e.target.value })}
                  className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal transition-all"
                />
              </div>
            </div>

            {!isChild && (
              <div className="space-y-3">
                <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">Numéro de Carte Nationale (CIN)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                    <CreditCard size={18} className="text-gray-500" />
                  </div>
                  <input
                    type="text"
                    placeholder="EX: AB123456"
                    value={newPatient.cin || ''}
                    onChange={e => setNewPatient({ ...newPatient, cin: e.target.value.toUpperCase() })}
                    className="w-full pl-14 pr-6 py-5 bg-slate-50/50 border border-slate-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-gray-900 font-bold text-sm tracking-wide uppercase ml-1">{t('consultation_fee')} ({doctor.currency})</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none group-focus-within:text-emerald-500 transition-colors">
                  <Wallet size={18} className="text-emerald-700" />
                </div>
                <input
                  type="number"
                  placeholder="EX: 300"
                  value={newPatient.consultationFee || ''}
                  onChange={e => setNewPatient({ ...newPatient, consultationFee: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-14 pr-6 py-5 bg-emerald-50/30 border border-emerald-300 rounded-[1.5rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500/30 outline-none font-semibold text-gray-900 placeholder:text-gray-300 placeholder:font-normal transition-all"
                />
              </div>
            </div>

            <div className="md:col-span-3 pt-6">
              <button
                onClick={handleRegister}
                className={`w-full py-6 text-white font-black rounded-[2rem] shadow-premium transition-all active:scale-[0.98] text-[11px] uppercase tracking-[0.3em] ${editingId ? 'bg-slate-900 hover:shadow-xl' : 'gradient-primary hover:shadow-premium-hover'}`}
              >
                {editingId ? t('confirm_changes') : t('validate_entry')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <Users size={20} />
            </div>
            <h3 className="text-xl font-bold text-gray-900">{t('todays_patients')}</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Vue liste compacte"
              >
                <LayoutList size={16} />
                <span className="hidden sm:inline">Liste</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Vue cartes"
              >
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Cartes</span>
              </button>
            </div>
            <span className="px-4 py-1.5 bg-gray-100 text-gray-500 rounded-full text-xs font-black uppercase tracking-widest">
              {filteredQueue.length} Patient{filteredQueue.length !== 1 ? 's' : ''} {t('in_waiting')}
            </span>
          </div>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="bg-slate-50/50 py-32 rounded-[3.5rem] border border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
            <div className="w-32 h-32 bg-white rounded-[3rem] flex items-center justify-center mb-8 shadow-soft border border-slate-100 animate-pulse">
              <Users size={56} className="text-slate-100" />
            </div>
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">{t('empty_queue')}</h4>
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
            <div className="divide-y divide-slate-100">
              {filteredQueue.map((p, i) => {
                const initials = p.name ? p.name.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?';
                const arrivalTime = p.registeredDate
                  ? new Date(p.registeredDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
                  : '—';
                const shortAddress = p.address ? (p.address.length > 25 ? `${p.address.substring(0, 25)}...` : p.address) : null;

                return (
                  <div
                    key={p.id}
                    className={`h-[56px] px-4 py-2 flex items-center justify-between gap-3 transition-colors cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-sky-50/60 ${i % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                  >
                    {/* Numéro d'ordre + Avatar + Nom + Sexe/Âge */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-black text-xs shrink-0">
                        {i + 1}
                      </span>

                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
                        p.sex === 'F' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {initials}
                      </div>

                      <span className="font-bold text-sm text-slate-900 uppercase truncate max-w-[180px] sm:max-w-[240px]" title={p.name}>
                        {p.name}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          p.type === 'Child' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                          p.type === 'Woman' ? 'bg-rose-50 text-rose-700 border border-rose-200/60' :
                          'bg-blue-50 text-blue-700 border border-blue-200/60'
                        }`}>
                          {p.type === 'Child' ? t('child') : p.type === 'Woman' ? t('woman') : t('adult')}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">
                          {formatAge(p)}
                        </span>
                      </div>
                    </div>

                    {/* Adresse + Téléphone (mobile hidden) + Heure d'arrivée */}
                    <div className="flex items-center gap-4 shrink-0">
                      {shortAddress && (
                        <div className="hidden lg:flex items-center gap-1 text-xs text-slate-500 font-medium bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200/60" title={p.address}>
                          <MapPin size={13} className="text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[180px]">{shortAddress}</span>
                        </div>
                      )}

                      {p.phone && (
                        <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <Phone size={13} className="text-slate-400" />
                          <span>{p.phone}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                        <Clock size={13} className="text-slate-400" />
                        <span>{arrivalTime}</span>
                      </div>
                    </div>

                    {/* Boutons d'action */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onConsult && onConsult(p); }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1"
                        title="Consulter"
                      >
                        <span>{t('consult')}</span>
                        <ArrowRight size={12} className={dir === 'rtl' ? 'rotate-180' : ''} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePatient(p.id); }}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Retirer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredQueue.map((p, i) => (
              <div key={p.id} className="group bg-white p-8 rounded-[3rem] premium-border shadow-soft hover:shadow-premium transition-all duration-700 relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-emerald-500/10 transition-all duration-1000"></div>

                <div className="flex justify-between items-start mb-8 relative z-10">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-slate-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner border border-slate-100">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-900 uppercase truncate max-w-[160px] tracking-tight group-hover:text-emerald-950 transition-colors">{p.name}</h4>
                      <div className="flex items-center gap-2.5 mt-2">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${p.type === 'Child' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          p.type === 'Woman' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                            'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                          {p.type === 'Child' ? t('child') : p.type === 'Woman' ? t('woman') : t('adult')}
                        </span>
                        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest leading-none">{formatAge(p)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform">
                    <Clock size={16} />
                  </div>
                </div>

                <div className="space-y-4 mb-10 flex-1 relative z-10">
                  {p.phone && (
                    <div className="flex items-center gap-4 text-[13px] font-medium text-slate-600">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <Phone size={14} />
                      </div>
                      <span className="font-bold tracking-tight">{p.phone}</span>
                    </div>
                  )}
                  {p.address && (
                    <div className="flex items-center gap-4 text-[13px] font-medium text-slate-600">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <MapPin size={14} className="text-emerald-600" />
                      </div>
                      <span className="font-bold tracking-tight truncate">{p.address}</span>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-50 flex gap-3 relative z-10">
                  <button onClick={() => startEdit(p)} className="w-12 h-12 bg-white border border-slate-100 text-slate-400 rounded-2xl hover:bg-slate-50 hover:text-blue-600 transition-all flex items-center justify-center shadow-sm active:scale-90">
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => onConsult && onConsult(p)}
                    className="flex-1 py-4 gradient-emerald-teal text-white font-black rounded-2xl shadow-soft hover:shadow-premium transition-all text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 active:scale-95 translate-y-0"
                  >
                    {t('consult')} <ArrowRight size={14} className={`transform ${dir === 'rtl' ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={() => deletePatient(p.id)} className="w-12 h-12 bg-white border border-slate-100 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all flex items-center justify-center shadow-sm active:scale-90">
                    <X size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientManager;
