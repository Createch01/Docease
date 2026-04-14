
import React, { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, FileText, X, Users, Scale, Activity, AlertCircle, Clock, Wallet, Edit2, Phone, UserCircle, Baby, Heart, ArrowRight, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { Patient, PatientType } from '../types';
import { COMMON_PATHOLOGIES, COMMON_ALLERGIES } from '../constants/medicalData';

interface PatientManagerProps {
  onConsult?: (p: Patient) => void;
}

const PatientManager: React.FC<PatientManagerProps> = ({ onConsult }) => {
  const { t, lang, dir } = useI18n();
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [showPathoSuggestions, setShowPathoSuggestions] = useState(false);
  const [showAllergySuggestions, setShowAllergySuggestions] = useState(false);

  const doctor = dataService.getDoctorInfo();
  const [newPatient, setNewPatient] = useState<Partial<Patient>>({
    name: '',
    age: 0,
    phone: '',
    weight: '',
    allergies: '',
    pathologies: '',
    sex: 'F',
    type: 'Woman',
    consultationFee: 0
  });

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

    try {
      const patient: Patient = {
        id: editingId || Date.now().toString(),
        name: newPatient.name,
        age: newPatient.age || 0,
        sex: newPatient.type === 'Woman' ? 'F' : (newPatient.sex as 'M' | 'F' || 'M'),
        type: newPatient.type as PatientType,
        phone: newPatient.phone,
        weight: newPatient.weight,
        allergies: newPatient.allergies,
        pathologies: newPatient.pathologies,
        consultationFee: newPatient.consultationFee || 0,
        registeredDate: (newPatient as Patient).registeredDate || new Date().toISOString()
      };

      if (editingId) {
        await dataService.updatePatientInQueue(editingId, patient);
        setEditingId(null);
      } else {
        await dataService.registerPatient(patient);
      }

      setQueue(dataService.getTodayQueue());
      setIsRegistering(false);
      setNewPatient({ name: '', age: 0, phone: '', weight: '', allergies: '', pathologies: '', sex: 'F', type: 'Woman', consultationFee: 0 });
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

  const isChild = newPatient.type === 'Child';

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 pb-20 text-black">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-emerald-900 tracking-tight flex items-center gap-3">
            <Users className="text-emerald-500" size={32} />
            {t('waiting_room')}
          </h2>
          <p className="text-gray-500 font-medium">{t('waiting_room_desc')} {new Date().toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto relative">
          <div className="relative flex-grow group">
            <Search className={`absolute ${dir === 'rtl' ? 'right-5' : 'left-5'} top-1/2 -translate-y-1/2 transition-colors duration-300 ${localSearch ? 'text-emerald-500' : 'text-gray-400'}`} size={22} />
            <input
              type="text"
              placeholder={t('search_patient')}
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className={`w-full sm:w-96 ${dir === 'rtl' ? 'pr-14 pl-12' : 'pl-14 pr-12'} py-5 bg-white border-2 border-emerald-100 rounded-[2rem] focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500 outline-none shadow-sm transition-all font-black text-gray-900 text-xl placeholder-gray-300`}
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className={`absolute ${dir === 'rtl' ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-full text-gray-400`}
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
                              Inscrit le {new Date(p.registeredDate).toLocaleDateString()}
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
                setNewPatient({ name: '', age: 0, phone: '', weight: '', allergies: '', pathologies: '', sex: 'F', type: 'Woman', consultationFee: 0 });
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
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-emerald-100 animate-in zoom-in-95 duration-200">
          <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
            {editingId ? <Edit2 size={24} className="text-blue-600" /> : <UserPlus size={24} className="text-emerald-600" />}
            {editingId ? t('edit_info') : t('new_registration')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Type Selection */}
            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('patient_category')}</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'Adult', label: t('adult'), icon: UserCircle, color: 'blue' },
                  { id: 'Woman', label: t('woman'), icon: Heart, color: 'pink' },
                  { id: 'Child', label: t('child'), icon: Baby, color: 'emerald' }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setNewPatient({ ...newPatient, type: t.id as PatientType, sex: t.id === 'Woman' ? 'F' : (t.id === 'Adult' ? 'M' : newPatient.sex) })}
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl border-2 transition-all font-black uppercase text-xs tracking-widest ${newPatient.type === t.id
                      ? `bg-${t.color}-50 border-${t.color}-500 text-${t.color}-700 shadow-lg shadow-${t.color}-100`
                      : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
                      }`}
                  >
                    <t.icon size={20} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('full_name')}</label>
              <div className="relative">
                <UserCircle className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-300`} size={18} />
                <input
                  type="text"
                  placeholder="Ex: Ahmed Benani"
                  value={newPatient.name}
                  onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                  className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black text-lg`}
                />
              </div>
            </div>

            {registrationMatches.length > 0 && (
              <div className="md:col-span-3 -mt-4 animate-in slide-in-from-top-2">
                <div className="bg-amber-50/50 border border-amber-100 rounded-[1.5rem] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="text-amber-600" size={16} />
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Patient déjà enregistré ?</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {registrationMatches.map(p => (
                      <button
                        key={p.id}
                        onClick={() => startEdit(p)}
                        className="bg-white px-4 py-2 rounded-xl border border-amber-200 shadow-sm hover:border-amber-500 transition-all flex items-center gap-4 group"
                      >
                        <div className="text-left">
                          <p className="text-[10px] font-black text-gray-900 uppercase">{p.name}</p>
                          <p className="text-[8px] font-bold text-gray-400">{p.phone || 'Sans téléphone'}</p>
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all">
                          <ArrowRight size={14} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('phone_required')}</label>
              <div className="relative">
                <Phone className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-300`} size={18} />
                <input
                  type="tel"
                  placeholder="06 XX XX XX XX"
                  value={newPatient.phone}
                  onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                  className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black`}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isChild ? 'text-emerald-600' : 'text-gray-400'}`}>
                {t('age')} {isChild && `(${t('age_required')})`}
              </label>
              <div className="relative">
                <Clock className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 ${isChild ? 'text-emerald-400' : 'text-gray-300'}`} size={18} />
                <input
                  type="number"
                  placeholder={t('age')}
                  value={newPatient.age || ''}
                  onChange={e => setNewPatient({ ...newPatient, age: parseInt(e.target.value) || 0 })}
                  className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 border rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black ${isChild ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}
                />
              </div>
            </div>

            {isChild && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <Scale size={12} /> {t('weight_child')}
                </label>
                <div className="relative">
                  <Scale className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-emerald-400`} size={18} />
                  <input
                    type="text"
                    placeholder="Ex: 12 kg"
                    value={newPatient.weight}
                    onChange={e => setNewPatient({ ...newPatient, weight: e.target.value })}
                    className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black`}
                  />
                </div>
              </div>
            )}

            {!isChild && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('weight_optional')}</label>
                <div className="relative">
                  <Scale className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-300`} size={18} />
                  <input
                    type="text"
                    placeholder="Ex: 75 kg"
                    value={newPatient.weight}
                    onChange={e => setNewPatient({ ...newPatient, weight: e.target.value })}
                    className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black`}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2 relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('pathologies')}</label>
              <div className="relative">
                <Activity className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-300`} size={18} />
                <input
                  type="text"
                  placeholder="Ex: Diabète, HTA..."
                  value={newPatient.pathologies}
                  onFocus={() => { setShowPathoSuggestions(true); setShowAllergySuggestions(false); }}
                  onChange={e => setNewPatient({ ...newPatient, pathologies: e.target.value })}
                  className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black`}
                />
              </div>
              {showPathoSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-emerald-100 z-[60] py-2 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-2 flex justify-between items-center border-b border-gray-50 mb-1">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t('suggestions')}</span>
                    <button onClick={() => setShowPathoSuggestions(false)}><X size={14} className="text-gray-400" /></button>
                  </div>
                  {COMMON_PATHOLOGIES.filter(p => !newPatient.pathologies?.includes(p))
                    .filter(p => p.toLowerCase().includes((newPatient.pathologies?.split(',').pop()?.trim() || '').toLowerCase()))
                    .map(p => (
                      <button
                        key={p}
                        onClick={() => {
                          const current = newPatient.pathologies ? newPatient.pathologies.split(',').map(s => s.trim()).filter(Boolean) : [];
                          current.pop(); // Remove the partial search term
                          const updated = [...current, p].join(', ');
                          setNewPatient({ ...newPatient, pathologies: updated + ', ' });
                          setShowPathoSuggestions(false);
                        }}
                        className="w-full text-left px-5 py-2.5 hover:bg-emerald-50 text-xs font-bold text-gray-700 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('consultation_fee')} ({doctor.currency})</label>
              <div className="relative">
                <Wallet className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-emerald-400`} size={18} />
                <input
                  type="number"
                  placeholder="Ex: 200"
                  value={newPatient.consultationFee || ''}
                  onChange={e => setNewPatient({ ...newPatient, consultationFee: parseFloat(e.target.value) || 0 })}
                  className={`w-full ${dir === 'rtl' ? 'pr-12 pl-5' : 'pl-12 pr-5'} py-4 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black`}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2 relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Allergies connues</label>
              <div className="relative">
                <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-red-300" size={18} />
                <input
                  type="text"
                  placeholder="Ex: Pénicilline..."
                  value={newPatient.allergies}
                  onFocus={() => { setShowAllergySuggestions(true); setShowPathoSuggestions(false); }}
                  onChange={e => setNewPatient({ ...newPatient, allergies: e.target.value })}
                  className="w-full pl-12 pr-5 py-4 bg-red-50/30 border border-red-100 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-black"
                />
              </div>
              {showAllergySuggestions && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-red-100 z-[60] py-2 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-2 flex justify-between items-center border-b border-gray-50 mb-1">
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">{t('suggestions')}</span>
                    <button onClick={() => setShowAllergySuggestions(false)}><X size={14} className="text-gray-400" /></button>
                  </div>
                  {COMMON_ALLERGIES.filter(a => !newPatient.allergies?.includes(a))
                    .filter(a => a.toLowerCase().includes((newPatient.allergies?.split(',').pop()?.trim() || '').toLowerCase()))
                    .map(a => (
                      <button
                        key={a}
                        onClick={() => {
                          const current = newPatient.allergies ? newPatient.allergies.split(',').map(s => s.trim()).filter(Boolean) : [];
                          current.pop();
                          const updated = [...current, a].join(', ');
                          setNewPatient({ ...newPatient, allergies: updated + ', ' });
                          setShowAllergySuggestions(false);
                        }}
                        className="w-full text-left px-5 py-2.5 hover:bg-red-50 text-xs font-bold text-gray-700 transition-colors"
                      >
                        {a}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-3 pt-4">
              <button
                onClick={handleRegister}
                className={`w-full py-5 text-white font-black rounded-2xl shadow-xl transition-all active:scale-[0.98] text-lg uppercase tracking-widest ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}
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
          <span className="px-4 py-1.5 bg-gray-100 text-gray-500 rounded-full text-xs font-black uppercase tracking-widest">
            {filteredQueue.length} Patient{filteredQueue.length !== 1 ? 's' : ''} {t('in_waiting')}
          </span>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="bg-white py-32 rounded-[3rem] border border-dashed border-gray-200 text-center">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users size={48} className="text-gray-200" />
            </div>
            <h4 className="text-xl font-bold text-gray-400">{t('empty_queue')}</h4>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredQueue.map((p, i) => (
              <div key={p.id} className="group bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 transition-all duration-500 relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-2xl">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-gray-900 uppercase truncate max-w-[150px]">{p.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${p.type === 'Child' ? 'bg-emerald-100 text-emerald-700' :
                          p.type === 'Woman' ? 'bg-pink-100 text-pink-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                          {p.type === 'Child' ? t('child') : p.type === 'Woman' ? t('woman') : t('adult')}
                        </span>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{p.age} {t('age').toLowerCase()}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-emerald-500/10 text-emerald-600 p-2 rounded-xl">
                    <Clock size={18} />
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {p.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone size={14} className="text-emerald-500 shrink-0" />
                      <span className="text-gray-900 font-bold">{p.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm">
                    <Activity size={16} className="text-emerald-500 shrink-0" />
                    <span className="text-gray-600 font-bold">{p.pathologies || 'Pas de pathologie'}</span>
                  </div>
                  {p.weight && (
                    <div className="flex items-center gap-3 text-sm">
                      <Scale size={16} className="text-emerald-500 shrink-0" />
                      <span className="text-gray-600 font-bold">{t('weight')}: {p.weight}</span>
                    </div>
                  )}
                  {p.allergies && (
                    <div className="flex items-center gap-3 text-sm bg-red-50 p-2 rounded-xl">
                      <AlertCircle size={16} className="text-red-500 shrink-0" />
                      <span className="text-red-700 font-bold text-[10px] uppercase truncate">{t('allergies')}: {p.allergies}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-50 flex gap-2">
                  <button onClick={() => startEdit(p)} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => onConsult && onConsult(p)}
                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition-all text-xs uppercase flex items-center justify-center gap-2"
                  >
                    {t('consult')} <ArrowRight size={14} className={`transform ${dir === 'rtl' ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={() => deletePatient(p.id)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
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
