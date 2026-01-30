
import React, { useState, useMemo, useEffect } from 'react';
import { Search, Calendar, FileText, Printer, ChevronRight, User, Wallet, Activity, ArrowRight, Heart, Filter, Trash2, ShieldCheck, Plus, X, AlertCircle, Phone, History, Edit2, Check } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Prescription, Patient } from '../types';
import PrescriptionView from './PrescriptionView';

const PatientDossier: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientName, setSelectedPatientName] = useState<string | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState< Prescription | null>(null);
  
  // Patient profile and chronic diseases management
  const [patientProfile, setPatientProfile] = useState<Patient | null>(null);
  const [newChronicDisease, setNewChronicDisease] = useState('');
  const [editingDiseaseIndex, setEditingDiseaseIndex] = useState<number | null>(null);
  const [editingDiseaseValue, setEditingDiseaseValue] = useState('');

  const doctor = dataService.getDoctorInfo();
  const allPrescriptions = dataService.getPrescriptions();

  const patientGroups = useMemo(() => {
    const groups: Record<string, Prescription[]> = {};
    allPrescriptions.forEach(p => {
      const name = p.patientId.toUpperCase();
      if (!groups[name]) groups[name] = [];
      groups[name].push(p);
    });
    Object.keys(groups).forEach(name => {
      groups[name].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    return groups;
  }, [allPrescriptions]);

  const patientMetadata = useMemo(() => {
    return Object.keys(patientGroups).map(name => {
      const profile = dataService.getPatientProfile(name);
      return {
        name: name,
        phone: profile?.phone || '',
        hasChronic: (profile?.chronicDiseases?.length || 0) > 0,
        prescriptionsCount: patientGroups[name].length
      };
    });
  }, [patientGroups]);

  const filteredPatients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return patientMetadata.sort((a, b) => a.name.localeCompare(b.name));

    return patientMetadata
      .filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.phone.includes(term)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [patientMetadata, searchTerm]);

  useEffect(() => {
    if (selectedPatientName) {
      const profile = dataService.getPatientProfile(selectedPatientName);
      if (profile) {
        setPatientProfile(profile);
      } else {
        const lastPrescription = patientGroups[selectedPatientName][0];
        const newProfile: Patient = {
          id: Date.now().toString(),
          name: selectedPatientName,
          age: lastPrescription.patientAge || 0,
          sex: lastPrescription.patientType === 'Woman' ? 'F' : 'M',
          type: lastPrescription.patientType,
          chronicDiseases: []
        };
        setPatientProfile(newProfile);
      }
    }
  }, [selectedPatientName, patientGroups]);

  const selectPatient = (name: string) => {
    setSelectedPatientName(name);
    setSelectedPrescription(patientGroups[name][0]);
    setNewChronicDisease('');
    setEditingDiseaseIndex(null);
  };

  const addChronicDisease = () => {
    if (!newChronicDisease.trim() || !patientProfile) return;
    const updatedDiseases = [...(patientProfile.chronicDiseases || []), newChronicDisease.trim()];
    const updatedProfile = { ...patientProfile, chronicDiseases: updatedDiseases };
    setPatientProfile(updatedProfile);
    dataService.savePatientProfile(updatedProfile);
    setNewChronicDisease('');
  };

  const removeChronicDisease = (index: number) => {
    if (!patientProfile) return;
    const updatedDiseases = (patientProfile.chronicDiseases || []).filter((_, i) => i !== index);
    const updatedProfile = { ...patientProfile, chronicDiseases: updatedDiseases };
    setPatientProfile(updatedProfile);
    dataService.savePatientProfile(updatedProfile);
    if (editingDiseaseIndex === index) setEditingDiseaseIndex(null);
  };

  const startEditingDisease = (index: number, value: string) => {
    setEditingDiseaseIndex(index);
    setEditingDiseaseValue(value);
  };

  const saveEditedDisease = () => {
    if (editingDiseaseIndex === null || !patientProfile || !editingDiseaseValue.trim()) return;
    const updatedDiseases = [...(patientProfile.chronicDiseases || [])];
    updatedDiseases[editingDiseaseIndex] = editingDiseaseValue.trim();
    const updatedProfile = { ...patientProfile, chronicDiseases: updatedDiseases };
    setPatientProfile(updatedProfile);
    dataService.savePatientProfile(updatedProfile);
    setEditingDiseaseIndex(null);
  };

  return (
    <div className="flex h-full gap-8 animate-in fade-in duration-500 overflow-hidden text-black">
      {/* Sidebar: Liste des Patients */}
      <div className="w-80 shrink-0 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col overflow-hidden print:hidden">
        <div className="p-6 border-b border-gray-50 space-y-4 bg-gray-50/50">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <Filter size={14} /> Dossiers Patients
            </h3>
            <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredPatients.length}
            </span>
          </div>
          <div className="relative group">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searchTerm ? 'text-emerald-500' : 'text-gray-400'}`} size={16} />
            <input 
              type="text" 
              placeholder="Nom ou téléphone..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all text-black placeholder-gray-300" 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-emerald-600 transition-all"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-hide">
          {filteredPatients.length > 0 ? (
            filteredPatients.map((p) => (
              <button 
                key={p.name} 
                onClick={() => selectPatient(p.name)} 
                className={`w-full p-5 text-left transition-all group relative border-l-4 ${
                  selectedPatientName === p.name 
                    ? 'bg-emerald-50 border-emerald-500' 
                    : 'bg-white border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="overflow-hidden flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <p className={`font-black uppercase truncate text-sm transition-colors ${selectedPatientName === p.name ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {p.name}
                      </p>
                      {p.hasChronic && (
                        <AlertCircle size={12} className="text-red-500 shrink-0" />
                      )}
                    </div>
                    {p.phone && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone size={10} className="text-gray-300" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          {p.phone}
                        </p>
                      </div>
                    )}
                    <p className="text-[9px] font-black text-emerald-600/60 uppercase tracking-widest mt-1">
                      {p.prescriptionsCount} Ordonnance{p.prescriptionsCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 mt-1 transition-all ${selectedPatientName === p.name ? 'text-emerald-500 translate-x-1' : 'text-gray-200 group-hover:text-gray-400'}`} />
                </div>
              </button>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <Search size={24} className="text-gray-200" />
              </div>
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Aucun résultat</h4>
              <p className="text-[10px] text-gray-300 font-bold mt-1 max-w-[150px] mx-auto leading-relaxed">Nous n'avons trouvé aucun patient correspondant à "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto pb-20 pr-4 scrollbar-hide">
        {!selectedPatientName ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100 p-20 text-center">
            <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center mb-6">
              <User size={48} className="text-gray-200" />
            </div>
            <h3 className="text-xl font-black text-gray-300 uppercase tracking-[0.2em]">Sélectionnez un dossier</h3>
            <p className="text-gray-400 text-sm mt-2 font-medium">Consultez l'historique médical complet de vos patients</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 items-start">
            
            {/* Profil Column */}
            <div className="xl:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                 <div className="flex items-center gap-4 mb-8">
                   <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                     <User size={32} />
                   </div>
                   <div>
                     <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{selectedPatientName}</h2>
                     <div className="flex items-center gap-3">
                       <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Dossier #P-{selectedPatientName.slice(0,3)}</span>
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                       <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">Actif</span>
                     </div>
                   </div>
                 </div>

                 {/* Maladies Chroniques */}
                 <div className="mb-8 p-6 bg-red-50/50 rounded-3xl border border-red-100">
                    <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <AlertCircle size={14} /> Maladies Chroniques & Antécédents
                    </h3>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      {patientProfile?.chronicDiseases?.length === 0 && (
                        <p className="text-xs text-gray-400 italic font-medium">Aucun antécédent enregistré</p>
                      )}
                      {patientProfile?.chronicDiseases?.map((disease, idx) => (
                        <div key={`${disease}-${idx}`} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-700 rounded-xl text-xs font-bold shadow-sm group transition-all hover:border-red-400">
                          {editingDiseaseIndex === idx ? (
                            <input 
                              autoFocus
                              className="bg-transparent border-none outline-none text-red-700 min-w-[80px]"
                              value={editingDiseaseValue}
                              onChange={e => setEditingDiseaseValue(e.target.value)}
                              onBlur={saveEditedDisease}
                              onKeyPress={e => e.key === 'Enter' && saveEditedDisease()}
                            />
                          ) : (
                            <span>{disease}</span>
                          )}
                          
                          <div className="flex items-center gap-1">
                            {editingDiseaseIndex === idx ? (
                              <button onClick={saveEditedDisease} className="text-emerald-600">
                                <Check size={14} />
                              </button>
                            ) : (
                              <>
                                <button onClick={() => startEditingDisease(idx, disease)} className="opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-all">
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => removeChronicDisease(idx)} className="opacity-0 group-hover:opacity-100 hover:text-red-900 transition-all">
                                  <X size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Ajouter une maladie..." 
                        value={newChronicDisease}
                        onChange={e => setNewChronicDisease(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addChronicDisease()}
                        className="flex-1 px-4 py-2.5 bg-white border border-red-100 rounded-xl text-xs font-bold outline-none focus:border-red-400 text-black placeholder-gray-300 shadow-inner"
                      />
                      <button 
                        onClick={addChronicDisease}
                        className="p-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-md active:scale-95"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Dernière Visite</p>
                      <p className="font-bold text-gray-900">{patientGroups[selectedPatientName][0].date}</p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                      <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Total Honoraires</p>
                      <p className="font-black text-emerald-700 text-xl">
                        {patientGroups[selectedPatientName].reduce((sum, p) => sum + p.amount, 0)} {doctor.currency}
                      </p>
                    </div>
                 </div>

                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                   <History size={14} className="text-emerald-500" /> Historique des consultations
                 </h3>

                 <div className="space-y-4">
                    {patientGroups[selectedPatientName].map((p) => (
                      <button 
                        key={p.id} 
                        onClick={() => setSelectedPrescription(p)}
                        className={`w-full p-5 rounded-[2rem] border transition-all flex flex-col gap-3 group relative overflow-hidden ${selectedPrescription?.id === p.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-xl scale-[1.02] z-10' : 'bg-white border-gray-100 hover:border-emerald-200 shadow-sm'}`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${selectedPrescription?.id === p.id ? 'bg-white text-emerald-600' : 'bg-emerald-50 text-emerald-600 shadow-inner'}`}>
                              <Calendar size={18} />
                            </div>
                            <div className="text-left">
                               <p className="font-black uppercase text-xs tracking-tight">
                                 {new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                               </p>
                               <p className={`text-[9px] font-bold uppercase tracking-widest ${selectedPrescription?.id === p.id ? 'text-emerald-100' : 'text-gray-400'}`}>Consultation #{p.id.slice(-4)}</p>
                            </div>
                          </div>
                          <ArrowRight size={18} className={selectedPrescription?.id === p.id ? 'text-white' : 'text-gray-200 group-hover:text-emerald-500'} />
                        </div>
                        <div className={`text-left p-3 rounded-2xl border ${selectedPrescription?.id === p.id ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1 ${selectedPrescription?.id === p.id ? 'text-emerald-100' : 'text-gray-400'}`}>
                             <Activity size={10} /> Aperçu de l'ordonnance
                          </p>
                          <p className={`text-xs font-bold leading-relaxed line-clamp-2 ${selectedPrescription?.id === p.id ? 'text-white' : 'text-gray-700'}`}>
                            {p.items.map(i => i.medicineName).join(', ')}
                          </p>
                        </div>
                        <div className="flex justify-between items-center w-full px-1">
                           <span className={`text-[10px] font-black uppercase tracking-widest ${selectedPrescription?.id === p.id ? 'text-white' : 'text-emerald-600'}`}>
                              Honoraire: {p.amount} {doctor.currency}
                           </span>
                           <span className={`text-[9px] font-bold ${selectedPrescription?.id === p.id ? 'text-emerald-100' : 'text-gray-400'}`}>
                              {p.items.length} médicament{p.items.length > 1 ? 's' : ''}
                           </span>
                        </div>
                      </button>
                    ))}
                 </div>
              </div>
            </div>

            {/* Preview Column */}
            <div className="xl:col-span-3 space-y-6">
              {selectedPrescription && (
                <div className="animate-in slide-in-from-right-4 duration-500">
                  <div className="flex justify-between items-center mb-4 px-4">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                          <FileText className="text-emerald-600" size={20} />
                        </div>
                        <span className="font-black text-gray-900 uppercase tracking-widest text-sm">Consultation du {selectedPrescription.date}</span>
                     </div>
                     <div className="flex gap-2">
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-gray-900 transition-all active:scale-95">
                          <Printer size={16} /> Imprimer l'original
                        </button>
                     </div>
                  </div>
                  <div className="w-full">
                    <PrescriptionView 
                      prescription={selectedPrescription} 
                      doctor={doctor} 
                      isPreview={true} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="hidden print:block fixed inset-0 z-[9999] bg-white">
        {selectedPrescription && (
          <PrescriptionView 
            prescription={selectedPrescription} 
            doctor={doctor} 
            isPreview={false} 
          />
        )}
      </div>
    </div>
  );
};

export default PatientDossier;
