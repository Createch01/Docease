import React, { useState, useEffect, useRef } from 'react';
import {
  Save, User, Building2, FileText, Lock, Database, Info,
  MapPin, Phone, Mail, Upload, Trash2, ShieldCheck,
  RefreshCw, Download, Monitor, Globe, CreditCard, X,
  Eye, EyeOff, Barcode, QrCode, Plus, Users
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { settingsService } from '../services/settingsService';
import { DoctorInfo, PrescriptionAppearance } from '../types';
import ExactPrescriptionTemplate from './ExactPrescriptionTemplate';
import { invoke } from '@tauri-apps/api/core';
import packageJson from '../package.json';
import { AppUser, UserRole, Permission } from '../types';
import { useI18n, Language } from '../i18n';

type SettingsTab = 'profile' | 'cabinet' | 'prescription' | 'security' | 'users' | 'database';

const SettingsPanel: React.FC = () => {
  const { t, lang, changeLanguage } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [info, setInfo] = useState<DoctorInfo>(dataService.getDoctorInfo());
  const [appearance, setAppearance] = useState<PrescriptionAppearance>(settingsService.getAppearance());
  const [previewScale, setPreviewScale] = useState(0.22);

  // Security State
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const SENSITIVE_TABS: SettingsTab[] = ['security', 'users', 'database'];
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [pinEnabledLocal, setPinEnabledLocal] = useState<boolean>(info.pinEnabled || false);
  const [settingsPinInput, setSettingsPinInput] = useState(''); // Input for settings lock

  // Database State
  const [dbStats, setDbStats] = useState(dataService.getDatabaseStats());
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Users State
  const [users, setUsers] = useState<AppUser[]>(dataService.getUsers());
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUser, setNewUser] = useState<Partial<AppUser>>({ name: '', pin: '', role: 'User', permissions: [] });

  // Update State
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // File Refs
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDbStats(dataService.getDatabaseStats());
    setUsers(dataService.getUsers());
  }, []);

  const handleAddUser = () => {
    if (!newUser.name || !newUser.pin || newUser.pin.length < 4) {
      alert("Veuillez remplir le nom et un PIN d'au moins 4 chiffres.");
      return;
    }
    const user: AppUser = {
      id: Date.now().toString(),
      name: newUser.name,
      pin: newUser.pin,
      role: newUser.role as UserRole || 'User',
      permissions: newUser.permissions || [],
      createdAt: new Date().toISOString()
    };
    dataService.saveUser(user);
    setUsers(dataService.getUsers());
    setNewUser({ name: '', pin: '', role: 'User', permissions: [] });
    setShowUserForm(false);
  };

  const handleDeleteUser = (id: string) => {
    if (window.confirm("Supprimer cet utilisateur ?")) {
      dataService.deleteUser(id);
      setUsers(dataService.getUsers());
    }
  };

  const handleSaveInfo = () => {
    dataService.saveDoctorInfo(info);
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 font-bold';
    toast.textContent = 'Paramètres enregistrés avec succès !';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handleSaveAppearance = () => {
    settingsService.saveAppearance(appearance);

    // Save logo preferences to DoctorInfo as well for backward compatibility/printing
    const updatedInfo = {
      ...info,
      logoUrl: appearance.logoUrl,
      logoScale: appearance.logoScale,
    };
    setInfo(updatedInfo);
    dataService.saveDoctorInfo(updatedInfo);

    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-purple-600 text-white px-6 py-3 rounded-2xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-4 font-bold';
    toast.textContent = 'Apparence mise à jour !';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await settingsService.fileToBase64(file);
      setAppearance({ ...appearance, logoUrl: base64 });
      setInfo({ ...info, logoUrl: base64 }); // Sync with info
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Erreur lors du chargement du logo');
    }
  };

  const handleBackupExport = () => {
    dataService.exportFullBackup();
    setDbStats(dataService.getDatabaseStats());
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (window.confirm("ATTENTION : Cette action remplacera toutes vos données actuelles. Continuer ?")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          if (dataService.importFullBackup(event.target.result)) {
            alert("Restauration réussie !");
            window.location.reload();
          } else {
            alert("Fichier de sauvegarde invalide.");
          }
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCheckUpdate = async () => {
    try {
      const update = await invoke('plugin:updater|check');
      if (update) {
        setUpdateAvailable(true);
        alert(`Mise à jour disponible !`);
      } else {
        alert("Aucune mise à jour disponible.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifySettingsPin = () => {
    if (settingsPinInput === info.pin) {
      setIsAdminUnlocked(true);
      setSettingsPinInput('');
    } else {
      alert("Code PIN incorrect.");
      setSettingsPinInput('');
    }
  };

  const AdminLock = () => (
    <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
        <Lock size={32} />
      </div>
      <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Zone Sécurisée</h3>
      <p className="text-gray-500 mt-2 text-sm text-center max-w-xs">Cette section contient des paramètres sensibles. Veuillez saisir votre code PIN administrateur.</p>

      <div className="mt-8 space-y-4 w-full max-w-xs">
        <input
          type="password"
          value={settingsPinInput}
          onChange={e => setSettingsPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-center text-2xl font-black tracking-[0.5em] outline-none focus:ring-4 ring-amber-100 transition-all font-mono"
          onKeyDown={e => e.key === 'Enter' && handleVerifySettingsPin()}
        />
        <button
          onClick={handleVerifySettingsPin}
          className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all uppercase text-xs tracking-widest"
        >
          Déverrouiller
        </button>
      </div>
    </div>
  );

  const menuItems = [
    { id: 'profile', label: 'Profil Médecin', icon: User, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'cabinet', label: 'Infos Cabinet', icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'prescription', label: 'Ordonnance', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 'security', label: 'Sécurité', icon: Lock, color: 'text-rose-600', bg: 'bg-rose-50' },
    { id: 'users', label: 'Utilisateurs', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'database', label: 'Données', icon: Database, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-6 animate-in fade-in duration-500">
      {/* Sidebar Navigation */}
      <div className="w-72 bg-white rounded-[2rem] shadow-sm border border-gray-100 p-4 flex flex-col gap-2 h-full">
        <div className="px-4 py-4 mb-2">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Paramètres</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">Configuration Générale</p>
        </div>

        <div className="space-y-1 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <nav className="flex flex-col gap-1">
            {[
              { id: 'profile', label: 'Mon Profil', icon: User, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { id: 'cabinet', label: 'Cabinet Infos', icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
              { id: 'prescription', label: 'Mise en page', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
              { id: 'security', label: 'Sécurité PIN', icon: Lock, color: 'text-rose-600', bg: 'bg-rose-50' },
              { id: 'users', label: 'Collaborateurs', icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-50' },
              { id: 'database', label: 'Base de données', icon: Database, color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as SettingsTab);
                  if (!SENSITIVE_TABS.includes(tab.id as SettingsTab)) {
                    // Auto-lock if moving to non-sensitive tab? Maybe not to avoid frustration
                  }
                }}
                className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl font-bold transition-all text-sm group ${activeTab === tab.id ? `${tab.bg} ${tab.color} shadow-sm ring-1 ring-black/5` : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
              >
                <div className={`p-1.5 rounded-lg transition-colors ${activeTab === tab.id ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
                  <tab.icon size={18} />
                </div>
                <span>{tab.label}</span>
                {SENSITIVE_TABS.includes(tab.id as SettingsTab) && !isAdminUnlocked && info.pinEnabled && (
                  <Lock size={12} className="ml-auto opacity-40" />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <button
            onClick={handleCheckUpdate}
            className="w-full flex items-center gap-3 text-xs font-bold text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <RefreshCw size={14} className={updateAvailable ? "animate-spin text-emerald-600" : ""} />
            <span>Vérifier mises à jour</span>
          </button>
          <div className="mt-2 text-[10px] text-gray-400 font-mono text-center">
            v{packageJson.version} • Build 2026
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8 overflow-y-auto relative h-full custom-scrollbar">

        {SENSITIVE_TABS.includes(activeTab) && info.pinEnabled && !isAdminUnlocked ? (
          <AdminLock />
        ) : (
          <>
            {activeTab === 'profile' && (
              <div className="space-y-8 max-w-4xl mx-auto animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                      <User size={28} className="text-blue-600" /> Profil Professionnel
                    </h3>
                    <p className="text-gray-500 mt-1">Vos informations personnelles affichées sur les documents.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                      <button
                        onClick={() => changeLanguage('fr')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === 'fr' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
                      >
                        Français
                      </button>
                      <button
                        onClick={() => changeLanguage('ar')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === 'ar' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
                      >
                        العربية
                      </button>
                    </div>
                    <button onClick={handleSaveInfo} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-100 transition-transform active:scale-95 flex items-center gap-2">
                      <Save size={18} /> Enregistrer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* French Profile */}
                  <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🇫🇷</span>
                      <span className="font-black text-gray-900 text-sm uppercase tracking-wider">Version Française</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 ml-2 mb-1 block">Nom & Prénom</label>
                        <input
                          type="text"
                          value={info.nameFr}
                          onChange={e => setInfo({ ...info, nameFr: e.target.value })}
                          className="w-full px-5 py-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl shadow-sm outline-none font-bold text-gray-800 transition-all placeholder:font-normal"
                          placeholder="Dr. Nom Prénom"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 ml-2 mb-1 block">Spécialité</label>
                        <input
                          type="text"
                          value={info.specialtyFr}
                          onChange={e => setInfo({ ...info, specialtyFr: e.target.value })}
                          className="w-full px-5 py-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl shadow-sm outline-none font-bold text-gray-800 transition-all"
                          placeholder="Médecine Générale"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 ml-2 mb-1 block">Diplômes & Mentions</label>
                        <textarea
                          value={info.diplomasFr}
                          onChange={e => setInfo({ ...info, diplomasFr: e.target.value })}
                          className="w-full px-5 py-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl shadow-sm outline-none font-medium text-gray-800 h-32 resize-none transition-all"
                          placeholder="Liste des diplômes..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Arabic Profile */}
                  <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-5" dir="rtl">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🇲🇦</span>
                      <span className="font-black text-gray-900 text-sm uppercase tracking-wider">النسخة العربية</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 mr-2 mb-1 block">الاسم الكامل</label>
                        <input
                          type="text"
                          value={info.nameAr}
                          onChange={e => setInfo({ ...info, nameAr: e.target.value })}
                          className="w-full px-5 py-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl shadow-sm outline-none font-bold text-gray-800 transition-all text-right"
                          placeholder="د. الاسم الكامل"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 mr-2 mb-1 block">الاختصاص</label>
                        <input
                          type="text"
                          value={info.specialtyAr}
                          onChange={e => setInfo({ ...info, specialtyAr: e.target.value })}
                          className="w-full px-5 py-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl shadow-sm outline-none font-bold text-gray-800 transition-all text-right"
                          placeholder="طب عام"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 mr-2 mb-1 block">الديبلومات</label>
                        <textarea
                          value={info.diplomasAr}
                          onChange={e => setInfo({ ...info, diplomasAr: e.target.value })}
                          className="w-full px-5 py-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-2xl shadow-sm outline-none font-medium text-gray-800 h-32 resize-none transition-all text-right"
                          placeholder="لائحة الديبلومات..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'cabinet' && (
              <div className="space-y-8 max-w-4xl mx-auto animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                      <Building2 size={28} className="text-emerald-600" /> Informations du Cabinet
                    </h3>
                    <p className="text-gray-500 mt-1">Coordonnées et identifiants légaux.</p>
                  </div>
                  <button onClick={handleSaveInfo} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 transition-transform active:scale-95 flex items-center gap-2">
                    <Save size={18} /> Enregistrer
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Contact Info */}
                  <div className="bg-white p-1 rounded-3xl space-y-6">
                    <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <MapPin size={20} className="text-emerald-500" /> Contact & Localisation
                    </h4>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="group">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-3 mb-1 block">Téléphone</label>
                        <div className="flex items-center px-4 py-3 bg-gray-50 group-focus-within:bg-white group-focus-within:ring-2 ring-emerald-100 rounded-2xl transition-all border border-gray-100">
                          <Phone size={18} className="text-gray-400 mr-3" />
                          <input
                            type="text"
                            value={info.phone}
                            onChange={e => setInfo({ ...info, phone: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none font-bold text-gray-800"
                            placeholder="05..."
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-3 mb-1 block">Email</label>
                        <div className="flex items-center px-4 py-3 bg-gray-50 group-focus-within:bg-white group-focus-within:ring-2 ring-emerald-100 rounded-2xl transition-all border border-gray-100">
                          <Mail size={18} className="text-gray-400 mr-3" />
                          <input
                            type="text"
                            value={info.email}
                            onChange={e => setInfo({ ...info, email: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none font-bold text-gray-800"
                            placeholder="docteur@exemple.com"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-3 mb-1 block">Adresse (Fr)</label>
                        <div className="flex items-start px-4 py-3 bg-gray-50 group-focus-within:bg-white group-focus-within:ring-2 ring-emerald-100 rounded-2xl transition-all border border-gray-100">
                          <MapPin size={18} className="text-gray-400 mr-3 mt-1" />
                          <textarea
                            value={info.addressFr}
                            onChange={e => setInfo({ ...info, addressFr: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none font-medium text-gray-800 resize-none h-20"
                            placeholder="123 Avenue..."
                          />
                        </div>
                      </div>
                      <div className="group" dir="rtl">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pr-3 mb-1 block text-right">العنوان</label>
                        <div className="flex items-start px-4 py-3 bg-gray-50 group-focus-within:bg-white group-focus-within:ring-2 ring-emerald-100 rounded-2xl transition-all border border-gray-100">
                          <textarea
                            value={info.addressAr}
                            onChange={e => setInfo({ ...info, addressAr: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none font-medium text-gray-800 resize-none h-20 text-right"
                            placeholder="شارع..."
                          />
                          <MapPin size={18} className="text-gray-400 ml-3 mt-1" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legal Info */}
                  <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100 space-y-6">
                    <h4 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                      <CreditCard size={20} className="text-emerald-600" /> Identifiants Légaux
                    </h4>

                    <div className="space-y-4">
                      <div>
                        <label className="flex items-center justify-between text-xs font-bold text-emerald-700/60 uppercase tracking-widest pl-1 mb-1">
                          <span>INPE</span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Requis</span>
                        </label>
                        <input
                          type="text"
                          value={info.inpe || ''}
                          onChange={e => setInfo({ ...info, inpe: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-emerald-100 focus:ring-2 ring-emerald-200 rounded-xl font-mono font-bold text-emerald-900 outline-none"
                          placeholder="Code National"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest pl-1 mb-1 block">ICE</label>
                          <input
                            type="text"
                            value={info.ice || ''}
                            onChange={e => setInfo({ ...info, ice: e.target.value })}
                            className="w-full px-4 py-3 bg-white border border-emerald-100 focus:ring-2 ring-emerald-200 rounded-xl font-mono font-bold text-emerald-900 outline-none"
                            placeholder="Numéro ICE"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest pl-1 mb-1 block">Patente</label>
                          <input
                            type="text"
                            value={info.patente || ''}
                            onChange={e => setInfo({ ...info, patente: e.target.value })}
                            className="w-full px-4 py-3 bg-white border border-emerald-100 focus:ring-2 ring-emerald-200 rounded-xl font-mono font-bold text-emerald-900 outline-none"
                            placeholder="N° Patente"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest pl-1 mb-1 block">Identifiant Fiscal</label>
                          <input
                            type="text"
                            value={info.taxId || ''}
                            onChange={e => setInfo({ ...info, taxId: e.target.value })}
                            className="w-full px-4 py-3 bg-white border border-emerald-100 focus:ring-2 ring-emerald-200 rounded-xl font-mono font-bold text-emerald-900 outline-none"
                            placeholder="N° IF"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest pl-1 mb-1 block">RC (Optionnel)</label>
                          <input
                            type="text"
                            value={info.rc || ''}
                            onChange={e => setInfo({ ...info, rc: e.target.value })}
                            className="w-full px-4 py-3 bg-white border border-emerald-100 focus:ring-2 ring-emerald-200 rounded-xl font-mono font-bold text-emerald-900 outline-none"
                            placeholder="Registre Commerce"
                          />
                        </div>
                      </div>

                      <div className="bg-emerald-100/50 p-4 rounded-xl flex gap-3">
                        <Info size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-800 leading-relaxed">
                          Ces informations apparaîtront automatiquement sur le pied de page de vos ordonnances et factures pour assurer leur conformité légale.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'prescription' && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10 py-2 border-b border-gray-100 mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                      <FileText size={28} className="text-purple-600" /> Design d'Ordonnance
                    </h3>
                    <p className="text-gray-500 mt-1">Personnalisez l'esthétique professionnelle de vos documents.</p>
                  </div>
                  <button
                    onClick={handleSaveAppearance}
                    className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-100 transition-transform active:scale-95 flex items-center gap-2"
                  >
                    <Save size={18} /> Appliquer
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Configuration Column */}
                  <div className="lg:col-span-5 space-y-8">
                    {/* Logo & Identity */}
                    <section className="space-y-4">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Logo & Identité Visuelle</label>
                      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 text-center">
                        <div
                          className="w-32 h-32 mx-auto bg-white rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer hover:border-purple-400 transition-colors relative group"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {appearance.logoUrl ? (
                            <>
                              <img src={appearance.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <RefreshCw className="text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center text-gray-400">
                              <Upload size={24} className="mb-2" />
                              <span className="text-xs font-bold">Choisir Logo</span>
                            </div>
                          )}
                        </div>
                        <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />

                        {appearance.logoUrl && (
                          <div className="mt-4 flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-gray-500 w-16">Échelle</span>
                              <input
                                type="range"
                                min="0.5"
                                max="2.5"
                                step="0.1"
                                value={appearance.logoScale}
                                onChange={e => setAppearance({ ...appearance, logoScale: parseFloat(e.target.value) })}
                                className="flex-1 accent-purple-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{appearance.logoScale}x</span>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-gray-500 w-16">Opacité</span>
                              <input
                                type="range"
                                min="0.05"
                                max="1.0"
                                step="0.05"
                                value={appearance.watermarkOpacity}
                                onChange={e => setAppearance({ ...appearance, watermarkOpacity: parseFloat(e.target.value) })}
                                className="flex-1 accent-purple-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{Math.round((appearance.watermarkOpacity || 0.1) * 100)}%</span>
                            </div>

                            <button
                              onClick={() => setAppearance({ ...appearance, logoUrl: undefined })}
                              className="text-red-500 text-xs font-bold hover:text-red-700 flex items-center justify-center gap-1 mt-2"
                            >
                              <Trash2 size={12} /> Supprimer le Logo
                            </button>
                          </div>
                        )}

                        {appearance.logoUrl && (
                          <div>
                            <span className="text-xs font-bold text-gray-500 block mb-2">Alignement</span>
                            <div className="flex bg-gray-200 rounded-lg p-1">
                              {(['left', 'center', 'right'] as const).map((pos) => (
                                <button
                                  key={pos}
                                  onClick={() => setAppearance({ ...appearance, logoPosition: pos })}
                                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${appearance.logoPosition === pos ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                  {pos === 'left' ? 'Gauche' : pos === 'center' ? 'Centre' : 'Droite'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Typography & Layout */}
                    <section className="space-y-4">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Style & Mise en page</label>
                      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-6">
                        <div>
                          <label className="text-xs font-bold text-gray-600 mb-2 block">Couleur Signature</label>
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl border-2 border-white shadow-sm flex-shrink-0" style={{ backgroundColor: appearance.primaryColor }}></div>
                            <div className="flex-1 relative">
                              <input
                                type="color"
                                value={appearance.primaryColor}
                                onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={appearance.primaryColor}
                                onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-gray-100 font-mono text-sm uppercase font-bold"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-gray-600 mb-2 block">Disposition</label>
                            <select
                              value={appearance.headerLayout}
                              onChange={e => setAppearance({ ...appearance, headerLayout: e.target.value as any })}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none focus:ring-2 ring-purple-100"
                            >
                              <option value="classic">Classique</option>
                              <option value="modern">Moderne</option>
                              <option value="minimal">Minimaliste</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-600 mb-2 block">Police</label>
                            <select
                              value={appearance.fontFamily}
                              onChange={e => setAppearance({ ...appearance, fontFamily: e.target.value as any })}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none focus:ring-2 ring-purple-100"
                            >
                              <option value="serif">Sérif (Médical)</option>
                              <option value="sans">Sans-Sérif (Moderne)</option>
                              <option value="mono">Monospace (Technique)</option>
                            </select>
                          </div>
                        </div>

                        {/* Layout Presets */}
                        <div>
                          <label className="text-xs font-bold text-gray-600 mb-3 block">Style de Mise en Page (Vibe)</label>
                          <div className="grid grid-cols-3 gap-3">
                            {(['classic', 'modern', 'elegant'] as const).map((preset) => (
                              <button
                                key={preset}
                                onClick={() => setAppearance({ ...appearance, layoutPreset: preset })}
                                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${appearance.layoutPreset === preset ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-gray-100 text-gray-400 opacity-60'}`}
                              >
                                <Monitor size={20} />
                                <span className="text-[10px] uppercase font-black">{preset}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Content Padding & Footer Vertical Offset */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between">
                              <label className="text-xs font-bold text-gray-600">Marge Haut</label>
                              <span className="text-[10px] font-mono text-gray-400">{appearance.contentVerticalPadding || 40}px</span>
                            </div>
                            <input
                              type="range" min="0" max="300" step="10"
                              value={appearance.contentVerticalPadding || 40}
                              onChange={e => setAppearance({ ...appearance, contentVerticalPadding: parseInt(e.target.value) })}
                              className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-2"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between">
                              <label className="text-xs font-bold text-gray-600">Position Pied</label>
                              <span className="text-[10px] font-mono text-gray-400">{appearance.footerVerticalOffset || 0}px</span>
                            </div>
                            <input
                              type="range" min="-100" max="100" step="5"
                              value={appearance.footerVerticalOffset || 0}
                              onChange={e => setAppearance({ ...appearance, footerVerticalOffset: parseInt(e.target.value) })}
                              className="w-full accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-2"
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* QR Code Settings */}
                    <section className="space-y-4">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">Configuration QR Code</label>
                      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-6">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-gray-600 flex items-center gap-2">
                            Cachet & Signature
                          </label>
                          <button
                            onClick={() => setAppearance({ ...appearance, showSignature: appearance.showSignature === false ? true : false })}
                            className={`w-10 h-5 rounded-full transition-colors relative ${appearance.showSignature !== false ? 'bg-purple-600' : 'bg-gray-200'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${appearance.showSignature !== false ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </div>

                        {appearance.showSignature !== false && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Libellé Signature</label>
                            <input
                              type="text"
                              value={appearance.signatureLabel || 'Cachet & Signature'}
                              onChange={e => setAppearance({ ...appearance, signatureLabel: e.target.value })}
                              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-xs outline-none focus:ring-2 ring-purple-100"
                              placeholder="Cachet & Signature"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-gray-600 flex items-center gap-2">
                            <QrCode size={16} /> Activer le Code QR
                          </label>
                          <button
                            onClick={() => setAppearance({ ...appearance, enableQrCode: !appearance.enableQrCode })}
                            className={`w-10 h-5 rounded-full transition-colors relative ${appearance.enableQrCode ? 'bg-purple-600' : 'bg-gray-200'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${appearance.enableQrCode ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                        </div>

                        {appearance.enableQrCode && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div>
                              <label className="text-xs font-bold text-gray-500 block mb-2">Contenu du QR Code</label>
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                {[
                                  { id: 'AUTOMATIC', label: 'Auto', icon: QrCode },
                                  { id: 'VCARD', label: 'Contact', icon: User },
                                  { id: 'WHATSAPP', label: 'WhatsApp', icon: Phone },
                                  { id: 'URL', label: 'Lien Web', icon: Globe }
                                ].map((type) => (
                                  <button
                                    key={type.id}
                                    onClick={() => setAppearance({ ...appearance, qrCodeType: type.id as any })}
                                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${appearance.qrCodeType === type.id || (!appearance.qrCodeType && type.id === 'AUTOMATIC') ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-gray-100 text-gray-400 opacity-60'}`}
                                  >
                                    <type.icon size={16} />
                                    <span className="text-[8px] uppercase font-black">{type.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex justify-between items-center">
                              <label className="text-xs font-bold text-gray-500">Taille du QR</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range" min="50" max="250" step="10"
                                  value={appearance.qrCodeSize || 120}
                                  onChange={e => setAppearance({ ...appearance, qrCodeSize: parseInt(e.target.value) })}
                                  className="w-32 accent-purple-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-[10px] font-mono text-gray-400 w-8">{appearance.qrCodeSize || 120}px</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  {/* Preview Column */}
                  <div className="lg:col-span-7">
                    <div className="sticky top-24">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block text-center">Aperçu Documents</label>
                        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-lg">
                          <Monitor size={14} className="text-gray-500" />
                          <input
                            type="range" min="0.15" max="0.5" step="0.01"
                            value={previewScale}
                            onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
                            className="w-24 accent-purple-600 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="text-[10px] font-mono text-gray-500 w-8">{Math.round(previewScale * 100)}%</span>
                        </div>
                      </div>

                      <div className="w-full bg-gray-100 rounded-[2.5rem] p-6 shadow-inner overflow-hidden flex justify-center items-start min-h-[600px] border border-gray-100">
                        <div
                          style={{
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top center',
                            width: '2480px',
                            height: '3508px',
                            boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.3)',
                            flexShrink: 0
                          }}
                        >
                          <ExactPrescriptionTemplate
                            doctor={info}
                            appearance={appearance}
                            patient={{ name: 'Patient Prototype', age: 35, type: 'Adult' }}
                            items={[
                              { id: '1', medicineName: 'Traitement Médical A', dosage: '1 comprimé x 3 / jour', timing: 'Après repas' },
                              { id: '2', medicineName: 'Traitement Médical B', dosage: '1 sachet le soir', timing: 'Avant repas' }
                            ]}
                            date="26/10/2026"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in mt-10 fade-in duration-300">
                <div className="text-center">
                  <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <Lock size={32} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900">Sécurité administrateur</h3>
                  <p className="text-gray-500 mt-2">Gérez le code PIN d'accès aux sections sensibles.</p>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
                  <div className="flex items-center justify-between mb-8">
                    <span className="font-bold text-gray-700">Verrouillage par code PIN</span>
                    <div
                      className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${info.pinEnabled ? 'bg-rose-500' : 'bg-gray-200'}`}
                      onClick={() => {
                        const newState = !info.pinEnabled;
                        setInfo({ ...info, pinEnabled: newState });
                        dataService.saveDoctorInfo({ ...info, pinEnabled: newState });
                      }}
                    >
                      <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${info.pinEnabled ? 'translate-x-5' : ''}`}></div>
                    </div>
                  </div>

                  {info.pinEnabled && (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <input
                          type={showPins ? "text" : "password"}
                          value={currentPinInput}
                          onChange={e => setCurrentPinInput(e.target.value)}
                          placeholder="Ancien PIN"
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-black text-center text-xl"
                        />
                        <input
                          type={showPins ? "text" : "password"}
                          value={pinInput}
                          onChange={e => setPinInput(e.target.value)}
                          placeholder="Nouveau PIN"
                          className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-black text-center text-xl"
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (info.pin && currentPinInput !== info.pin) { alert("PIN incorrect"); return; }
                          dataService.saveDoctorInfo({ ...info, pin: pinInput });
                          alert("PIN mis à jour");
                        }}
                        className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl"
                      >
                        Sauvegarder le PIN
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Database Tab */}
            {activeTab === 'database' && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-orange-50 p-8 rounded-[2.5rem] border border-orange-100 space-y-6">
                    <h3 className="text-xl font-black uppercase flex items-center gap-3">
                      <Database size={24} /> Statistiques
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/60 p-4 rounded-2xl">
                        <span className="block text-3xl font-black">{dbStats.patientCount}</span>
                        <span className="text-xs font-bold opacity-60">Patients</span>
                      </div>
                      <div className="bg-white/60 p-4 rounded-2xl">
                        <span className="block text-3xl font-black">{dbStats.prescriptionCount}</span>
                        <span className="text-xs font-bold opacity-60">Ordonnances</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 flex flex-col gap-4">
                    <button onClick={handleBackupExport} className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl">Exporter Sauvegarde</button>
                    <button onClick={() => backupInputRef.current?.click()} className="w-full py-4 bg-white border-2 border-dashed border-gray-300 text-gray-500 font-bold rounded-2xl">Importer Sauvegarde</button>
                    <input type="file" ref={backupInputRef} onChange={handleBackupImport} accept=".json" className="hidden" />
                  </div>
                </div>
              </div>
            )}
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-8 max-w-4xl mx-auto animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black flex items-center gap-3"><Users size={28} /> Collaborateurs</h3>
                  <button onClick={() => setShowUserForm(!showUserForm)} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl">
                    {showUserForm ? 'Annuler' : 'Nouveau'}
                  </button>
                </div>
                {showUserForm && (
                  <div className="bg-gray-50 p-6 rounded-[2rem] space-y-4">
                    <input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="Nom" className="w-full p-3 rounded-xl border" />
                    <input type="password" value={newUser.pin} onChange={e => setNewUser({ ...newUser, pin: e.target.value })} placeholder="PIN" className="w-full p-3 rounded-xl border" />
                    <button onClick={handleAddUser} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl">Ajouter</button>
                  </div>
                )}
                <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase">Utilisateur</th>
                        <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase">Rôle</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users.map(u => (
                        <tr key={u.id}>
                          <td className="px-6 py-4 font-black">{u.name}</td>
                          <td className="px-6 py-4 text-xs font-bold uppercase">{u.role}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={18} /></button>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-300 italic text-sm">
                            Aucun collaborateur ajouté.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div >
    </div >
  );
};

export default SettingsPanel;
