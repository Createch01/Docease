
import React, { useState, Suspense, useEffect } from 'react';
import { I18nProvider, useI18n } from './i18n';
import {
  LayoutDashboard, Users, FileText, Settings, BarChart3, PlusCircle,
  Pill, FolderOpen, CheckSquare, CalendarRange, Activity,
  ChevronLeft, ChevronRight, Menu, X, Bell, Database, Search
} from 'lucide-react';
import LoadingIndicator from './components/LoadingIndicator';
import WaveBackground from './components/WaveBackground';
import PinDialog from './components/PinDialog';
import ToastContainer from './components/ToastContainer';
import { dataService } from './services/dataService';
import { autoImportService } from './services/autoImportService';
import { Patient, AppUser, Permission, PrescriptionDraft } from './types';
import { LogOut, BookOpen } from 'lucide-react';

// Lazy loading components for code splitting
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const PatientManager = React.lazy(() => import('./components/PatientManager'));
const PrescriptionEditor = React.lazy(() => import('./components/PrescriptionEditor'));
const SettingsPanel = React.lazy(() => import('./components/SettingsPanel'));
const Analytics = React.lazy(() => import('./components/Analytics'));
const MedicineManager = React.lazy(() => import('./components/MedicineManager'));
const PatientDossier = React.lazy(() => import('./components/PatientDossier'));
const TaskManager = React.lazy(() => import('./components/TaskManager'));
const AppointmentManager = React.lazy(() => import('./components/AppointmentManager'));
const DrugCompatibility = React.lazy(() => import('./components/DrugCompatibility'));
const NotificationCenter = React.lazy(() => import('./components/NotificationCenter'));
const SmartDocInterface = React.lazy(() => import('./components/SmartDoc/SmartDocInterface'));
const GlobalSearch = React.lazy(() => import('./components/GlobalSearch'));

type View = 'dashboard' | 'patients' | 'appointments' | 'dossier' | 'new-prescription' | 'medicines' | 'analytics' | 'settings' | 'tasks' | 'compatibility' | 'notifications' | 'medical-directory' | 'smart-doc';

const App: React.FC = () => {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
};

const AppContent: React.FC = () => {
  const { t, lang, dir } = useI18n();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [activePrescription, setActivePrescription] = useState<any | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [prescriptionDraft, setPrescriptionDraft] = useState<PrescriptionDraft | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const activeUser = dataService.getActiveUser();
  const doctor = dataService.getDoctorInfo();

  useEffect(() => {
    const init = async () => {
      // Automatic JSON Scan & Import on startup
      await autoImportService.runAutoImport();

      // Initialize Professional Data Architecture
      await dataService.initialize();

      setAuthenticated(!!dataService.getActiveUser());
      setIsDataLoaded(true);
    };

    init();

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };

    // Listen for updates from dataService
    const handleUpdate = () => {
      setAuthenticated(!!dataService.getActiveUser());
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === '/') {
        // Only trigger if not in an input/textarea
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setIsSearchOpen(true);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('meddoc_data_update', handleUpdate);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('meddoc_data_update', handleUpdate);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleStartConsultation = (patient?: Patient) => {
    if (patient) {
      setActivePatient(patient);
      if (prescriptionDraft?.patient?.id !== patient.id) {
        setPrescriptionDraft(null);
      }
    }
    setActivePrescription(null);
    setCurrentView('new-prescription');
  };

  const hasPermission = (permission: string) => {
    if (!activeUser) return true; // Doctor (admin) has all permissions
    if (activeUser.role === 'Admin') return true;
    return activeUser.permissions?.includes(permission as Permission);
  };

  const renderView = () => {
    // Permission Guards
    if (currentView === 'patients' && !hasPermission('MANAGE_PATIENTS')) return <AccessDenied />;
    if (currentView === 'dossier' && !hasPermission('MANAGE_PATIENTS')) return <AccessDenied />;
    if (currentView === 'appointments' && !hasPermission('MANAGE_APPOINTMENTS')) return <AccessDenied />;
    if (currentView === 'new-prescription' && !hasPermission('CREATE_PRESCRIPTION')) return <AccessDenied />;
    if (currentView === 'medicines' && !hasPermission('CREATE_PRESCRIPTION')) return <AccessDenied />;
    if (currentView === 'analytics' && !hasPermission('VIEW_FINANCES')) return <AccessDenied />;
    if (currentView === 'settings' && !hasPermission('MANAGE_SETTINGS')) return <AccessDenied />;

    switch (currentView) {
      case 'dashboard': return (
        <Dashboard
          onNewPrescription={handleStartConsultation}
          onNavigate={setCurrentView}
          onViewDossier={(patientId) => {
            const p = dataService.getAllPatients().find(pat => pat.id === patientId || pat.name === patientId);
            if (p) setActivePatient(p);
            setCurrentView('dossier');
          }}
        />
      );
      case 'patients': return <PatientManager onConsult={handleStartConsultation} />;
      case 'appointments': return <AppointmentManager />;
      case 'dossier': return <PatientDossier initialPatient={activePatient} onNavigate={(view, data) => {
        if (view === 'smart-doc') setCurrentView('smart-doc');
        if (view === 'prescriptions' && data?.prescription) {
          setActivePrescription(data.prescription);
          setCurrentView('new-prescription');
        }
        if (view === 'new-prescription') {
          handleStartConsultation(data?.patient);
        }
      }} />;
      case 'new-prescription': return (
        <PrescriptionEditor
          initialPatient={activePatient}
          initialPrescription={activePrescription}
          draft={prescriptionDraft}
          onDraftChange={setPrescriptionDraft}
          onFinish={() => {
            setActivePatient(null);
            setActivePrescription(null);
            setPrescriptionDraft(null); // Clear draft on finish
            setCurrentView('dashboard');
          }}
        />
      );
      case 'medicines': return <MedicineManager />;
      case 'compatibility': return <DrugCompatibility />;
      case 'analytics': return <Analytics />;
      case 'tasks': return <TaskManager />;
      case 'settings': return <SettingsPanel />;
      case 'notifications': return <NotificationCenter onNavigate={(view, data) => {
        if (data?.patientId) {
          const allPatients = dataService.getAllPatients();
          const targetPatient = allPatients.find(p => p.id === data.patientId);
          if (targetPatient) setActivePatient(targetPatient);
        }
        setCurrentView(view as View);
      }} />;
      case 'smart-doc': return <SmartDocInterface />;
      default: return <Dashboard onNewPrescription={handleStartConsultation} />;
    }
  };

  const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-10 opacity-50">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <LogOut size={32} className="text-gray-400" />
      </div>
      <h3 className="text-xl font-black text-gray-900 uppercase">{t('access_denied')}</h3>
      <p className="text-sm font-bold text-gray-400 mt-2">{t('access_denied_desc')}</p>
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard, requiredPermission: 'ACCESS_DASHBOARD' },
    { id: 'patients', label: t('waiting_room'), icon: Users, requiredPermission: 'MANAGE_PATIENTS' },
    { id: 'appointments', label: t('appointments'), icon: CalendarRange, requiredPermission: 'MANAGE_APPOINTMENTS' },
    { id: 'tasks', label: t('tasks'), icon: CheckSquare, requiredPermission: 'ACCESS_DASHBOARD' },
    { id: 'new-prescription', label: t('new_consultation'), icon: PlusCircle, requiredPermission: 'CREATE_PRESCRIPTION' },
    { id: 'dossier', label: t('patients'), icon: FolderOpen, requiredPermission: 'MANAGE_PATIENTS' },
    { id: 'smart-doc', label: t('smart_doc'), icon: FileText, highlight: true, requiredPermission: 'USE_AI_ASSISTANT' },
    { id: 'medicines', label: t('medical_management') || 'Gestion Médicale Pro', icon: Database, highlight: true, requiredPermission: 'CREATE_PRESCRIPTION' },
    { id: 'compatibility', label: t('interactions') || 'Interactions', icon: Activity, requiredPermission: 'CREATE_PRESCRIPTION' },
    { id: 'analytics', label: t('accounting') || t('analytics'), icon: BarChart3, requiredPermission: 'VIEW_FINANCES' },
    { id: 'notifications', label: t('notifications') || 'Notifications', icon: Bell, requiredPermission: 'ACCESS_DASHBOARD' },
    { id: 'settings', label: t('settings'), icon: Settings, requiredPermission: 'MANAGE_SETTINGS' },
  ].filter(item => !item.requiredPermission || hasPermission(item.requiredPermission));

  if (!isDataLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-emerald-50">
        <LoadingIndicator />
      </div>
    );
  }

  if (doctor.pinEnabled && !authenticated) {
    return <PinDialog onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className={`flex h-screen overflow-hidden font-sans text-gray-900 relative ${lang === 'ar' ? 'font-arabic' : ''}`} dir={dir}>
      {/* Wave Background */}
      <WaveBackground />

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 glass-effect z-40 flex items-center justify-between px-6 border-b border-emerald-100/20">
        <div className="flex items-center gap-3">
          <img src="/docease-logo.svg" className="w-8 h-8 object-contain" alt="DocEase Logo" />
          <span className="font-bold text-emerald-900">DocEase</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-emerald-100/30 rounded-xl text-emerald-700 transition-smooth"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'w-20' : 'w-64'}
        fixed lg:relative top-0 left-0 bottom-0
        glass-dark border-r border-emerald-200/30 flex flex-col z-50
        transition-smooth
      `}>
        {/* Toggle Button (Desktop Only) */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 gradient-emerald-teal text-white rounded-full items-center justify-center border-2 border-white shadow-soft-lg hover:shadow-soft-lg transition-all active:scale-95 z-50"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`p-6 flex items-center gap-3 border-b border-emerald-200/20 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className={`
            gradient-emerald-light rounded-2xl flex items-center justify-center 
            border border-emerald-200/50 shadow-soft overflow-hidden p-2 
            transition-smooth group
            ${isCollapsed ? 'w-10 h-10' : 'w-14 h-14 hover:scale-110 hover:shadow-soft-md'}`}>
            <img src="/docease-logo.svg" className="w-full h-full object-contain" alt="DocEase Logo" />
          </div>
          {!isCollapsed && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <h1 className="text-xl font-bold text-emerald-900 tracking-tight">DocEase</h1>
              <p className="text-[10px] bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent font-black uppercase tracking-widest">Pro Edition</p>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => (
            <button
              key={item.id}
              title={isCollapsed ? item.label : ''}
              onClick={() => {
                if (item.id !== 'new-prescription') setActivePatient(null);
                setCurrentView(item.id as View);
                setIsMobileMenuOpen(false);
              }}
              className={`
                w-full flex items-center transition-smooth border rounded-xl font-medium text-sm
                ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}
                ${currentView === item.id
                  ? 'gradient-emerald-light text-emerald-700 shadow-soft border-emerald-400/50'
                  : 'text-emerald-700/60 hover:bg-white/40 hover:text-emerald-700 border-transparent'
                }
              `}
            >
              <item.icon size={20} className={currentView === item.id ? 'text-emerald-600' : 'text-emerald-600/60'} />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
              {item.highlight && !isCollapsed && (
                <div className="ml-auto w-2.5 h-2.5 rounded-full gradient-emerald-teal shadow-soft-md"></div>
              )}
            </button>
          ))}

          <button
            onClick={() => setIsSearchOpen(true)}
            className={`
              w-full flex items-center transition-smooth border rounded-xl font-black text-xs uppercase tracking-widest mt-6
              ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'}
              bg-white/40 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100 hover:border-emerald-300 shadow-sm
            `}
          >
            <Search size={20} className="text-emerald-700" />
            {!isCollapsed && (
              <div className="flex justify-between items-center flex-1">
                <span>{t('search_patient')}</span>
                <span className="text-[10px] text-emerald-400 border border-emerald-100 px-1 rounded">/</span>
              </div>
            )}
          </button>
        </nav>

        {!isCollapsed && (
          <div className="p-4 border-t border-emerald-200/20 space-y-3">
            <div className="bg-emerald-900/40 backdrop-blur-md rounded-2xl p-4 text-white border border-emerald-500/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-xs uppercase">
                  {activeUser?.name.charAt(0) || 'D'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest truncate">{t('user') || 'Utilisateur'}</p>
                  <p className="text-xs font-bold truncate">{activeUser?.name || doctor.nameFr}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    dataService.setActiveUser(undefined);
                    setAuthenticated(false);
                  }}
                  className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <LogOut size={12} /> {t('logout') || 'Quitter la Session'}
                </button>
              </div>
            </div>

            <div className="gradient-emerald-teal rounded-2xl p-4 text-white shadow-soft-lg">
              <p className="text-[10px] font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-200 rounded-full animate-pulse"></span>
                {t('offline_mode') || 'Mode Hors-ligne'}
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-auto bg-transparent p-4 lg:p-8 mt-16 lg:mt-0 z-10 relative scrollbar-hide">
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <LoadingIndicator />
          </div>
        }>
          {renderView()}
        </Suspense>

        {isSearchOpen && (
          <Suspense fallback={null}>
            <GlobalSearch
              onClose={() => setIsSearchOpen(false)}
              onSelectPatient={(p) => {
                setActivePatient(p);
                setCurrentView('dossier');
                setIsSearchOpen(false);
              }}
              onConsult={(p) => {
                handleStartConsultation(p);
                setIsSearchOpen(false);
              }}
            />
          </Suspense>
        )}

        <ToastContainer />
      </main>
    </div>
  );
};

export default App;
