
import React, { useState, Suspense, useEffect } from 'react';
import { I18nProvider, useI18n } from './i18n';
import {
  LayoutDashboard, Users, FileText, Settings, BarChart3, PlusCircle,
  Pill, FolderOpen, CheckSquare, CalendarRange, Activity,
  ChevronLeft, ChevronRight, Menu, X, Bell, Database, Search,
  Stethoscope, PanelLeftClose, PanelLeftOpen,
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
const PatientDossier = React.lazy(() => import('./components/PatientDossier'));
const TaskManager = React.lazy(() => import('./components/TaskManager'));
const AppointmentManager = React.lazy(() => import('./components/AppointmentManager'));
const DrugCompatibility = React.lazy(() => import('./components/DrugCompatibility'));
const NotificationCenter = React.lazy(() => import('./components/NotificationCenter'));
const SmartDocInterface = React.lazy(() => import('./components/SmartDoc/SmartDocInterface'));
const GlobalSearch = React.lazy(() => import('./components/GlobalSearch'));
const MedicamentsBrowser = React.lazy(() => import('./components/MedicamentsBrowser'));
const PharmaDirectory = React.lazy(() => import('./components/PharmaDirectory'));

type View = 'dashboard' | 'patients' | 'appointments' | 'dossier' | 'new-prescription' | 'analytics' | 'settings' | 'tasks' | 'compatibility' | 'notifications' | 'medical-directory' | 'smart-doc' | 'repertoire';

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
      await autoImportService.runAutoImport();
      await dataService.initialize();
      setAuthenticated(!!dataService.getActiveUser());
      setIsDataLoaded(true);
    };

    init();

    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
    };

    const handleUpdate = () => {
      setAuthenticated(!!dataService.getActiveUser());
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === '/') {
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
      if (prescriptionDraft?.patient?.id !== patient.id) setPrescriptionDraft(null);
    }
    setActivePrescription(null);
    setCurrentView('new-prescription');
  };

  const hasPermission = (permission: string) => {
    if (!activeUser) return true;
    if (activeUser.role === 'Admin') return true;
    return activeUser.permissions?.includes(permission as Permission);
  };

  const renderView = () => {
    if (currentView === 'patients' && !hasPermission('MANAGE_PATIENTS')) return <AccessDenied />;
    if (currentView === 'dossier' && !hasPermission('MANAGE_PATIENTS')) return <AccessDenied />;
    if (currentView === 'appointments' && !hasPermission('MANAGE_APPOINTMENTS')) return <AccessDenied />;
    if (currentView === 'new-prescription' && !hasPermission('CREATE_PRESCRIPTION')) return <AccessDenied />;
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
        if (view === 'new-prescription') handleStartConsultation(data?.patient);
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
            setPrescriptionDraft(null);
            setCurrentView('dashboard');
          }}
        />
      );
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
      case 'repertoire': return <MedicamentsBrowser />;
      case 'medical-directory': return <PharmaDirectory />;
      default: return <Dashboard onNewPrescription={handleStartConsultation} />;
    }
  };

  const AccessDenied = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-10" style={{ opacity: 0.5 }}>
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center mb-4"
        style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-faint)' }}
      >
        <LogOut size={28} />
      </div>
      <h3 className="text-[18px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{t('access_denied')}</h3>
      <p className="text-[13px]" style={{ color: 'var(--color-text-subtle)' }}>{t('access_denied_desc')}</p>
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
    { id: 'repertoire', label: 'Répertoire Pharmaceutique', icon: Pill, requiredPermission: 'CREATE_PRESCRIPTION' },
    { id: 'medical-directory', label: 'Annuaire Médicaments', icon: BookOpen, requiredPermission: 'ACCESS_DASHBOARD' },
    { id: 'compatibility', label: t('interactions') || 'Interactions', icon: Activity, requiredPermission: 'CREATE_PRESCRIPTION' },
    { id: 'analytics', label: t('accounting') || t('analytics'), icon: BarChart3, requiredPermission: 'VIEW_FINANCES' },
    { id: 'notifications', label: t('notifications') || 'Notifications', icon: Bell, requiredPermission: 'ACCESS_DASHBOARD' },
    { id: 'settings', label: t('settings'), icon: Settings, requiredPermission: 'MANAGE_SETTINGS' },
  ].filter(item => !item.requiredPermission || hasPermission(item.requiredPermission));

  // ─── Loading & Auth gates ───
  if (!isDataLoaded) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <LoadingIndicator />
      </div>
    );
  }

  if (doctor.pinEnabled && !authenticated) {
    return <PinDialog onAuthenticated={() => setAuthenticated(true)} />;
  }

  const userInitials = (activeUser?.name || doctor.nameFr || 'D').substring(0, 2).toUpperCase();
  const sidebarWidth = isCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div
      className={`flex h-screen overflow-hidden ${lang === 'ar' ? 'font-arabic' : ''}`}
      dir={dir}
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}
    >
      {/* ─── Mobile overlay ─── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ═══════════════ SIDEBAR ═══════════════ */}
      <aside
        className={`
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed lg:relative top-0 left-0 bottom-0 flex flex-col
          transition-all duration-300
        `}
        style={{
          width: sidebarWidth,
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          height: '100vh',
          zIndex: 'var(--z-sidebar)' as any,
          flexShrink: 0,
        }}
      >
        {/* ─── Logo block ─── */}
        <div
          className="flex items-center shrink-0"
          style={{
            height: 'var(--topbar-height)',
            borderBottom: '1px solid var(--color-border)',
            padding: isCollapsed ? '0 16px' : '0 20px',
            gap: '12px',
            overflow: 'hidden',
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)' }}
          >
            <Stethoscope size={18} />
          </div>
          {!isCollapsed && (
            <div>
              <div className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>DocEase</div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>Medical Suite</div>
            </div>
          )}
        </div>

        {/* ─── Doctor block ─── */}
        {!isCollapsed && (
          <div
            className="px-3 py-4 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <div
              className="flex items-center gap-3 p-2 rounded-lg"
              style={{ background: 'var(--color-surface-alt)' }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium shrink-0 text-[13px]"
                style={{ background: 'var(--color-primary)' }}
              >
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                  {activeUser?.name || doctor.nameFr}
                </div>
                <div className="text-[11px] truncate flex items-center gap-1" style={{ color: 'var(--color-text-subtle)' }}>
                  <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: 'var(--color-secondary)' }} />
                  {doctor.specialtyFr || t('doctor')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Navigation ─── */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
          {!isCollapsed && (
            <div
              className="text-[10px] font-semibold uppercase tracking-wider px-3 mb-2"
              style={{ color: 'var(--color-text-faint)', letterSpacing: '0.08em' }}
            >
              Workspace
            </div>
          )}

          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                title={isCollapsed ? item.label : undefined}
                onClick={() => {
                  if (item.id !== 'new-prescription') setActivePatient(null);
                  setCurrentView(item.id as View);
                  setIsMobileMenuOpen(false);
                }}
                className={`relative w-full flex items-center rounded-lg text-left transition-all`}
                style={{
                  gap: isCollapsed ? 0 : '10px',
                  padding: isCollapsed ? '10px' : '10px 12px',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  background: isActive ? 'var(--color-primary-50)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '14px',
                  transition: 'all var(--transition-base)',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 rounded-r"
                    style={{ top: '8px', bottom: '8px', width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0' }}
                  />
                )}
                <item.icon size={18} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
                {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                {item.highlight && !isCollapsed && (
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--color-secondary)' }}
                  />
                )}
              </button>
            );
          })}

          {/* Search shortcut */}
          <button
            onClick={() => setIsSearchOpen(true)}
            title={isCollapsed ? t('search_patient') : undefined}
            className="w-full flex items-center rounded-lg transition-all mt-4"
            style={{
              gap: isCollapsed ? 0 : '10px',
              padding: isCollapsed ? '10px' : '10px 12px',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              background: 'var(--color-surface-alt)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
              fontSize: '13px',
              transition: 'all var(--transition-base)',
            }}
          >
            <Search size={16} className="shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">{t('search_patient')}</span>
                <kbd
                  className="text-[10px] px-1.5 py-0.5 rounded border"
                  style={{ color: 'var(--color-text-faint)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', fontFamily: 'var(--font-mono)' }}
                >
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </nav>

        {/* ─── Collapse toggle + logout ─── */}
        <div
          className="shrink-0 p-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {!isCollapsed && activeUser && (
            <button
              onClick={() => { dataService.setActiveUser(undefined); setAuthenticated(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all mb-2 text-[13px]"
              style={{ color: 'var(--color-text-muted)', transition: 'all var(--transition-base)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <LogOut size={16} />
              <span>{t('logout') || 'Déconnexion'}</span>
            </button>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex w-full items-center gap-2 px-3 py-2 rounded-lg transition-all text-[13px]"
            style={{
              color: 'var(--color-text-subtle)',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              transition: 'all var(--transition-base)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!isCollapsed && <span>Réduire</span>}
          </button>
        </div>
      </aside>

      {/* ═══════════════ MAIN COLUMN ═══════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ─── TOPBAR ─── */}
        <header
          className="shrink-0 flex items-center px-6 gap-4"
          style={{
            height: 'var(--topbar-height)',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            position: 'sticky',
            top: 0,
            zIndex: 'var(--z-topbar)' as any,
          }}
        >
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden w-10 h-10 rounded-lg flex items-center justify-center transition-all"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            style={{ color: 'var(--color-text-muted)', transition: 'all var(--transition-base)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Search bar */}
          <div className="relative flex-1 max-w-[420px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-faint)' }}
            />
            <input
              type="text"
              readOnly
              onClick={() => setIsSearchOpen(true)}
              placeholder="Rechercher un patient, médicament, ordonnance…"
              className="w-full h-10 pl-9 pr-14 rounded-lg border text-[14px] cursor-pointer transition-all"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface-alt)',
                color: 'var(--color-text-muted)',
              }}
            />
            <kbd
              className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] rounded border"
              style={{ color: 'var(--color-text-subtle)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', fontFamily: 'var(--font-mono)' }}
            >
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* End-of-day */}
            <button
              onClick={() => {
                if (window.confirm("Voulez-vous effectuer la sauvegarde et archiver la journée ?")) {
                  dataService.exportFullBackup();
                  dataService.archiveDay();
                }
              }}
              className="hidden md:flex h-10 px-4 rounded-lg text-[13px] font-medium items-center gap-2 border transition-all"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
                background: 'transparent',
                transition: 'all var(--transition-base)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <Database size={15} />
              {t('end_of_day')}
            </button>

            {/* Notifications */}
            <button
              onClick={() => setCurrentView('notifications')}
              className="relative w-10 h-10 rounded-lg flex items-center justify-center transition-all"
              style={{ color: 'var(--color-text-muted)', transition: 'all var(--transition-base)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <Bell size={18} />
              <span
                className="absolute top-2 right-2 w-2 h-2 rounded-full"
                style={{ background: 'var(--color-danger)' }}
              />
            </button>

            <div className="w-px h-6 mx-1" style={{ background: 'var(--color-border)' }} />

            {/* User avatar */}
            <button
              onClick={() => setCurrentView('settings')}
              className="flex items-center gap-2 h-10 px-2 rounded-lg transition-all"
              style={{ transition: 'all var(--transition-base)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
                style={{ background: 'var(--color-primary)' }}
              >
                {userInitials}
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-text-subtle)' }} />
            </button>
          </div>
        </header>

        {/* ─── CONTENT AREA ─── */}
        <main
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ padding: '24px 28px' }}
        >
          <div style={{ maxWidth: 'var(--max-content-width)', margin: '0 auto' }}>
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <LoadingIndicator />
              </div>
            }>
              {renderView()}
            </Suspense>
          </div>

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
    </div>
  );
};

export default App;
