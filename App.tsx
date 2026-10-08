
import React, { useState, Suspense, useEffect, useRef } from 'react';
import { I18nProvider, useI18n } from './i18n';
import {
  LayoutDashboard, Users, FileText, Settings, BarChart3, PlusCircle,
  FolderOpen, CheckSquare, CalendarRange, Activity,
  ChevronLeft, ChevronRight, Menu, X, Bell, Database, Search,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import LoadingIndicator from './components/LoadingIndicator';
import WaveBackground from './components/WaveBackground';
import AppLockScreen from './components/AppLockScreen';
import WaitingRoomKiosk from './components/WaitingRoomKiosk';
import ToastContainer from './components/ToastContainer';
import { dataService } from './services/dataService';
import { notificationsService, TodoItem } from './services/notificationsService';
import { backupService, BACKUP_STATUS_EVENT } from './services/backupService';
import { toastService } from './services/toastService';
import { autoImportService } from './services/autoImportService';
import { securityService } from './services/securityService';
import { sessionService } from './services/sessionService';
import { useInactivityLock } from './services/useInactivityLock';
import { Patient, Permission, PrescriptionDraft } from './types';
import { LogOut, BookOpen, Wallet, Lock, Monitor } from 'lucide-react';
import {
  SettingsRoute, DEFAULT_SETTINGS_ROUTE, getSection, isSettingsHash, normalizeRoute,
  parseSettingsHash, sameRoute, settingsHash, visibleSettingsGroups,
} from './components/settings/settingsRoutes';
import { unsavedChanges } from './components/settings/unsavedChanges';
import { FEATURES } from './features';
import { endOfDay } from './services/endOfDay';
import { aiService } from './services/aiService';
import { useAiEnabled } from './services/useAiEnabled';
import { useAutoBackup } from './services/useAutoBackup';
import CabinetSetupGate from './components/CabinetSetupGate';
import { installPrintGuard } from './services/cabinetSetup';
import { useActiveProfile } from './components/ui/ActiveProfileContext';

// Lazy loading components for code splitting
const Dashboard = React.lazy(() => import('./components/Dashboard')) as React.LazyExoticComponent<React.ComponentType<any>>;
const PatientManager = React.lazy(() => import('./components/PatientManager'));
const PrescriptionEditor = React.lazy(() => import('./components/PrescriptionEditor'));
const SettingsPanel = React.lazy(() => import('./components/SettingsPanel')) as React.LazyExoticComponent<React.ComponentType<any>>;
const Analytics = React.lazy(() => import('./components/Analytics'));
const PatientDossier = React.lazy(() => import('./components/PatientDossier'));
const TaskManager = React.lazy(() => import('./components/TaskManager'));
const AssistantDashboard = React.lazy(() => import('./components/AssistantDashboard'));
const CashierView = React.lazy(() => import('./components/CashierView'));
const PatientDirectory = React.lazy(() => import('./components/PatientDirectory'));
// Raccourci de recherche affiché selon la plateforme (Ctrl K sous Windows et Linux).
const SEARCH_SHORTCUT = /Mac|iPhone|iPad/i.test(typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgent) : '') ? '⌘K' : 'Ctrl K';

const AppointmentManager = React.lazy(() => import('./components/AppointmentManager'));
const TodoDrawer = React.lazy(() => import('./components/TodoDrawer'));
const RemindersModal = React.lazy(() => import('./components/appointments/RemindersModal'));
const SmartDocInterface = React.lazy(() => import('./components/SmartDoc/SmartDocInterface'));
const GlobalSearch = React.lazy(() => import('./components/GlobalSearch'));
const MedicamentsPage = React.lazy(() => import('./components/MedicamentsPage'));

type View = 'dashboard' | 'patients' | 'appointments' | 'dossier' | 'new-prescription' | 'analytics' | 'settings' | 'tasks' | 'medical-directory' | 'smart-doc' | 'cashier' | 'patient-directory';

// Permission requise par écran. Un écran absent de cette table est refusé (liste blanche).
// Même règle que côté Rust : l'interface ne fait que la refléter.
const VIEW_PERMISSION: Record<View, Permission> = {
  dashboard: 'ACCESS_DASHBOARD',
  patients: 'MANAGE_PATIENTS',
  appointments: 'MANAGE_APPOINTMENTS',
  cashier: 'COLLECT_PAYMENTS',
  'patient-directory': 'MANAGE_PATIENTS',
  dossier: 'MANAGE_MEDICAL_RECORDS',
  'new-prescription': 'CREATE_PRESCRIPTION',
  analytics: 'VIEW_FINANCES',
  settings: 'MANAGE_SETTINGS',
  'smart-doc': 'USE_AI_ASSISTANT',
  tasks: 'DOCTOR_TOOLS',
  'medical-directory': 'DOCTOR_TOOLS',
};
// Fonctions masquées (features.ts) ou dépendantes de « Fonctions IA » : refusées comme un écran non autorisé.
const featureVisible = (view: View) =>
  (view !== 'tasks' || FEATURES.tasks) && (view !== 'smart-doc' || aiService.isEnabledCached());
const canOpen = (view: View) => !!VIEW_PERMISSION[view] && sessionService.can(VIEW_PERMISSION[view]) && featureVisible(view);

const App: React.FC = () => {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
};

const AppContent: React.FC = () => {
  const { t, lang, dir } = useI18n();
  // Un lien #/settings/... ouvre directement la bonne page des Paramètres
  // (route invalide → Mon profil).
  const initialSettingsHash = isSettingsHash(window.location.hash);
  const [currentView, setCurrentView] = useState<View>(initialSettingsHash ? 'settings' : 'dashboard');
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  // Profil de sécurité du catalogue : en mémoire seulement, remis à zéro à chaque changement de patient.
  const { resetProfile } = useActiveProfile();
  useEffect(() => { resetProfile(); }, [activePatient?.id, resetProfile]);
  // Impression bloquée tant que le nom ou l'INPE du médecin est vide.
  useEffect(() => installPrintGuard(), []);
  const [activePrescription, setActivePrescription] = useState<any | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Mode concentration : pendant une consultation la sidebar est masquée ; le choix du médecin est mémorisé.
  const [consultSidebarShown, setConsultSidebarShown] = useState<boolean>(() => {
    try { return localStorage.getItem('docease_consult_sidebar') === 'shown'; } catch { return false; }
  });
  const toggleConsultSidebar = () => setConsultSidebarShown(prev => {
    const next = !prev;
    try { localStorage.setItem('docease_consult_sidebar', next ? 'shown' : 'hidden'); } catch { /* préférence non mémorisée */ }
    return next;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [kioskMode, setKioskMode] = useState(false);
  // Verrouillage automatique (minutes ; 0 = désactivé, toujours le cas en développement).
  const [autoLockMinutes, setAutoLockMinutes] = useState(0);
  const [prescriptionDraft, setPrescriptionDraft] = useState<PrescriptionDraft | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoLoading, setTodoLoading] = useState(false);
  // Mandatory master-PIN gate — nothing below can load before this resolves, since
  // the encrypted store requires the AES key derived from this PIN (see
  // services/securityService.ts and src-tauri/src/lib.rs).
  const [securityChecked, setSecurityChecked] = useState(false);
  const [securityConfigured, setSecurityConfigured] = useState(false);
  const [securityUnlocked, setSecurityUnlocked] = useState(false);
  // Relit « Fonctions IA » à chaque changement : SmartDoc n'apparaît que s'il est activé.
  useAiEnabled(securityUnlocked);
  // Sauvegarde automatique du médecin (> 24 h) : au déverrouillage puis toutes les 30 min de contrôle.
  useAutoBackup(securityUnlocked);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(initialSettingsHash ? 'settings' : null);
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>(
    () => parseSettingsHash(window.location.hash) || DEFAULT_SETTINGS_ROUTE,
  );

  const activeUser = sessionService.get();

  // ─── Navigation guardée ───
  // Toute navigation qui ferait perdre un brouillon des Paramètres (autre vue,
  // autre section, autre onglet dont l'état n'est pas partagé) demande
  // confirmation. Les onglets de Cabinet partagent un brouillon : pas d'alerte.
  const leavesSettingsDraft = (to: SettingsRoute) => {
    if (currentView !== 'settings') return false;
    const from = normalizeRoute(settingsRoute);
    const next = normalizeRoute(to);
    if (sameRoute(from, next)) return false;
    return !(from.section === next.section && getSection(from.section).sharedDraft);
  };

  // Quitter une consultation avec des modifications non enregistrées passe par la même garde que les Paramètres.
  const leavesConsultation = (to: View) => currentView === 'new-prescription' && to !== 'new-prescription';

  const goToView = (view: View): boolean => {
    if (!canOpen(view)) return false;
    if (leavesConsultation(view) && !unsavedChanges.confirmLeave()) return false;
    if (currentView === 'settings' && view !== 'settings' && !unsavedChanges.confirmLeave()) return false;
    setCurrentView(view);
    return true;
  };

  const openSettings = (to: SettingsRoute): boolean => {
    if (!sessionService.can('MANAGE_SETTINGS')) return false;
    if (leavesSettingsDraft(to) && !unsavedChanges.confirmLeave()) return false;
    if (leavesConsultation('settings') && !unsavedChanges.confirmLeave()) return false;
    setSettingsRoute(normalizeRoute(to));
    setCurrentView('settings');
    return true;
  };

  // L'URL reflète la page des Paramètres affichée (#/settings/documents/design…)
  // et disparaît hors des Paramètres. replaceState : ne déclenche pas hashchange.
  useEffect(() => {
    const target = currentView === 'settings' ? settingsHash(settingsRoute) : '';
    if (window.location.hash === target) return;
    window.history.replaceState(null, '', target || window.location.pathname + window.location.search);
  }, [currentView, settingsRoute]);

  // Liens #/settings/... saisis ou cliqués (href) : même garde que la sidebar.
  // Refus → l'URL revient sur la page toujours affichée.
  const openSettingsRef = useRef(openSettings);
  openSettingsRef.current = openSettings;
  const settingsRouteRef = useRef(settingsRoute);
  settingsRouteRef.current = settingsRoute;
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash;
      if (!isSettingsHash(hash)) return;
      // Paramètres : médecin uniquement. Une URL #/settings/... saisie par une assistante est effacée.
      if (!sessionService.can('MANAGE_SETTINGS')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      const parsed = parseSettingsHash(hash) || DEFAULT_SETTINGS_ROUTE;
      const accepted = openSettingsRef.current(parsed);
      if (accepted) setExpandedMenu('settings');
      window.history.replaceState(null, '', settingsHash(accepted ? parsed : settingsRouteRef.current));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Sous-menu Paramètres de la sidebar — généré depuis settingsRoutes.ts, seule
  // navigation de niveau 1 (les onglets de niveau 2 sont en haut de page).
  const settingsGroups = visibleSettingsGroups();
  const doctor = securityUnlocked ? dataService.getDoctorInfo() : ({} as any);

  useEffect(() => {
    (async () => {
      const configured = await securityService.isConfigured();
      setSecurityConfigured(configured);
      setSecurityChecked(true);
    })();
  }, []);

  const handleUnlocked = () => {
    setSecurityUnlocked(true);
  };

  useEffect(() => {
    if (!securityUnlocked) return;
    const init = async () => {
      // Import automatique de fichiers déposés : médecin seulement (commande Rust réservée).
      if (sessionService.isMedecin()) await autoImportService.runAutoImport();
      await dataService.initialize();
      // L'écran initial doit être autorisé pour ce rôle (URL #/settings/... comprise).
      if (!sessionService.can('MANAGE_SETTINGS')) {
        setCurrentView(v => (canOpen(v) ? v : 'dashboard'));
        if (isSettingsHash(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      securityService.getSettings()
        .then(s => setAutoLockMinutes(s.enforced ? s.inactivityMinutes : 0))
        .catch(() => setAutoLockMinutes(0));
      setIsDataLoaded(true);
    };

    init();

    const handleResize = () => {
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
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
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [securityUnlocked]);

  const handleStartConsultation = (patient?: Patient) => {
    // Ouvrir une autre fiche pendant une consultation en cours = quitter celle-ci.
    if (currentView === 'new-prescription' && patient && patient.id !== activePatient?.id && !unsavedChanges.confirmLeave()) return;
    if (patient) {
      setActivePatient(patient);
      if (prescriptionDraft?.patient?.id !== patient.id) setPrescriptionDraft(null);
    }
    setActivePrescription(null);
    setCurrentView('new-prescription');
  };

  const refreshTodo = React.useCallback(() => {
    setTodoLoading(true);
    notificationsService.list(sessionService.isMedecin() ? dataService.getAllPatients() : [])
      .then(setTodoItems)
      .catch(() => setTodoItems([]))
      .finally(() => setTodoLoading(false));
  }, []);

  // Rafraîchi à l'ouverture de session, à chaque changement de données, après une sauvegarde et toutes les 5 minutes.
  useEffect(() => {
    if (!securityUnlocked) { setTodoItems([]); return; }
    refreshTodo();
    const timer = setInterval(refreshTodo, 5 * 60 * 1000);
    window.addEventListener('meddoc_data_update', refreshTodo);
    window.addEventListener(BACKUP_STATUS_EVENT, refreshTodo);
    return () => {
      clearInterval(timer);
      window.removeEventListener('meddoc_data_update', refreshTodo);
      window.removeEventListener(BACKUP_STATUS_EVENT, refreshTodo);
    };
  }, [securityUnlocked, refreshTodo]);

  const runTodoAction = async (item: TodoItem) => {
    switch (item.action) {
      case 'backup_now':
        try { await backupService.runNow(); toastService.success('Sauvegarde effectuée'); } catch (e) { toastService.error(String((e as Error).message || e)); }
        refreshTodo();
        return;
      case 'open_backup_settings':
        if (openSettings({ section: 'database' })) setTodoOpen(false);
        return;
      case 'open_receipts_settings':
        if (openSettings({ section: 'cabinet', tab: 'coordonnees' })) setTodoOpen(false);
        return;
      case 'open_reminders':
        setRemindersOpen(true);
        return;
      case 'open_appointments':
        if (goToView('appointments')) setTodoOpen(false);
        return;
      case 'open_billing':
        if (goToView(canOpen('analytics') ? 'analytics' : 'cashier')) setTodoOpen(false);
        return;
      case 'open_dossier': {
        const patient = item.patientId ? dataService.getAllPatients().find(p => p.id === item.patientId) : undefined;
        if (goToView('dossier')) { if (patient) setActivePatient(patient); setTodoOpen(false); }
        return;
      }
    }
  };

  const hasPermission = (permission: string) => sessionService.can(permission as Permission);

  // Verrouillage / changement d'utilisateur : Rust efface la clé et la session, et
  // plus rien du compte précédent ne reste en mémoire côté interface.
  const handleLock = async () => {
    await securityService.lock();
    dataService.reset();
    resetProfile();
    setIsDataLoaded(false);
    setSecurityUnlocked(false);
    setCurrentView('dashboard');
    setActivePatient(null);
    setActivePrescription(null);
    setPrescriptionDraft(null);
    setExpandedMenu(null);
    setKioskMode(false);
    setIsSearchOpen(false);
    setAutoLockMinutes(0);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  // Pas de verrouillage automatique pendant l'écran salle d'attente : on n'en sort qu'avec le mot de passe.
  useInactivityLock(securityUnlocked && isDataLoaded && !kioskMode, autoLockMinutes, handleLock);

  const renderView = () => {
    // Liste blanche : tout écran non autorisé pour ce rôle est refusé.
    if (!canOpen(currentView)) return <AccessDenied />;
    const isMedecin = sessionService.isMedecin();

    switch (currentView) {
      case 'cashier': return <CashierView />;
      case 'patient-directory': return <PatientDirectory />;
      case 'dashboard': return !isMedecin ? <AssistantDashboard onNavigate={goToView} /> : (
        <Dashboard
          onNewPrescription={handleStartConsultation}
          onNavigate={goToView}
          onOpenBackupSettings={() => openSettings({ section: 'database' })}
          onViewDossier={(patientId) => {
            const p = dataService.getAllPatients().find(pat => pat.id === patientId || pat.name === patientId);
            if (p) setActivePatient(p);
            setCurrentView('dossier');
          }}
        />
      );
      case 'patients': return <PatientManager onConsult={isMedecin ? handleStartConsultation : undefined} />;
      case 'appointments': return (
        <AppointmentManager
          onOpenDossier={isMedecin ? (p) => { setActivePatient(p); setCurrentView('dossier'); } : undefined}
          onStartConsultation={isMedecin ? handleStartConsultation : undefined}
        />
      );
      case 'dossier': return <PatientDossier initialPatient={activePatient} onNavigate={(view, data) => {
        if (view === 'smart-doc') setCurrentView('smart-doc');
        if (view === 'prescriptions' && data?.prescription) {
          setActivePrescription(data.prescription);
          setCurrentView('new-prescription');
        }
        if (view === 'new-prescription') handleStartConsultation(data?.patient);
      }} />;
      case 'new-prescription': return (
        <CabinetSetupGate onOpenSettings={openSettings}>
        <PrescriptionEditor
          initialPatient={activePatient}
          initialPrescription={activePrescription}
          draft={prescriptionDraft}
          onDraftChange={setPrescriptionDraft}
          sidebarShown={consultSidebarShown}
          onToggleSidebar={toggleConsultSidebar}
          onFinish={() => {
            setActivePatient(null);
            setActivePrescription(null);
            setPrescriptionDraft(null);
            setCurrentView('dashboard');
          }}
        />
        </CabinetSetupGate>
      );
      case 'analytics': return <Analytics />;
      case 'tasks': return <TaskManager />;
      case 'settings': return <SettingsPanel route={settingsRoute} onNavigate={openSettings} />;
      case 'smart-doc': return <SmartDocInterface />;
      case 'medical-directory': return <MedicamentsPage />;
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
    // Page Patients de l'assistante (identité uniquement) ; le médecin a le dossier complet ci-dessous.
    { id: 'patient-directory', label: 'Patients', icon: FolderOpen, requiredPermission: 'MANAGE_PATIENTS', assistantOnly: true },
    { id: 'cashier', label: 'Encaissement', icon: Wallet, requiredPermission: 'COLLECT_PAYMENTS' },
    { id: 'tasks', label: t('tasks'), icon: CheckSquare, requiredPermission: 'DOCTOR_TOOLS' },
    { id: 'new-prescription', label: t('new_consultation'), icon: PlusCircle, requiredPermission: 'CREATE_PRESCRIPTION' },
    { id: 'dossier', label: t('patients'), icon: FolderOpen, requiredPermission: 'MANAGE_MEDICAL_RECORDS' },
    { id: 'smart-doc', label: t('smart_doc'), icon: FileText, highlight: true, requiredPermission: 'USE_AI_ASSISTANT' },
    // Clinical, daily-use tools
    { id: 'medical-directory', label: 'Médicaments', icon: BookOpen, requiredPermission: 'DOCTOR_TOOLS' },
    // Outils administratifs
    { id: 'analytics', label: 'Comptabilité', icon: BarChart3, requiredPermission: 'VIEW_FINANCES' },
    { id: 'settings', label: t('settings'), icon: Settings, requiredPermission: 'MANAGE_SETTINGS' },
  ].filter(item => featureVisible(item.id as View) && (!item.requiredPermission || hasPermission(item.requiredPermission)) && !((item as any).assistantOnly && sessionService.isMedecin()));

  // ─── Loading & Auth gates ───
  if (!securityChecked) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <LoadingIndicator />
      </div>
    );
  }

  // Mandatory master PIN — gates the encryption key itself, so no patient data can
  // load (dataService.initialize) until this resolves.
  if (!securityUnlocked) {
    return <AppLockScreen mode={securityConfigured ? 'unlock' : 'setup'} onUnlocked={handleUnlocked} />;
  }

  if (!isDataLoaded) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <LoadingIndicator />
      </div>
    );
  }

  // Affichage de la salle d'attente : lancé depuis une session ouverte, il n'affiche
  // que « numéro — Prénom I. » et demande le mot de passe pour en sortir.
  if (kioskMode) {
    return <WaitingRoomKiosk onExit={() => setKioskMode(false)} />;
  }

  const userInitials = (activeUser?.name || doctor.nameFr || 'D').substring(0, 2).toUpperCase();
  const focusMode = currentView === 'new-prescription' && !consultSidebarShown;
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
        aria-hidden={focusMode}
        className={`
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          fixed top-0 left-0 bottom-0 flex flex-col
          transition-all duration-300
        `}
        style={{
          width: focusMode ? 0 : isCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
          visibility: focusMode ? 'hidden' : 'visible',
          overflow: 'hidden',
          background: 'var(--color-surface)',
          borderRight: focusMode ? 'none' : '1px solid var(--color-border)',
          height: '100vh',
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        {/* ─── Logo block ─── */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            padding: isCollapsed ? '16px 8px' : '20px',
            borderBottom: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}
        >
          <img
            src="/logo.png"
            alt="DocEase"
            className={isCollapsed ? 'w-16 h-16 shrink-0' : 'w-20 h-20 shrink-0'}
            style={{ objectFit: 'contain' }}
          />
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
                  {sessionService.isMedecin() ? (doctor.specialtyFr || t('doctor')) : 'Assistante'}
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
            const isSettingsExpanded = expandedMenu === 'settings';
            const isSettingsItem = item.id === 'settings';
            // Seul l'élément Paramètres porte l'état « déplié » : les autres ne doivent pas s'afficher actifs.
            const isItemExpanded = isSettingsItem && isSettingsExpanded;

            return (
              <div key={item.id}>
                <button
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => {
                    if (isSettingsItem) {
                      // Toggle settings menu expansion
                      setExpandedMenu(isItemExpanded ? null : 'settings');
                    } else {
                      if (!goToView(item.id as View)) return;
                      if (item.id !== 'new-prescription') setActivePatient(null);
                      setExpandedMenu(null); // Close settings menu when switching views
                      setIsMobileMenuOpen(false);
                    }
                  }}
                  className={`relative w-full flex items-center justify-between rounded-lg text-left transition-all`}
                  style={{
                    gap: isCollapsed ? 0 : '10px',
                    padding: isCollapsed ? '10px' : '10px 12px',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    background: isActive || isItemExpanded ? 'var(--color-primary-50)' : 'transparent',
                    color: isActive || isItemExpanded ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontWeight: isActive || isItemExpanded ? 600 : 500,
                    fontSize: '14px',
                    transition: 'all var(--transition-base)',
                  }}
                  onMouseEnter={e => {
                    if (!isActive && !isItemExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive && !isItemExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div className="flex items-center" style={{ gap: isCollapsed ? 0 : '10px' }}>
                    {(isActive || isItemExpanded) && (
                      <span
                        className="absolute left-0 rounded-r"
                        style={{ top: '8px', bottom: '8px', width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0' }}
                      />
                    )}
                    <item.icon size={18} strokeWidth={isActive || isItemExpanded ? 2.25 : 2} className="shrink-0" />
                    {!isCollapsed && <span className="truncate flex-1" title={item.label}>{item.label}</span>}
                  </div>
                  {isSettingsItem && !isCollapsed && (
                    <ChevronRight
                      size={16}
                      style={{
                        transform: isItemExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform var(--transition-base)',
                      }}
                    />
                  )}
                  {item.highlight && !isCollapsed && !isSettingsItem && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: 'var(--color-secondary)' }}
                    />
                  )}
                </button>

                {/* Settings sub-menu */}
                {isSettingsItem && isSettingsExpanded && !isCollapsed && (
                  <div style={{ overflow: 'hidden', maxHeight: isSettingsExpanded ? '760px' : '0px', transition: 'max-height var(--transition-base)' }}>
                    {settingsGroups.map((group, groupIndex) => (
                      <div key={group.title} style={{ marginTop: groupIndex === 0 ? 0 : '6px' }}>
                        <div
                          className="truncate"
                          style={{ padding: '6px 12px 4px 40px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-faint)' }}
                        >
                          {group.title}
                        </div>
                        {group.sections.map((subItem) => {
                          const isSubActive = currentView === 'settings' && settingsRoute.section === subItem.id;
                          return (
                          <button
                            key={subItem.id}
                            aria-current={isSubActive ? 'page' : undefined}
                            onClick={() => {
                              if (openSettings({ section: subItem.id })) setIsMobileMenuOpen(false);
                            }}
                            // Survol en CSS : un style posé à la main au survol restait
                            // collé après un changement de section (fond actif perdu).
                            className={`relative w-full flex items-center rounded-lg text-left transition-all ${isSubActive ? 'bg-[var(--color-primary-50)]' : 'hover:bg-[var(--color-surface-alt)]'}`}
                            style={{
                              gap: '8px',
                              padding: '8px 12px 8px 40px',
                              color: isSubActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                              fontWeight: isSubActive ? 600 : 500,
                              fontSize: '13px',
                              transition: 'all var(--transition-base)',
                            }}
                          >
                            {isSubActive && (
                              <span
                                className="absolute left-0 rounded-r"
                                style={{ top: '6px', bottom: '6px', width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0' }}
                              />
                            )}
                            <subItem.icon size={16} className="shrink-0" />
                            <span className="truncate flex-1" title={subItem.label}>{subItem.label}</span>
                          </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ─── Collapse toggle + logout ─── */}
        <div
          className="shrink-0 p-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {!isCollapsed && (
            <>
              <button
                onClick={() => setKioskMode(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all mb-1 text-[13px]"
                style={{ color: 'var(--color-text-muted)', transition: 'all var(--transition-base)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <Monitor size={16} />
                <span>Écran salle d'attente</span>
              </button>
              <button
                onClick={handleLock}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all mb-2 text-[13px]"
                style={{ color: 'var(--color-text-muted)', transition: 'all var(--transition-base)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <Lock size={16} />
                <span>Verrouiller / changer d'utilisateur</span>
              </button>
            </>
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ marginLeft: focusMode ? 0 : 'var(--sidebar-width)', transition: 'margin-left var(--transition-base)' }}>

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
            ...(focusMode ? { display: 'none' } : {}),
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
              className="w-full h-10 pl-9 pr-20 rounded-lg border text-[14px] cursor-pointer text-ellipsis transition-all"
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
              {SEARCH_SHORTCUT}
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* End-of-day */}
            {sessionService.isMedecin() && <button
              onClick={() => { void endOfDay(); }}
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
            </button>}

            {/* À faire : la cloche ouvre le panneau ; le badge compte les actions restantes */}
            {securityUnlocked && <button
              onClick={() => setTodoOpen(true)}
              aria-label={todoItems.length > 0 ? `À faire : ${todoItems.length} action${todoItems.length > 1 ? 's' : ''}` : 'À faire'}
              className="relative w-10 h-10 rounded-lg flex items-center justify-center transition-all"
              style={{ color: 'var(--color-text-muted)', transition: 'all var(--transition-base)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-alt)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <Bell size={18} />
              {todoItems.length > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium leading-4 text-center text-white"
                  style={{ background: todoItems.some(i => i.severity === 'critical') ? 'var(--color-danger)' : 'var(--color-warning-hover)' }}
                >
                  {todoItems.length > 99 ? '99+' : todoItems.length}
                </span>
              )}
            </button>}

            <div className="w-px h-6 mx-1" style={{ background: 'var(--color-border)' }} />

            {/* Utilisateur : nom en haut ; le médecin accède aux Paramètres, l'assistante verrouille */}
            <button
              title={activeUser ? `${activeUser.name} — ${activeUser.role === 'Medecin' ? 'Médecin' : 'Assistante'}` : undefined}
              onClick={() => { if (hasPermission('MANAGE_SETTINGS')) { setExpandedMenu('settings'); goToView('settings'); } else { void handleLock(); } }}
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
              <span className="hidden md:inline text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>{activeUser?.name}</span>
              <ChevronRight size={14} style={{ color: 'var(--color-text-subtle)' }} />
            </button>
          </div>
        </header>

        {/* ─── CONTENT AREA ─── */}
        <main
          className="flex-1 overflow-y-auto scrollbar-hide"
          style={{ padding: '24px 28px' }}
        >
          <div style={{
            maxWidth: currentView === 'new-prescription'
              || (currentView === 'settings' && settingsRoute.section === 'documents' && normalizeRoute(settingsRoute).tab === 'design')
              ? 'none' : 'var(--max-content-width)',
            margin: '0 auto',
          }}>
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <LoadingIndicator />
              </div>
            }>
              {renderView()}
            </Suspense>
          </div>

          {todoOpen && (
            <Suspense fallback={null}>
              <TodoDrawer
                items={todoItems}
                loading={todoLoading}
                onClose={() => setTodoOpen(false)}
                onAction={runTodoAction}
                onSnooze={item => { void notificationsService.snooze(item).then(refreshTodo); }}
                onDismiss={item => { void notificationsService.dismiss(item).then(refreshTodo); }}
              />
            </Suspense>
          )}

          {remindersOpen && (
            <Suspense fallback={null}>
              <RemindersModal onClose={() => setRemindersOpen(false)} />
            </Suspense>
          )}

          {isSearchOpen && (
            <Suspense fallback={null}>
              <GlobalSearch
                onClose={() => setIsSearchOpen(false)}
                onSelectPatient={(p) => {
                  setIsSearchOpen(false);
                  if (!goToView(sessionService.isMedecin() ? 'dossier' : 'patients')) return;
                  setActivePatient(p);
                }}
                onConsult={sessionService.isMedecin() ? (p) => {
                  setIsSearchOpen(false);
                  if (currentView === 'settings' && !unsavedChanges.confirmLeave()) return;
                  handleStartConsultation(p);
                } : undefined}
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
