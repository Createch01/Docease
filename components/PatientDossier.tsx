
import React, { useState, useMemo, useEffect } from 'react';
import { Search, Calendar, FileText, Printer, ChevronRight, User, Wallet, Activity, ArrowRight, Filter, Trash2, ShieldCheck, Plus, X, AlertCircle, Phone, History, Edit2, Check, Clock, LayoutDashboard, Syringe, FileText as FileTextIcon, ChevronDown, Save } from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { Prescription, Patient, ClinicalConsultation, LabRequest, MedicalResult, PatientInvoice, HonoraryNote } from '../types';
import PrescriptionView from './PrescriptionView';
import HonoraryNoteEditor from './HonoraryNoteEditor';
import HonoraryNoteTemplate from './HonoraryNoteTemplate';
import DossierOverview from './dossier/DossierOverview';
import ConsultationSection from './dossier/ConsultationSection';
import AnalysesSection from './dossier/AnalysesSection';
import ResultsSection from './dossier/ResultsSection';
import FinancesSection from './dossier/FinancesSection';
import VaccinationTab from './dossier/VaccinationTab';
import SmartDocInterface from './SmartDoc/SmartDocInterface';
import MedicalCertificateEditor from './MedicalCertificateEditor';
import MedicalCertificateTemplate from './MedicalCertificateTemplate';
import { printService } from '../services/printService';
import { vaccinationService } from '../services/vaccinationService';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { toastService } from '../services/toastService';
import { settingsService } from '../services/settingsService';

type DossierTab = 'overview' | 'consultation' | 'ordonnance' | 'analyses' | 'resultats' | 'vaccination' | 'documents' | 'facture' | 'certificats';
type TimeFilter = 'all' | 'today' | 'week' | 'date';

const PatientDossier: React.FC<{ onNavigate?: (view: string, data?: any) => void, initialPatient?: Patient | null }> = ({ onNavigate, initialPatient }) => {
  const { t, lang, dir } = useI18n();
  // Navigation & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sidebarMode, setSidebarMode] = useState<'alphabetical' | 'date'>('date');

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

  // 1. Filtered Patients for Sidebar
  // 1. last visit map
  const lastVisits = useMemo(() => {
    const map: Record<string, string> = {};
    allPrescriptions.forEach(p => {
      if (!map[p.patientId] || p.date > map[p.patientId]) {
        map[p.patientId] = p.date;
      }
    });
    return map;
  }, [allPrescriptions]);

  // 2. Filtered Patients for Sidebar
  const filteredPatients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let patients = [...allPatients];

    if (term) {
      patients = patients.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.phone && p.phone.includes(term)) ||
        p.id.toLowerCase().includes(term)
      );
    }

    if (sidebarMode === 'alphabetical') {
      return patients.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Sort by last visit or registration date
      return patients.sort((a, b) => {
        const dateA = lastVisits[a.id] || a.registeredDate || '0000-00-00';
        const dateB = lastVisits[b.id] || b.registeredDate || '0000-00-00';
        return dateB.localeCompare(dateA);
      });
    }
  }, [allPatients, searchTerm, sidebarMode, lastVisits]);

  // 3. Grouped Patients for Sidebar (by Date)
  const groupedPatients = useMemo(() => {
    if (sidebarMode === 'alphabetical') return null;

    const groups: Record<string, Patient[]> = {};
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    filteredPatients.forEach(p => {
      let date = lastVisits[p.id] || p.registeredDate || 'Inconnu';
      if (date === today) date = t('today');
      else if (date === yesterday) date = t('yesterday');

      if (!groups[date]) groups[date] = [];
      groups[date].push(p);
    });

    return Object.entries(groups).sort((a, b) => {
      if (a[0] === t('today')) return -1;
      if (b[0] === t('today')) return 1;
      if (a[0] === t('yesterday')) return -1;
      if (b[0] === t('yesterday')) return 1;
      return b[0].localeCompare(a[0]);
    });
  }, [filteredPatients, sidebarMode, lastVisits, t]);

  // 2. Filtered Visits (Prescriptions) for Right Panel
  const filteredVisits = useMemo(() => {
    let visits = [...allPrescriptions];

    // Filter by Patient ID
    if (selectedPatientId) {
      visits = visits.filter(px => px.patientId === selectedPatientId);
    } else if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      // Look up matches in patients to get their IDs
      const matchingIds = allPatients
        .filter(p => p.name.toLowerCase().includes(term) || (p.phone && p.phone.includes(term)))
        .map(p => p.id);

      visits = visits.filter(px => matchingIds.includes(px.patientId) || px.patientId.toLowerCase().includes(term));
    }

    // Filter by Time
    const today = new Date().toISOString().split('T')[0];

    switch (timeFilter) {
      case 'today':
        visits = visits.filter(p => p.date === today);
        break;
      case 'date':
        visits = visits.filter(p => p.date === selectedDate);
        break;
      case 'week':
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        visits = visits.filter(p => new Date(p.date) >= oneWeekAgo);
        break;
      case 'all':
      default:
        break;
    }

    // Sort by Date DESC (Newest first)
    return visits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allPrescriptions, selectedPatientId, timeFilter, selectedDate, searchTerm]);

  // Grouped Visits for Global History
  const groupedVisits = useMemo(() => {
    if (selectedPatientId) return null;
    const groups: Record<string, Prescription[]> = {};
    filteredVisits.forEach(v => {
      if (!groups[v.date]) groups[v.date] = [];
      groups[v.date].push(v);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredVisits, selectedPatientId]);

  // 2. Selected Patient Profile
  const selectedPatientProfile = useMemo(() => {
    if (!selectedPatientId) return null;
    return allPatients.find(p => p.id === selectedPatientId) || null;
  }, [selectedPatientId, allPatients]);

  // 3. Section Data
  const consultations = useMemo(() => selectedPatientProfile ? dataService.getConsultations(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const prescriptions = useMemo(() => selectedPatientProfile ? allPrescriptions.filter(p => p.patientId === selectedPatientProfile.id) : [], [selectedPatientProfile, allPrescriptions]);
  const labRequests = useMemo(() => selectedPatientProfile ? dataService.getLabRequests(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const results = useMemo(() => selectedPatientProfile ? dataService.getMedicalResults(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const invoices = useMemo(() => selectedPatientProfile ? dataService.getInvoices(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const honoraryNotes = useMemo(() => selectedPatientProfile ? dataService.getHonoraryNotes(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);
  const certificates = useMemo(() => selectedPatientProfile ? dataService.getMedicalCertificates(selectedPatientProfile.id) : [], [selectedPatientProfile, refreshTrigger]);

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

  const clearPatientSelection = () => {
    setSelectedPatientId(null);
    setTimeFilter('today'); // Default to today's overview when viewing global
  };

  const handleExportCertPDF = (cert: any) => {
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
    html2pdf().set(opt).from(element).save().then(() => toastService.success("Certificat enregistré !"));
  };

  const handleExportNotePDF = (note: any) => {
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
  return (
    <div className="flex h-full gap-6 animate-in fade-in duration-500 overflow-hidden text-black font-sans">

      {/* --- LEFT PANEL: SEARCH & PATIENTS --- */}
      <div className="w-80 shrink-0 bg-white rounded-[2rem] border border-gray-100 shadow-sm flex flex-col overflow-hidden">
        {/* Search Header */}
        <div className="p-6 bg-gray-50/50 border-b border-gray-50 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <User size={14} /> {t('patients')}
            </h3>
            <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredPatients.length}
            </span>
          </div>

          <button
            onClick={() => onNavigate && onNavigate('patients')}
            className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all active:scale-95"
          >
            <Plus size={14} /> {t('add_patient')}
          </button>

          <div className="relative group">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searchTerm ? 'text-emerald-500' : 'text-gray-400'}`} size={16} />
            <input
              type="text"
              placeholder={t('search_dossier_placeholder')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full ${dir === 'rtl' ? 'pr-11 pl-10 text-right' : 'pl-11 pr-10 text-left'} py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all shadow-sm placeholder-gray-300`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-emerald-600 transition-all font-bold"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex p-1 bg-gray-100/50 rounded-xl gap-1">
            <button
              onClick={() => setSidebarMode('date')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${sidebarMode === 'date' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Clock size={12} className="inline mr-1" /> {t('by_date')}
            </button>
            <button
              onClick={() => setSidebarMode('alphabetical')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${sidebarMode === 'alphabetical' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <ArrowRight size={12} className="inline mr-1" /> {t('a_z')}
            </button>
          </div>
        </div>

        {/* Patient List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          {filteredPatients.length > 0 ? (
            sidebarMode === 'date' ? (
              groupedPatients?.map(([date, patients]) => (
                <div key={date}>
                  <div className="sticky top-0 bg-white/80 backdrop-blur-md px-6 py-2 border-y border-gray-50 z-10 flex justify-between items-center">
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                      {date}
                    </span>
                    <span className="text-[8px] font-black text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded italic">{patients.length} {t('patients').toLowerCase()}</span>
                  </div>
                  {patients.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPatient(p.id)}
                      className={`w-full ${dir === 'rtl' ? 'text-right' : 'text-left'} p-4 transition-smooth group relative border-l-4 hover:bg-emerald-50/30 ${selectedPatientId === p.id ? 'bg-emerald-50 border-emerald-500' : 'bg-transparent border-transparent'}`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${selectedPatientId === p.id ? 'bg-emerald-600 text-white scale-110 shadow-emerald-200' : 'bg-gray-50 text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 group-hover:scale-105'}`}>
                            <User size={18} />
                          </div>
                          <div className="overflow-hidden">
                            <p className={`font-black uppercase text-xs transition-colors truncate ${selectedPatientId === p.id ? 'text-emerald-900' : 'text-gray-900 group-hover:text-emerald-700'}`}>{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[8px] font-black text-gray-300 uppercase tracking-tighter shrink-0">ID: {p.id}</p>
                              {p.phone && <p className="text-[8px] font-bold text-emerald-500/50 truncate italic opacity-60">· {p.phone}</p>}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={14} className={`shrink-0 transition-transform ${dir === 'rtl' ? 'rotate-180' : ''} ${selectedPatientId === p.id ? 'text-emerald-500 translate-x-1' : 'text-gray-200 group-hover:text-emerald-300 group-hover:translate-x-1'}`} />
                      </div>
                    </button>
                  ))}
                </div>
              ))
            ) : (
              filteredPatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPatient(p.id)}
                  className={`w-full ${dir === 'rtl' ? 'text-right' : 'text-left'} p-4 transition-smooth group relative border-l-4 hover:bg-emerald-50/30 ${selectedPatientId === p.id ? 'bg-emerald-50 border-emerald-500' : 'bg-transparent border-transparent'}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${selectedPatientId === p.id ? 'bg-emerald-600 text-white scale-110 shadow-emerald-200' : 'bg-gray-50 text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600'}`}>
                        <User size={18} />
                      </div>
                      <div className="overflow-hidden">
                        <p className={`font-black uppercase text-xs transition-colors truncate ${selectedPatientId === p.id ? 'text-emerald-900' : 'text-gray-900 group-hover:text-emerald-700'}`}>{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[8px] font-black text-gray-300 uppercase tracking-tighter shrink-0">ID: {p.id}</p>
                          {p.phone && <p className="text-[8px] font-bold text-emerald-500/50 truncate italic opacity-60">· {p.phone}</p>}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`shrink-0 transition-transform ${dir === 'rtl' ? 'rotate-180' : ''} ${selectedPatientId === p.id ? 'text-emerald-500 translate-x-1' : 'text-gray-200 group-hover:text-emerald-300 group-hover:translate-x-1'}`} />
                  </div>
                </button>
              ))
            )
          ) : (
            <div className="p-10 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                <Search size={24} />
              </div>
              <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">{t('no_patient_found')}</p>
            </div>
          )}
        </div>
      </div>

      {/* --- RIGHT PANEL: DOSSIER CONTENT --- */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">

        {/* Dossier Header & Tabs */}
        {selectedPatientProfile ? (
          <div className="bg-white/80 backdrop-blur-xl rounded-[2.5rem] border border-emerald-100 shadow-soft-lg overflow-hidden flex flex-col transition-all duration-500">
            <div className="p-8 bg-gradient-to-r from-emerald-50/50 via-white to-indigo-50/50 border-b border-emerald-50 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-gradient-emerald-teal rounded-3xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 animate-in zoom-in-95">
                  <User size={40} className="drop-shadow-md" />
                </div>
                <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black uppercase tracking-tight text-emerald-950 leading-tight">{selectedPatientProfile.name}</h2>
                    <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black tracking-widest uppercase">
                      ID: {selectedPatientProfile.id}
                    </div>
                  </div>
                  <div className={`flex gap-4 mt-3 items-center ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-2xl border border-emerald-50 shadow-sm transition-all hover:scale-105">
                      <Clock size={14} className="text-emerald-500" />
                      <span className="text-xs font-black text-emerald-900">{selectedPatientProfile.age} {t('years_old')}</span>
                    </div>
                    {selectedPatientProfile.phone && (
                      <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-2xl border border-indigo-50 shadow-sm transition-all hover:scale-105">
                        <Phone size={14} className="text-indigo-500" />
                        <span className="text-xs font-black text-indigo-900 uppercase">{selectedPatientProfile.phone}</span>
                      </div>
                    )}
                    {selectedPatientProfile.registeredDate && (
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Calendar size={12} />
                        {t('enrolled_since')} {new Date(selectedPatientProfile.registeredDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const vaccinations = vaccinationService.getPatientRecords(selectedPatientProfile.id);
                    printService.printPatientDossier(selectedPatientProfile, consultations, prescriptions, results, vaccinations, doctor);
                  }}
                  className="p-3 bg-white hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 rounded-2xl transition-all border border-gray-100 shadow-sm"
                  title="Imprimer le dossier complet"
                >
                  <Printer size={20} />
                </button>
                <button
                  onClick={() => setSelectedPatientId(null)}
                  className="p-3 bg-white hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all border border-gray-100 shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex p-2 gap-2 overflow-x-auto no-scrollbar bg-gray-50/50">
              {[
                { id: 'overview', label: t('overview'), icon: <LayoutDashboard size={14} /> },
                { id: 'consultation', label: t('consultation'), icon: <Activity size={14} /> },
                { id: 'ordonnance', label: t('prescription'), icon: <FileText size={14} /> },
                { id: 'analyses', label: t('analyses'), icon: <Filter size={14} /> },
                { id: 'facture', label: t('finance'), icon: <Wallet size={14} /> },
                { id: 'resultats', label: t('results'), icon: <ShieldCheck size={14} /> },
                { id: 'vaccination', label: t('vaccines'), icon: <Syringe size={14} /> },
                { id: 'certificats', label: t('certificates'), icon: <FileTextIcon size={14} /> },
                { id: 'documents', label: 'SmartDoc', icon: <History size={14} /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as DossierTab)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 relative group shrink-0 whitespace-nowrap
                    ${activeTab === tab.id
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100 -translate-y-0.5'
                      : 'bg-white text-gray-400 border border-gray-100 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50/30'}`}
                >
                  {tab.icon}
                  <span className="relative z-10">{tab.label}</span>
                  {activeTab === tab.id && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                <History size={20} />
              </div>
              <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
                <h2 className="text-base font-black uppercase tracking-tight text-gray-900">{t('global_history')}</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('global_history_desc')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-gray-50/50 p-1 rounded-2xl border border-gray-100/50 shadow-sm">
              {[
                { id: 'today', label: t('today'), icon: <Clock size={12} /> },
                { id: 'date', label: t('analyses'), icon: <Calendar size={12} /> } // Using 'analyses' as proxy for Date/Agenda if specific key missing, but 'date' exists in i18n
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setTimeFilter(f.id as TimeFilter)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 ${timeFilter === f.id ? 'bg-white text-emerald-600 shadow-xl shadow-emerald-100/20 translate-y-[-1px]' : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50/30'}`}
                >
                  {f.id === 'today' ? <Clock size={12} /> : <Calendar size={12} />}
                  {f.id === 'today' ? t('today') : (lang === 'ar' ? 'التاريخ' : 'Date')}
                </button>
              ))}
              {timeFilter === 'date' && (
                <div className="ml-1 flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-emerald-50 shadow-inner animate-in slide-in-from-left-2 duration-300">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-[10px] font-black uppercase text-emerald-600 outline-none w-28 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
          {!selectedPatientProfile ? (
            <div className="space-y-8 pb-10">
              {groupedVisits && groupedVisits.length > 0 ? (
                groupedVisits.map(([date, visits]) => (
                  <div key={date} className="space-y-4">
                    <div className="flex items-center gap-4 px-2">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50 px-4 py-1 rounded-full border border-gray-100 flex items-center gap-2">
                        <Calendar size={12} className="text-emerald-500" /> {date}
                      </span>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {visits.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleSelectPatient(p.patientId, 'ordonnance', p)}
                          className={`bg-white/80 backdrop-blur-md p-6 rounded-[2.5rem] border border-gray-100 shadow-sm transition-all duration-500 hover:shadow-emerald-200/20 hover:shadow-xl hover:-translate-y-1 hover:border-emerald-200 group ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                <FileText size={16} />
                              </div>
                              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">#{p.id.slice(-4)}</span>
                            </div>
                            <span className="text-[8px] font-black text-gray-300 uppercase tracking-tighter">{p.date}</span>
                          </div>
                          <h4 className="font-black text-gray-900 uppercase text-sm mb-2 group-hover:text-emerald-700 transition-colors">
                            {allPatients.find(pa => pa.id === p.patientId)?.name || p.patientId}
                          </h4>
                          <div className="flex flex-wrap gap-1 mt-3">
                            {p.items.slice(0, 3).map((item, idx) => (
                              <span key={idx} className="text-[8px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 group-hover:border-emerald-100 group-hover:text-emerald-600 transition-all truncate max-w-[120px]">
                                {item.medicineName}
                              </span>
                            ))}
                            {p.items.length > 3 && <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center">+ {p.items.length - 3}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-32 text-center bg-white/50 backdrop-blur-sm rounded-[5rem] border-2 border-dashed border-emerald-100 shadow-inner group">
                  <div className="w-24 h-24 bg-gradient-to-br from-gray-50 to-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm group-hover:scale-110 transition-transform duration-700">
                    <Search size={48} className="text-emerald-200" />
                  </div>
                  <h4 className="text-emerald-950 font-black uppercase text-xl tracking-tight mb-2">{t('no_patient_found')}</h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">{t('no_results_found')}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="animate-in fade-in duration-300 h-full">
              {activeTab === 'overview' && (
                <DossierOverview
                  patientId={selectedPatientProfile.id}
                  patientName={selectedPatientProfile.name}
                  refreshTrigger={refreshTrigger}
                  onNavigate={setActiveTab}
                  onPreviewNote={(note) => {
                    setSelectedNote(note);
                    setActiveTab('facture');
                  }}
                  onPreviewPrescription={(rx) => {
                    setSelectedPrescription(rx);
                    setActiveTab('ordonnance');
                  }}
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
                <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{t('prescriptions')}</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{prescriptions.length} {t('prescriptions').toLowerCase()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (onNavigate && selectedPatientProfile) {
                          onNavigate('new-prescription', { patient: selectedPatientProfile });
                        }
                      }}
                      className="px-8 py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-100 flex items-center gap-3 hover:bg-emerald-700 hover:-translate-y-0.5 transition-all active:scale-95"
                    >
                      <Plus size={18} /> {t('new_prescription_btn')}
                    </button>
                  </div>

                  <div className="flex gap-6 flex-1 overflow-hidden min-h-[500px]">
                    <div className={`flex flex-col gap-3 transition-all duration-500 overflow-y-auto no-scrollbar ${selectedPrescription ? 'w-1/3' : 'w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-max'}`}>
                      {prescriptions.length > 0 ? (
                        prescriptions.map(p => (
                          <button key={p.id} onClick={() => setSelectedPrescription(p)}
                            className={`w-full p-6 rounded-[2.5rem] border transition-all duration-300 relative group overflow-hidden ${dir === 'rtl' ? 'text-right' : 'text-left'} ${selectedPrescription?.id === p.id
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-2xl shadow-emerald-200 -translate-y-1'
                              : 'bg-white border-gray-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50/50'}`}>

                            <div className="flex justify-between items-start mb-4">
                              <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${selectedPrescription?.id === p.id ? 'bg-emerald-500/50 text-emerald-50' : 'bg-gray-50 text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600'}`}>
                                {p.date}
                              </div>
                              <FileText size={16} className={selectedPrescription?.id === p.id ? 'text-emerald-200 animate-pulse' : 'text-gray-200 group-hover:text-emerald-300'} />
                            </div>

                            <p className={`text-xs font-black leading-relaxed line-clamp-2 uppercase tracking-tight ${selectedPrescription?.id === p.id ? 'text-white' : 'text-gray-900 group-hover:text-emerald-900'}`}>
                              {p.items.map(i => i.medicineName).join(', ')}
                            </p>

                            <div className={`mt-4 pt-4 border-t flex justify-between items-center ${selectedPrescription?.id === p.id ? 'border-emerald-500/30' : 'border-gray-50'}`}>
                              <span className={`text-[8px] font-black uppercase tracking-widest ${selectedPrescription?.id === p.id ? 'text-emerald-200' : 'text-gray-300'}`}>#{p.id.slice(-6)}</span>
                              <span className={`text-[8px] font-black uppercase tracking-widest p-1.5 rounded-lg ${selectedPrescription?.id === p.id ? 'bg-emerald-700 text-emerald-300' : 'bg-gray-50 text-gray-400'}`}>
                                {p.items.length} meds
                              </span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="col-span-full p-20 text-center bg-white/50 rounded-[4rem] border-2 border-dashed border-emerald-50 shadow-inner">
                          <FileText className="mx-auto mb-4 text-emerald-100" size={48} />
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('no_prescriptions')}</p>
                        </div>
                      )}
                    </div>
                    {selectedPrescription && (
                      <div className={`flex-1 bg-white rounded-[2.5rem] border border-gray-100 shadow-inner overflow-hidden flex flex-col p-2 animate-in ${dir === 'rtl' ? 'slide-in-from-left-4' : 'slide-in-from-right-4'}`}>
                        <div className="flex justify-between items-center p-4 bg-gray-50/50 rounded-t-[2rem]">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Printer size={12} /> {t('preview_prescription')}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (window.confirm(t('confirm_delete_prescription'))) {
                                  dataService.deletePrescription(selectedPrescription.id);
                                  setSelectedPrescription(null);
                                  window.dispatchEvent(new Event('meddoc_data_update'));
                                }
                              }}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title={t('delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (onNavigate) {
                                  onNavigate('prescriptions', { prescription: selectedPrescription });
                                }
                              }}
                              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                              title={t('edit')}
                            >
                              <Edit2 size={16} />
                            </button>
                            <div className="w-[1px] h-4 bg-gray-200 mx-1" />
                            <button onClick={() => window.print()} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
                              <Printer size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto rounded-b-[2rem]">
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

              {activeTab === 'vaccination' && (
                <VaccinationTab patient={selectedPatientProfile} />
              )}

              {activeTab === 'documents' && (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-2 h-full">
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
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                      {t('certificates_count')} ({certificates.length})
                    </h3>
                    <button
                      onClick={() => setIsAddingCertificate(true)}
                      className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center gap-2"
                    >
                      <Plus size={16} /> {t('new_certificate')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {certificates.length > 0 ? (
                      certificates.map(cert => (
                        <div key={cert.id} className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-4">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{cert.date}</span>
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${cert.type === 'REPOS' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                              {cert.type}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-gray-600 line-clamp-2 italic">"{cert.content}"</p>
                          <div className="flex justify-end gap-2 pt-2 border-t border-gray-50">
                            <button
                              onClick={() => setSelectedCert(cert)}
                              className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-xl transition-all"
                            >
                              <Printer size={16} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(t('confirm_delete_certificate'))) {
                                  dataService.deleteMedicalCertificate(cert.id);
                                  window.dispatchEvent(new Event('meddoc_data_update'));
                                }
                              }}
                              className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full p-20 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
                        <FileTextIcon className="mx-auto mb-4 text-gray-300" size={40} />
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{t('no_results_found')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Honorary Note Modals */}
      {isAddingNote && selectedPatientProfile && (
        <HonoraryNoteEditor
          patient={selectedPatientProfile}
          onClose={() => setIsAddingNote(false)}
        />
      )}

      {/* Medical Certificate Modals */}
      {isAddingCertificate && selectedPatientProfile && (
        <MedicalCertificateEditor
          patient={selectedPatientProfile}
          onClose={() => setIsAddingCertificate(false)}
        />
      )}

      {selectedCert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-2 flex flex-col gap-2 overflow-hidden max-h-[98vh]">
            <div className="flex justify-between items-center px-4 pt-1">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">{t('preview_certificate')}</h3>
              <div className={`flex gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <button onClick={() => handleExportCertPDF(selectedCert)} className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg hover:scale-105 transition-all" title={t('save_pdf')}><Save size={20} /></button>
                <button onClick={() => window.print()} className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg hover:scale-105 transition-all" title={t('print')}><Printer size={20} /></button>
                <button onClick={() => setSelectedCert(null)} className="p-3 bg-gray-100 text-gray-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all" title={t('close')}><X size={20} /></button>
              </div>
            </div>
            <div className="overflow-y-auto rounded-[2rem] border border-gray-100 p-4 bg-gray-50 flex justify-center">
              <div id="cert-preview-pdf" className="bg-white shadow-xl">
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
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-2 flex flex-col gap-2 overflow-hidden max-h-[98vh]">
            <div className="flex justify-between items-center px-4 pt-1">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">{t('preview_note')}</h3>
              <div className={`flex gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <button onClick={() => handleExportNotePDF(selectedNote)} className="p-3 bg-emerald-600 text-white rounded-2xl shadow-lg hover:scale-105 transition-all" title={t('save_pdf')}><Save size={20} /></button>
                <button onClick={() => window.print()} className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg hover:scale-105 transition-all" title={t('print')}><Printer size={20} /></button>
                <button onClick={() => setSelectedNote(null)} className="p-3 bg-gray-100 text-gray-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all" title={t('close')}><X size={20} /></button>
              </div>
            </div>
            <div className="overflow-y-auto rounded-[2rem] border border-gray-100 p-4 bg-gray-50 flex justify-center">
              <div id="note-preview-pdf" className="bg-white shadow-xl">
                <HonoraryNoteTemplate
                  doctor={doctor}
                  note={selectedNote}
                  isPrinting={true}
                  scale={0.32}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDossier;
