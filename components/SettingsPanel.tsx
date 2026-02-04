import React, { useState, useEffect, useRef } from 'react';
import {
  Save, User, Building2, FileText, Lock, Database, Info,
  MapPin, Phone, Mail, Upload, Trash2, ShieldCheck,
  RefreshCw, Download, Monitor, Globe, CreditCard, X
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { settingsService } from '../services/settingsService';
import { DoctorInfo, PrescriptionAppearance } from '../types';
import { invoke } from '@tauri-apps/api/core';

type SettingsTab = 'profile' | 'cabinet' | 'prescription' | 'security' | 'database';

const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [info, setInfo] = useState<DoctorInfo>(dataService.getDoctorInfo());
  const [appearance, setAppearance] = useState<PrescriptionAppearance>(settingsService.getAppearance());

  // Security State
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinEnabledLocal, setPinEnabledLocal] = useState<boolean>(info.pinEnabled || false);

  // Database State
  const [dbStats, setDbStats] = useState(dataService.getDatabaseStats());
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Update State
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // File Refs
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDbStats(dataService.getDatabaseStats());
  }, []);

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
        alert("Votre version est à jour.");
      }
    } catch (error) {
      console.error("Erreur update:", error);
      alert("Impossible de vérifier les mises à jour pour le moment.");
    }
  };

  const menuItems = [
    { id: 'profile', label: 'Profil Médecin', icon: User, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'cabinet', label: 'Infos Cabinet', icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'prescription', label: 'Ordonnance', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
    { id: 'security', label: 'Sécurité', icon: Lock, color: 'text-rose-600', bg: 'bg-rose-50' },
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
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as SettingsTab)}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-200 group relative overflow-hidden ${activeTab === item.id
                  ? 'bg-gray-900 text-white shadow-lg shadow-gray-200 scale-[1.02]'
                  : 'hover:bg-gray-50 text-gray-600'
                }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeTab === item.id ? 'bg-white/20 text-white' : `${item.bg} ${item.color}`
                }`}>
                <item.icon size={20} />
              </div>
              <span className={`font-bold text-sm tracking-wide ${activeTab === item.id ? 'text-white' : 'text-gray-700'}`}>
                {item.label}
              </span>
              {activeTab === item.id && (
                <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
              )}
            </button>
          ))}
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
            v1.0.0 • Build 2024
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-gray-100 p-8 overflow-y-auto relative h-full custom-scrollbar">

        {activeTab === 'profile' && (
          <div className="space-y-8 max-w-4xl mx-auto animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                  <User size={28} className="text-blue-600" /> Profil Professionnel
                </h3>
                <p className="text-gray-500 mt-1">Vos informations personnelles affichées sur les documents.</p>
              </div>
              <button onClick={handleSaveInfo} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-100 transition-transform active:scale-95 flex items-center gap-2">
                <Save size={18} /> Enregistrer
              </button>
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
                  <FileText size={28} className="text-purple-600" /> Design Ordonnance
                </h3>
                <p className="text-gray-500 mt-1">Personnalisez l'apparence de vos documents.</p>
              </div>
              <button onClick={handleSaveAppearance} className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-100 transition-transform active:scale-95 flex items-center gap-2">
                <Save size={18} /> Appliquer
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Controls Column */}
              <div className="lg:col-span-5 space-y-8">

                {/* Logo Section */}
                <section className="space-y-4">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Logo & Identité</label>
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
                          <span className="text-xs font-bold text-gray-500">Taille</span>
                          <input
                            type="range"
                            min="0.5"
                            max="2.5"
                            step="0.1"
                            value={appearance.logoScale}
                            onChange={e => setAppearance({ ...appearance, logoScale: parseFloat(e.target.value) })}
                            className="flex-1 accent-purple-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <button
                          onClick={() => setAppearance({ ...appearance, logoUrl: undefined })}
                          className="text-red-500 text-xs font-bold hover:text-red-700 flex items-center justify-center gap-1"
                        >
                          <Trash2 size={12} /> Supprimer le logo
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Colors & Fonts */}
                <section className="space-y-4">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Style & Couleurs</label>
                  <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-6">
                    <div>
                      <label className="text-xs font-bold text-gray-600 mb-2 block">Couleur Principale</label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl border-2 border-white shadow-sm flex-shrink-0" style={{ backgroundColor: appearance.primaryColor }}></div>
                        <input
                          type="color"
                          value={appearance.primaryColor}
                          onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                          className="flex-1 h-12 rounded-xl cursor-pointer opacity-0 absolute w-full"
                        />
                        <input
                          type="text"
                          value={appearance.primaryColor}
                          onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-mono text-sm uppercase font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-600 mb-2 block">Taille du texte</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['small', 'medium', 'large'].map((size) => (
                          <button
                            key={size}
                            onClick={() => setAppearance({ ...appearance, fontSize: size as any })}
                            className={`py-3 rounded-xl text-xs font-black uppercase transition-all ${appearance.fontSize === size
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                          >
                            {size === 'small' ? 'Petit' : size === 'medium' ? 'Standard' : 'Grand'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Preview Column */}
              <div className="lg:col-span-7">
                <div className="sticky top-24">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 block text-center">Aperçu en temps réel</label>
                  <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 p-8 min-h-[600px] flex flex-col relative overflow-hidden transition-all duration-300 transform hover:scale-[1.01]">
                    {/* Decorative Header Bar */}
                    <div className="absolute top-0 left-0 right-0 h-2" style={{ backgroundColor: appearance.primaryColor }}></div>

                    {/* Header */}
                    <div className="flex justify-between items-start mb-8 pb-6" style={{ borderBottom: `2px solid ${appearance.primaryColor}20` }}>
                      <div style={{ color: appearance.primaryColor }}>
                        <h1 className="font-bold text-xl uppercase mb-1">{info.nameFr || 'Dr. Nom Prénom'}</h1>
                        <p className="text-xs opacity-80">{info.specialtyFr || 'Spécialité Médicale'}</p>
                        <p className="text-xs opacity-60 mt-2 max-w-[200px]">{info.addressFr || 'Adresse du cabinet...'}</p>
                      </div>
                      {appearance.logoUrl && (
                        <img
                          src={appearance.logoUrl}
                          style={{
                            width: `${100 * appearance.logoScale}px`,
                            maxHeight: '100px',
                            objectFit: 'contain'
                          }}
                          alt="Logo"
                        />
                      )}
                      <div className="text-right" style={{ color: appearance.primaryColor }}>
                        <h1 className="font-bold text-xl mb-1" dir="rtl">{info.nameAr || 'د. الاسم الكامل'}</h1>
                        <p className="text-xs opacity-80" dir="rtl">{info.specialtyAr || 'التخصص'}</p>
                        <p className="text-xs opacity-60 mt-2 max-w-[200px]" dir="rtl">{info.addressAr || 'العنوان...'}</p>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 space-y-6 py-4">
                      <div className="flex justify-between items-center text-sm font-bold text-gray-400 mb-8">
                        <span>Le 23/10/2024</span>
                        <span>Nom du Patient (34 ans)</span>
                      </div>

                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-4 items-start group">
                          <span className="font-black text-lg w-6" style={{ color: appearance.primaryColor }}>{i}.</span>
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-800 text-lg">DO LIPRANE 1000MG CP</h4>
                            <p className="text-sm text-gray-500 font-medium">1 Comprimé chaque 6 heures • 5 jours</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="mt-auto pt-6 border-t border-gray-100 flex flex-col items-center gap-1 text-[10px] text-gray-400 font-medium uppercase tracking-widest text-center">
                      <p>{info.addressFr} • {info.phone}</p>
                      {(info.ice || info.inpe) && (
                        <div className="flex gap-3 opacity-60">
                          {info.inpe && <span>INPE: {info.inpe}</span>}
                          {info.ice && <span>ICE: {info.ice}</span>}
                          {info.patente && <span>Patente: {info.patente}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in mt-10 fade-in duration-300">
            <div className="text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Lock size={32} />
              </div>
              <h3 className="text-2xl font-black text-gray-900">Sécurité d'accès</h3>
              <p className="text-gray-500 mt-2">Protégez l'accès à l'application avec un code PIN.</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${info.pinEnabled ? 'bg-rose-500' : 'bg-gray-200'}`} onClick={() => {
                    const newState = !info.pinEnabled;
                    setInfo({ ...info, pinEnabled: newState });
                    dataService.saveDoctorInfo({ ...info, pinEnabled: newState });
                  }}>
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${info.pinEnabled ? 'translate-x-5' : ''}`}></div>
                  </div>
                  <span className="font-bold text-gray-700">Activer le verrouillage PIN</span>
                </div>
              </div>

              {info.pinEnabled && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-3 mb-1 block">Définir un code PIN</label>
                    <input
                      type="password"
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value)}
                      placeholder="****"
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-black text-center text-2xl tracking-[0.5em] focus:bg-white focus:ring-2 ring-rose-100 transition-all"
                      maxLength={4}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-3 mb-1 block">Confirmer le code</label>
                    <input
                      type="password"
                      value={confirmPinInput}
                      onChange={e => setConfirmPinInput(e.target.value)}
                      placeholder="****"
                      className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-black text-center text-2xl tracking-[0.5em] focus:bg-white focus:ring-2 ring-rose-100 transition-all"
                      maxLength={4}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (pinInput === confirmPinInput && pinInput.length >= 4) {
                        setInfo({ ...info, pin: pinInput });
                        dataService.saveDoctorInfo({ ...info, pin: pinInput });
                        alert("Code PIN mis à jour !");
                        setPinInput(''); setConfirmPinInput('');
                      } else {
                        alert("Les codes ne correspondent pas (min 4 chiffres)");
                      }
                    }}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-lg shadow-rose-100 transition-transform active:scale-95 uppercase text-xs tracking-widest mt-4"
                  >
                    Mettre à jour le PIN
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'database' && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Stats Card */}
              <div className="bg-orange-50 p-8 rounded-[2.5rem] border border-orange-100 space-y-6 text-orange-900">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                  <Database size={24} /> Base de Données
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/60 p-4 rounded-2xl">
                    <span className="block text-3xl font-black">{dbStats.patientCount}</span>
                    <span className="text-xs font-bold opacity-60 uppercase">Patients</span>
                  </div>
                  <div className="bg-white/60 p-4 rounded-2xl">
                    <span className="block text-3xl font-black">{dbStats.prescriptionCount}</span>
                    <span className="text-xs font-bold opacity-60 uppercase">Ordonnances</span>
                  </div>
                  <div className="bg-white/60 p-4 rounded-2xl">
                    <span className="block text-3xl font-black">{dbStats.medicineCount}</span>
                    <span className="text-xs font-bold opacity-60 uppercase">Médicaments</span>
                  </div>
                  <div className="bg-white/60 p-4 rounded-2xl">
                    <span className="block text-3xl font-black">{dbStats.appointmentCount}</span>
                    <span className="text-xs font-bold opacity-60 uppercase">Rendez-vous</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold opacity-70">
                  <ShieldCheck size={16} /> Données stockées localement
                </div>
              </div>

              {/* Actions Card */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col justify-center gap-4">
                <div className="text-center mb-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2 text-gray-500">
                    <RefreshCw size={24} />
                  </div>
                  <h4 className="font-black text-gray-900">Sauvegarde & Restauration</h4>
                  <p className="text-xs text-gray-500 mt-1">Gérez vos archives de données.</p>
                </div>

                <button
                  onClick={handleBackupExport}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-gray-900 text-white font-bold rounded-2xl shadow-lg shadow-gray-200 transition-transform active:scale-95"
                >
                  <Download size={18} /> Télécharger une Sauvegarde
                </button>

                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-gray-100"></div>
                  <span className="relative z-10 bg-white px-2 text-[10px] font-bold text-gray-400 uppercase mx-auto block w-fit">ou</span>
                </div>

                <button
                  onClick={() => backupInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-dashed border-gray-300 text-gray-500 font-bold rounded-2xl hover:bg-gray-50 transition-colors"
                >
                  <Upload size={18} /> Restaurer depuis un fichier
                </button>
                <input type="file" ref={backupInputRef} onChange={handleBackupImport} accept=".json" className="hidden" />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default SettingsPanel;
