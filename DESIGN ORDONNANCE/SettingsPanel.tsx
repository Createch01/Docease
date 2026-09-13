/**
 * SettingsPanel.tsx — restyled to match DocEase's current design system
 * (variables.css tokens: --color-primary #1A6B8A, 8px grid, Inter, 8/12px radii,
 * shadow-soft/card/premium, same nav/card/input patterns as App.tsx,
 * Dashboard.tsx and PrescriptionEditor.tsx).
 *
 * ZERO logic changes: every useState, useEffect, handler function, and
 * conditional branch below is identical to the original file. Only JSX
 * markup, className, and inline style values were changed.
 */

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

// ─── Shared style tokens (mirrors PrescriptionEditor.tsx / Dashboard.tsx) ──
const card = 'bg-white rounded-xl border';
const cardStyle = { borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' } as React.CSSProperties;
const sectionStyle = { background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' } as React.CSSProperties;
const input40 = 'w-full h-10 px-3 rounded-md border text-[14px] outline-none transition-all bg-white';
const inputStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;
const textareaBase = 'w-full px-3 py-2.5 rounded-md border text-[14px] outline-none transition-all bg-white resize-none';
const labelEyebrow = 'block text-[11px] font-medium uppercase tracking-wider mb-1.5';
const labelEyebrowStyle = { color: 'var(--color-text-subtle)', letterSpacing: '0.06em' } as React.CSSProperties;
const iconInputWrap = 'flex items-center gap-2.5 px-3 h-10 rounded-md border bg-white transition-all';

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
    toast.className = 'fixed bottom-4 right-4 text-white px-6 py-3 rounded-xl z-50 animate-in font-semibold text-sm';
    toast.style.background = 'var(--color-primary)';
    toast.style.boxShadow = 'var(--shadow-premium)';
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
    toast.className = 'fixed bottom-4 right-4 text-white px-6 py-3 rounded-xl z-50 animate-in font-semibold text-sm';
    toast.style.background = 'var(--color-primary)';
    toast.style.boxShadow = 'var(--shadow-premium)';
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
    <div className="flex flex-col items-center justify-center py-20 animate-in">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center mb-5"
        style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}
      >
        <Lock size={28} />
      </div>
      <h3 className="text-[18px] font-semibold" style={{ color: 'var(--color-text)' }}>Zone sécurisée</h3>
      <p className="mt-1.5 text-[13px] text-center max-w-xs" style={{ color: 'var(--color-text-subtle)' }}>
        Cette section contient des paramètres sensibles. Veuillez saisir votre code PIN administrateur.
      </p>

      <div className="mt-7 space-y-3 w-full max-w-xs">
        <input
          type="password"
          value={settingsPinInput}
          onChange={e => setSettingsPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className="w-full h-14 px-5 rounded-lg border text-center text-[22px] font-semibold tracking-[0.5em] outline-none transition-all"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)', fontFamily: 'var(--font-mono)' }}
          onKeyDown={e => e.key === 'Enter' && handleVerifySettingsPin()}
        />
        <button
          onClick={handleVerifySettingsPin}
          className="w-full h-11 rounded-lg text-white font-medium text-[13px] transition-all active:scale-[0.98]"
          style={{ background: 'var(--color-text)' }}
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

  // Nav items rendered in the settings sub-sidebar — token-aligned, single accent color
  const navTabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Mon profil', icon: User },
    { id: 'cabinet', label: 'Cabinet', icon: Building2 },
    { id: 'prescription', label: 'Documents', icon: FileText },
    { id: 'security', label: 'Sécurité', icon: Lock },
    { id: 'users', label: 'Collaborateurs', icon: Users },
    { id: 'database', label: 'Base de données', icon: Database },
  ];

  return (
    <div className="flex gap-5 animate-in" style={{ height: 'calc(100vh - var(--topbar-height) - 48px)' }}>

      {/* ═══════════════ SETTINGS SIDEBAR ═══════════════ */}
      <aside
        className="w-[260px] shrink-0 rounded-xl border flex flex-col h-full overflow-hidden"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-[16px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Paramètres</h2>
          <p className="text-[11px] font-medium uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>
            Configuration générale
          </p>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          {navTabs.map((tabItem) => {
            const isActive = activeTab === tabItem.id;
            const isLocked = SENSITIVE_TABS.includes(tabItem.id) && !isAdminUnlocked && info.pinEnabled;
            return (
              <button
                key={tabItem.id}
                onClick={() => setActiveTab(tabItem.id)}
                className="relative w-full flex items-center gap-2.5 rounded-lg text-left transition-all px-3 py-2.5 text-[14px] hover:bg-[var(--color-surface-alt)]"
                style={{
                  background: isActive ? 'var(--color-primary-50)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 rounded-r"
                    style={{ top: '8px', bottom: '8px', width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0' }}
                  />
                )}
                <tabItem.icon size={17} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
                <span className="truncate flex-1">{tabItem.label}</span>
                {isLocked && <Lock size={12} style={{ color: 'var(--color-text-faint)' }} />}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            onClick={handleCheckUpdate}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all hover:bg-[var(--color-surface-alt)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <RefreshCw size={14} className={updateAvailable ? 'animate-spin' : ''} style={{ color: updateAvailable ? 'var(--color-primary)' : undefined }} />
            <span>Vérifier les mises à jour</span>
          </button>
          <div className="mt-2 text-[10px] text-center" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>
            v{packageJson.version} • Build 2026
          </div>
        </div>
      </aside>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <div
        className="flex-1 rounded-xl border p-7 overflow-y-auto relative h-full scrollbar-hide"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
      >
        {SENSITIVE_TABS.includes(activeTab) && info.pinEnabled && !isAdminUnlocked ? (
          <AdminLock />
        ) : (
          <>
            {/* ═══════════ PROFILE TAB ═══════════ */}
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-4xl mx-auto animate-in">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                      <User size={19} />
                    </div>
                    <div>
                      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Profil professionnel</h3>
                      <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Vos informations personnelles affichées sur les documents.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex p-1 rounded-lg" style={{ background: 'var(--color-surface-alt)' }}>
                      <button
                        onClick={() => changeLanguage('fr')}
                        className="px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all"
                        style={lang === 'fr' ? { background: 'white', color: 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--color-text-faint)' }}
                      >
                        Français
                      </button>
                      <button
                        onClick={() => changeLanguage('ar')}
                        className="px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all"
                        style={lang === 'ar' ? { background: 'white', color: 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--color-text-faint)' }}
                      >
                        العربية
                      </button>
                    </div>
                    <button
                      onClick={handleSaveInfo}
                      className="h-10 px-5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-white transition-all shadow-soft hover:shadow-card active:scale-[0.98]"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      <Save size={15} /> Enregistrer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* French Profile */}
                  <div className="p-5 rounded-lg border space-y-4" style={sectionStyle}>
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">🇫🇷</span>
                      <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text)', letterSpacing: '0.06em' }}>Version française</span>
                    </div>
                    <div className="space-y-3.5">
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>Nom &amp; prénom</label>
                        <input
                          type="text" value={info.nameFr}
                          onChange={e => setInfo({ ...info, nameFr: e.target.value })}
                          className={input40} style={inputStyle}
                          placeholder="Dr. Nom Prénom"
                        />
                      </div>
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>Spécialité</label>
                        <input
                          type="text" value={info.specialtyFr}
                          onChange={e => setInfo({ ...info, specialtyFr: e.target.value })}
                          className={input40} style={inputStyle}
                          placeholder="Médecine Générale"
                        />
                      </div>
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>Diplômes &amp; mentions</label>
                        <textarea
                          value={info.diplomasFr}
                          onChange={e => setInfo({ ...info, diplomasFr: e.target.value })}
                          className={`${textareaBase} h-28`} style={inputStyle}
                          placeholder="Liste des diplômes..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Arabic Profile */}
                  <div className="p-5 rounded-lg border space-y-4" style={sectionStyle} dir="rtl">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">🇲🇦</span>
                      <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text)', letterSpacing: '0.06em' }}>النسخة العربية</span>
                    </div>
                    <div className="space-y-3.5">
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>الاسم الكامل</label>
                        <input
                          type="text" value={info.nameAr}
                          onChange={e => setInfo({ ...info, nameAr: e.target.value })}
                          className={`${input40} text-right`} style={inputStyle}
                          placeholder="د. الاسم الكامل"
                        />
                      </div>
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>الاختصاص</label>
                        <input
                          type="text" value={info.specialtyAr}
                          onChange={e => setInfo({ ...info, specialtyAr: e.target.value })}
                          className={`${input40} text-right`} style={inputStyle}
                          placeholder="طب عام"
                        />
                      </div>
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>الديبلومات</label>
                        <textarea
                          value={info.diplomasAr}
                          onChange={e => setInfo({ ...info, diplomasAr: e.target.value })}
                          className={`${textareaBase} h-28 text-right`} style={inputStyle}
                          placeholder="لائحة الديبلومات..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ CABINET TAB ═══════════ */}
            {activeTab === 'cabinet' && (
              <div className="space-y-6 max-w-4xl mx-auto animate-in">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                      <Building2 size={19} />
                    </div>
                    <div>
                      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Informations du cabinet</h3>
                      <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Coordonnées et identifiants légaux.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveInfo}
                    className="h-10 px-5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-white transition-all shadow-soft hover:shadow-card active:scale-[0.98]"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    <Save size={15} /> Enregistrer
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Contact Info */}
                  <div className="space-y-4">
                    <h4 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                      <MapPin size={16} style={{ color: 'var(--color-primary)' }} /> Contact &amp; localisation
                    </h4>

                    <div className="space-y-3.5">
                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>Téléphone</label>
                        <div className={iconInputWrap} style={inputStyle}>
                          <Phone size={16} style={{ color: 'var(--color-text-faint)' }} />
                          <input
                            type="text" value={info.phone}
                            onChange={e => setInfo({ ...info, phone: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none text-[14px]"
                            style={{ color: 'var(--color-text)' }}
                            placeholder="05..."
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>Email</label>
                        <div className={iconInputWrap} style={inputStyle}>
                          <Mail size={16} style={{ color: 'var(--color-text-faint)' }} />
                          <input
                            type="text" value={info.email}
                            onChange={e => setInfo({ ...info, email: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none text-[14px]"
                            style={{ color: 'var(--color-text)' }}
                            placeholder="docteur@exemple.com"
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelEyebrow} style={labelEyebrowStyle}>Adresse (FR)</label>
                        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border bg-white transition-all" style={inputStyle}>
                          <MapPin size={16} style={{ color: 'var(--color-text-faint)' }} className="mt-1 shrink-0" />
                          <textarea
                            value={info.addressFr}
                            onChange={e => setInfo({ ...info, addressFr: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none text-[14px] resize-none h-16"
                            style={{ color: 'var(--color-text)' }}
                            placeholder="123 Avenue..."
                          />
                        </div>
                      </div>
                      <div dir="rtl">
                        <label className={labelEyebrow} style={{ ...labelEyebrowStyle, textAlign: 'right' }}>العنوان</label>
                        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border bg-white transition-all" style={inputStyle}>
                          <textarea
                            value={info.addressAr}
                            onChange={e => setInfo({ ...info, addressAr: e.target.value })}
                            className="flex-1 bg-transparent border-none outline-none text-[14px] resize-none h-16 text-right"
                            style={{ color: 'var(--color-text)' }}
                            placeholder="شارع..."
                          />
                          <MapPin size={16} style={{ color: 'var(--color-text-faint)' }} className="mt-1 shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legal Info */}
                  <div className="p-5 rounded-lg border space-y-4" style={{ background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-100)' }}>
                    <h4 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                      <CreditCard size={16} /> Identifiants légaux
                    </h4>

                    <div className="space-y-3.5">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-primary)', letterSpacing: '0.06em' }}>INPE</label>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary)' }}>Requis</span>
                        </div>
                        <input
                          type="text" value={info.inpe || ''}
                          onChange={e => setInfo({ ...info, inpe: e.target.value })}
                          className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white"
                          style={{ borderColor: 'var(--color-primary-100)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                          placeholder="Code National"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-primary)', letterSpacing: '0.06em' }}>ICE</label>
                          <input
                            type="text" value={info.ice || ''}
                            onChange={e => setInfo({ ...info, ice: e.target.value })}
                            className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white"
                            style={{ borderColor: 'var(--color-primary-100)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                            placeholder="Numéro ICE"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-primary)', letterSpacing: '0.06em' }}>Patente</label>
                          <input
                            type="text" value={info.patente || ''}
                            onChange={e => setInfo({ ...info, patente: e.target.value })}
                            className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white"
                            style={{ borderColor: 'var(--color-primary-100)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                            placeholder="N° Patente"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-primary)', letterSpacing: '0.06em' }}>Identifiant fiscal</label>
                          <input
                            type="text" value={info.taxId || ''}
                            onChange={e => setInfo({ ...info, taxId: e.target.value })}
                            className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white"
                            style={{ borderColor: 'var(--color-primary-100)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                            placeholder="N° IF"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-primary)', letterSpacing: '0.06em' }}>RC (optionnel)</label>
                          <input
                            type="text" value={info.rc || ''}
                            onChange={e => setInfo({ ...info, rc: e.target.value })}
                            className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white"
                            style={{ borderColor: 'var(--color-primary-100)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                            placeholder="Registre Commerce"
                          />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-md flex gap-2.5" style={{ background: 'var(--color-primary-100)' }}>
                        <Info size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
                        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-primary)' }}>
                          Ces informations apparaîtront automatiquement sur le pied de page de vos ordonnances et factures pour assurer leur conformité légale.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ PRESCRIPTION / DOCUMENTS TAB ═══════════ */}
            {activeTab === 'prescription' && (
              <div className="space-y-6 animate-in">
                <div
                  className="flex items-center justify-between sticky top-0 py-2 border-b mb-2 z-10"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                      <FileText size={19} />
                    </div>
                    <div>
                      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Design d'ordonnance</h3>
                      <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Personnalisez l'esthétique de vos documents.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveAppearance}
                    className="h-10 px-5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-white transition-all shadow-soft hover:shadow-card active:scale-[0.98]"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    <Save size={15} /> Appliquer
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Configuration column */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Logo & Identity */}
                    <section className="space-y-3">
                      <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Logo &amp; identité visuelle</label>
                      <div className="p-5 rounded-lg border text-center space-y-4" style={sectionStyle}>
                        <div
                          className="w-28 h-28 mx-auto bg-white rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors relative group"
                          style={{ borderColor: 'var(--color-border-strong)' }}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {appearance.logoUrl ? (
                            <>
                              <img src={appearance.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <RefreshCw className="text-white" size={18} />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5" style={{ color: 'var(--color-text-faint)' }}>
                              <Upload size={20} />
                              <span className="text-[11px] font-medium">Choisir logo</span>
                            </div>
                          )}
                        </div>
                        <input type="file" ref={logoInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />

                        {appearance.logoUrl && (
                          <div className="flex flex-col gap-3.5">
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-medium w-14 text-left" style={{ color: 'var(--color-text-muted)' }}>Échelle</span>
                              <input
                                type="range" min="0.5" max="2.5" step="0.1"
                                value={appearance.logoScale}
                                onChange={e => setAppearance({ ...appearance, logoScale: parseFloat(e.target.value) })}
                                className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                                style={{ accentColor: 'var(--color-primary)', background: 'var(--color-border)' }}
                              />
                              <span className="text-[10px] w-9 text-right" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{appearance.logoScale}x</span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-medium w-14 text-left" style={{ color: 'var(--color-text-muted)' }}>Opacité</span>
                              <input
                                type="range" min="0.05" max="1.0" step="0.05"
                                value={appearance.watermarkOpacity}
                                onChange={e => setAppearance({ ...appearance, watermarkOpacity: parseFloat(e.target.value) })}
                                className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                                style={{ accentColor: 'var(--color-primary)', background: 'var(--color-border)' }}
                              />
                              <span className="text-[10px] w-9 text-right" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{Math.round((appearance.watermarkOpacity || 0.1) * 100)}%</span>
                            </div>

                            <button
                              onClick={() => setAppearance({ ...appearance, logoUrl: undefined })}
                              className="text-[11px] font-medium flex items-center justify-center gap-1.5 mt-1 transition-colors"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <Trash2 size={12} /> Supprimer le logo
                            </button>
                          </div>
                        )}

                        {appearance.logoUrl && (
                          <div>
                            <span className="text-[11px] font-medium block mb-2 text-left" style={{ color: 'var(--color-text-muted)' }}>Alignement</span>
                            <div className="flex rounded-md p-1" style={{ background: 'var(--color-border)' }}>
                              {(['left', 'center', 'right'] as const).map((pos) => (
                                <button
                                  key={pos}
                                  onClick={() => setAppearance({ ...appearance, logoPosition: pos })}
                                  className="flex-1 py-1.5 rounded text-[10px] font-medium uppercase transition-all"
                                  style={appearance.logoPosition === pos ? { background: 'white', color: 'var(--color-primary)', boxShadow: 'var(--shadow-xs)' } : { color: 'var(--color-text-subtle)' }}
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
                    <section className="space-y-3">
                      <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Style &amp; mise en page</label>
                      <div className="p-5 rounded-lg border space-y-5" style={sectionStyle}>
                        <div>
                          <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--color-text)' }}>Couleur signature</label>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg border shrink-0" style={{ backgroundColor: appearance.primaryColor, borderColor: 'var(--color-border)' }} />
                            <div className="flex-1 relative">
                              <input
                                type="color" value={appearance.primaryColor}
                                onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <input
                                type="text" value={appearance.primaryColor}
                                onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                                className="w-full h-10 px-3 rounded-md border text-[13px] uppercase font-medium bg-white"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--color-text)' }}>Disposition</label>
                            <select
                              value={appearance.headerLayout}
                              onChange={e => setAppearance({ ...appearance, headerLayout: e.target.value as any })}
                              className={input40} style={inputStyle}
                            >
                              <option value="classic">Classique</option>
                              <option value="modern">Moderne</option>
                              <option value="minimal">Minimaliste</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--color-text)' }}>Police</label>
                            <select
                              value={appearance.fontFamily}
                              onChange={e => setAppearance({ ...appearance, fontFamily: e.target.value as any })}
                              className={input40} style={inputStyle}
                            >
                              <option value="serif">Sérif (Médical)</option>
                              <option value="sans">Sans-Sérif (Moderne)</option>
                              <option value="mono">Monospace (Technique)</option>
                            </select>
                          </div>
                        </div>

                        {/* Layout Presets */}
                        <div>
                          <label className="text-[12px] font-medium mb-2.5 block" style={{ color: 'var(--color-text)' }}>Style de mise en page</label>
                          <div className="grid grid-cols-3 gap-2.5">
                            {(['classic', 'modern', 'elegant'] as const).map((preset) => (
                              <button
                                key={preset}
                                onClick={() => setAppearance({ ...appearance, layoutPreset: preset })}
                                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all"
                                style={appearance.layoutPreset === preset
                                  ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                                  : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
                              >
                                <Monitor size={18} />
                                <span className="text-[10px] uppercase font-medium">{preset}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Padding sliders */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between mb-1">
                              <label className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Marge haut</label>
                              <span className="text-[10px]" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{appearance.contentVerticalPadding || 40}px</span>
                            </div>
                            <input
                              type="range" min="0" max="300" step="10"
                              value={appearance.contentVerticalPadding || 40}
                              onChange={e => setAppearance({ ...appearance, contentVerticalPadding: parseInt(e.target.value) })}
                              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                              style={{ accentColor: 'var(--color-primary)', background: 'var(--color-border)' }}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <label className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Position pied</label>
                              <span className="text-[10px]" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{appearance.footerVerticalOffset || 0}px</span>
                            </div>
                            <input
                              type="range" min="-100" max="100" step="5"
                              value={appearance.footerVerticalOffset || 0}
                              onChange={e => setAppearance({ ...appearance, footerVerticalOffset: parseInt(e.target.value) })}
                              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                              style={{ accentColor: 'var(--color-primary)', background: 'var(--color-border)' }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* QR Code Settings */}
                    <section className="space-y-3">
                      <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Configuration QR code</label>
                      <div className="p-5 rounded-lg border space-y-5" style={sectionStyle}>
                        <div className="flex items-center justify-between">
                          <label className="text-[12px] font-medium flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                            Cachet &amp; signature
                          </label>
                          <button
                            onClick={() => setAppearance({ ...appearance, showSignature: appearance.showSignature === false ? true : false })}
                            className="w-10 h-[22px] rounded-full transition-colors relative"
                            style={{ background: appearance.showSignature !== false ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
                          >
                            <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all" style={{ left: appearance.showSignature !== false ? '20px' : '2px' }} />
                          </button>
                        </div>

                        {appearance.showSignature !== false && (
                          <div className="space-y-1.5 animate-in">
                            <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Libellé signature</label>
                            <input
                              type="text"
                              value={appearance.signatureLabel || 'Cachet & Signature'}
                              onChange={e => setAppearance({ ...appearance, signatureLabel: e.target.value })}
                              className={input40} style={inputStyle}
                              placeholder="Cachet & Signature"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <label className="text-[12px] font-medium flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                            <QrCode size={15} /> Activer le code QR
                          </label>
                          <button
                            onClick={() => setAppearance({ ...appearance, enableQrCode: !appearance.enableQrCode })}
                            className="w-10 h-[22px] rounded-full transition-colors relative"
                            style={{ background: appearance.enableQrCode ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
                          >
                            <div className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all" style={{ left: appearance.enableQrCode ? '20px' : '2px' }} />
                          </button>
                        </div>

                        {appearance.enableQrCode && (
                          <div className="space-y-4 animate-in">
                            <div>
                              <label className="text-[12px] font-medium block mb-2" style={{ color: 'var(--color-text)' }}>Contenu du QR code</label>
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
                                    className="p-2.5 rounded-lg border transition-all flex flex-col items-center gap-1.5"
                                    style={(appearance.qrCodeType === type.id || (!appearance.qrCodeType && type.id === 'AUTOMATIC'))
                                      ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', color: 'var(--color-primary)' }
                                      : { background: 'white', borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
                                  >
                                    <type.icon size={15} />
                                    <span className="text-[9px] uppercase font-medium">{type.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex justify-between items-center">
                              <label className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Taille du QR</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range" min="50" max="250" step="10"
                                  value={appearance.qrCodeSize || 120}
                                  onChange={e => setAppearance({ ...appearance, qrCodeSize: parseInt(e.target.value) })}
                                  className="w-28 h-1.5 rounded-lg appearance-none cursor-pointer"
                                  style={{ accentColor: 'var(--color-primary)', background: 'var(--color-border)' }}
                                />
                                <span className="text-[10px] w-8" style={{ color: 'var(--color-text-faint)', fontFamily: 'var(--font-mono)' }}>{appearance.qrCodeSize || 120}px</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  {/* Preview column */}
                  <div className="lg:col-span-7">
                    <div className="sticky top-16">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Aperçu documents</label>
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md" style={{ background: 'var(--color-surface-alt)' }}>
                          <Monitor size={13} style={{ color: 'var(--color-text-subtle)' }} />
                          <input
                            type="range" min="0.15" max="0.5" step="0.01"
                            value={previewScale}
                            onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
                            className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
                            style={{ accentColor: 'var(--color-primary)', background: 'var(--color-border)' }}
                          />
                          <span className="text-[10px] w-8" style={{ color: 'var(--color-text-subtle)', fontFamily: 'var(--font-mono)' }}>{Math.round(previewScale * 100)}%</span>
                        </div>
                      </div>

                      <div
                        className="w-full rounded-xl p-5 overflow-hidden flex justify-center items-start min-h-[560px] border"
                        style={{ background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' }}
                      >
                        <div
                          style={{
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top center',
                            width: '2480px',
                            height: '3508px',
                            boxShadow: 'var(--shadow-premium)',
                            flexShrink: 0,
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

            {/* ═══════════ SECURITY TAB ═══════════ */}
            {activeTab === 'security' && (
              <div className="max-w-2xl mx-auto space-y-6 animate-in mt-6">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}>
                    <Lock size={26} />
                  </div>
                  <h3 className="text-[20px] font-semibold" style={{ color: 'var(--color-text)' }}>Sécurité administrateur</h3>
                  <p className="mt-1.5 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Gérez le code PIN d'accès aux sections sensibles.</p>
                </div>

                <div className={`${card} p-7`} style={cardStyle}>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>Verrouillage par code PIN</span>
                    <div
                      className="w-11 h-6 rounded-full transition-colors relative cursor-pointer"
                      style={{ background: info.pinEnabled ? 'var(--color-danger)' : 'var(--color-border-strong)' }}
                      onClick={() => {
                        const newState = !info.pinEnabled;
                        setInfo({ ...info, pinEnabled: newState });
                        dataService.saveDoctorInfo({ ...info, pinEnabled: newState });
                      }}
                    >
                      <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform" style={{ transform: info.pinEnabled ? 'translateX(20px)' : 'translateX(2px)' }} />
                    </div>
                  </div>

                  {info.pinEnabled && (
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <input
                          type={showPins ? 'text' : 'password'}
                          value={currentPinInput}
                          onChange={e => setCurrentPinInput(e.target.value)}
                          placeholder="Ancien PIN"
                          className="w-full h-14 px-5 rounded-lg border text-center text-[20px] font-semibold outline-none transition-all"
                          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}
                        />
                        <input
                          type={showPins ? 'text' : 'password'}
                          value={pinInput}
                          onChange={e => setPinInput(e.target.value)}
                          placeholder="Nouveau PIN"
                          className="w-full h-14 px-5 rounded-lg border text-center text-[20px] font-semibold outline-none transition-all"
                          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (info.pin && currentPinInput !== info.pin) { alert('PIN incorrect'); return; }
                          dataService.saveDoctorInfo({ ...info, pin: pinInput });
                          alert('PIN mis à jour');
                        }}
                        className="w-full h-12 rounded-lg text-white font-medium text-[14px] transition-all active:scale-[0.98]"
                        style={{ background: 'var(--color-danger)' }}
                      >
                        Sauvegarder le PIN
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════ DATABASE TAB ═══════════ */}
            {activeTab === 'database' && (
              <div className="space-y-6 animate-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                    <Database size={19} />
                  </div>
                  <div>
                    <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Base de données</h3>
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Statistiques et sauvegardes locales.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-6 rounded-lg border space-y-5" style={sectionStyle}>
                    <h4 className="text-[13px] font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.06em' }}>
                      <Database size={15} /> Statistiques
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white p-4 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="block text-[28px] font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{dbStats.patientCount}</span>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Patients</span>
                      </div>
                      <div className="bg-white p-4 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="block text-[28px] font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{dbStats.prescriptionCount}</span>
                        <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Ordonnances</span>
                      </div>
                    </div>
                  </div>
                  <div className={`${card} p-6 flex flex-col gap-3`} style={cardStyle}>
                    <button
                      onClick={handleBackupExport}
                      className="w-full h-11 rounded-lg text-white font-medium text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      <Download size={15} /> Exporter la sauvegarde
                    </button>
                    <button
                      onClick={() => backupInputRef.current?.click()}
                      className="w-full h-11 rounded-lg border-2 border-dashed font-medium text-[13px] flex items-center justify-center gap-2 transition-all"
                      style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-subtle)' }}
                    >
                      <Upload size={15} /> Importer une sauvegarde
                    </button>
                    <input type="file" ref={backupInputRef} onChange={handleBackupImport} accept=".json" className="hidden" />
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════ USERS TAB ═══════════ */}
            {activeTab === 'users' && (
              <div className="space-y-6 max-w-4xl mx-auto animate-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                      <Users size={19} />
                    </div>
                    <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>Collaborateurs</h3>
                  </div>
                  <button
                    onClick={() => setShowUserForm(!showUserForm)}
                    className="h-10 px-5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-white transition-all shadow-soft hover:shadow-card active:scale-[0.98]"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {showUserForm ? <X size={15} /> : <Plus size={15} />}
                    {showUserForm ? 'Annuler' : 'Nouveau'}
                  </button>
                </div>

                {showUserForm && (
                  <div className="p-5 rounded-lg border space-y-3" style={sectionStyle}>
                    <input
                      value={newUser.name}
                      onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                      placeholder="Nom"
                      className={input40} style={{ ...inputStyle, background: 'white' }}
                    />
                    <input
                      type="password"
                      value={newUser.pin}
                      onChange={e => setNewUser({ ...newUser, pin: e.target.value })}
                      placeholder="PIN"
                      className={input40} style={{ ...inputStyle, background: 'white' }}
                    />
                    <button
                      onClick={handleAddUser}
                      className="w-full h-11 rounded-lg text-white font-medium text-[13px] transition-all active:scale-[0.98]"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      Ajouter
                    </button>
                  </div>
                )}

                <div className={`${card} overflow-hidden`} style={cardStyle}>
                  <table className="striped w-full text-left text-[13px]">
                    <thead style={{ background: 'var(--color-surface-alt)' }}>
                      <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Utilisateur</th>
                        <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Rôle</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{u.name}</td>
                          <td className="px-5 py-3 text-[11px] font-medium uppercase" style={{ color: 'var(--color-text-muted)' }}>{u.role}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="p-1.5 rounded-md transition-colors"
                              style={{ color: 'var(--color-text-faint)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-5 py-12 text-center text-[13px] italic" style={{ color: 'var(--color-text-faint)' }}>
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
      </div>
    </div>
  );
};

export default SettingsPanel;
