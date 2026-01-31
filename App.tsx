
import React, { useState, Suspense, useEffect } from 'react';
import {
  LayoutDashboard, Users, FileText, Settings, BarChart3, PlusCircle,
  Pill, FolderOpen, CheckSquare, CalendarRange, Activity,
  ChevronLeft, ChevronRight, Menu, X
} from 'lucide-react';
import LoadingIndicator from './components/LoadingIndicator';
import WaveBackground from './components/WaveBackground';
import PinDialog from './components/PinDialog';
import { dataService } from './services/dataService';
import { Patient } from './types';

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

type View = 'dashboard' | 'patients' | 'appointments' | 'dossier' | 'new-prescription' | 'medicines' | 'analytics' | 'settings' | 'tasks' | 'compatibility';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const doctor = dataService.getDoctorInfo();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleStartConsultation = (patient?: Patient) => {
    if (patient) {
      setActivePatient(patient);
    } else {
      setActivePatient(null);
    }
    setCurrentView('new-prescription');
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard onNewPrescription={handleStartConsultation} />;
      case 'patients': return <PatientManager onConsult={handleStartConsultation} />;
      case 'appointments': return <AppointmentManager />;
      case 'dossier': return <PatientDossier />;
      case 'new-prescription': return <PrescriptionEditor initialPatient={activePatient} onFinish={() => { setActivePatient(null); setCurrentView('dashboard'); }} />;
      case 'medicines': return <MedicineManager />;
      case 'compatibility': return <DrugCompatibility />;
      case 'analytics': return <Analytics />;
      case 'tasks': return <TaskManager />;
      case 'settings': return <SettingsPanel />;
      default: return <Dashboard onNewPrescription={handleStartConsultation} />;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'patients', label: 'Salle d\'Attente', icon: Users },
    { id: 'appointments', label: 'Rendez-vous', icon: CalendarRange },
    { id: 'tasks', label: 'Tâches & Rappels', icon: CheckSquare },
    { id: 'dossier', label: 'Dossiers Patients', icon: FolderOpen },
    { id: 'new-prescription', label: 'Nouvelle Ordonnance', icon: PlusCircle, highlight: true },
    { id: 'medicines', label: 'Médicaments', icon: Pill },
    { id: 'compatibility', label: 'Interactions', icon: Activity },
    { id: 'analytics', label: 'Finances', icon: BarChart3 },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  if (doctor.pinEnabled && !authenticated) {
    return <PinDialog onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans text-gray-900 relative">
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
        </nav>

        {!isCollapsed && (
          <div className="p-4 border-t border-emerald-200/20">
            <div className="gradient-emerald-teal rounded-2xl p-4 text-white shadow-soft-lg">
              <p className="text-[10px] opacity-70 mb-1 font-bold uppercase tracking-widest">Système</p>
              <p className="text-[10px] font-semibold flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-200 rounded-full animate-pulse"></span>
                Mode Hors-ligne
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
      </main>
    </div>
  );
};

export default App;
