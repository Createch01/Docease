/**
 * PrescriptionEditor.tsx — DocEase v3 (new design system)
 *
 * Token-aligned: variables.css (--color-primary #1A6B8A, --color-danger #E53E3E,
 * --color-warning #F6AD55, 8px grid, Inter, 40px buttons, 8/12px radii).
 *
 * Logic, props, hooks, services — UNCHANGED (verbatim from v2).
 * Pulsing animation comes from .alert-pulse class in variables.css.
 *
 * Audit trail is derivative — built from existing state (items + overriddenWarnings).
 * No new logic or state added.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, Printer, Save, Pill, ChevronRight, ChevronDown,
  Search, FileText, AlertTriangle, ShieldAlert,
  RefreshCcw, FileDigit, X as CloseX, Loader2,
  Heart, CheckCircle2, Baby, UserCircle,
  ShieldX, AlertCircle, Activity, Zap, BrainCircuit, FlaskConical,
  ArrowLeft, History, XCircle, ScrollText, ShieldCheck, PanelLeftOpen, PanelLeftClose,
} from 'lucide-react';
import { Medicine, PrescriptionItem, MedicineCategory, MealTiming, Patient, Prescription, PatientType, PrescriptionDraft, ContextEntry, AllergyReaction, RenalStage } from '../types';
import { dataService } from '../services/dataService';
import { searchDrugsGlobal, mapMedicamentToMedicine } from '../services/drugCatalogService';
import { drugRulesService } from '../services/drugRules';
import { settingsService } from '../services/settingsService';
import { useI18n } from '../i18n';
import CombinedConsultationTemplate from './CombinedConsultationTemplate';
import TemplateRenderer from './templates/TemplateRenderer';
import { usePrintMode } from './usePrintMode';
import { COMMON_ANALYSES } from '../constants/medicalData';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import * as prescriptionAiService from '../services/prescriptionAiService';
import { toastService } from '../services/toastService';
import { sessionService } from '../services/sessionService';
import { unsavedChanges, useUnsavedChanges } from './settings/unsavedChanges';
import { specialtyKey, deriveProfileFlags } from '../services/medicalReferentials';
import { buildContextFromPatient, buildContextSave, shortcutActive, toggleShortcut, withContext, ShortcutKey } from '../services/patientContext';
import ContextTagInput from './ui/ContextTagInput';
import PatientPicker from './ui/PatientPicker';

export interface SafetyNotification {
  id: string;
  severity: 'CRITIQUE' | 'ATTENTION' | 'INFO';
  title: string;
  message: string;
  type: 'INTERACTION' | 'CONTRE_INDICATION' | 'DOUBLON' | 'ENFANT_INTERDIT' | 'REGLE_SYSTEME' | 'DONNEE_MANQUANTE';
  canOverride?: boolean;
  itemId?: string;
  /** Allergie à réaction anaphylactique : l'ordonnance ne peut être enregistrée qu'après justification. */
  requiresJustification?: boolean;
}

interface PrescriptionEditorProps {
  onFinish: () => void;
  selectedPatientFromQueue?: { id: string; patientName: string; phone: string };
  initialPatient?: Patient | null;
  initialPrescription?: Prescription | null;
  draft?: PrescriptionDraft | null;
  onDraftChange?: (draft: PrescriptionDraft | null) => void;
  /** Mode concentration : la sidebar de l'application est-elle affichée ? */
  sidebarShown?: boolean;
  onToggleSidebar?: () => void;
}

// ─── Shared style constants ──────────────────────────────────────────────
const card = 'bg-white rounded-xl border';
const cardStyle = { borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' } as React.CSSProperties;
const input40 = 'w-full h-10 px-3 rounded-md border text-[14px] outline-none transition-all bg-white';
const inputStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;
const labelEyebrow = 'block text-[11px] font-medium uppercase tracking-wider mb-1.5';
const labelEyebrowStyle = { color: 'var(--color-text-subtle)', letterSpacing: '0.06em' } as React.CSSProperties;

const PrescriptionEditor: React.FC<PrescriptionEditorProps> = ({
  onFinish, selectedPatientFromQueue, initialPatient, initialPrescription, draft, onDraftChange, sidebarShown, onToggleSidebar,
}) => {
  const { t, lang, dir } = useI18n();

  // ═══ State (UNCHANGED) ═══
  const [patient, setPatient] = useState<Partial<Patient>>(draft?.patient || {
    name: initialPatient?.name || '',
    age: initialPatient?.age || 0,
    // Aucun sexe par défaut : la saisie est obligatoire (voir validateForOutput).
    sex: initialPatient?.sex,
    type: initialPatient?.type || 'Adult',
    weight: initialPatient?.weight || '',
    allergyList: [],
    pathologyList: [],
    consultationFee: initialPatient?.consultationFee || 0,
    isPregnant: initialPatient?.isPregnant || false,
    isBreastfeeding: initialPatient?.isBreastfeeding || false,
    isHeartPatient: initialPatient?.isHeartPatient || false,
    isKidneyPatient: initialPatient?.isKidneyPatient || false,
    isLiverPatient: initialPatient?.isLiverPatient || false,
    pregnancyWeeks: initialPatient?.pregnancyWeeks || 0,
    lactationMonths: initialPatient?.lactationMonths || 0,
  });

  const [items, setItems] = useState<PrescriptionItem[]>(draft?.items || []);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Medicine[]>([]);
  const [amount, setAmount] = useState(draft?.amount || 200);
  // Un brouillon restauré garde le patient choisi (son id est conservé dans l'état patient).
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(draft?.patient?.id ?? null);
  // « search » : recherche d'un dossier existant ; « new » : saisie d'un nouveau patient (dossier créé à l'enregistrement).
  const [patientMode, setPatientMode] = useState<'search' | 'new'>(draft?.patient?.name && !draft.patient.id ? 'new' : 'search');
  const [aiWarnings, setAiWarnings] = useState<SafetyNotification[]>([]);
  const [isAiChecking, setIsAiChecking] = useState(false);
  const [overriddenWarnings, setOverriddenWarnings] = useState<Set<string>>(new Set());
  const [overrideModal, setOverrideModal] = useState<{ isOpen: boolean; notificationId: string; reason: string }>({ isOpen: false, notificationId: '', reason: '' });
  const [selectedCategory, setSelectedCategory] = useState<MedicineCategory | 'Tous'>('Tous');
  const [categories, setCategories] = useState<(MedicineCategory | 'Tous')[]>(['Tous']);

  const [isSmartMode, setIsSmartMode] = useState(false);
  const [smartPrompt, setSmartPrompt] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [pediatricAlerts, setPediatricAlerts] = useState<string[]>([]);

  const [selectedTests, setSelectedTests] = useState<string[]>(draft?.selectedTests || []);
  const [isAnalysesOpen, setIsAnalysesOpen] = useState(false);
  const [labSearchTerm, setLabSearchTerm] = useState('');
  const [useCombinedPrint, setUseCombinedPrint] = useState(false);
  // While printing, only the print copy is mounted (see usePrintMode).
  const printing = usePrintMode();

  const medInputRef = useRef<HTMLInputElement>(null);
  const specialty = specialtyKey(dataService.getDoctorInfo()?.specialtyFr);

  // Aperçu d'impression plus grand sur les écrans larges (≥ 1700 px) ; 794 px = largeur A4 à l'échelle 1.
  const [wide, setWide] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1700px)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1700px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const previewScale = wide ? 0.68 : 0.531;

  // Modifications non enregistrées : alimente la garde de navigation (même mécanisme que les Paramètres).
  const [touched, setTouched] = useState(false);
  const updatePatient = (next: Partial<Patient>) => { setTouched(true); setPatient(next); };
  const dirty = initialPrescription
    ? touched || JSON.stringify(items) !== JSON.stringify(initialPrescription.items)
    : touched || items.length > 0 || selectedTests.length > 0;
  useUnsavedChanges('consultation', dirty);

  // ═══ Effects (UNCHANGED) ═══
  useEffect(() => { setCategories(['Tous', ...dataService.getTherapeuticGroups()]); }, []);

  useEffect(() => {
    if (onDraftChange && !initialPrescription) {
      onDraftChange({ patient, items, amount, selectedTests });
    }
  }, [patient, items, amount, selectedTests, initialPrescription]);

  // Ouverture depuis un RDV ou la salle d'attente : le dossier complet remplace la copie de la file.
  useEffect(() => {
    if (initialPatient) selectFromPatientData(dataService.getPatientProfile(initialPatient.id) ?? initialPatient);
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
      if (fullPatient) selectFromPatientData(fullPatient);
      else setPatient({ name: initialPrescription.patientId });
    }
  }, [initialPrescription]);

  // Toute modification du contexte (allergie, pathologie, stade rénal, indicateurs) relance
  // immédiatement la vérification des médicaments déjà prescrits.
  useEffect(() => { runSafetyChecks(items); },
    [patient.allergyList, patient.pathologyList, patient.noKnownAllergy, patient.renalStage,
      patient.isHeartPatient, patient.isKidneyPatient, patient.isLiverPatient]);

  // ═══ Handlers (UNCHANGED) ═══
  const runSafetyChecks = (currentItems: PrescriptionItem[], currentPatient: Partial<Patient> = patient) => {
    const newLocalWarnings: SafetyNotification[] = [];
    const seenMeds = new Set<string>();
    currentItems.forEach(item => {
      const nameNorm = item.medicineName.toUpperCase().trim();
      if (seenMeds.has(nameNorm)) {
        newLocalWarnings.push({
          id: `doublon - ${item.id} `, severity: 'ATTENTION', type: 'DOUBLON',
          title: '💊 MÉDICAMENT À DOUBLE',
          message: `${item.medicineName} est déjà présent dans l'ordonnance.`,
          itemId: item.id,
        });
      }
      seenMeds.add(nameNorm);
    });
    const systemAlerts = drugRulesService.checkRules(currentPatient as Patient, currentItems);
    systemAlerts.forEach((alert, idx) => {
      const alertId = alert.id ?? `rule-${idx}-${alert.type}-${alert.message.length}`;
      if (!overriddenWarnings.has(alertId)) {
        newLocalWarnings.push({ ...alert, id: alertId, canOverride: true });
      }
    });
    setAiWarnings(newLocalWarnings);
  };

  const handleSmartParse = async () => {
    if (!smartPrompt.trim()) return;
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
      setSmartPrompt('');
      runSafetyChecks(newItems);
    } catch (error: any) {
      // Messages en français fournis par le backend (IA désactivée, pas de clé,
      // clé invalide, quota, réseau…). Le texte de l'ordonnance n'est pas journalisé.
      alert('Analyse intelligente indisponible\n\n' + (error?.message || 'Erreur inconnue'));
    } finally {
      setIsParsing(false);
    }
  };

  const addItem = (m: Medicine) => {
    const categoryDefaults = m.category ? (dataService as any).CATEGORY_POSOLOGY?.[m.category] : null;
    const fallbackDosage = categoryDefaults?.dosage || '';
    const fallbackTiming = categoryDefaults?.timing || 'Indifférent';
    const newItem: PrescriptionItem = {
      id: Date.now().toString(),
      medicineName: m.name, category: m.category, form: m.form, strength: m.strength,
      dosage: m.defaultDosage || fallbackDosage,
      referenceDosage: m.defaultDosage || fallbackDosage,
      timing: m.defaultTiming || fallbackTiming,
      duration: '7 jours', frequency: '3 fois par jour',
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
    if (val.trim().length < 2) { setSuggestions([]); return; }
    const searchLower = val.toLowerCase().trim();
    const localMeds = dataService.getMedicines();
    const catalogMedsRaw = await searchDrugsGlobal(searchLower, 50);
    const catalogMeds = catalogMedsRaw.map(mapMedicamentToMedicine);
    const combined = [...localMeds, ...catalogMeds];
    const seen = new Set<string>();
    const deduplicated: Medicine[] = [];
    combined.forEach(m => {
      const norm = m.name.toLowerCase();
      if (!seen.has(norm)) { seen.add(norm); deduplicated.push(m); }
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
      .slice(0, 50);
    setSuggestions(filtered);
  };

  const toggleTest = (test: string) => {
    setSelectedTests(prev => prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]);
  };

  const selectFromPatientData = (p: Patient) => {
    setSelectedPatientId(p.id);
    setPatientMode('search');
    const { migrated: _migrated, ...context } = buildContextFromPatient(p);
    setPatient({
      id: p.id, name: p.name, age: p.age, sex: p.sex, phone: p.phone, weight: p.weight, type: p.type,
      consultationFee: p.consultationFee,
      isPregnant: p.isPregnant || false, isBreastfeeding: p.isBreastfeeding || false,
      pregnancyWeeks: p.pregnancyWeeks || 0, lactationMonths: p.lactationMonths || 0,
      contextUpdatedAt: p.contextUpdatedAt, contextUpdatedBy: p.contextUpdatedBy,
      ...withContext({}, context),
    });
    setAmount(p.consultationFee || 200);
    medInputRef.current?.focus();
  };

  // Une allergie à réaction anaphylactique impose une justification avant tout enregistrement.
  const justificationPending = () => {
    const pending = aiWarnings.filter(w => w.requiresJustification);
    if (pending.length === 0) return false;
    toastService.error(`Justification requise : ${pending[0].message}`);
    return true;
  };

  /** Enregistre le contexte (allergies, pathologies…) dans le dossier — médecin uniquement. */
  const persistContext = (patientId: string) => {
    if (!sessionService.isMedecin()) return;
    const profile = dataService.getPatientProfile(patientId);
    if (!profile) return;
    const updated = buildContextSave(
      profile,
      {
        allergyList: patient.allergyList || [], pathologyList: patient.pathologyList || [],
        noKnownAllergy: patient.noKnownAllergy, renalStage: patient.renalStage,
      },
      sessionService.get()?.name || sessionService.get()?.userId || 'médecin',
    );
    if (updated) dataService.savePatientProfile(updated);
  };

  const handleBack = () => {
    if (!unsavedChanges.confirmLeave()) return;
    onFinish();
  };

  const handleSave = () => {
    if (!validateForOutput() || justificationPending()) return;
    const isEditing = !!initialPrescription;
    const finalPatientId = ensurePatientRecord();
    const newPrescription: Prescription = {
      id: isEditing ? initialPrescription.id : Date.now().toString(),
      patientId: finalPatientId,
      date: isEditing ? initialPrescription.date : new Date().toISOString().split('T')[0],
      items, amount,
      patientType: patient.type as PatientType,
      patientAge: patient.age, patientWeight: patient.weight,
    };
    persistContext(finalPatientId);
    if (isEditing) dataService.updatePrescription(newPrescription);
    else dataService.savePrescription(newPrescription);
    if (selectedTests.length > 0) {
      dataService.saveLabRequest({
        id: `lab-${Date.now()}`, patientId: finalPatientId, date: newPrescription.date,
        title: 'Bilan Consultation', tests: selectedTests, status: 'REQUESTED',
      });
    }
    if (selectedPatientId) {
      dataService.deleteFromQueue(selectedPatientId);
      dataService.markAppointmentDone(selectedPatientId);
    }
    unsavedChanges.set('consultation', false);
    onFinish();
  };

  const handleExportPDF = () => {
    if (!validateForOutput() || justificationPending()) return;
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
      pagebreak: { mode: 'avoid-all' },
    };
    toastService.info("Génération de l'ordonnance PDF...");
    html2pdf().set(opt).from(element).save()
      .then(() => {
        toastService.success(useCombinedPrint ? 'Consultation complète enregistrée !' : 'Ordonnance enregistrée !');
        handleSave();
      })
      .catch((err: any) => {
        console.error('Prescription PDF Error:', err);
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
        <div
          className={`w-full ${wide ? 'lg:w-[540px]' : 'lg:w-[420px]'} shrink-0 lg:sticky lg:top-[76px] h-fit rounded-xl overflow-hidden bg-white border flex justify-center items-start`}
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          {useCombinedPrint ? (
            <CombinedConsultationTemplate doctor={doctor} appearance={appearance} patient={patient} items={items} tests={getGroupedTests()} scale={0.17} />
          ) : (
            <TemplateRenderer templateId={appearance.selectedTemplate} id={id} doctor={doctor} appearance={appearance} patient={{ name: patient.name || '', age: patient.age || 0, sex: (patient as any).sex, type: (patient.type as PatientType) || 'Adult' }} items={items} scale={previewScale} />
          )}
        </div>
      );
    }
    if (mode === 'export') {
      return (
        <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
          {useCombinedPrint
            ? <CombinedConsultationTemplate doctor={doctor} appearance={appearance} patient={patient} items={items} tests={getGroupedTests()} isPrinting={true} scale={0.32} />
            : <TemplateRenderer templateId={appearance.selectedTemplate} id={id} doctor={doctor} appearance={appearance} patient={{ name: patient.name || '', age: patient.age || 0, sex: (patient as any).sex, type: (patient.type as PatientType) || 'Adult' }} items={items} isPrinting={true} />}
        </div>
      );
    }
    // Print: the page must be a .document-print-container — index.css hides
    // everything else at print time. Sized and @page-d to the chosen format.
    const paper = appearance.paperSize === 'A5' && !useCombinedPrint ? 'A5' : 'A4';
    return (
      <div className={`document-print-container print-${paper.toLowerCase()} print-page overflow-hidden bg-white`}>
        <style>{`@media print { @page { size: ${paper} portrait; margin: 0; } }`}</style>
        {useCombinedPrint ? (
          <div style={{ transform: 'scale(0.32)', transformOrigin: 'top left' }}>
            <CombinedConsultationTemplate doctor={doctor} appearance={appearance} patient={patient} items={items} tests={getGroupedTests()} isPrinting={true} />
          </div>
        ) : (
          <TemplateRenderer templateId={appearance.selectedTemplate} id={id} doctor={doctor} appearance={appearance} patient={{ name: patient.name || '', age: patient.age || 0, sex: (patient as any).sex, type: (patient.type as PatientType) || 'Adult' }} items={items} isPrinting={true} fitPaper />
        )}
      </div>
    );
  };

  // Largeur réelle de la colonne formulaire (avec ou sans sidebar) : décide de la mise en page des blocs.
  const formRef = useRef<HTMLDivElement>(null);
  const [formWidth, setFormWidth] = useState(900);
  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setFormWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const roomy = formWidth >= 640;

  // ─── Choix du patient ───
  const blankPatient = (name = ''): Partial<Patient> => ({
    name, age: 0, sex: undefined, type: 'Adult', weight: '', phone: '', consultationFee: 0,
    isPregnant: false, isBreastfeeding: false, pregnancyWeeks: 0, lactationMonths: 0,
    ...withContext({}, { allergyList: [], pathologyList: [], noKnownAllergy: undefined, renalStage: undefined }),
  });
  const pickPatient = (p: Patient) => {
    selectFromPatientData(dataService.getPatientProfile(p.id) ?? p);
    setAmount((dataService.getPatientProfile(p.id) ?? p).consultationFee || 200);
    medInputRef.current?.focus();
  };
  const startNewPatient = (typed: string) => {
    setSelectedPatientId(null);
    setPatient(blankPatient(typed));
    setPatientMode('new');
    setTouched(true);
  };
  const clearPatient = () => {
    setSelectedPatientId(null);
    setPatient(blankPatient());
    setPatientMode('search');
    setTouched(true);
  };

  // ─── Champs obligatoires : sexe ; poids en pédiatrie (< 15 ans) ───
  const ageYears = patient.age || 0;
  const weightNeeded = (ageYears > 0 && ageYears < 15) || patient.type === 'Child';
  const weightValue = parseFloat(String(patient.weight || '').replace(',', '.').replace(/[^0-9.]/g, ''));
  const sexMissing = !patient.sex;
  const weightMissing = weightNeeded && !(weightValue > 0);
  const [attempted, setAttempted] = useState(false);
  const showSexError = attempted && sexMissing;
  const showWeightError = attempted && weightMissing;

  const duplicateName = patientMode === 'new' && !selectedPatientId && !!(patient.name || '').trim()
    && !!dataService.getAllPatients().find(p => p.name.trim().toUpperCase() === (patient.name || '').trim().toUpperCase());

  /** Patient sélectionné ; pour un « nouveau patient », son dossier est créé ici (médecin uniquement). */
  const ensurePatientRecord = (): string => {
    if (selectedPatientId) return selectedPatientId;
    const name = (patient.name || '').trim();
    if (!name || !sessionService.isMedecin()) return name;
    const record: Patient = {
      id: Date.now().toString(), name, age: patient.age || 0, sex: patient.sex as 'M' | 'F',
      type: (patient.type as PatientType) || 'Adult', phone: patient.phone, weight: patient.weight,
      consultationFee: patient.consultationFee, registeredDate: new Date().toISOString(),
    };
    dataService.savePatientProfile(record);
    return record.id;
  };

  /** Bloque enregistrement, impression et PDF tant que le sexe (et le poids en pédiatrie) manquent. */
  const validateForOutput = (): boolean => {
    const problems: string[] = [];
    if (sexMissing) problems.push('le sexe du patient');
    if (weightMissing) problems.push('le poids (obligatoire en pédiatrie)');
    if (duplicateName) {
      toastService.error('Un patient de ce nom existe déjà : sélectionnez-le avec la recherche.');
      return false;
    }
    if (problems.length === 0) return true;
    setAttempted(true);
    toastService.error(`Renseignez ${problems.join(' et ')}.`);
    document.getElementById(sexMissing ? 'field-sex' : 'field-weight')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    (document.getElementById(sexMissing ? 'field-sex' : 'field-weight')?.querySelector('button') as HTMLElement | null)?.focus();
    return false;
  };

  const handlePrint = () => { if (validateForOutput()) window.print(); };

  // ═══════════════════════════ RENDER ═══════════════════════════
  const criticalWarnings = aiWarnings.filter(w => w.severity === 'CRITIQUE');
  const attentionWarnings = aiWarnings.filter(w => w.severity === 'ATTENTION');
  const itemHasCritical = (itemId?: string) =>
    !!itemId && criticalWarnings.some(w => w.itemId === itemId);
  const itemHasAttention = (itemId?: string) =>
    !!itemId && attentionWarnings.some(w => w.itemId === itemId);

  return (
    <div className="w-full max-w-[1760px] mx-auto flex flex-col gap-5 pb-10" style={{ color: 'var(--color-text)' }}>
      {/* ═══ Override modal ═══ */}
      {overrideModal.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl p-7 max-w-md w-full" style={{ boxShadow: 'var(--shadow-premium)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: 'var(--color-danger)' }}>
                <ShieldX size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold mb-0.5" style={{ color: 'var(--color-text)' }}>Passer outre cette alerte</h3>
                <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Indiquez la justification clinique. Cette action sera enregistrée dans le journal d'audit.</p>
              </div>
            </div>
            <textarea
              value={overrideModal.reason}
              onChange={e => setOverrideModal({ ...overrideModal, reason: e.target.value })}
              placeholder="Justification clinique..."
              className="w-full px-3 py-2.5 bg-white border rounded-md text-[14px] outline-none resize-none h-28 mb-4 transition-all"
              style={{ borderColor: 'var(--color-border)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setOverrideModal({ isOpen: false, notificationId: '', reason: '' })}
                className="flex-1 h-10 px-4 rounded-lg text-[13px] font-medium border transition-all hover:bg-slate-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleOverrideWarning(overrideModal.notificationId, overrideModal.reason)}
                disabled={!overrideModal.reason.trim()}
                className="flex-1 h-10 px-4 rounded-lg text-[13px] font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--color-danger)' }}
              >
                Confirmer l'override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ En-tête compact de consultation ═══ */}
      <header
        className="sticky top-0 z-30 -mx-7 -mt-6 px-7 py-2.5 flex items-center justify-between gap-3 border-b print:hidden"
        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-pressed={!!sidebarShown}
              aria-label={sidebarShown ? 'Masquer le menu' : 'Afficher le menu'}
              title={sidebarShown ? 'Masquer le menu' : 'Afficher le menu'}
              className="w-10 h-10 shrink-0 rounded-lg border bg-white flex items-center justify-center hover:bg-slate-50 transition-all"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              {sidebarShown ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          )}
          <button
            type="button"
            onClick={handleBack}
            className="h-10 px-3 shrink-0 rounded-lg border bg-white flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap hover:bg-slate-50 transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <ArrowLeft size={15} className={dir === 'rtl' ? 'rotate-180' : ''} /> Retour
          </button>
          <div className="min-w-0 pl-1">
            <h1 className="text-[16px] font-semibold tracking-tight truncate" style={{ color: 'var(--color-text)' }} title={patient.name || undefined}>
              {patient.name || (initialPrescription ? 'Modification' : 'Nouvelle consultation')}
            </h1>
            {patient.name && (
              <div className="text-[11px] truncate" style={{ color: 'var(--color-text-subtle)' }}>
                {initialPrescription ? 'Modification' : 'Nouvelle consultation'}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePrint}
            disabled={items.length === 0}
            className="h-10 px-4 rounded-lg text-[13px] font-medium whitespace-nowrap border bg-white flex items-center gap-2 transition-all hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <Printer size={15} /> {t('print')}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={items.length === 0}
            className="h-10 px-4 rounded-lg text-[13px] font-medium whitespace-nowrap border bg-white flex items-center gap-2 transition-all hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <FileDigit size={15} /> PDF
          </button>
          <button
            onClick={handleSave}
            className="h-10 px-5 rounded-lg text-[13px] font-medium whitespace-nowrap flex items-center gap-2 text-white shadow-soft transition-all hover:shadow-card active:scale-[0.98]"
            style={{ background: 'var(--color-primary)' }}
          >
            <Save size={15} /> {t('save')}
          </button>
        </div>
      </header>

      {/* ═══════════════ ALERTS ═══════════════ */}
      <div className="flex flex-col gap-3 print:hidden">
        {/* 🚨 CRITICAL — pulsing red banner */}
        {criticalWarnings.map(alert => (
          <div
            key={alert.id}
            className="alert-pulse rounded-xl border-2 p-5 flex items-start gap-4 bg-white"
            style={{ borderColor: 'var(--color-danger)' }}
          >
            <div className="w-11 h-11 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: 'var(--color-danger)' }}>
              <ShieldAlert size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white"
                  style={{ background: 'var(--color-danger)', letterSpacing: '0.1em' }}
                >
                  Critique
                </span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-danger-700)' }}>
                  {alert.type === 'ENFANT_INTERDIT' ? 'Contre-indication pédiatrique'
                   : alert.type === 'CONTRE_INDICATION' ? 'Contre-indication'
                   : alert.type === 'INTERACTION' ? 'Interaction critique'
                   : 'Règle de sécurité'}
                </span>
              </div>
              <div className="text-[15px] font-semibold mb-1" style={{ color: 'var(--color-danger-700)' }}>
                {alert.title}
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-danger-700)' }}>
                {alert.message}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {alert.itemId && (
                <button
                  onClick={() => removeItem(alert.itemId!)}
                  className="h-10 px-5 rounded-lg text-[13px] font-semibold text-white transition-all"
                  style={{ background: 'var(--color-danger)' }}
                >
                  Retirer le médicament
                </button>
              )}
              {alert.canOverride && (
                <button
                  onClick={() => setOverrideModal({ isOpen: true, notificationId: alert.id, reason: '' })}
                  className="h-10 px-5 rounded-lg text-[13px] font-medium border transition-all"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger-700)', background: 'rgba(255,255,255,0.7)' }}
                >
                  Passer outre…
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 🟡 ATTENTION — amber warnings */}
        {attentionWarnings.length > 0 && (
          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--color-warning-50)', borderColor: 'var(--color-warning)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: 'var(--color-warning-hover)' }}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white" style={{ background: 'var(--color-warning-hover)', letterSpacing: '0.1em' }}>Attention</span>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-warning-800)' }}>
                    {attentionWarnings.length} avertissement{attentionWarnings.length > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[13px]" style={{ color: 'var(--color-warning-800)' }}>
                  Vérifications cliniques à examiner avant validation.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {attentionWarnings.map(alert => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-md bg-white border"
                  style={{ borderColor: 'var(--color-warning-100)' }}
                >
                  <AlertTriangle size={15} style={{ color: 'var(--color-warning-hover)' }} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--color-warning-800)' }}>{alert.title}</div>
                    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-warning-800)' }}>{alert.message}</p>
                  </div>
                  {alert.canOverride && (
                    <button
                      onClick={() => setOverrideModal({ isOpen: true, notificationId: alert.id, reason: '' })}
                      className="h-8 px-3 rounded-md text-[11px] font-medium border transition-all bg-white shrink-0"
                      style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning-800)' }}
                    >
                      Passer outre
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI pediatric notes (assistive) */}
        {pediatricAlerts.length > 0 && (
          <div className="rounded-xl border p-5" style={{ background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-100)' }}>
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit size={16} style={{ color: 'var(--color-primary)' }} />
              <div className="text-[13px] font-semibold" style={{ color: 'var(--color-primary)' }}>Analyse assistée — notes pédiatriques</div>
            </div>
            <div className="space-y-1.5">
              {pediatricAlerts.map((alert, i) => (
                <div key={i} className="text-[13px] flex gap-2 items-start" style={{ color: 'var(--color-primary)' }}>
                  <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-primary)' }} />
                  <span>{alert}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════ MAIN 2-COL LAYOUT ═══════════════ */}
      <div className="flex flex-col lg:flex-row gap-5">
        <div ref={formRef} className="flex-1 space-y-5 print:hidden min-w-0">

          {/* ─── PATIENT CARD ─── */}
          <section className={`${card} p-6 space-y-5`} style={cardStyle}>
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>Contexte patient</h2>
            </div>

            <div className="space-y-3">
              <div>
                {patientMode === 'new' && !selectedPatientId ? (
                  <div>
                    <label className={labelEyebrow} style={labelEyebrowStyle} htmlFor="new-patient-name">Nouveau patient</label>
                    <input
                      id="new-patient-name"
                      type="text"
                      value={patient.name || ''}
                      onChange={e => updatePatient({ ...patient, name: e.target.value })}
                      className={input40} style={inputStyle}
                      placeholder="NOM Prénom"
                      autoFocus
                    />
                    <button type="button" onClick={() => setPatientMode('search')}
                      className="mt-1 text-[11px] font-medium whitespace-nowrap hover:underline" style={{ color: 'var(--color-primary)' }}>
                      ← Rechercher un patient existant
                    </button>
                  </div>
                ) : (
                  <PatientPicker
                    label="Patient"
                    placeholder="Rechercher par nom ou téléphone…"
                    patients={dataService.getAllPatients()}
                    queue={dataService.getTodayQueue()}
                    selected={selectedPatientId ? { id: selectedPatientId, name: patient.name || '', phone: patient.phone } : null}
                    onSelect={pickPatient}
                    onNew={startNewPatient}
                    onClear={clearPatient}
                  />
                )}
              </div>

              {patientMode === 'new' && !selectedPatientId && (
                <div>
                  <label className={labelEyebrow} style={labelEyebrowStyle} htmlFor="new-patient-phone">Téléphone</label>
                  <input
                    id="new-patient-phone"
                    type="tel"
                    value={patient.phone || ''}
                    onChange={e => updatePatient({ ...patient, phone: e.target.value })}
                    className={input40} style={inputStyle}
                    placeholder="06 00 00 00 00"
                  />
                </div>
              )}

              <div className="grid gap-3 grid-cols-[88px_minmax(0,1fr)_120px]">
              <div>
                <label className={`${labelEyebrow} whitespace-nowrap`} style={labelEyebrowStyle} htmlFor="patient-age">{t('age')}</label>
                <input
                  id="patient-age"
                  type="number"
                  min={0}
                  max={120}
                  value={patient.age || ''}
                  onChange={e => updatePatient({ ...patient, age: parseInt(e.target.value) || 0 })}
                  className={input40} style={inputStyle}
                />
              </div>

              <fieldset className="min-w-0" aria-required="true" aria-invalid={showSexError}>
                <legend className={labelEyebrow} style={{ ...labelEyebrowStyle, color: showSexError ? 'var(--color-danger-700)' : 'var(--color-text-subtle)' }}>
                  Sexe <span aria-hidden="true">*</span>
                </legend>
                <div id="field-sex" className="flex gap-2" role="radiogroup" aria-label="Sexe">
                  {([['M', 'Homme'], ['F', 'Femme']] as const).map(([value, text]) => {
                    const on = patient.sex === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => updatePatient({ ...patient, sex: value })}
                        className="flex-1 h-10 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap transition-all"
                        style={on
                          ? { background: 'var(--color-primary)', color: 'white', borderColor: 'var(--color-primary)' }
                          : { background: 'white', color: 'var(--color-text-muted)', borderColor: showSexError ? 'var(--color-danger)' : 'var(--color-border)' }}
                      >
                        {text}
                      </button>
                    );
                  })}
                </div>
                {showSexError && <p className="mt-1 text-[11px] whitespace-nowrap" role="alert" style={{ color: 'var(--color-danger-700)' }}>Sexe obligatoire</p>}
              </fieldset>

              <div>
                <label className={`${labelEyebrow} whitespace-nowrap`} style={{ ...labelEyebrowStyle, color: showWeightError ? 'var(--color-danger-700)' : weightNeeded ? 'var(--color-warning-hover)' : 'var(--color-text-subtle)' }} htmlFor="field-weight">
                  Poids (kg){weightNeeded && <span aria-hidden="true"> *</span>}
                </label>
                <input
                  id="field-weight"
                  type="text"
                  inputMode="decimal"
                  value={patient.weight || ''}
                  onChange={e => updatePatient({ ...patient, weight: e.target.value })}
                  className={input40}
                  style={{ ...inputStyle, borderColor: showWeightError ? 'var(--color-danger)' : weightNeeded ? 'var(--color-warning-hover)' : 'var(--color-border)' }}
                  placeholder="Ex : 75"
                  aria-required={weightNeeded}
                  aria-invalid={showWeightError}
                />
                {weightNeeded && (
                  <p className="mt-1 text-[11px] whitespace-nowrap" role={showWeightError ? 'alert' : undefined} style={{ color: showWeightError ? 'var(--color-danger-700)' : 'var(--color-warning-hover)' }}>
                    Obligatoire en pédiatrie
                  </p>
                )}
              </div>

              </div>
            </div>

            {/* Allergies + pathologies */}
            <div className={`grid gap-3 ${roomy ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Allergies */}
              <div className="p-4 rounded-lg border space-y-3" style={{ background: 'var(--color-danger-50)', borderColor: 'var(--color-danger-100)' }}>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-danger-700)', letterSpacing: '0.06em' }}>
                    <AlertCircle size={11} /> {t('allergies')}
                  </label>
                  <button
                    type="button"
                    aria-pressed={!!patient.noKnownAllergy}
                    disabled={(patient.allergyList || []).length > 0}
                    title={(patient.allergyList || []).length > 0 ? 'Retirez les allergies saisies pour déclarer « aucune »' : undefined}
                    onClick={() => updatePatient(withContext(patient, { noKnownAllergy: !patient.noKnownAllergy }))}
                    className="h-7 px-2.5 shrink-0 rounded-md text-[11px] font-medium whitespace-nowrap flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={patient.noKnownAllergy
                      ? { background: 'var(--color-success, #2F855A)', color: 'white' }
                      : { background: 'white', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                  >
                    <ShieldCheck size={11} /> Aucune allergie connue
                  </button>
                </div>
                <ContextTagInput
                  kind="allergy"
                  tone="danger"
                  ariaLabel={t('allergies')}
                  placeholder="Pénicilline, AINS, latex…"
                  specialty={specialty}
                  entries={patient.allergyList || []}
                  onChange={(list: ContextEntry[]) => updatePatient(withContext(patient, { allergyList: list }))}
                  renderChipExtra={(entry: ContextEntry, index: number) => (
                    <select
                      aria-label={`Réaction à ${entry.label}`}
                      value={entry.reaction || ''}
                      onChange={e => updatePatient(withContext(patient, {
                        allergyList: (patient.allergyList || []).map((a, i) => i === index ? { ...a, reaction: (e.target.value || undefined) as AllergyReaction | undefined } : a),
                      }))}
                      className="h-5 rounded border text-[11px] bg-white outline-none"
                      style={{ borderColor: 'var(--color-danger-100)', color: 'var(--color-text-muted)' }}
                    >
                      <option value="">réaction ?</option>
                      <option value="eruption">éruption</option>
                      <option value="oedeme">œdème</option>
                      <option value="anaphylaxie">anaphylaxie</option>
                      <option value="inconnue">inconnue</option>
                    </select>
                  )}
                />
                <p className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                  {patient.noKnownAllergy
                    ? 'Aucune allergie connue (déclaré).'
                    : (patient.allergyList || []).length === 0 ? 'Non renseigné.' : 'Réaction anaphylactique : toute prescription de la même famille exige une justification.'}
                </p>
                {patient.sex === 'F' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { const next = { ...patient, isPregnant: !patient.isPregnant }; updatePatient(next); runSafetyChecks(items, next); }}
                        className="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all"
                        style={patient.isPregnant
                          ? { background: 'var(--color-warning-hover)', color: 'white' }
                          : { background: 'white', color: 'var(--color-text-muted)', border: `1px solid var(--color-border)` }}
                      >
                        <Zap size={11} /> {t('pregnant')}
                      </button>
                      {patient.isPregnant && (
                        <input
                          type="number" value={patient.pregnancyWeeks || ''}
                          onChange={e => { const next = { ...patient, pregnancyWeeks: parseInt(e.target.value) || 0 }; updatePatient(next); runSafetyChecks(items, next); }}
                          placeholder="sem."
                          className="w-14 h-8 px-2 rounded-md border text-[12px] font-medium outline-none bg-white"
                          style={{ borderColor: 'var(--color-warning-100)' }}
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { const next = { ...patient, isBreastfeeding: !patient.isBreastfeeding }; updatePatient(next); runSafetyChecks(items, next); }}
                        className="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all"
                        style={patient.isBreastfeeding
                          ? { background: 'var(--color-warning-hover)', color: 'white' }
                          : { background: 'white', color: 'var(--color-text-muted)', border: `1px solid var(--color-border)` }}
                      >
                        <Baby size={11} /> {t('breastfeeding')}
                      </button>
                      {patient.isBreastfeeding && (
                        <input
                          type="number" value={patient.lactationMonths || ''}
                          onChange={e => { const next = { ...patient, lactationMonths: parseInt(e.target.value) || 0 }; updatePatient(next); runSafetyChecks(items, next); }}
                          placeholder="mois"
                          className="w-14 h-8 px-2 rounded-md border text-[12px] font-medium outline-none bg-white"
                          style={{ borderColor: 'var(--color-warning-100)' }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Pathologies */}
              <div className="p-4 rounded-lg border space-y-3" style={{ background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' }}>
                <label className="text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>
                  <Activity size={11} /> {t('pathologies')}
                </label>
                <ContextTagInput
                  kind="pathology"
                  ariaLabel={t('pathologies')}
                  placeholder="HTA, diabète, insuffisance cardiaque…"
                  specialty={specialty}
                  entries={patient.pathologyList || []}
                  onChange={(list: ContextEntry[]) => updatePatient(withContext(patient, { pathologyList: list }))}
                />
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: 'cardiac', icon: Heart, label: t('heart_patient') },
                    { key: 'renal', icon: FlaskConical, label: t('kidney_patient') },
                    { key: 'hepatic', icon: Activity, label: t('liver_patient') },
                  ] as Array<{ key: ShortcutKey; icon: typeof Heart; label: string }>).map(({ key, icon: Icon, label }) => {
                    const isOn = shortcutActive(patient, key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={isOn}
                        onClick={() => updatePatient(toggleShortcut(patient, key))}
                        className="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all"
                        style={isOn
                          ? { background: 'var(--color-primary)', color: 'white' }
                          : { background: 'white', color: 'var(--color-text-muted)', border: `1px solid var(--color-border)` }}
                      >
                        <Icon size={11} /> {label}
                      </button>
                    );
                  })}
                </div>
                {deriveProfileFlags(patient.pathologyList).isKidneyPatient && (
                  <fieldset className="flex flex-wrap items-center gap-1.5">
                    <legend className="sr-only">Stade rénal (DFG)</legend>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>DFG (mL/min) :</span>
                    {([['ge60', '≥ 60'], ['30-59', '30–59'], ['15-29', '15–29'], ['lt15', '< 15']] as Array<[RenalStage, string]>).map(([value, text]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={patient.renalStage === value}
                        onClick={() => updatePatient(withContext(patient, { renalStage: patient.renalStage === value ? undefined : value }))}
                        className="h-7 px-2.5 rounded-md text-[11px] font-medium transition-all"
                        style={patient.renalStage === value
                          ? { background: 'var(--color-primary)', color: 'white' }
                          : { background: 'white', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                      >
                        {text}
                      </button>
                    ))}
                    {!patient.renalStage && <span className="text-[11px]" style={{ color: 'var(--color-warning-hover)' }}>stade à préciser</span>}
                  </fieldset>
                )}
              </div>
            </div>
            {patient.contextUpdatedAt && (
              <p className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                Allergies et pathologies mis à jour le {new Date(patient.contextUpdatedAt).toLocaleDateString('fr-FR')}
                {patient.contextUpdatedBy ? ` par ${patient.contextUpdatedBy}` : ''}.
              </p>
            )}
          </section>

          {/* ─── MEDICATION CARD ─── */}
          <section className={`${card} p-6`} style={cardStyle}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                <h2 className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>Médicaments</h2>
                {items.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded text-[11px] font-medium tabular-nums" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                    {items.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsSmartMode(!isSmartMode)}
                className="h-9 px-3.5 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all"
                style={isSmartMode
                  ? { background: 'var(--color-primary)', color: 'white' }
                  : { background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}
              >
                <Zap size={13} className={isSmartMode ? 'fill-white' : ''} />
                {t('smart_mode')}
              </button>
            </div>

            <div className="relative mb-5">
              {isSmartMode ? (
                <div className="space-y-3">
                  <textarea
                    value={smartPrompt}
                    onChange={e => setSmartPrompt(e.target.value)}
                    placeholder={t('smart_mode_desc')}
                    className="w-full h-32 p-4 border rounded-lg text-[14px] outline-none resize-none transition-all"
                    style={{ borderColor: 'var(--color-primary-100)', background: 'var(--color-primary-50)' }}
                  />
                  <button
                    disabled={isParsing || !smartPrompt.trim()}
                    onClick={handleSmartParse}
                    className="w-full h-11 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {isParsing ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
                    <span className="text-[14px]">{isParsing ? t('parsing_in_progress') : t('smart_parse_btn')}</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      size={18}
                      className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 transition-colors`}
                      style={{ color: medicineSearch ? 'var(--color-primary)' : 'var(--color-text-faint)' }}
                    />
                    <input
                      ref={medInputRef}
                      type="text"
                      value={medicineSearch}
                      onChange={e => handleMedSearch(e.target.value)}
                      placeholder={t('search_med_placeholder')}
                      className={`w-full h-12 ${dir === 'rtl' ? 'pr-12 pl-12' : 'pl-12 pr-12'} border rounded-lg text-[14px] outline-none transition-all`}
                      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}
                    />
                    {(medicineSearch || selectedCategory !== 'Tous') && (
                      <button
                        onClick={() => { setMedicineSearch(''); setSelectedCategory('Tous'); setSuggestions([]); }}
                        className={`absolute ${dir === 'rtl' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center transition-all hover:bg-slate-100`}
                        style={{ color: 'var(--color-text-faint)' }}
                      >
                        <CloseX size={15} />
                      </button>
                    )}
                  </div>

                  {suggestions.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg z-50 overflow-hidden max-h-[440px] flex flex-col"
                      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}
                    >
                      <div
                        className="px-4 py-2 border-b flex items-center justify-between"
                        style={{ background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' }}
                      >
                        <span className="text-[12px] font-medium flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                          <Pill size={13} style={{ color: 'var(--color-primary)' }} />
                          {suggestions.length} {t('results').toLowerCase()}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>
                          {t('suggestions')}
                        </span>
                      </div>
                      <div className="overflow-y-auto p-2 flex-1">
                        {suggestions.map((m, idx) => (
                          <button
                            key={m.id || idx}
                            onClick={() => addItem(m)}
                            className="w-full text-left p-3 rounded-md transition-all flex items-start gap-3 hover:bg-[var(--color-row-hover)]"
                          >
                            <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-subtle)' }}>
                              <Pill size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center gap-2 mb-1">
                                <h4 className="text-[14px] font-semibold leading-tight truncate" style={{ color: 'var(--color-text)' }}>
                                  {m.name.split(new RegExp(`(${medicineSearch})`, 'gi')).map((part, i) =>
                                    part.toLowerCase() === medicineSearch.toLowerCase() ? (
                                      <span key={i} className="rounded px-0.5" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>{part}</span>
                                    ) : part
                                  )}
                                </h4>
                                <ChevronRight size={14} className={`shrink-0 ${dir === 'rtl' ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-faint)' }} />
                              </div>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                                  {m.category ? (lang === 'ar' ? (t(m.category.toLowerCase()) || m.category) : m.category) : t('medicine')}
                                </span>
                                {m.form && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>
                                    {m.form}
                                  </span>
                                )}
                                {m.strength && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>
                                    {m.strength}
                                  </span>
                                )}
                                {m.defaultDosage && (
                                  <span className="text-[11px] truncate max-w-[260px]" style={{ color: 'var(--color-text-subtle)' }}>
                                    Posologie type&nbsp;: {m.defaultDosage}
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
                    <div
                      className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg z-50 p-7 text-center"
                      style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}
                    >
                      <h4 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{t('no_med_found')}</h4>
                      <p className="text-[12px] mb-4" style={{ color: 'var(--color-text-subtle)' }}>Aucun résultat pour « {medicineSearch} »</p>
                      <button
                        onClick={() => addItem({ id: Date.now().toString(), name: medicineSearch, category: 'Autre', defaultDosage: '', defaultTiming: 'Indifférent' })}
                        className="h-9 px-4 rounded-md text-[12px] font-medium text-white inline-flex items-center gap-2 transition-all"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        <Plus size={13} /> {t('add_new_med')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Items */}
            <div className="space-y-3">
              {items.length === 0 && !isSmartMode && (
                <div className="py-10 text-center">
                  <div
                    className="w-12 h-12 mx-auto mb-3 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-faint)' }}
                  >
                    <Pill size={20} />
                  </div>
                  <p className="text-[13px] font-medium mb-0.5" style={{ color: 'var(--color-text)' }}>Aucun médicament</p>
                  <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Recherchez ci-dessus pour ajouter un traitement.</p>
                </div>
              )}

              {items.map((item, index) => {
                const isCritical = itemHasCritical(item.id);
                const isAttention = itemHasAttention(item.id);
                const itemBorderColor = isCritical
                  ? 'var(--color-danger)'
                  : isAttention ? 'var(--color-warning)' : 'var(--color-border)';
                const itemBg = isCritical
                  ? 'var(--color-danger-50)'
                  : isAttention ? 'var(--color-warning-50)' : 'var(--color-surface-alt)';
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border p-4 relative transition-all"
                    style={{ borderColor: itemBorderColor, background: itemBg, borderWidth: isCritical ? '2px' : '1px' }}
                  >
                    <button
                      onClick={() => removeItem(item.id)}
                      className={`absolute top-3 ${dir === 'rtl' ? 'left-3' : 'right-3'} w-8 h-8 rounded-md flex items-center justify-center hover:bg-white transition-all`}
                      style={{ color: 'var(--color-text-faint)' }}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={15} />
                    </button>

                    <div className="mb-3 pr-10">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--color-text-faint)' }}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>{item.medicineName}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}>
                          {item.category ? (lang === 'ar' ? (t(item.category.toLowerCase()) || item.category) : item.category) : t('medicine')}
                          {item.form && ` · ${item.form}`}
                          {item.strength && ` · ${item.strength}`}
                        </span>
                        {isCritical && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1" style={{ background: 'var(--color-danger)', letterSpacing: '0.08em' }}>
                            <XCircle size={11} /> Contre-indiqué
                          </span>
                        )}
                        {isAttention && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white flex items-center gap-1" style={{ background: 'var(--color-warning-hover)', letterSpacing: '0.08em' }}>
                            <AlertTriangle size={11} /> Vérifier
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]" style={{ color: 'var(--color-primary)' }}>
                        {item.dosage && <span className="font-medium">{item.dosage}</span>}
                        {item.timing && item.timing !== 'Indifférent' && (<><span>·</span><span>{item.timing}</span></>)}
                        {item.duration && (<><span>·</span><span>{lang === 'ar' ? 'لمدة' : 'pendant'} {item.duration}</span></>)}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <div className="flex justify-between items-center mb-1">
                          <p className={labelEyebrow} style={{ ...labelEyebrowStyle, marginBottom: 0 }}>{t('dosage')}</p>
                          {item.referenceDosage && item.dosage !== item.referenceDosage && (
                            <button
                              onClick={() => setItems(items.map(i => i.id === item.id ? { ...i, dosage: item.referenceDosage! } : i))}
                              className="text-[11px] font-medium flex items-center gap-1 transition-colors"
                              style={{ color: 'var(--color-primary)' }}
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
                            const lv = val.toLowerCase();
                            if (lv.includes('apres repas') || lv.includes('après repas')) {
                              newTiming = 'Après repas'; newDosage = val.replace(/apres repas|après repas/gi, '').trim();
                            } else if (lv.includes('avant repas')) {
                              newTiming = 'Avant repas'; newDosage = val.replace(/avant repas/gi, '').trim();
                            } else if (lv.includes('pendant repas')) {
                              newTiming = 'Pendant repas'; newDosage = val.replace(/pendant repas/gi, '').trim();
                            } else if (lv.includes('indifferent') || lv.includes('indifférent')) {
                              newTiming = 'Indifférent'; newDosage = val.replace(/indifferent|indifférent/gi, '').trim();
                            }
                            setItems(items.map(i => i.id === item.id ? { ...i, dosage: newDosage, timing: newTiming } : i));
                          }}
                          className={input40} style={inputStyle}
                          placeholder={t('dosage_placeholder')}
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {['1-0-0', '0-1-0', '0-0-1', '1-0-1', '1-1-1', '2-0-2'].map(q => (
                            <button
                              key={q}
                              onClick={() => setItems(items.map(i => i.id === item.id ? { ...i, dosage: q } : i))}
                              className="h-7 px-2 rounded-md text-[11px] font-medium tabular-nums transition-all hover:bg-[var(--color-primary-50)] bg-white border"
                              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                        {item.referenceDosage && (
                          <p className="mt-2 text-[11px] italic line-clamp-1" style={{ color: 'var(--color-text-faint)' }}>
                            Réf : {item.referenceDosage}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className={labelEyebrow} style={labelEyebrowStyle}>{t('duration')}</p>
                        <input
                          type="text" value={item.duration}
                          onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, duration: e.target.value } : i))}
                          className={input40} style={inputStyle}
                        />
                      </div>
                      <div>
                        <p className={labelEyebrow} style={labelEyebrowStyle}>{t('type')}</p>
                        <select
                          value={item.timing}
                          onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, timing: e.target.value as MealTiming } : i))}
                          className={input40} style={inputStyle}
                        >
                          {['Indifférent', 'Avant repas', 'Pendant repas', 'Après repas'].map(time => (
                            <option key={time} value={time}>{t(time.toLowerCase().replace(' ', '_')) || time}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── LAB ANALYSES PANEL ─── */}
          <section className={`${card} overflow-hidden`} style={cardStyle}>
            <button
              onClick={() => setIsAnalysesOpen(!isAnalysesOpen)}
              className="w-full px-6 py-4 flex items-center justify-between transition-all hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                  style={selectedTests.length > 0
                    ? { background: 'var(--color-secondary)', color: 'white' }
                    : { background: 'var(--color-surface-alt)', color: 'var(--color-text-subtle)' }}
                >
                  <FlaskConical size={16} />
                </div>
                <div className="text-left">
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                    {t('analyses')}
                    {selectedTests.length > 0 && (
                      <span className="ml-2 tabular-nums" style={{ color: 'var(--color-secondary)' }}>({selectedTests.length})</span>
                    )}
                  </div>
                  <div className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Examens biologiques à prescrire</div>
                </div>
              </div>
              <ChevronDown size={18} className={`transition-transform ${isAnalysesOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-faint)' }} />
            </button>

            {isAnalysesOpen && (
              <div className="px-6 pb-6 space-y-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="relative pt-4">
                  <Search size={15} className={`absolute ${dir === 'rtl' ? 'right-4' : 'left-4'} top-[26px] -translate-y-1/2`} style={{ color: 'var(--color-text-faint)' }} />
                  <input
                    type="text" placeholder="Rechercher une analyse..."
                    value={labSearchTerm}
                    onChange={e => setLabSearchTerm(e.target.value)}
                    className={`w-full h-10 ${dir === 'rtl' ? 'pr-11 pl-3' : 'pl-11 pr-3'} rounded-md border text-[13px] outline-none transition-all`}
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto pr-2 scrollbar-hide">
                  {COMMON_ANALYSES.map(cat => {
                    const filtered = cat.items.filter(i => i.toLowerCase().includes(labSearchTerm.toLowerCase()));
                    if (filtered.length === 0) return null;
                    return (
                      <div key={cat.category} className="space-y-1.5">
                        <h5 className="text-[10px] font-medium uppercase tracking-wider px-1" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>{cat.category}</h5>
                        <div className="space-y-1">
                          {filtered.map(test => {
                            const checked = selectedTests.includes(test);
                            return (
                              <button
                                key={test}
                                onClick={() => toggleTest(test)}
                                className="w-full text-left px-3 py-2 rounded-md text-[12px] transition-all flex items-center justify-between gap-2"
                                style={checked
                                  ? { background: 'var(--color-primary)', color: 'white', fontWeight: 500 }
                                  : { background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}
                              >
                                <span className="truncate flex-1">{test}</span>
                                {checked
                                  ? <CheckCircle2 size={13} className="shrink-0" />
                                  : <div className="w-3 h-3 border rounded-sm bg-white shrink-0" style={{ borderColor: 'var(--color-border-strong)' }} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ─── AUDIT TRAIL (derived from state — UI only) ─── */}
          {(items.length > 0 || overriddenWarnings.size > 0) && (
            <section className={`${card} p-6`} style={cardStyle}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                  <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                    <ScrollText size={14} /> Journal d'audit
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium tabular-nums" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>
                    {items.length + overriddenWarnings.size + (patient.name ? 1 : 0)} entrées
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {/* Override entries */}
                {[...overriddenWarnings].map((id, i) => (
                  <div key={id} className="flex items-start gap-3 p-3 rounded-md" style={{ background: 'var(--color-danger-50)' }}>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-white" style={{ background: 'var(--color-danger)' }}>
                      <ShieldX size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold" style={{ color: 'var(--color-danger-700)' }}>Override d'alerte</div>
                      <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Alerte de sécurité passée outre par le médecin.</p>
                    </div>
                  </div>
                ))}
                {/* Item additions */}
                {items.slice().reverse().slice(0, 4).map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-md" style={{ background: 'var(--color-surface-alt)' }}>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-white" style={{ color: 'var(--color-primary)' }}>
                      <Plus size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>Médicament ajouté</div>
                      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{item.medicineName} — {item.dosage || 'posologie non définie'}.</p>
                    </div>
                  </div>
                ))}
                {/* Patient selection */}
                {patient.name && (
                  <div className="flex items-start gap-3 p-3 rounded-md" style={{ background: 'var(--color-surface-alt)' }}>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-white" style={{ color: 'var(--color-primary)' }}>
                      <UserCircle size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>Patient sélectionné</div>
                      <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                        {patient.name}{selectedPatientId && ` (ID ${selectedPatientId})`}
                        {patient.age && ` — ${patient.age} ans`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ─── PRINT MODE TOGGLE (small footer) ─── */}
          <section
            className={`${card} px-5 py-3 flex items-center justify-between`}
            style={cardStyle}
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Mode d'impression :</span>
              <button
                onClick={() => setUseCombinedPrint(!useCombinedPrint)}
                disabled={selectedTests.length === 0}
                className="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={useCombinedPrint
                  ? { background: 'var(--color-secondary-50)', color: '#1F7B5C', border: '1px solid var(--color-secondary)' }
                  : { background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}
              >
                <FileDigit size={13} />
                {useCombinedPrint
                  ? (lang === 'ar' ? 'ورقة كاملة' : 'Feuille unique A4')
                  : (lang === 'ar' ? 'وصفة فقط' : 'Ordonnance seule')}
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
              <History size={13} />
              <span>Auto-sauvegarde activée</span>
            </div>
          </section>
        </div>

        {/* ═══ PREVIEW PANE ═══ */}
        <div className={`w-full ${wide ? 'lg:w-[560px]' : 'lg:w-[440px]'} shrink-0 print:hidden`}>
          <h3 className="text-[11px] font-medium uppercase tracking-wider mb-3 px-1 flex items-center gap-2" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>
            <FileText size={13} /> {lang === 'ar' ? 'معاينة' : 'Aperçu impression'}
          </h3>
          {!printing && renderPrescriptionPage('preview')}
        </div>
      </div>

      <div className="hidden print:block fixed inset-0 z-0 bg-white">{renderPrescriptionPage('print')}</div>
      {!printing && renderPrescriptionPage('export')}
    </div>
  );
};

export default PrescriptionEditor;
