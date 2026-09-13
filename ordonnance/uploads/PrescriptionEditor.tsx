import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Plus, Trash2, Printer, Save, Pill, Clock, ChevronRight, Sparkles,
  Search, Scan, FileText, CheckCircle, AlertTriangle, ShieldAlert, History,
  RefreshCcw, FileDigit, X as CloseX, ArrowLeft, Loader2, Info,
  Heart, AlertOctagon, CheckCircle2, Barcode, Scale, Phone, Baby, UserCircle,
  ShieldAlert as ShieldWarning, ChevronDown, MapPin, Mail, Eye, EyeOff,
  ShieldX, AlertCircle, Activity, Zap, BrainCircuit, FlaskConical
} from 'lucide-react';
import { Medicine, PrescriptionItem, MedicineCategory, MealTiming, Patient, Prescription, PatientType, PrescriptionDraft } from '../types';
import { dataService } from '../services/dataService';
import { searchDrugsGlobal, mapMedicamentToMedicine } from '../services/drugCatalogService';
import { drugRulesService, DrugAlert } from '../services/drugRules';
import { settingsService } from '../services/settingsService';
import { useI18n } from '../i18n';
import ExactPrescriptionTemplate from './ExactPrescriptionTemplate';
import CombinedConsultationTemplate from './CombinedConsultationTemplate';
import { COMMON_ANALYSES } from '../constants/medicalData';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import * as prescriptionAiService from '../services/prescriptionAiService';
import { toastService } from '../services/toastService';

interface SafetyNotification {
  id: string;
  severity: 'CRITIQUE' | 'ATTENTION';
  title: string;
  message: string;
  type: 'INTERACTION' | 'CONTRE_INDICATION' | 'DOUBLON' | 'ENFANT_INTERDIT' | 'REGLE_SYSTEME';
  canOverride?: boolean;
  itemId?: string;
}

interface PrescriptionEditorProps {
  onFinish: () => void;
  selectedPatientFromQueue?: { id: string; patientName: string; phone: string };
  initialPatient?: Patient | null;
  initialPrescription?: Prescription | null;
  draft?: PrescriptionDraft | null;
  onDraftChange?: (draft: PrescriptionDraft | null) => void;
}

const PrescriptionEditor: React.FC<PrescriptionEditorProps> = ({ onFinish, selectedPatientFromQueue, initialPatient, initialPrescription, draft, onDraftChange }) => {
  const { t, lang, dir } = useI18n();
  const [patient, setPatient] = useState<Partial<Patient>>(draft?.patient || {
    name: initialPatient?.name || '',
    age: initialPatient?.age || 0,
    sex: initialPatient?.sex || 'M',
    type: initialPatient?.type || 'Adult',
    weight: initialPatient?.weight || '',
    allergies: initialPatient?.allergies || '',
    pathologies: initialPatient?.pathologies || '',
    consultationFee: initialPatient?.consultationFee || 0,
    isPregnant: initialPatient?.isPregnant || false,
    isBreastfeeding: initialPatient?.isBreastfeeding || false,
    isHeartPatient: initialPatient?.isHeartPatient || false,
    isKidneyPatient: initialPatient?.isKidneyPatient || false,
    isLiverPatient: initialPatient?.isLiverPatient || false,
    pregnancyWeeks: initialPatient?.pregnancyWeeks || 0,
    lactationMonths: initialPatient?.lactationMonths || 0
  });

  const [items, setItems] = useState<PrescriptionItem[]>(draft?.items || []);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Medicine[]>([]);
  const [amount, setAmount] = useState(draft?.amount || 200);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSuggestions, setPatientSuggestions] = useState<Patient[]>([]);
  const [aiWarnings, setAiWarnings] = useState<SafetyNotification[]>([]);
  const [isAiChecking, setIsAiChecking] = useState(false);
  const [overriddenWarnings, setOverriddenWarnings] = useState<Set<string>>(new Set());
  const [overrideModal, setOverrideModal] = useState<{ isOpen: boolean; notificationId: string; reason: string }>({ isOpen: false, notificationId: '', reason: '' });
  const [selectedCategory, setSelectedCategory] = useState<MedicineCategory | 'Tous'>('Tous');
  const [categories, setCategories] = useState<(MedicineCategory | 'Tous')[]>(['Tous']);

  // SMART MODE STATES
  const [isSmartMode, setIsSmartMode] = useState(false);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [pediatricAlerts, setPediatricAlerts] = useState<string[]>([]);

  // LAB ANALYSIS STATES
  const [selectedTests, setSelectedTests] = useState<string[]>(draft?.selectedTests || []);
  const [isAnalysesOpen, setIsAnalysesOpen] = useState(false);
  const [labSearchTerm, setLabSearchTerm] = useState('');
  const [useCombinedPrint, setUseCombinedPrint] = useState(false);

  const medInputRef = useRef<HTMLInputElement>(null);

  const queueSuggestions = (dataService.getTodayQueue()).map(q => ({
    id: q.id,
    name: q.name || (q as any).patientName,
    age: q.age || 0,
    sex: q.sex || 'M' as const,
    type: q.type || 'Adult' as const,
    phone: q.phone || '',
    consultationFee: q.consultationFee || 200
  }));

  useEffect(() => {
    setCategories(['Tous', ...dataService.getTherapeuticGroups()]);
  }, []);

  // PERSISTENCE EFFECT
  useEffect(() => {
    if (onDraftChange) {
      // Don't save empty/initial state as draft if we are editing an existing prescription
      if (!initialPrescription) {
        onDraftChange({
          patient,
          items,
          amount,
          selectedTests
        });
      }
    }
  }, [patient, items, amount, selectedTests, initialPrescription]);

  useEffect(() => {
    if (initialPatient) {
      selectFromPatientData(initialPatient);
    }
  }, [initialPatient]);

  useEffect(() => {
    if (selectedPatientFromQueue) {
      const fullPatient = dataService.searchPatients(selectedPatientFromQueue.patientName)[0];
      if (fullPatient) {
        selectFromPatientData(fullPatient);
        setSelectedPatientId(selectedPatientFromQueue.id);
      } else {
        setPatient({ ...patient, name: selectedPatientFromQueue.patientName, phone: selectedPatientFromQueue.phone });
        setAmount(200);
        setSelectedPatientId(selectedPatientFromQueue.id);
      }
    }
  }, [selectedPatientFromQueue]);

  useEffect(() => {
    if (initialPrescription) {
      setItems(initialPrescription.items);
      setAmount(initialPrescription.amount || 200);

      const fullPatient = dataService.getPatientProfile(initialPrescription.patientId);
      if (fullPatient) {
        selectFromPatientData(fullPatient);
      } else {
        setPatient({ name: initialPrescription.patientId });
      }
    }
  }, [initialPrescription]);

  const runSafetyChecks = (currentItems: PrescriptionItem[]) => {
    const newLocalWarnings: SafetyNotification[] = [];

    // 1. DUPLICATES
    const seenMeds = new Set<string>();
    currentItems.forEach(item => {
      const nameNorm = item.medicineName.toUpperCase().trim();
      if (seenMeds.has(nameNorm)) {
        newLocalWarnings.push({
          id: `doublon - ${item.id} `,
          severity: 'ATTENTION',
          type: 'DOUBLON',
          title: '💊 MÉDICAMENT À DOUBLE',
          message: `${item.medicineName} est déjà présent dans l'ordonnance.`,
          itemId: item.id
        });
      }
      seenMeds.add(nameNorm);
    });

    // 2. DRUG RULES
    const systemAlerts = drugRulesService.checkRules(patient as Patient, currentItems);
    systemAlerts.forEach((alert, idx) => {
      const alertId = `rule-${idx}-${alert.type}-${alert.message.length}`;
      if (!overriddenWarnings.has(alertId)) {
        newLocalWarnings.push({
          id: alertId,
          ...alert,
          canOverride: true
        });
      }
    });

    setAiWarnings(newLocalWarnings);
  };

  const handleSmartParse = async () => {
    if (!smartPrompt.trim()) return;

    // Check if API key is configured
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      alert("⚠️ Configuration manquante\n\nLa clé API Gemini n'est pas configurée.\n\nVeuillez redémarrer l'application après avoir configuré le fichier .env.local");
      return;
    }

    setIsParsing(true);
    setPediatricAlerts([]);
    try {
      const result = await prescriptionAiService.parsePrescription(smartPrompt, patient as Patient);

      const newItems: PrescriptionItem[] = result.items.map((item: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        medicineName: item.medicineName,
        dosage: item.dosage,
        timing: item.timing as MealTiming || 'Indifférent',
        duration: item.duration || '7 jours',
        frequency: item.frequency || '3 fois par jour',
      }));

      setItems(newItems);
      setPediatricAlerts(result.pediatricWarnings);
      setIsSmartMode(false);
      setSmartPrompt("");
      runSafetyChecks(newItems);
    } catch (error: any) {
      console.error("Smart Parse Error:", error);
      const errorMessage = error?.message || "Erreur inconnue";
      if (errorMessage.includes("API key") || errorMessage.includes("401") || errorMessage.includes("403")) {
        alert("🔑 Erreur d'authentification\n\nLa clé API Gemini est invalide ou expirée.\n\nVeuillez vérifier votre configuration dans .env.local");
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        alert("🌐 Erreur de connexion\n\nImpossible de se connecter au service Gemini AI.\n\nVérifiez votre connexion internet.");
      } else {
        alert(`❌ Erreur lors de l'analyse intelligente\n\n${errorMessage}\n\nVeuillez réessayer ou contacter le support.`);
      }
    } finally {
      setIsParsing(false);
    }
  };

  const addItem = (m: Medicine) => {
    // Determine default dosage and timing based on category if not provided by the medicine itself
    const categoryDefaults = m.category ? (dataService as any).CATEGORY_POSOLOGY?.[m.category] : null;
    const fallbackDosage = categoryDefaults?.dosage || '';
    const fallbackTiming = categoryDefaults?.timing || 'Indifférent';

    const newItem: PrescriptionItem = {
      id: Date.now().toString(),
      medicineName: m.name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      dosage: m.defaultDosage || fallbackDosage,
      referenceDosage: m.defaultDosage || fallbackDosage,
      timing: m.defaultTiming || fallbackTiming,
      duration: '7 jours',
      frequency: '3 fois par jour'
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

  const handleOverrideWarning = (id: string, reason: string) => {
    setOverriddenWarnings(new Set([...overriddenWarnings, id]));
    setAiWarnings(aiWarnings.filter(w => w.id !== id));
    setOverrideModal({ isOpen: false, notificationId: '', reason: '' });
  };

  const handleMedSearch = async (val: string) => {
    setMedicineSearch(val);
    if (val.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const searchLower = val.toLowerCase().trim();
    const localMeds = dataService.getMedicines();

    // Async fetch from the new smart catalog
    const catalogMedsRaw = await searchDrugsGlobal(searchLower, 50);
    const catalogMeds = catalogMedsRaw.map(mapMedicamentToMedicine);

    const combined = [...localMeds, ...catalogMeds];

    // Deduplicate combining local custom meds and catalog
    const seen = new Set<string>();
    const deduplicated: Medicine[] = [];
    combined.forEach(m => {
      const norm = m.name.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        deduplicated.push(m);
      }
    });

    const filtered = deduplicated
      .filter(m => {
        const matchName = m.name.toLowerCase().includes(searchLower);
        const matchIngredient = m.active_ingredient && m.active_ingredient.toLowerCase().includes(searchLower);
        const matchesSearch = matchName || matchIngredient;
        const matchesCategory = selectedCategory === 'Tous' || m.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const aLower = a.name.toLowerCase();
        const bLower = b.name.toLowerCase();

        const aStarts = aLower.startsWith(searchLower);
        const bStarts = bLower.startsWith(searchLower);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return aLower.localeCompare(bLower, 'fr');
      })
      .slice(0, 50); // Limit to 50 for performance

    setSuggestions(filtered);
  };

  const toggleTest = (test: string) => {
    setSelectedTests(prev =>
      prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
    );
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
      consultationFee: p.consultationFee,
      isPregnant: p.isPregnant || false,
      isBreastfeeding: p.isBreastfeeding || false,
      isHeartPatient: p.isHeartPatient || false,
      isKidneyPatient: p.isKidneyPatient || false,
      isLiverPatient: p.isLiverPatient || false,
      pregnancyWeeks: p.pregnancyWeeks || 0,
      lactationMonths: p.lactationMonths || 0
    });
    setAmount(p.consultationFee || 200);
    setPatientSuggestions([]);
    medInputRef.current?.focus();
  };


  const handleSave = () => {
    const isEditing = !!initialPrescription;
    const finalPatientId = selectedPatientId || (patient.name as string);

    const newPrescription: Prescription = {
      id: isEditing ? initialPrescription.id : Date.now().toString(),
      patientId: finalPatientId,
      date: isEditing ? initialPrescription.date : new Date().toISOString().split('T')[0],
      items,
      amount,
      patientType: patient.type as PatientType,
      patientAge: patient.age,
      patientWeight: patient.weight
    };

    if (isEditing) {
      dataService.updatePrescription(newPrescription);
    } else {
      dataService.savePrescription(newPrescription);
    }

    // Also save lab request if tests are selected
    if (selectedTests.length > 0) {
      dataService.saveLabRequest({
        id: `lab-${Date.now()}`,
        patientId: finalPatientId,
        date: newPrescription.date,
        title: "Bilan Consultation",
        tests: selectedTests,
        status: 'REQUESTED'
      });
    }

    if (selectedPatientId) dataService.deleteFromQueue(selectedPatientId);
    onFinish();
  };

  const handleExportPDF = () => {
    const appearance = settingsService.getAppearance();
    const doctor = dataService.getDoctorInfo();
    const element = document.getElementById('prescription-export-template');

    if (!element) return;

    const opt = {
      margin: 0,
      filename: `Ordonnance_${patient.name || 'Patient'}_${new Date().toLocaleDateString()}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true, letterRendering: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: 'avoid-all' }
    };

    toastService.info("Génération de l'ordonnance PDF...");
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        toastService.success(useCombinedPrint ? "Consultation complète enregistrée !" : "Ordonnance enregistrée !");
        handleSave();
      })
      .catch((err: any) => {
        console.error("Prescription PDF Error:", err);
        toastService.error("Erreur d'export PDF.");
      });
  };

  const getGroupedTests = () => {
    const groups: { category: string; items: string[] }[] = [];
    COMMON_ANALYSES.forEach(cat => {
      const items = cat.items.filter(item => selectedTests.includes(item));
      if (items.length > 0) groups.push({ category: cat.category, items });
    });
    return groups;
  };

  const renderPrescriptionPage = (mode: 'preview' | 'print' | 'export' = 'preview') => {
    const appearance = settingsService.getAppearance();
    const doctor = dataService.getDoctorInfo();
    const id = mode === 'preview' ? 'prescription-preview-template' : mode === 'print' ? 'prescription-print-template' : 'prescription-export-template';

    if (mode === 'preview') {
      return (
        <div className="shadow-2xl w-full lg:w-[420px] shrink-0 lg:sticky lg:top-8 h-fit rounded-[2rem] overflow-hidden bg-white border border-gray-100 flex justify-center items-start">
          {useCombinedPrint ? (
            <CombinedConsultationTemplate
              doctor={doctor}
              appearance={appearance}
              patient={patient}
              items={items}
              tests={getGroupedTests()}
              scale={0.17}
            />
          ) : (
            <ExactPrescriptionTemplate
              id={id}
              doctor={doctor}
              appearance={appearance}
              patient={{
                name: patient.name || '',
                age: patient.age || 0,
                type: (patient.type as PatientType) || 'Adult'
              }}
              items={items}
              scale={0.17}
            />
          )}
        </div>
      );
    }

    if (mode === 'export') {
      return (
        <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          {useCombinedPrint ? (
            <CombinedConsultationTemplate
              doctor={doctor}
              appearance={appearance}
              patient={patient}
              items={items}
              tests={getGroupedTests()}
              isPrinting={true}
              scale={0.32}
            />
          ) : (
            <ExactPrescriptionTemplate id={id} doctor={doctor} appearance={appearance} patient={{ name: patient.name || '', age: patient.age || 0, type: (patient.type as PatientType) || 'Adult' }} items={items} isPrinting={true} scale={0.32} />
          )}
        </div>
      );
    }

    return (
      <div className="print-page w-full h-[297mm] overflow-hidden bg-white">
        <div style={{ transform: 'scale(0.32)', transformOrigin: 'top left' }}>
          {useCombinedPrint ? (
            <CombinedConsultationTemplate
              doctor={doctor}
              appearance={appearance}
              patient={patient}
              items={items}
              tests={getGroupedTests()}
              isPrinting={true}
            />
          ) : (
            <ExactPrescriptionTemplate id={id} doctor={doctor} appearance={appearance} patient={{ name: patient.name || '', age: patient.age || 0, type: (patient.type as PatientType) || 'Adult' }} items={items} isPrinting={true} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-8 pb-20 px-4 text-black">
      {overrideModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-black uppercase text-red-600 mb-4 flex items-center gap-2"><ShieldX size={20} /> {t('security')}</h3>
            <textarea value={overrideModal.reason} onChange={e => setOverrideModal({ ...overrideModal, reason: e.target.value })} placeholder="..." className="w-full px-4 py-3 border border-gray-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-red-500 resize-none h-24 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setOverrideModal({ isOpen: false, notificationId: '', reason: '' })} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-black rounded-xl uppercase text-xs">{t('cancel')}</button>
              <button onClick={() => handleOverrideWarning(overrideModal.notificationId, overrideModal.reason)} disabled={!overrideModal.reason.trim()} className="flex-1 px-4 py-3 bg-red-600 text-white font-black rounded-xl uppercase text-xs">{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-6 print:hidden">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 relative">


          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-2 relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('patient_name')}</label>
              <input type="text" value={patient.name} onFocus={() => !patient.name && setPatientSuggestions(queueSuggestions as any)} onChange={e => { setPatient({ ...patient, name: e.target.value }); setPatientSuggestions(e.target.value.length > 0 ? dataService.searchPatients(e.target.value) : queueSuggestions as any); }} className={`w-full ${dir === 'rtl' ? 'pr-5 pl-5' : 'pl-5 pr-5'} py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-emerald-500`} placeholder={t('name')} />
              {patientSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-3xl shadow-2xl z-50 overflow-hidden max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
                  <div className="p-3 bg-emerald-50 border-b border-emerald-100">
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">{t('suggestions')}</span>
                  </div>
                  {patientSuggestions.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectFromPatientData(p)}
                      className="w-full text-left p-4 hover:bg-emerald-50 border-t border-gray-50 flex justify-between items-center group transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:text-emerald-600 transition-colors shadow-sm">
                          <UserCircle size={22} />
                        </div>
                        <div>
                          <p className="font-black text-gray-950 uppercase text-xs">{p.name}</p>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">ID: {p.id}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded italic">
                              {(p as any).phone || p.phone || 'Sans tel'}
                            </span>
                            {p.registeredDate && (
                              <span className="text-[8px] font-medium text-emerald-600">
                                Depuis le {new Date(p.registeredDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={16} className={`text-gray-200 group-hover:text-emerald-500 transition-all group-hover:translate-x-1 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('age')}</label><input type="number" value={patient.age || ''} onChange={e => setPatient({ ...patient, age: parseInt(e.target.value) || 0 })} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-lg outline-none" /></div>
            <div><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('weight')}</label><input type="text" value={patient.weight || ''} onChange={e => setPatient({ ...patient, weight: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-lg outline-none" placeholder={t('weight_placeholder')} /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-red-50/20 border border-red-100 rounded-[2rem]">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1"><AlertCircle size={10} /> {t('allergies')}</label>
                <input type="text" value={patient.allergies} onChange={e => setPatient({ ...patient, allergies: e.target.value })} placeholder={t('allergies_placeholder')} className="w-full px-4 py-3 bg-white border border-red-100 rounded-xl font-bold text-sm outline-none" />
              </div>
              <div className="flex flex-wrap gap-2">
                {patient.sex === 'F' && (
                  <>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => { const val = !patient.isPregnant; setPatient({ ...patient, isPregnant: val }); runSafetyChecks(items); }} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${patient.isPregnant ? 'bg-pink-100 text-pink-700 ring-1 ring-pink-300' : 'bg-white text-gray-400 border border-gray-100'}`}>
                        <Zap size={10} /> {t('pregnant')}
                      </button>
                      {patient.isPregnant && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-[8px] font-black text-pink-600 uppercase">Semaines:</span>
                          <input
                            type="number"
                            value={patient.pregnancyWeeks || ''}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0;
                              setPatient({ ...patient, pregnancyWeeks: val });
                              runSafetyChecks(items);
                            }}
                            className="w-12 px-1 py-0.5 bg-white border border-pink-200 rounded md text-[10px] font-black outline-none"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => { const val = !patient.isBreastfeeding; setPatient({ ...patient, isBreastfeeding: val }); runSafetyChecks(items); }} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${patient.isBreastfeeding ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-white text-gray-400 border border-gray-100'}`}>
                        <Baby size={10} /> {t('breastfeeding')}
                      </button>
                      {patient.isBreastfeeding && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-[8px] font-black text-blue-600 uppercase">Mois:</span>
                          <input
                            type="number"
                            value={patient.lactationMonths || ''}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0;
                              setPatient({ ...patient, lactationMonths: val });
                              runSafetyChecks(items);
                            }}
                            className="w-12 px-1 py-0.5 bg-white border border-blue-200 rounded md text-[10px] font-black outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1"><Activity size={10} /> {t('pathologies')}</label>
                <input type="text" value={patient.pathologies} onChange={e => setPatient({ ...patient, pathologies: e.target.value })} placeholder={t('antecedents_placeholder')} className="w-full px-4 py-3 bg-white border border-indigo-100 rounded-xl font-bold text-sm outline-none" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { const val = !patient.isHeartPatient; setPatient({ ...patient, isHeartPatient: val }); runSafetyChecks(items); }} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${patient.isHeartPatient ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300' : 'bg-white text-gray-400 border border-gray-100'}`}>
                  <Heart size={10} /> {t('heart_patient')}
                </button>
                <button onClick={() => { const val = !patient.isKidneyPatient; setPatient({ ...patient, isKidneyPatient: val }); runSafetyChecks(items); }} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${patient.isKidneyPatient ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'bg-white text-gray-400 border border-gray-100'}`}>
                  <FlaskConical size={10} /> {t('kidney_patient')}
                </button>
                <button onClick={() => { const val = !patient.isLiverPatient; setPatient({ ...patient, isLiverPatient: val }); runSafetyChecks(items); }} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${patient.isLiverPatient ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-white text-gray-400 border border-gray-100'}`}>
                  <Activity size={10} /> {t('liver_patient')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 min-h-[400px]">
          <div className="relative mb-8">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setIsSmartMode(!isSmartMode)}
                className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm ${isSmartMode ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-500' : 'bg-gray-100 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
              >
                <Zap size={14} className={isSmartMode ? "fill-amber-500" : ""} /> {t('smart_mode')}
              </button>
              {!isSmartMode && <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">{t('manual_search')}</p>}
            </div>

            {isSmartMode ? (
              <div className="space-y-4 animate-in zoom-in-95 duration-300">
                <textarea
                  value={smartPrompt}
                  onChange={e => setSmartPrompt(e.target.value)}
                  placeholder={t('smart_mode_desc')}
                  className="w-full h-40 p-6 bg-emerald-50/50 border border-emerald-200 rounded-[2rem] font-bold text-lg outline-none focus:ring-4 focus:ring-emerald-100 transition-all resize-none shadow-inner"
                />
                <button
                  disabled={isParsing || !smartPrompt.trim()}
                  onClick={handleSmartParse}
                  className="w-full py-5 bg-emerald-600 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {isParsing ? <Loader2 size={24} className="animate-spin" /> : <BrainCircuit size={24} />}
                  {isParsing ? t('parsing_in_progress') : t('smart_parse_btn')}
                </button>
              </div>
            ) : (
              <>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-3">
                    <Search className={`transition-colors duration-300 ${medicineSearch ? 'text-emerald-500 scale-110' : 'text-gray-300'}`} size={24} />
                    <div className="w-[2px] h-6 bg-gray-100 hidden md:block" />
                  </div>
                  <input
                    ref={medInputRef}
                    type="text"
                    value={medicineSearch}
                    onChange={e => handleMedSearch(e.target.value)}
                    placeholder={t('search_med_placeholder')}
                    className={`w-full ${dir === 'rtl' ? 'pr-16 md:pr-20 pl-12' : 'pl-16 md:pl-20 pr-12'} py-6 bg-white border border-gray-100 rounded-3xl font-black text-xl outline-none focus:border-emerald-500 focus:ring-[12px] focus:ring-emerald-500/5 shadow-soft-lg transition-all`}
                  />
                  {(medicineSearch || selectedCategory !== 'Tous') && (
                    <button
                      onClick={() => {
                        setMedicineSearch('');
                        setSelectedCategory('Tous');
                        setSuggestions([]);
                      }}
                      className={`absolute ${dir === 'rtl' ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 p-2 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-all`}
                    >
                      <CloseX size={18} />
                    </button>
                  )}
                </div>

                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-4 bg-white/80 backdrop-blur-xl border border-white rounded-[2.5rem] shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 max-h-[500px] flex flex-col">
                    <div className="px-6 py-3 bg-emerald-600 flex justify-between items-center text-white">
                      <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <Pill size={12} /> {suggestions.length} {t('results').toLowerCase()}
                      </span>
                      <span className="text-[9px] font-bold opacity-80 uppercase">{t('suggestions')}</span>
                    </div>
                    <div className="overflow-y-auto overflow-x-hidden p-2 scrollbar-thin scrollbar-thumb-emerald-100 flex-1">
                      {suggestions.map((m, idx) => (
                        <button
                          key={m.id || idx}
                          onClick={() => addItem(m)}
                          className="w-full text-left p-4 hover:bg-emerald-50 rounded-2xl transition-all group flex items-start gap-4"
                        >
                          <div className="w-12 h-12 bg-gray-50 group-hover:bg-white rounded-xl flex items-center justify-center text-gray-400 group-hover:text-emerald-600 transition-colors shrink-0 shadow-sm">
                            <Pill size={22} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center gap-4 mb-1">
                              <h4 className="font-black text-gray-900 group-hover:text-emerald-800 text-lg leading-tight uppercase truncate">
                                {m.name.split(new RegExp(`(${medicineSearch})`, 'gi')).map((part, i) =>
                                  part.toLowerCase() === medicineSearch.toLowerCase() ? (
                                    <span key={i} className="text-emerald-600 bg-emerald-100/50 rounded-md px-0.5">{part}</span>
                                  ) : part
                                )}
                              </h4>
                              <ChevronRight size={18} className={`text-gray-200 group-hover:text-emerald-400 -translate-x-2 group-hover:translate-x-0 transition-all ${dir === 'rtl' ? 'rotate-180' : ''}`} />
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="px-2 py-0.5 bg-emerald-100/50 text-[10px] font-black text-emerald-700 rounded-md uppercase tracking-wider">
                                {m.category ? (lang === 'ar' ? (t(m.category.toLowerCase()) || m.category) : m.category) : t('medicine')}
                              </span>
                              {m.form && (
                                <span className="px-2 py-0.5 bg-amber-100 text-[10px] font-black text-amber-700 rounded-md uppercase tracking-wider">
                                  {m.form}
                                </span>
                              )}
                              {m.strength && (
                                <span className="px-2 py-0.5 bg-blue-100 text-[10px] font-black text-blue-700 rounded-md uppercase tracking-wider">
                                  {m.strength}
                                </span>
                              )}
                              {m.defaultDosage && (
                                <span className="px-2 py-0.5 bg-gray-100 text-[10px] font-bold text-gray-500 rounded-md truncate max-w-[300px]">
                                  <span className="opacity-50 mr-1">Posologie type:</span> {m.defaultDosage}
                                </span>
                              )}
                              {m.interactionGroup && (
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md italic truncate max-w-[200px]">
                                  {m.interactionGroup}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {medicineSearch.length >= 2 && suggestions.length === 0 && !isParsing && (
                  <div className="absolute top-full left-0 right-0 mt-4 bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl z-50 p-10 text-center animate-in zoom-in-95 duration-300">
                    <h4 className="font-black text-gray-900 uppercase">{t('no_med_found')}</h4>
                    <p className="text-xs text-gray-400 font-bold mt-2 uppercase tracking-widest">---</p>
                    <button
                      onClick={() => {
                        addItem({ id: Date.now().toString(), name: medicineSearch, category: 'Autre', defaultDosage: '', defaultTiming: 'Indifférent' });
                      }}
                      className="mt-6 px-6 py-3 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2 mx-auto"
                    >
                      <Plus size={14} /> {t('add_new_med')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {(pediatricAlerts.length > 0 || aiWarnings.length > 0) && (
            <div className="mb-8 space-y-4 animate-in slide-in-from-left duration-500">
              {pediatricAlerts.length > 0 && (
                <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-200">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xs font-black text-emerald-700 uppercase flex items-center gap-2">🟢 Analyse Assistée</h3>
                    <span className="text-[9px] font-bold text-emerald-600/60 uppercase tracking-tighter italic">Outil d'aide à la lecture</span>
                  </div>
                  <div className="space-y-2">
                    {pediatricAlerts.map((alert, i) => (
                      <div key={i} className="flex gap-3 items-start p-3 bg-white/60 rounded-xl">
                        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-1" />
                        <p className="text-sm font-black text-amber-900 leading-tight">{alert}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiWarnings.length > 0 && (
                <div className="p-6 bg-red-50 rounded-3xl border border-red-200">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xs font-black text-red-700 uppercase flex items-center gap-2">🚨 Alertes de Sécurité</h3>
                    <span className="text-[9px] font-bold text-red-600/60 uppercase tracking-tighter italic">Vérification clinique automatique</span>
                  </div>
                  <div className="space-y-3">
                    {aiWarnings.map((alert) => (
                      <div key={alert.id} className={`flex gap-4 items-start p-4 rounded-2xl ${alert.severity === 'CRITIQUE' ? 'bg-red-600 text-white shadow-lg' : 'bg-white/80 text-red-900 border border-red-100'}`}>
                        {alert.severity === 'CRITIQUE' ? <ShieldAlert size={20} className="shrink-0 mt-1" /> : <AlertTriangle size={20} className="text-red-500 shrink-0 mt-1" />}
                        <div className="flex-1">
                          <p className="font-black uppercase text-xs mb-1">{alert.title}</p>
                          <p className="text-sm font-bold leading-tight opacity-90">{alert.message}</p>
                        </div>
                        {alert.canOverride && (
                          <button
                            onClick={() => setOverrideModal({ isOpen: true, notificationId: alert.id, reason: '' })}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${alert.severity === 'CRITIQUE' ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}
                          >
                            Passer outre
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 shadow-sm relative">
                <button onClick={() => removeItem(item.id)} className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                <div className="flex flex-col gap-1 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-black uppercase tracking-tight text-xl">{index + 1}/ {item.medicineName}</p>
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-[10px] font-black text-gray-400 rounded-md uppercase tracking-widest">
                        {item.category ? (lang === 'ar' ? (t(item.category.toLowerCase()) || item.category) : item.category) : t('medicine').toUpperCase()}
                      </span>
                      {item.form && (
                        <span className="px-2 py-0.5 bg-amber-50 text-[10px] font-black text-amber-600 rounded-md uppercase tracking-widest border border-amber-100">
                          {item.form}
                        </span>
                      )}
                      {item.strength && (
                        <span className="px-2 py-0.5 bg-blue-50 text-[10px] font-black text-blue-600 rounded-md uppercase tracking-widest border border-blue-100">
                          {item.strength}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
                    {item.dosage && <span>{item.dosage}</span>}
                    {item.timing && item.timing !== 'Indifférent' && <span>{item.timing}</span>}
                    {item.duration && <span>{lang === 'ar' ? 'لمدة' : 'pendant'} {item.duration}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase">{t('dosage')}</p>
                      {item.referenceDosage && item.dosage !== item.referenceDosage && (
                        <button
                          onClick={() => setItems(items.map(i => i.id === item.id ? { ...i, dosage: item.referenceDosage! } : i))}
                          className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 uppercase flex items-center gap-1 transition-colors"
                          title="Rétablir la posologie de référence"
                        >
                          <RefreshCcw size={10} /> {t('restore')}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.dosage}
                      onChange={e => {
                        const val = e.target.value;
                        let newDosage = val;
                        let newTiming = item.timing;

                        // Shorthand Parsing Logic
                        const lowerVal = val.toLowerCase();

                        // Check for timing keywords
                        if (lowerVal.includes('apres repas') || lowerVal.includes('après repas')) {
                          newTiming = 'Après repas';
                          newDosage = val.replace(/apres repas|après repas/gi, '').trim();
                        } else if (lowerVal.includes('avant repas')) {
                          newTiming = 'Avant repas';
                          newDosage = val.replace(/avant repas/gi, '').trim();
                        } else if (lowerVal.includes('pendant repas')) {
                          newTiming = 'Pendant repas';
                          newDosage = val.replace(/pendant repas/gi, '').trim();
                        } else if (lowerVal.includes('indifferent') || lowerVal.includes('indifférent')) {
                          newTiming = 'Indifférent';
                          newDosage = val.replace(/indifferent|indifférent/gi, '').trim();
                        }

                        setItems(items.map(i => i.id === item.id ? { ...i, dosage: newDosage, timing: newTiming } : i));
                      }}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder={t('dosage_placeholder')}
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', '2-0-2'].map(quickP => (
                        <button
                          key={quickP}
                          onClick={() => {
                            setItems(items.map(i => i.id === item.id ? { ...i, dosage: quickP } : i));
                          }}
                          className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-black hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-all shadow-sm"
                        >
                          {quickP}
                        </button>
                      ))}
                    </div>
                    {item.referenceDosage && (
                      <p className="mt-1.5 text-[9px] font-bold text-gray-400/80 italic line-clamp-1 group-hover:line-clamp-none transition-all">
                        Réf: {item.referenceDosage}
                      </p>
                    )}
                  </div>
                  <div><p className="text-[10px] font-black text-gray-400 uppercase mb-1">{t('duration')}</p><input type="text" value={item.duration} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, duration: e.target.value } : i))} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-black outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                  <div><p className="text-[10px] font-black text-gray-400 uppercase mb-1">{t('type')}</p>
                    <select value={item.timing} onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, timing: e.target.value as MealTiming } : i))} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-black outline-none">
                      {['Indifférent', 'Avant repas', 'Pendant repas', 'Après repas'].map(time => (
                        <option key={time} value={time}>{t(time.toLowerCase().replace(' ', '_')) || time}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6">
          <button
            onClick={() => setIsAnalysesOpen(!isAnalysesOpen)}
            className={`w-full py-4 px-6 rounded-2xl flex items-center justify-between transition-all ${isAnalysesOpen || selectedTests.length > 0 ? 'bg-blue-50 border-2 border-blue-500 text-blue-800 shadow-md' : 'bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}
          >
            <div className="flex items-center gap-3">
              <FlaskConical size={20} className={selectedTests.length > 0 ? 'text-blue-600' : ''} />
              <span className="font-black uppercase tracking-widest text-xs">{t('analyses')} {selectedTests.length > 0 ? `(${selectedTests.length})` : ''}</span>
            </div>
            {isAnalysesOpen ? <ChevronDown className="rotate-180" size={18} /> : <ChevronRight size={18} />}
          </button>

          {isAnalysesOpen && (
            <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400" size={16} />
                <input
                  type="text"
                  placeholder={t('search_patient')}
                  value={labSearchTerm}
                  onChange={e => setLabSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-blue-50/30 border border-blue-100 rounded-xl text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto p-2 scrollbar-hide">
                {COMMON_ANALYSES.map(cat => {
                  const filtered = cat.items.filter(i => i.toLowerCase().includes(labSearchTerm.toLowerCase()));
                  if (filtered.length === 0) return null;
                  return (
                    <div key={cat.category} className="space-y-2">
                      <h5 className="text-[9px] font-black text-blue-600/60 uppercase tracking-widest px-2">{cat.category}</h5>
                      <div className="space-y-1">
                        {filtered.map(test => (
                          <button
                            key={test}
                            onClick={() => toggleTest(test)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-between ${selectedTests.includes(test) ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 hover:bg-blue-50'}`}
                          >
                            <span className="truncate flex-1">{test}</span>
                            {selectedTests.includes(test) ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 border border-gray-200 rounded-sm bg-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setUseCombinedPrint(!useCombinedPrint)}
              disabled={selectedTests.length === 0}
              className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${useCombinedPrint ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600'}`}
            >
              <FileDigit size={16} />
              {useCombinedPrint ? (lang === 'ar' ? 'وضع: ورقة كاملة' : 'Mode : Feuille Unique A4') : (lang === 'ar' ? 'وضع: وصفة فقط' : 'Mode : Ordonnance Seule')}
            </button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => window.print()} disabled={items.length === 0} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl uppercase text-xs tracking-widest transition-all"><Printer size={18} /> {t('print')}</button>
            <button onClick={handleExportPDF} disabled={items.length === 0} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black rounded-2xl uppercase text-xs tracking-widest transition-all"><FileDigit size={18} /> {t('print')} PDF</button>
            <button onClick={handleSave} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-12 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl uppercase text-sm tracking-widest active:scale-95 transition-all"><Save size={18} /> {t('save')}</button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[500px] mx-auto print:hidden">
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 px-2 flex items-center gap-2"><FileText size={16} /> {lang === 'ar' ? 'معاينة' : 'Aperçu'}</h3>
        {renderPrescriptionPage('preview')}
      </div>

      <div className="hidden print:block fixed inset-0 z-0 bg-white">{renderPrescriptionPage('print')}</div>
      {renderPrescriptionPage('export')}
    </div >
  );
};

export default PrescriptionEditor;
