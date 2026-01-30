
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Printer, Search, AlertTriangle, ChevronRight, Heart,
  AlertOctagon, CheckCircle2, X, Barcode, Info, Pill,
  Scale, Phone, Baby, UserCircle, ShieldX, ShieldAlert as ShieldWarning,
  Zap, Clock, ChevronDown, FileText, History, Save, ShieldCheck, Loader2,
  ShieldAlert, Activity, AlertCircle
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { PrescriptionItem, Patient, Medicine, Prescription, MealTiming, PatientType } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface SafetyNotification {
  id: string;
  severity: 'CRITIQUE' | 'ATTENTION';
  title: string;
  message: string;
  type: 'INTERACTION' | 'CONTRE_INDICATION' | 'DOUBLON' | 'ENFANT_INTERDIT' | 'INCOMPATIBILITE';
  itemId?: string;
  canOverride?: boolean;
}

interface OverrideModal {
  isOpen: boolean;
  notificationId: string;
  reason: string;
}

interface PrescriptionEditorProps {
  initialPatient?: Patient | null;
  onFinish: () => void;
}

const PrescriptionEditor: React.FC<PrescriptionEditorProps> = ({ initialPatient, onFinish }) => {
  const [patient, setPatient] = useState<Partial<Patient>>({
    name: '', age: 0, sex: 'F', phone: '', weight: '', type: 'Woman', allergies: '', pathologies: ''
  });
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [amount, setAmount] = useState<number>(0);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Medicine[]>([]);
  const [patientSuggestions, setPatientSuggestions] = useState<Patient[]>([]);
  const [queueSuggestions, setQueueSuggestions] = useState<Patient[]>([]);
  const [aiWarnings, setAiWarnings] = useState<SafetyNotification[]>([]);
  const [isAiChecking, setIsAiChecking] = useState(false);
  const [overrideModal, setOverrideModal] = useState<OverrideModal>({ isOpen: false, notificationId: '', reason: '' });
  const [overriddenWarnings, setOverriddenWarnings] = useState<Set<string>>(new Set());

  const doctor = dataService.getDoctorInfo();
  const medicines = dataService.getMedicines();
  const medInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load queue for suggestions
    const queue = dataService.getTodayQueue();
    setQueueSuggestions(queue);

    if (initialPatient) {
      selectFromPatientData(initialPatient);
    }
    setTimeout(() => medInputRef.current?.focus(), 100);
  }, [initialPatient]);

  // Update warnings if age changes
  useEffect(() => {
    if (items.length > 0) {
      runSafetyChecks(items);
    }
  }, [patient.age]);

  const runSafetyChecks = (currentItems: PrescriptionItem[]) => {
    // 1. Run AI Check
    runAiSafetyCheck(currentItems);

    // 2. Run Local Real-time Checks (Age & Interaction)
    runLocalSafetyCheck(currentItems);
  };

  const runLocalSafetyCheck = (currentItems: PrescriptionItem[]) => {
    const newLocalWarnings: SafetyNotification[] = [];

    currentItems.forEach(item => {
      // Obtenir le médicament correspondant
      const medicine = medicines.find(m => m.name.toLowerCase() === item.medicineName.toLowerCase());

      // 1. VÉRIFICATION: ENFANT INTERDIT (Age < 15 + restriction.status === 'interdit')
      if (patient.age && patient.age < 15 && medicine?.restriction?.status === 'interdit') {
        const warningId = `enfant-${item.id}`;
        if (!overriddenWarnings.has(warningId)) {
          newLocalWarnings.push({
            id: warningId,
            severity: 'CRITIQUE',
            type: 'ENFANT_INTERDIT',
            title: '⚠️ INTERDIT POUR ENFANT',
            message: `${item.medicineName} est INTERDIT pour les enfants de moins de 15 ans. Patient: ${patient.age} ans. ${medicine?.restriction?.reason ? `Raison: ${medicine.restriction.reason}` : ''}`,
            itemId: item.id,
            canOverride: true
          });
        }
      }

      // 2. VÉRIFICATION: INCOMPATIBILITÉS DANGEREUSES entre médicaments
      currentItems.forEach(otherItem => {
        if (item.id === otherItem.id) return;

        const otherMedicine = medicines.find(m => m.name.toLowerCase() === otherItem.medicineName.toLowerCase());
        
        // Vérifier si le médicament actuel est dans la liste d'incompatibilité de l'autre
        if (medicine?.incompatibleWith || otherMedicine?.incompatibleWith) {
          const itemIncompatible = otherMedicine?.incompatibleWith?.some(incomp =>
            item.medicineName.toLowerCase().includes(incomp.toLowerCase()) ||
            incomp.toLowerCase().includes(item.medicineName.toLowerCase())
          );
          
          const otherIncompatible = medicine?.incompatibleWith?.some(incomp =>
            otherItem.medicineName.toLowerCase().includes(incomp.toLowerCase()) ||
            incomp.toLowerCase().includes(otherItem.medicineName.toLowerCase())
          );

          if (itemIncompatible || otherIncompatible) {
            const warningId = `incomp-${[item.id, otherItem.id].sort().join('-')}`;
            if (!newLocalWarnings.find(w => w.id === warningId) && !overriddenWarnings.has(warningId)) {
              newLocalWarnings.push({
                id: warningId,
                severity: 'CRITIQUE',
                type: 'INCOMPATIBILITE',
                title: '🚨 INCOMPATIBILITÉ DANGEREUSE',
                message: `${item.medicineName} et ${otherItem.medicineName} NE DOIVENT PAS ÊTRE MÉLANGÉS. Risque grave d'interaction dangereuse.`,
                canOverride: true
              });
            }
          }
        }
      });

      // 3. VÉRIFICATION: Age Alert (< 15 ans + dosage 1g ou Fort)
      if (patient.age && patient.age < 15) {
        const nameLower = item.medicineName.toLowerCase();
        if (nameLower.includes('1g') || nameLower.includes('fort')) {
          newLocalWarnings.push({
            id: `local-age-${item.id}`,
            severity: 'ATTENTION',
            type: 'CONTRE_INDICATION',
            title: 'Attention Âge',
            message: `Le patient a moins de 15 ans (${patient.age} ans), mais reçoit ${item.medicineName}. Vérifiez la posologie.`,
            itemId: item.id
          });
        }
      }

      // 4. VÉRIFICATION: Interaction Group classique
      currentItems.forEach(otherItem => {
        if (item.id === otherItem.id) return;

        const interactionGroups = (otherItem.interactionGroup || '').toLowerCase().split(',').map(s => s.trim());
        const myNameParts = item.medicineName.toLowerCase().split(' ');

        const hasConflict = interactionGroups.some(group =>
          group && (
            item.medicineName.toLowerCase().includes(group) ||
            group.includes(item.medicineName.toLowerCase()) ||
            myNameParts.includes(group)
          )
        );

        if (hasConflict) {
          const warningId = `local-int-${[item.id, otherItem.id].sort().join('-')}`;
          if (!newLocalWarnings.find(w => w.id === warningId)) {
            newLocalWarnings.push({
              id: warningId,
              severity: 'CRITIQUE',
              type: 'INTERACTION',
              title: 'Interaction Risquée',
              message: `Risque d'interaction détecté entre ${item.medicineName} et ${otherItem.medicineName}.`,
              canOverride: true
            });
          }
        }
      });
    });

    setAiWarnings(prev => {
      const aiOnly = prev.filter(w => !w.id.startsWith('local-') && !w.id.startsWith('enfant-') && !w.id.startsWith('incomp-'));
      return [...aiOnly, ...newLocalWarnings];
    });
  };

  // Fonction de vérification par IA (Sécurité Maximale)
  const runAiSafetyCheck = async (currentItems: PrescriptionItem[]) => {
    if (currentItems.length === 0) {
      setAiWarnings([]);
      return;
    }

    setIsAiChecking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const medList = currentItems.map(i => `${i.medicineName} (${i.interactionGroup || 'pas de groupe'})`).join(', ');

      const prompt = `En tant qu'assistant expert en pharmacologie clinique et sécurité patient, analyse cette prescription :
      
      PROFIL PATIENT :
      - Type : ${patient.type} (Adult, Woman, Child)
      - Âge : ${patient.age} ans
      - Sexe : ${patient.sex}
      - Poids : ${patient.weight || 'Non spécifié'}
      - ALLERGIES : ${patient.allergies || 'Aucune connue déclarée'}
      - PATHOLOGIES/ANTÉCÉDENTS : ${patient.pathologies || 'Aucun connu'}
      
      LISTE MÉDICAMENTEUSE :
      ${medList}
      
      MISSIONS CRITIQUES :
      1. CONTRE-INDICATIONS (CI) : Identifie si un médicament est formellement déconseillé ou interdit au vu des pathologies (ex: AINS et asthme/insuffisance rénale) ou allergies du patient.
      2. INTERACTIONS (DDI) : Identifie les interactions médicamenteuses dangereuses.
      3. DOUBLONS : Détecte les redondances thérapeutiques (même classe ou même molécule).
      4. GROSSESSE : Si 'Woman', vérifie la tératogénicité.

      Format de réponse attendu : Tableau JSON d'objets { severity: 'CRITIQUE' | 'ATTENTION', title: string, message: string, type: 'INTERACTION' | 'CONTRE_INDICATION' | 'DOUBLON' }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                severity: { type: Type.STRING, enum: ['CRITIQUE', 'ATTENTION'] },
                title: { type: Type.STRING },
                message: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['INTERACTION', 'CONTRE_INDICATION', 'DOUBLON'] }
              },
              required: ['severity', 'title', 'message', 'type']
            }
          }
        }
      });

      const results = JSON.parse(response.text);

      // Combiner avec les alertes locales de groupe d'interaction
      // Fix: Use optional chaining to prevent startsWith error if ID is missing or object is undefined
      const localWarnings = aiWarnings.filter(w => w?.id?.startsWith('local-'));
      setAiWarnings([...localWarnings, ...results.map((r: any) => ({ ...r, id: `ai-${Math.random()}` }))]);
    } catch (error) {
      console.error("Erreur Safety Check:", error);
    } finally {
      setIsAiChecking(false);
    }
  };

  const selectFromPatientData = (p: Patient) => {
    setSelectedPatientId(p.id);
    setPatient({
      name: p.name,
      age: p.age,
      sex: p.sex,
      phone: p.phone,
      weight: p.weight,
      type: p.type,
      allergies: p.allergies || '',
      pathologies: (p.pathologies || '') + (p.chronicDiseases ? ' ' + p.chronicDiseases.join(', ') : ''),
      consultationFee: p.consultationFee
    });
    setAmount(p.consultationFee || 0);
    setPatientSuggestions([]);
    medInputRef.current?.focus();
  };

  const addItem = (medicine: Medicine) => {
    if (items.find(i => i.medicineName.toLowerCase() === medicine.name.toLowerCase())) {
      alert("Ce médicament est déjà prescrit.");
      return;
    }

    const newItem: PrescriptionItem = {
      id: Math.random().toString(36).substr(2, 9),
      medicineName: medicine.name,
      dosage: medicine.defaultDosage || '',
      timing: medicine.defaultTiming || 'Indifférent',
      interactionGroup: medicine.interactionGroup || ''
    };

    const newItems = [...items, newItem];
    setItems(newItems);
    setMedicineSearch('');
    setSuggestions([]);

    runSafetyChecks(newItems);
  };

  const removeItem = (id: string) => {
    const newItems = items.filter(i => i.id !== id);
    setItems(newItems);
    runSafetyChecks(newItems);
  };

  const handleOverrideWarning = (notificationId: string, reason: string) => {
    setOverriddenWarnings(prev => new Set([...prev, notificationId]));
    
    // Enregistrer l'action de dépassement dans les items si applicable
    const notification = aiWarnings.find(w => w.id === notificationId);
    if (notification?.itemId) {
      setItems(items.map(item =>
        item.id === notification.itemId
          ? { ...item, overriddenByDoctor: true, overrideReason: reason }
          : item
      ));
    }

    setAiWarnings(prev => prev.filter(w => w.id !== notificationId));
    setOverrideModal({ isOpen: false, notificationId: '', reason: '' });

    // Log l'action pour audit
    console.log(`[AUDIT] Médecin a ignoré l'alerte ${notificationId} avec raison: ${reason}`);
  };

  const handleMedSearch = (val: string) => {
    setMedicineSearch(val);
    const query = val.trim().toLowerCase();
    if (query.length >= 2) {
      const filtered = medicines.filter(m => m.name.toLowerCase().includes(query)).slice(0, 8);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  const handleSave = () => {
    if (!patient.name || items.length === 0) return alert("Complétez l'ordonnance.");
    const newPrescription: Prescription = {
      id: Date.now().toString(),
      patientId: patient.name as string,
      date: new Date().toISOString().split('T')[0],
      items,
      amount,
      patientType: patient.type as PatientType,
      patientAge: patient.age,
      patientWeight: patient.weight
    };
    dataService.savePrescription(newPrescription);
    if (selectedPatientId) dataService.deleteFromQueue(selectedPatientId);
    onFinish();
  };

  const renderPrescriptionPage = (isPreview: boolean = false) => {
    return (
      <div className={`bg-white rounded-lg relative overflow-hidden flex flex-col h-full print:m-0 print:shadow-none mb-6 ${isPreview ? 'shadow-2xl aspect-[1/1.41] w-full lg:w-[500px] shrink-0 lg:sticky lg:top-8 h-fit' : 'print-page w-full h-[297mm]'}`}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          {doctor.logoUrl && <img src={doctor.logoUrl} className="w-2/3 object-contain" style={{ opacity: doctor.logoOpacity }} alt="Watermark" />}
        </div>
        <div className="relative z-10 flex flex-col h-full px-10 pt-8 pb-16 text-black">
          <div className="flex mb-6 items-start justify-between">
            <div className="text-[9px] leading-tight space-y-0.5 text-black uppercase w-1/3">
              <p className="font-black text-[11px] tracking-tight">{doctor.nameFr}</p>
              <p className="font-bold border-l-2 border-emerald-600 pl-1.5">{doctor.specialtyFr}</p>
              <div className="text-black/80 mt-1.5 whitespace-pre-line leading-[1.2] text-[8px]">{doctor.diplomasFr}</div>
            </div>
            <div className="flex justify-center w-1/3">
              {doctor.logoUrl && <img src={doctor.logoUrl} className="object-contain" style={{ width: `${doctor.logoScale * 0.8}px` }} alt="Logo" />}
            </div>
            <div className="text-[9px] leading-tight space-y-0.5 text-right font-arabic text-black w-1/3" dir="rtl">
              <p className="font-black text-[14px]">{doctor.nameAr}</p>
              <p className="font-bold border-r-2 border-emerald-600 pr-1.5">{doctor.specialtyAr}</p>
              <div className="text-black/80 mt-1.5 whitespace-pre-line leading-[1.3] text-[10px]">{doctor.diplomasAr}</div>
            </div>
          </div>
          <div className="text-right text-[11px] font-bold text-black mb-6">Agadir le : {new Date().toLocaleDateString('fr-FR')}</div>
          <div className="mb-8 text-center py-1">
            <p className="text-[14px] font-black text-black border-b-2 border-black inline-block px-8 uppercase">
              {patient.type === 'Woman' ? 'Mme / Mlle' : patient.type === 'Child' ? 'Enfant' : 'Mr'} {patient.name}
              {patient.age ? ` (${patient.age} ans)` : ''} {patient.weight ? ` (${patient.weight})` : ''}
            </p>
          </div>
          <div className="flex-1 px-4 mt-2 overflow-hidden">
            <div className="space-y-5">
              {items.map((item, i) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <span className="font-black text-[14px] text-black shrink-0 mt-0.5">{i + 1}/</span>
                  <div className="flex-1">
                    <p className="font-black text-[14px] uppercase text-black mb-0.5 leading-none">{item.medicineName}</p>
                    <p className="text-[12px] text-black font-bold pl-2 italic leading-tight">{item.dosage}</p>
                    {item.timing !== 'Indifférent' && <span className="text-[9px] font-black text-black bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-sm w-fit mt-1 uppercase">{item.timing}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-auto flex justify-end"><div className="w-40 h-24 border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center text-[9px] text-gray-200 font-bold uppercase text-center px-4">Signature & Cachet</div></div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white font-arabic text-center flex flex-col justify-center gap-0.5 z-20" style={{ backgroundColor: doctor.footerColor }}>
          <div className="text-[10px] font-bold">{doctor.addressAr}</div>
          <div className="text-[8px] font-medium opacity-90 uppercase tracking-tighter font-sans">{doctor.addressFr}</div>
          <div className="text-[10px] font-black mt-0.5 flex justify-center gap-6 font-sans"><span>Tél. : {doctor.phone}</span></div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-8 animate-in zoom-in-95 duration-300 pb-20 px-4 text-black">

      {/* MODAL OVERRIDE */}
      {overrideModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-in slide-in-from-bottom-4">
            <h3 className="text-lg font-black uppercase text-red-600 mb-4 flex items-center gap-2">
              <ShieldX size={20} /> Dépassement de Restriction
            </h3>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Vous êtes sur le point de dépasser une restriction de sécurité. Cette action sera enregistrée aux fins d'audit et reste de votre entière responsabilité médicale.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-600 uppercase mb-2">Raison du dépassement</label>
                <textarea
                  value={overrideModal.reason}
                  onChange={e => setOverrideModal({ ...overrideModal, reason: e.target.value })}
                  placeholder="Expliquez votre décision clinique..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-red-500 resize-none h-24"
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl">
                <p className="text-xs font-bold text-yellow-700 text-center uppercase">
                  ⚠️ Cette action est enregistrée et auditée
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setOverrideModal({ isOpen: false, notificationId: '', reason: '' })}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-xl uppercase text-xs transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleOverrideWarning(overrideModal.notificationId, overrideModal.reason)}
                  disabled={!overrideModal.reason.trim()}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-black rounded-xl uppercase text-xs transition-all"
                >
                  Continuer (Responsabilité du Médecin)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI & LOCAL SAFETY SIDEBAR - Hidden for professional appearance */}
      {/* <div className="w-full lg:w-80 shrink-0 space-y-4 print:hidden">
        <div className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck size={16} /> Sécurité Prescription
            </h3>
            {isAiChecking && <Loader2 className="animate-spin text-emerald-500" size={14} />}
          </div>

          {aiWarnings.length === 0 && !isAiChecking && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">Prescription Sûre</p>
            </div>
          )}

          <div className="space-y-3">
            {aiWarnings.map((notif) => {
              // Styles spécifiques par type
              const isEnfantInterdit = notif.type === 'ENFANT_INTERDIT';
              const isIncompatibilite = notif.type === 'INCOMPATIBILITE';
              
              let bgColor = notif.severity === 'CRITIQUE' ? 'bg-red-50 border-red-200 text-red-700' :
                notif.type === 'CONTRE_INDICATION' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                  'bg-amber-50 border-amber-200 text-amber-700';

              if (isEnfantInterdit) {
                bgColor = 'bg-red-50 border-red-300 text-red-700';
              }
              if (isIncompatibilite) {
                bgColor = 'bg-red-50 border-red-300 text-red-700';
              }

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-2xl border animate-in slide-in-from-left-2 shadow-sm ${bgColor} ${
                    isEnfantInterdit || isIncompatibilite ? 'animate-pulse' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isEnfantInterdit || isIncompatibilite ? (
                      <AlertOctagon size={14} className="animate-pulse text-red-600" />
                    ) : notif.severity === 'CRITIQUE' ? (
                      <AlertOctagon size={14} className="animate-pulse" />
                    ) : (
                      <AlertTriangle size={14} />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-tighter">
                      {notif.type === 'CONTRE_INDICATION' ? 'Contre-indication' : notif.title}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold leading-tight">{notif.message}</p>

                  <div className="flex gap-2 mt-3">
                    {notif.canOverride ? (
                      <>
                        <button
                          onClick={() => setOverrideModal({ isOpen: true, notificationId: notif.id, reason: '' })}
                          className="flex-1 text-[9px] font-black uppercase text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg transition-all"
                        >
                          Dépasser (Médecin)
                        </button>
                        <button
                          onClick={() => setAiWarnings(prev => prev.filter(w => w.id !== notif.id))}
                          className="text-[9px] font-bold uppercase text-gray-400 hover:text-gray-600 px-2"
                        >
                          ✕ Masquer
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setAiWarnings(prev => prev.filter(w => w.id !== notif.id))}
                        className="w-full text-[9px] font-bold uppercase text-gray-400 hover:text-gray-600"
                      >
                        Masquer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-indigo-900 text-white p-6 rounded-[2rem] shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} className="text-indigo-300" />
            <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Aide IA</p>
          </div>
          <p className="text-xs font-medium leading-relaxed italic opacity-90">
            "Je surveille les interactions, les allergies et les contre-indications au vu du dossier patient."
          </p>
        </div>
      </div> */}

      <div className="flex-1 space-y-6 print:hidden">
        {/* PATIENT FORM */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 relative">
          <div className="flex gap-2">
            {['Adult', 'Woman', 'Child'].map(t => (
              <button key={t} onClick={() => { setPatient({ ...patient, type: t as PatientType }); setAiWarnings([]); if (items.length > 0) runAiSafetyCheck(items); }} className={`flex-1 py-3 rounded-xl border font-black uppercase text-[10px] tracking-widest transition-all ${patient.type === t ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-lg' : 'bg-white border-gray-100 text-gray-400'}`}>
                {t === 'Adult' ? 'Homme' : t === 'Woman' ? 'Femme' : 'Enfant'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-2 relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nom du Patient</label>
              <input
                type="text"
                value={patient.name}
                onFocus={() => {
                  if (!patient.name) setPatientSuggestions(queueSuggestions);
                }}
                onChange={e => {
                  setPatient({ ...patient, name: e.target.value });
                  if (e.target.value.length > 0) {
                    setPatientSuggestions(dataService.searchPatients(e.target.value));
                  } else {
                    setPatientSuggestions(queueSuggestions);
                  }
                }}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Nom..."
              />
              {patientSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                  <div className="px-4 py-2 bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-50 flex justify-between">
                    <span>Suggestions ({patientSuggestions.length})</span>
                    {!patient.name && <span className="text-emerald-600">File d'attente</span>}
                  </div>
                  {patientSuggestions.map(p => (
                    <button key={p.id} onClick={() => selectFromPatientData(p)} className="w-full text-left px-5 py-3 hover:bg-emerald-50 border-t border-gray-50 flex justify-between items-center group">
                      <div>
                        <p className="font-black text-gray-900 uppercase text-xs">{p.name}</p>
                        {/* Show tag if from today's queue */}
                        {queueSuggestions.some(q => q.id === p.id) && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-1">Salle d'Attente</span>}
                      </div>
                      <ChevronRight size={16} className="text-gray-200" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Âge</label><input type="number" value={patient.age || ''} onChange={e => setPatient({ ...patient, age: parseInt(e.target.value) || 0 })} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-lg outline-none" /></div>
            <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Poids</label><input type="text" value={patient.weight || ''} onChange={e => setPatient({ ...patient, weight: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-lg outline-none" placeholder="Ex: 75kg" /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-red-50/20 border border-red-100 rounded-[2rem]">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1"><AlertCircle size={10} /> Allergies</label>
              <input type="text" value={patient.allergies} onChange={e => setPatient({ ...patient, allergies: e.target.value })} placeholder="Pénicilline, etc..." className="w-full px-4 py-3 bg-white border border-red-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1"><Activity size={10} /> Antécédents / CI</label>
              <input type="text" value={patient.pathologies} onChange={e => setPatient({ ...patient, pathologies: e.target.value })} placeholder="Asthme, Diabète, etc..." className="w-full px-4 py-3 bg-white border border-indigo-100 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* MEDICINE SEARCH */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 min-h-[400px]">
          <div className="relative mb-8">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-emerald-400" size={24} />
            <input ref={medInputRef} type="text" value={medicineSearch} onChange={e => handleMedSearch(e.target.value)} placeholder="Chercher médicament..." className="w-full pl-14 pr-6 py-5 bg-gray-50 border border-emerald-100 rounded-2xl font-black text-xl outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner" />
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-3xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2">
                {suggestions.map((m, idx) => <button key={m.id} onClick={() => addItem(m)} className={`w-full text-left px-8 py-5 border-b border-gray-50 flex justify-between items-center transition-all group ${idx === 0 ? 'bg-emerald-50/30' : 'hover:bg-emerald-50'}`}><div className="flex items-center gap-4"><div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm"><Pill size={20} /></div><div><span className="font-black text-gray-900 uppercase text-lg group-hover:text-emerald-700">{m.name}</span></div></div><ChevronRight size={20} className="text-gray-200" /></button>)}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 animate-in slide-in-from-left-2 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <p className="font-black uppercase tracking-tight text-lg">{index + 1}/ {item.medicineName}</p>
                    {/* Interaction Group hidden per user preference */}
                  </div>
                  <button onClick={() => removeItem(item.id)} className="p-2.5 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Zap size={10} /> Posologie</p>
                    <input type="text" value={item.dosage} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, dosage: e.target.value } : i))} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Moment</p>
                    <select value={item.timing} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, timing: e.target.value as MealTiming } : i))} className="w-full px-5 py-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm">
                      {['Indifférent', 'Avant repas', 'Pendant repas', 'Après repas'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {/* Interaction Group input removed to avoid showing group to the user */}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4"><span className="text-xs font-black text-gray-400 uppercase tracking-widest">Honoraires:</span><input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} className="w-32 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl font-black text-xl text-center outline-none focus:ring-2 focus:ring-emerald-500 transition-all" /><span className="font-black text-emerald-300">DH</span></div>
          <div className="flex gap-3 w-full md:w-auto"><button onClick={() => window.print()} disabled={items.length === 0} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl uppercase text-xs tracking-widest transition-all shadow-lg active:scale-95"><Printer size={18} /> Imprimer</button><button onClick={handleSave} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-12 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl uppercase text-sm tracking-widest active:scale-95 transition-all shadow-emerald-100"><Save size={18} /> Enregistrer</button></div>
        </div>
      </div>

      {/* PREVIEW SIDEBAR */}
      <div className="w-full max-w-[500px] mx-auto print:hidden">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 px-2 flex items-center gap-2"><FileText size={16} /> Aperçu de l'ordonnance</h3>
        {renderPrescriptionPage(true)}
      </div>

      <div className="hidden print:block fixed inset-0 z-0 bg-white">{renderPrescriptionPage(false)}</div>
    </div>
  );
};

export default PrescriptionEditor;
