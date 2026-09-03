
import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, FileText, Printer, Wallet, Activity, Filter, Trash2, ShieldCheck, Plus, X, AlertCircle, Phone, History, Edit2, LayoutDashboard, Syringe, FileText as FileTextIcon, Save, Pill, Droplet, ShieldAlert, ClipboardList, MapPin, HeartPulse, TrendingUp, TrendingDown, ArrowLeft } from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { Prescription, Patient, ClinicalConsultation, HonoraryNote } from '../types';
import PrescriptionView from './PrescriptionView';
import HonoraryNoteEditor from './HonoraryNoteEditor';
import HonoraryNoteTemplate from './HonoraryNoteTemplate';
import DossierOverview from './dossier/DossierOverview';
import ConsultationSection from './dossier/ConsultationSection';
import AnalysesSection from './dossier/AnalysesSection';
import ResultsSection from './dossier/ResultsSection';
import FinancesSection from './dossier/FinancesSection';
import VaccinationTab from './dossier/VaccinationTab';
import AntecedentsSection from './dossier/AntecedentsSection';
import VitalsSection from './dossier/VitalsSection';
import SmartDocInterface from './SmartDoc/SmartDocInterface';
import MedicalCertificateEditor from './MedicalCertificateEditor';
import MedicalCertificateTemplate from './MedicalCertificateTemplate';
import { printService } from '../services/printService';
import { vaccinationService } from '../services/vaccinationService';
import { drugRulesService } from '../services/drugRules';
import { getActiveTreatment } from '../utils/activeTreatment';
import { EMPTY_STATES } from '../constants/emptyStates';
// @ts-ignore
import { toastService } from '../services/toastService';
import { settingsService } from '../services/settingsService';
import { formatAge, formatNom } from '../utils/formatters';
import PatientsList from './PatientsList';

type DossierTab = 'overview' | 'consultation' | 'ordonnance' | 'analyses' | 'resultats' | 'vaccination' | 'antecedents' | 'constantes' | 'documents' | 'facture' | 'certificats';

const PatientDossier: React.FC<{ onNavigate?: (view: string, data?: any) => void, initialPatient?: Patient | null }> = ({ onNavigate, initialPatient }) => {
  const { t, dir } = useI18n();
  // Navigation & Filter State
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');

  // Selection States
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<ClinicalConsultation | null>(null);
  const [isAddingConsultation, setIsAddingConsultation] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isAddingCertificate, setIsAddingCertificate] = useState(false);
  const [selectedNote, setSelectedNote] = useState<HonoraryNote | null>(null);
  const [selectedCert, setSelectedCert] = useState<any | null>(null);

  // New Consultation Form State
  const [newConsultation, setNewConsultation] = useState<Partial<ClinicalConsultation>>({
    motif: '',
    symptoms: '',
    clinicalExam: '',
    diagnostic: '',
    treatmentPlan: '',
    notes: ''
  });

  // Data Sync
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('meddoc_data_update', handleUpdate);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate);
  }, []);

  useEffect(() => {
    if (initialPatient) {
      setSelectedPatientId(initialPatient.id);
      setActiveTab('overview');
    }
  }, [initialPatient]);

  // Data
  const doctor = dataService.getDoctorInfo();
  const allPrescriptions = useMemo(() => dataService.getPrescriptions(), [refreshTrigger]); // Fetch once or trigger updates
  const allPatients = useMemo(() => dataService.getAllPatients(), [refreshTrigger]);

  // --- Derived Data ---

  // Selected Patient Profile
  const selectedPatientProfile = useMemo(() => {
    if (!selectedPatientId) return null;
    return allPatients.find(p => p.id === selectedPatientId) || null;
  }, [selectedPatientId, allPatients]);

  // 3. Section Data
  const consultations = useMemo(() => selectedPatientProfile ? dataService.getConsultations(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const prescriptions = useMemo(() => selectedPatientProfile ? allPrescriptions.filter(p => p.patientId === selectedPatientProfile.id) : [], [selectedPatientProfile, allPrescriptions]);
  const labRequests = useMemo(() => selectedPatientProfile ? dataService.getLabRequests(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const results = useMemo(() => selectedPatientProfile ? dataService.getMedicalResults(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const honoraryNotes = useMemo(() => selectedPatientProfile ? dataService.getHonoraryNotes(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const certificates = useMemo(() => selectedPatientProfile ? dataService.getMedicalCertificates(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);

  // ── Bandeau critique (toujours visible) : traitement actif + alerte drugSafetyCheck.ts ──
  const prescriptionsDesc = useMemo(() => [...prescriptions].sort((a, b) => b.date.localeCompare(a.date)), [prescriptions]);
  const activeTreatment = useMemo(() => getActiveTreatment(prescriptionsDesc), [prescriptionsDesc]);
  // Passe obligatoirement par drugRulesService (→ drugSafetyCheck.ts) : jamais de logique
  // de sécurité parallèle. Vérifie le traitement actif du dossier contre le profil réel du patient.
  const activeTreatmentAlerts = useMemo(() => {
    if (!selectedPatientProfile || !activeTreatment?.items.length) return [];
    return drugRulesService.checkRules(selectedPatientProfile, activeTreatment.items);
  }, [selectedPatientProfile, activeTreatment]);
  const criticalAlertLevel: 'critique' | 'vigilance' | 'ok' = useMemo(() => {
    if (activeTreatmentAlerts.some(a => a.severity === 'CRITIQUE')) return 'critique';
    if (activeTreatmentAlerts.length > 0 || (selectedPatientProfile?.chronicDiseases?.length ?? 0) > 0) return 'vigilance';
    return 'ok';
  }, [activeTreatmentAlerts, selectedPatientProfile]);

  // Dernière/avant-dernière mesure de constantes, pour l'affichage tendance dans le bandeau
  const [latestVital, previousVital] = useMemo(() => {
    const history = [...(selectedPatientProfile?.vitalSigns || [])].sort((a, b) => a.date.localeCompare(b.date));
    return [history[history.length - 1], history[history.length - 2]];
  }, [selectedPatientProfile]);

  // Handlers
  const handleSelectPatient = (id: string, initialTab: DossierTab = 'overview', selectItem?: any) => {
    setSelectedPatientId(id);
    setActiveTab(initialTab);

    if (initialTab === 'ordonnance' && selectItem) {
      setSelectedPrescription(selectItem);
    } else {
      setSelectedPrescription(null);
    }

    setSelectedConsultation(null);
  };

  const clearPatientSelection = () => setSelectedPatientId(null);

  const handleExportCertPDF = async (cert: any) => {
    const element = document.getElementById('cert-preview-pdf');
    if (!element) return;

    const opt = {
      margin: 0,
      filename: `Certificat_${selectedPatientProfile?.name}_${cert.date}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: 'avoid-all' }
    };

    toastService.info("Génération du certificat PDF...");
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf().set(opt).from(element).save().then(() => toastService.success("Certificat enregistré !"));
  };

  const handleExportNotePDF = async (note: any) => {
    const element = document.getElementById('note-preview-pdf');
    if (!element) return;

    const opt = {
      margin: 0,
      filename: `Note_Honoraires_${selectedPatientProfile?.name}_${note.invoiceNumber}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: 'avoid-all' }
    };

    toastService.info("Génération de la note PDF...");
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf().set(opt).from(element).save().then(() => toastService.success("Note enregistrée !"));
  };

  const handleSaveConsultation = () => {
    if (!selectedPatientProfile) return;
    const cons: ClinicalConsultation = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      patientId: selectedPatientProfile.id,
      motif: newConsultation.motif || '',
      symptoms: newConsultation.symptoms || '',
      clinicalExam: newConsultation.clinicalExam || '',
      diagnostic: newConsultation.diagnostic || '',
      treatmentPlan: newConsultation.treatmentPlan || '',
      notes: newConsultation.notes || '',
    };
    dataService.saveConsultation(cons);
    setIsAddingConsultation(false);
    setNewConsultation({ motif: '', symptoms: '', clinicalExam: '', diagnostic: '', treatmentPlan: '', notes: '' });
    window.dispatchEvent(new Event('meddoc_data_update')); // Trigger refresh
  };
  // Helper: initials avatar colors by sex
  const getInitials = (name: string) => name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const getAvatarColors = (sex?: 'M' | 'F') => sex === 'F'
    ? 'bg-rose-100 text-rose-600'
    : 'bg-blue-100 text-blue-700';

  if (!selectedPatientId) {
    return (
      <div className="h-full animate-in fade-in duration-300 text-gray-900 font-sans bg-[#F9FAFB] p-1">
        <PatientsList
          onSelectPatient={(id) => handleSelectPatient(id)}
          onNewConsultation={(patient) => onNavigate && onNavigate('new-prescription', { patient })}
          onAddPatient={() => onNavigate && onNavigate('patients')}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 animate-in fade-in duration-300 overflow-hidden text-gray-900 font-sans bg-[#F9FAFB]">

      {/* ── FULL-SCREEN DOSSIER ── */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden min-w-0">

        {selectedPatientProfile && (
          <>
            {/* ── PROFILE HEADER CARD (bandeau critique — toujours visible, teinte selon niveau d'alerte) ── */}
            <div className={`rounded-2xl border shadow-sm overflow-hidden ${
              criticalAlertLevel === 'critique' ? 'bg-red-50/40 border-red-200' :
              criticalAlertLevel === 'vigilance' ? 'bg-amber-50/40 border-amber-200' :
              'bg-white border-gray-200'
            }`}>
              <div className="px-6 pt-4">
                <button
                  onClick={clearPatientSelection}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-[#1D9E75] transition-colors"
                >
                  <ArrowLeft size={14} /> Retour à la liste
                </button>
              </div>
              <div className="px-6 py-5 flex items-start justify-between gap-4">

                {/* Avatar + Info */}
                <div className="flex items-start gap-5">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 ${getAvatarColors(selectedPatientProfile.sex)}`}>
                    {getInitials(selectedPatientProfile.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Name row */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-gray-900 uppercase tracking-tight">{formatNom(selectedPatientProfile.name)}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${selectedPatientProfile.sex === 'F' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                        {selectedPatientProfile.sex === 'F' ? 'Femme' : 'Homme'} · {formatAge(selectedPatientProfile)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-gray-100 text-gray-500" title={`Identifiant complet : ${selectedPatientProfile.id}`}>#{selectedPatientProfile.id.slice(-6)}</span>
                      {selectedPatientProfile.phone && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 text-gray-500 border border-gray-200">
                          <Phone size={10} />{selectedPatientProfile.phone}
                        </span>
                      )}
                      {selectedPatientProfile.address && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-50 text-gray-600 border border-gray-200">
                          <MapPin size={10} className="text-emerald-600" />{selectedPatientProfile.address}
                        </span>
                      )}
                      {selectedPatientProfile.registeredDate && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Calendar size={10} />Depuis {new Date(selectedPatientProfile.registeredDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Medical alert badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedPatientProfile.bloodType && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold border border-gray-200">
                          <Droplet size={10} />{selectedPatientProfile.bloodType}
                        </span>
                      )}
                      {latestVital && (
                        <button
                          onClick={() => setActiveTab('constantes')}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            (latestVital.systolic && latestVital.systolic > 140) || (latestVital.diastolic && latestVital.diastolic > 90)
                              ? 'bg-red-50 text-red-600 border-red-100'
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}
                          title={`Mesuré le ${new Date(latestVital.date).toLocaleDateString('fr-FR')}`}
                        >
                          <HeartPulse size={10} />
                          {latestVital.systolic !== undefined || latestVital.diastolic !== undefined ? (
                            <>
                              {latestVital.systolic ?? '—'}/{latestVital.diastolic ?? '—'} mmHg
                              {(latestVital.systolic !== undefined && previousVital?.systolic !== undefined) && (
                                latestVital.systolic > previousVital.systolic
                                  ? <TrendingUp size={10} className="text-red-500" />
                                  : latestVital.systolic < previousVital.systolic
                                    ? <TrendingDown size={10} className="text-emerald-500" />
                                    : null
                              )}
                            </>
                          ) : null}
                          {latestVital.weight !== undefined && (
                            <>
                              · {latestVital.weight}kg
                              {previousVital?.weight !== undefined && (
                                latestVital.weight > previousVital.weight
                                  ? <TrendingUp size={10} className="text-amber-500" />
                                  : latestVital.weight < previousVital.weight
                                    ? <TrendingDown size={10} className="text-amber-500" />
                                    : null
                              )}
                            </>
                          )}
                        </button>
                      )}
                      {selectedPatientProfile.allergies && selectedPatientProfile.allergies.split(',').filter(Boolean).length > 0 ? (
                        selectedPatientProfile.allergies.split(',').filter(Boolean).map((al, i) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[10px] font-bold border border-red-100">
                            <AlertCircle size={10} />Allergie: {al.trim()}
                          </span>
                        ))
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full text-[10px] font-bold border border-gray-200">
                          <AlertCircle size={10} />{EMPTY_STATES.allergies}
                        </span>
                      )}
                      {selectedPatientProfile.chronicDiseases?.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-100">{d}</span>
                      ))}
                      {selectedPatientProfile.isPregnant && (
                        <span className="px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full text-[10px] font-bold border border-pink-100">
                          Enceinte{selectedPatientProfile.pregnancyWeeks ? ` (${selectedPatientProfile.pregnancyWeeks} SA)` : ''}
                        </span>
                      )}
                      {selectedPatientProfile.isBreastfeeding && (
                        <span className="px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full text-[10px] font-bold border border-pink-100">Allaitement</span>
                      )}
                      {selectedPatientProfile.isHeartPatient && (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full text-[10px] font-bold border border-purple-100">Cardiopathie</span>
                      )}
                      {selectedPatientProfile.isKidneyPatient && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-100">Insuffisance rénale</span>
                      )}
                      {selectedPatientProfile.isLiverPatient && (
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full text-[10px] font-bold border border-orange-100">Insuffisance hépatique</span>
                      )}
                    </div>

                    {/* Traitements actuels — dérivés des ordonnances (jamais ressaisis) */}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                        <Pill size={11} />Traitement :
                      </span>
                      {activeTreatment && activeTreatment.items.length > 0 ? (
                        activeTreatment.items.map((item, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold border border-blue-100">
                            {item.medicineName}{item.dosage ? ` · ${item.dosage}` : ''}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] font-semibold text-gray-400">{EMPTY_STATES.activeTreatment}</span>
                      )}
                    </div>

                    {/* Alerte drugSafetyCheck.ts permanente — traitement actif vs profil réel du patient */}
                    {activeTreatmentAlerts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {activeTreatmentAlerts.slice(0, 3).map((alert, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border ${
                              alert.severity === 'CRITIQUE'
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : 'bg-amber-100 text-amber-700 border-amber-200'
                            }`}
                          >
                            <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                            <span>{alert.title} — {alert.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('consultation')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-[#1D9E75] hover:border-[#1D9E75] rounded-lg text-xs font-semibold transition-all"
                    title="Nouvelle consultation"
                  >
                    <Activity size={14} /> <span className="hidden lg:inline">Consultation</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ordonnance')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-[#1D9E75] hover:border-[#1D9E75] rounded-lg text-xs font-semibold transition-all"
                    title="Nouvelle ordonnance"
                  >
                    <FileText size={14} /> <span className="hidden lg:inline">Ordonnance</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('analyses')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-[#1D9E75] hover:border-[#1D9E75] rounded-lg text-xs font-semibold transition-all"
                    title="Demander une analyse"
                  >
                    <Filter size={14} /> <span className="hidden lg:inline">Analyse</span>
                  </button>
                  <button
                    onClick={() => {
                      const vaccinations = vaccinationService.getPatientRecords(selectedPatientProfile.id);
                      printService.printPatientDossier(selectedPatientProfile, consultations, prescriptions, results, vaccinations, doctor);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-[#1D9E75] hover:border-[#1D9E75] rounded-lg text-xs font-semibold transition-all"
                    title="Imprimer le dossier"
                  >
                    <Printer size={14} /> <span className="hidden lg:inline">Imprimer</span>
                  </button>
                </div>
              </div>

              {/* ── UNDERLINE TABS ── */}
              <div className="flex border-t border-gray-100 overflow-x-auto no-scrollbar">
                {[
                  { id: 'overview', label: t('overview'), icon: <LayoutDashboard size={13} /> },
                  { id: 'consultation', label: t('consultation'), icon: <Activity size={13} /> },
                  { id: 'ordonnance', label: t('prescription'), icon: <FileText size={13} /> },
                  { id: 'analyses', label: t('analyses'), icon: <Filter size={13} /> },
                  { id: 'facture', label: t('finance'), icon: <Wallet size={13} /> },
                  { id: 'resultats', label: t('results'), icon: <ShieldCheck size={13} /> },
                  { id: 'vaccination', label: t('vaccines'), icon: <Syringe size={13} /> },
                  { id: 'antecedents', label: 'Antécédents', icon: <ClipboardList size={13} /> },
                  { id: 'constantes', label: 'Constantes', icon: <HeartPulse size={13} /> },
                  { id: 'certificats', label: t('certificates'), icon: <FileTextIcon size={13} /> },
                  { id: 'documents', label: 'SmartDoc', icon: <History size={13} /> }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as DossierTab)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold whitespace-nowrap shrink-0 border-b-2 transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'border-[#1D9E75] text-[#1D9E75]'
                        : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
                    }`}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-10 animate-in fade-in duration-200">
              {activeTab === 'overview' && (
                <DossierOverview
                  patientId={selectedPatientProfile.id}
                  patientName={selectedPatientProfile.name}
                  refreshTrigger={refreshTrigger}
                  onNavigate={setActiveTab}
                  onPreviewNote={(note) => { setSelectedNote(note); setActiveTab('facture'); }}
                  onPreviewPrescription={(rx) => { setSelectedPrescription(rx); setActiveTab('ordonnance'); }}
                />
              )}

              {activeTab === 'consultation' && (
                <ConsultationSection
                  patientId={selectedPatientProfile.id}
                  patientName={selectedPatientProfile.name}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {activeTab === 'ordonnance' && (
                <div className="flex flex-col gap-4 h-full">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-[#1D9E75]" />
                      <div>
                        <p className="text-sm font-bold text-gray-800">{t('prescriptions')}</p>
                        <p className="text-[10px] text-gray-400">{prescriptions.length} ordonnance{prescriptions.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onNavigate && selectedPatientProfile && onNavigate('new-prescription', { patient: selectedPatientProfile })}
                      className="flex items-center gap-2 px-4 py-2 bg-[#1D9E75] text-white rounded-lg text-xs font-semibold hover:bg-[#178a65] transition-all"
                    >
                      <Plus size={14} /> {t('new_prescription_btn')}
                    </button>
                  </div>

                  <div className="flex gap-4 flex-1 overflow-hidden min-h-[400px]">
                    {/* Prescription table */}
                    <div className={`${selectedPrescription ? 'w-5/12' : 'w-full'} flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300`}>
                      {prescriptions.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-16">
                          <FileText size={36} className="text-gray-200 mb-3" />
                          <p className="text-xs text-gray-400 font-medium">{t('no_prescriptions')}</p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1fr_auto_auto] text-[10px] font-bold text-gray-400 uppercase tracking-widest px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                            <span>Médicaments</span>
                            <span className="text-center px-4">Date</span>
                            <span className="text-center">Actions</span>
                          </div>
                          <div className="overflow-y-auto flex-1">
                            {prescriptions.map(p => (
                              <div
                                key={p.id}
                                className={`grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-all cursor-pointer ${selectedPrescription?.id === p.id ? 'bg-[#1D9E75]/5 border-l-2 border-l-[#1D9E75]' : ''}`}
                                onClick={() => setSelectedPrescription(p)}
                              >
                                <div className="min-w-0 pr-4">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{p.items.map(i => i.medicineName).join(', ')}</p>
                                  <p className="text-[10px] text-gray-400">{p.items.length} médicament{p.items.length !== 1 ? 's' : ''} · #{p.id.slice(-5)}</p>
                                </div>
                                <span className="text-[11px] text-gray-500 font-medium px-4 whitespace-nowrap">{p.date}</span>
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => setSelectedPrescription(selectedPrescription?.id === p.id ? null : p)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#1D9E75] hover:bg-[#1D9E75]/10 transition-all"
                                    title="Voir"
                                  >
                                    <FileText size={14} />
                                  </button>
                                  <button
                                    onClick={() => window.print()}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                    title="Imprimer"
                                  >
                                    <Printer size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(t('confirm_delete_prescription'))) {
                                        dataService.deletePrescription(p.id);
                                        setSelectedPrescription(null);
                                        window.dispatchEvent(new Event('meddoc_data_update'));
                                      }
                                    }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                    title={t('delete')}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Slide-in preview */}
                    {selectedPrescription && (
                      <div className={`flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col animate-in ${dir === 'rtl' ? 'slide-in-from-left-4' : 'slide-in-from-right-4'} duration-300`}>
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <span className="text-xs font-bold text-gray-600 flex items-center gap-2"><Printer size={13} className="text-[#1D9E75]" /> Aperçu ordonnance</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onNavigate && onNavigate('prescriptions', { prescription: selectedPrescription })}
                              className="p-1.5 text-gray-400 hover:text-[#1D9E75] hover:bg-[#1D9E75]/10 rounded-lg transition-all"
                              title={t('edit')}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => window.print()} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
                              <Printer size={14} />
                            </button>
                            <button onClick={() => setSelectedPrescription(null)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                          <PrescriptionView prescription={selectedPrescription} doctor={doctor} isPreview={true} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'analyses' && (
                <AnalysesSection
                  patientId={selectedPatientProfile.id}
                  patientName={selectedPatientProfile.name}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {activeTab === 'resultats' && (
                <ResultsSection
                  patientId={selectedPatientProfile.id}
                  patientName={selectedPatientProfile.name}
                  refreshTrigger={refreshTrigger}
                  onNavigate={onNavigate}
                />
              )}

              {activeTab === 'vaccination' && <VaccinationTab patient={selectedPatientProfile} />}

              {activeTab === 'antecedents' && (
                <AntecedentsSection
                  patient={selectedPatientProfile}
                  refreshTrigger={refreshTrigger}
                  onNavigate={setActiveTab}
                />
              )}

              {activeTab === 'constantes' && (
                <VitalsSection
                  patient={selectedPatientProfile}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {activeTab === 'documents' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2 h-full">
                  <SmartDocInterface />
                </div>
              )}

              {activeTab === 'facture' && (
                <FinancesSection
                  patientId={selectedPatientProfile.id}
                  patientName={selectedPatientProfile.name}
                  refreshTrigger={refreshTrigger}
                  currency={doctor.currency || 'DH'}
                  onAddNote={() => setIsAddingNote(true)}
                  onPreviewNote={setSelectedNote}
                />
              )}

              {activeTab === 'certificats' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-white rounded-xl border border-gray-200 px-5 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <FileTextIcon size={18} className="text-indigo-500" />
                      <div>
                        <p className="text-sm font-bold text-gray-800">{t('certificates_count')}</p>
                        <p className="text-[10px] text-gray-400">{certificates.length} certificat{certificates.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsAddingCertificate(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-all"
                    >
                      <Plus size={14} /> {t('new_certificate')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {certificates.length > 0 ? certificates.map(cert => (
                      <div key={cert.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 font-medium">{cert.date}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cert.type === 'REPOS' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            {cert.type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2 italic">"{cert.content}"</p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                          <button onClick={() => setSelectedCert(cert)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                            <Printer size={15} />
                          </button>
                          <button
                            onClick={() => { if (confirm(t('confirm_delete_certificate'))) { dataService.deleteMedicalCertificate(cert.id); window.dispatchEvent(new Event('meddoc_data_update')); } }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-200">
                        <FileTextIcon size={32} className="mx-auto mb-2 text-gray-200" />
                        <p className="text-xs text-gray-400 font-medium">{t('no_results_found')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── MODALS ── */}
      {isAddingNote && selectedPatientProfile && (
        <HonoraryNoteEditor patient={selectedPatientProfile} onClose={() => setIsAddingNote(false)} />
      )}

      {isAddingCertificate && selectedPatientProfile && (
        <MedicalCertificateEditor patient={selectedPatientProfile} onClose={() => setIsAddingCertificate(false)} />
      )}

      {selectedCert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl p-3 flex flex-col gap-2 overflow-hidden max-h-[98vh]">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-xs font-bold text-gray-500">{t('preview_certificate')}</h3>
              <div className="flex gap-2">
                <button onClick={() => handleExportCertPDF(selectedCert)} className="p-2 bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a65] transition-all" title={t('save_pdf')}><Save size={16} /></button>
                <button onClick={() => window.print()} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all" title={t('print')}><Printer size={16} /></button>
                <button onClick={() => setSelectedCert(null)} className="p-2 bg-gray-100 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all"><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-y-auto rounded-xl border border-gray-100 p-4 bg-gray-50 flex justify-center">
              <div id="cert-preview-pdf" className="bg-white shadow-lg">
                <MedicalCertificateTemplate
                  doctor={doctor}
                  appearance={settingsService.getAppearance()}
                  certificate={selectedCert}
                  isPrinting={true}
                  scale={0.32}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl p-3 flex flex-col gap-2 overflow-hidden max-h-[98vh]">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-xs font-bold text-gray-500">{t('preview_note')}</h3>
              <div className="flex gap-2">
                <button onClick={() => handleExportNotePDF(selectedNote)} className="p-2 bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a65] transition-all" title={t('save_pdf')}><Save size={16} /></button>
                <button onClick={() => window.print()} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all" title={t('print')}><Printer size={16} /></button>
                <button onClick={() => setSelectedNote(null)} className="p-2 bg-gray-100 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all"><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-y-auto rounded-xl border border-gray-100 p-4 bg-gray-50 flex justify-center">
              <div id="note-preview-pdf" className="bg-white shadow-lg">
                <HonoraryNoteTemplate doctor={doctor} note={selectedNote} isPrinting={true} scale={0.32} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDossier;
