
import React, { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, FileText, X, Users, Scale, Activity, AlertCircle, Clock, Wallet, Edit2, Phone, UserCircle, Baby, Heart, ArrowRight } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Patient, PatientType } from '../types';

interface PatientManagerProps {
  onConsult?: (p: Patient) => void;
}

const PatientManager: React.FC<PatientManagerProps> = ({ onConsult }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState('');

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

  const handleRegister = () => {
    if (!newPatient.name) return alert("Nom requis");

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
      consultationFee: newPatient.consultationFee || 0
    };

    if (editingId) {
      dataService.updatePatientInQueue(editingId, patient);
      setEditingId(null);
    } else {
      dataService.registerPatient(patient);
    }

    setQueue(dataService.getTodayQueue());
    setIsRegistering(false);
    setNewPatient({ name: '', age: 0, phone: '', weight: '', allergies: '', pathologies: '', sex: 'F', type: 'Woman', consultationFee: 0 });
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

  const isChild = newPatient.type === 'Child';

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-left-4 duration-500 pb-20 text-black">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Salle d'Attente</h2>
          <p className="text-gray-500">Gérez la file d'attente du {new Date().toLocaleDateString('fr-FR')}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher nom ou tél..."
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className="w-full sm:w-64 pl-12 pr-10 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all font-bold text-black"
            />
          </div>
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              if (editingId) {
                setEditingId(null);
                setNewPatient({ name: '', age: 0, phone: '', weight: '', allergies: '', pathologies: '', sex: 'F', type: 'Woman', consultationFee: 0 });
              }
            }}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-100 active:scale-95"
          >
            {isRegistering ? <X size={20} /> : <UserPlus size={20} />}
            {isRegistering ? 'Annuler' : 'Enregistrer Patient'}
          </button>
        </div>
      </div>

      {isRegistering && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-emerald-100 animate-in zoom-in-95 duration-200">
          <h3 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-3">
            {editingId ? <Edit2 size={24} className="text-blue-600" /> : <UserPlus size={24} className="text-emerald-600" />}
            {editingId ? 'Modifier les informations' : 'Nouvel Enregistrement'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Type Selection */}
            <div className="md:col-span-3 space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Catégorie du Patient</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'Adult', label: 'Adulte', icon: UserCircle, color: 'blue' },
                  { id: 'Woman', label: 'Femme', icon: Heart, color: 'pink' },
                  { id: 'Child', label: 'Enfant', icon: Baby, color: 'emerald' }
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nom Complet</label>
              <div className="relative">
                <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                <input
                  type="text"
                  placeholder="Ex: Ahmed Benani"
                  value={newPatient.name}
                  onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                  className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black text-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Numéro de Téléphone</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                <input
                  type="tel"
                  placeholder="06 XX XX XX XX"
                  value={newPatient.phone}
                  onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                  className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isChild ? 'text-emerald-600' : 'text-gray-400'}`}>
                Âge {isChild && '(Obligatoire)'}
              </label>
              <div className="relative">
                <Clock className={`absolute left-4 top-1/2 -translate-y-1/2 ${isChild ? 'text-emerald-400' : 'text-gray-300'}`} size={18} />
                <input
                  type="number"
                  placeholder="Âge"
                  value={newPatient.age || ''}
                  onChange={e => setNewPatient({ ...newPatient, age: parseInt(e.target.value) || 0 })}
                  className={`w-full pl-12 pr-5 py-4 border rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black ${isChild ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}
                />
              </div>
            </div>

            {isChild && (
              <div className="space-y-2 animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <Scale size={12} /> Poids (Enfant)
                </label>
                <div className="relative">
                  <Scale className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" size={18} />
                  <input
                    type="text"
                    placeholder="Ex: 12 kg"
                    value={newPatient.weight}
                    onChange={e => setNewPatient({ ...newPatient, weight: e.target.value })}
                    className="w-full pl-12 pr-5 py-4 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black"
                  />
                </div>
              </div>
            )}

            {!isChild && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Poids (Optionnel)</label>
                <div className="relative">
                  <Scale className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    type="text"
                    placeholder="Ex: 75 kg"
                    value={newPatient.weight}
                    onChange={e => setNewPatient({ ...newPatient, weight: e.target.value })}
                    className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pathologies</label>
              <div className="relative">
                <Activity className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                <input
                  type="text"
                  placeholder="Ex: Diabète, HTA..."
                  value={newPatient.pathologies}
                  onChange={e => setNewPatient({ ...newPatient, pathologies: e.target.value })}
                  className="w-full pl-12 pr-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Frais de Consultation ({doctor.currency})</label>
              <div className="relative">
                <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400" size={18} />
                <input
                  type="number"
                  placeholder="Ex: 200"
                  value={newPatient.consultationFee || ''}
                  onChange={e => setNewPatient({ ...newPatient, consultationFee: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-12 pr-5 py-4 bg-emerald-50 border border-emerald-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-black"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Allergies connues</label>
              <div className="relative">
                <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-red-300" size={18} />
                <input
                  type="text"
                  placeholder="Ex: Pénicilline..."
                  value={newPatient.allergies}
                  onChange={e => setNewPatient({ ...newPatient, allergies: e.target.value })}
                  className="w-full pl-12 pr-5 py-4 bg-red-50/30 border border-red-100 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-black"
                />
              </div>
            </div>

            <div className="lg:col-span-3 pt-4">
              <button
                onClick={handleRegister}
                className={`w-full py-5 text-white font-black rounded-2xl shadow-xl transition-all active:scale-[0.98] text-lg uppercase tracking-widest ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}
              >
                {editingId ? 'Confirmer les modifications' : "Valider l'entrée en Salle d'Attente"}
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
            <h3 className="text-xl font-bold text-gray-900">Patients du Jour</h3>
          </div>
          <span className="px-4 py-1.5 bg-gray-100 text-gray-500 rounded-full text-xs font-black uppercase tracking-widest">
            {filteredQueue.length} Patient{filteredQueue.length !== 1 ? 's' : ''} En attente
          </span>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="bg-white py-32 rounded-[3rem] border border-dashed border-gray-200 text-center">
            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users size={48} className="text-gray-200" />
            </div>
            <h4 className="text-xl font-bold text-gray-400">La salle d'attente est vide</h4>
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
                          {p.type === 'Child' ? 'Enfant' : p.type === 'Woman' ? 'Femme' : 'Adulte'}
                        </span>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{p.age} ans</p>
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
                    <Wallet size={16} className="text-emerald-500 shrink-0" />
                    <span className="text-gray-600 font-bold">Honoraires: {p.consultationFee} {doctor.currency}</span>
                  </div>
                  {p.weight && (
                    <div className="flex items-center gap-3 text-sm">
                      <Scale size={16} className="text-emerald-500 shrink-0" />
                      <span className="text-gray-600 font-bold">Poids: {p.weight}</span>
                    </div>
                  )}
                  {p.allergies && (
                    <div className="flex items-center gap-3 text-sm bg-red-50 p-2 rounded-xl">
                      <AlertCircle size={16} className="text-red-500 shrink-0" />
                      <span className="text-red-700 font-bold text-[10px] uppercase truncate">Allergies: {p.allergies}</span>
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
                    Consulter <ArrowRight size={14} />
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
