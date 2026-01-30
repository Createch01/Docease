
import React, { useState, useEffect, useRef } from 'react';
import {
  Save, Languages, MapPin, Phone, Mail, Download, RefreshCw,
  Database, ShieldCheck, Activity, Users, FileText, Pill, CalendarDays,
  Image as ImageIcon, Sliders, Type as TypeIcon, Lock, Key, Palette
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { settingsService } from '../services/settingsService';
import { DoctorInfo, PrescriptionAppearance } from '../types';

const SettingsPanel: React.FC = () => {
  const [info, setInfo] = useState<DoctorInfo>(dataService.getDoctorInfo());
  const [appearance, setAppearance] = useState<PrescriptionAppearance>(settingsService.getAppearance());
  const [activeTab, setActiveTab] = useState<'personal' | 'security' | 'prescription'>('personal');
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinEnabledLocal, setPinEnabledLocal] = useState<boolean>(info.pinEnabled || false);
  const [dbStats, setDbStats] = useState(dataService.getDatabaseStats());
  const backupInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Rafraîchir les stats au chargement pour rassurer l'utilisateur
  useEffect(() => {
    setDbStats(dataService.getDatabaseStats());
  }, []);

  const handleSaveInfo = () => {
    dataService.saveDoctorInfo(info);
    alert("Paramètres enregistrés avec succès!");
  };

  const handleBackupExport = () => {
    dataService.exportFullBackup();
    setDbStats(dataService.getDatabaseStats());
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("ATTENTION : Importer une sauvegarde remplacera TOUTES vos données actuelles par celles du fichier. Voulez-vous continuer ?")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (dataService.importFullBackup(content)) {
        alert("Restauration réussie ! Vos données ont été mises à jour.");
        window.location.reload();
      } else {
        alert("Erreur : Le fichier de sauvegarde semble invalide.");
      }
    };
    reader.readAsText(file);
  };

  const handleSaveSecurity = () => {
    if (pinEnabledLocal) {
      if (!pinInput) {
        alert('Veuillez saisir un code PIN.');
        return;
      }
      if (pinInput !== confirmPinInput) {
        alert('Les codes PIN ne correspondent pas.');
        return;
      }
      setInfo({ ...info, pinEnabled: true, pin: pinInput });
      dataService.saveDoctorInfo({ ...info, pinEnabled: true, pin: pinInput });
      alert('Code PIN enregistré.');
      setPinInput('');
      setConfirmPinInput('');
    } else {
      // disabling PIN
      setInfo({ ...info, pinEnabled: false, pin: '' });
      dataService.saveDoctorInfo({ ...info, pinEnabled: false, pin: '' });
      alert('Verrouillage désactivé.');
    }
  };

  const handleSaveAppearance = () => {
    settingsService.saveAppearance(appearance);
    alert('Paramètres d\'apparence de l\'ordonnance enregistrés !');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await settingsService.fileToBase64(file);
      const updated = { ...appearance, logoUrl: base64 };
      setAppearance(updated);
      settingsService.saveAppearance(updated);
      alert('Logo téléchargé avec succès !');
    } catch (error) {
      alert('Erreur lors du téléchargement du logo');
      console.error(error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4 text-black">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase italic">Configuration & Sécurité</h2>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Gestion du Profil & Intégrité des Données</p>
        </div>
        <button onClick={handleSaveInfo} className="flex items-center gap-2 px-10 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-95 uppercase text-xs tracking-widest">
          <Save size={20} /> Enregistrer Profil
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setActiveTab('personal')} className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest ${activeTab === 'personal' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
          Personnalisation
        </button>
        <button onClick={() => setActiveTab('prescription')} className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest ${activeTab === 'prescription' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
          Ordonnance
        </button>
        <button onClick={() => setActiveTab('security')} className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest ${activeTab === 'security' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
          Sécurité
        </button>
      </div>

      {activeTab === 'prescription' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* PRESCRIPTION APPEARANCE SETTINGS */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-3 uppercase tracking-tight">
                <Palette size={24} className="text-purple-600" /> Apparence des Ordonnances
              </h3>
              <button onClick={handleSaveAppearance} className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl shadow-lg shadow-purple-100 transition-all active:scale-95 uppercase text-xs tracking-widest">
                <Save size={18} /> Enregistrer
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Settings */}
              <div className="space-y-6">
                {/* Couleur Principale */}
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 flex items-center gap-2">
                    <span>Couleur Principale (Headers/Bordures)</span>
                    <div className="w-6 h-6 rounded border-2 border-gray-200" style={{ backgroundColor: appearance.primaryColor }}></div>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={appearance.primaryColor}
                      onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                      className="flex-1 h-12 rounded-2xl cursor-pointer border border-gray-100"
                    />
                    <input
                      type="text"
                      value={appearance.primaryColor}
                      onChange={e => setAppearance({ ...appearance, primaryColor: e.target.value })}
                      placeholder="#10b981"
                      className="flex-1 px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Taille de Police */}
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 flex items-center gap-2">
                    <TypeIcon size={16} /> Taille de Police
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {['small', 'medium', 'large'].map(size => (
                      <button
                        key={size}
                        onClick={() => setAppearance({ ...appearance, fontSize: size as any })}
                        className={`px-4 py-3 rounded-2xl font-black uppercase text-xs transition-all ${
                          appearance.fontSize === size
                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-100'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {size === 'small' ? 'Petit' : size === 'medium' ? 'Moyen' : 'Grand'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {appearance.fontSize === 'small' && '85% taille standard'}
                    {appearance.fontSize === 'medium' && '100% taille standard (recommandé)'}
                    {appearance.fontSize === 'large' && '120% taille standard'}
                  </p>
                </div>

                {/* Logo du Cabinet */}
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 flex items-center gap-2">
                    <ImageIcon size={16} /> Logo du Cabinet
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="flex-1 px-4 py-3 bg-purple-50 border border-purple-200 text-purple-700 font-black rounded-2xl hover:bg-purple-100 transition-all uppercase text-xs"
                    >
                      Télécharger
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    {appearance.logoUrl && (
                      <button
                        onClick={() => setAppearance({ ...appearance, logoUrl: undefined })}
                        className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 font-black rounded-2xl hover:bg-red-100 transition-all uppercase text-xs"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>

                {/* Échelle Logo */}
                {appearance.logoUrl && (
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 flex justify-between">
                      <span>Taille du Logo</span>
                      <span className="text-purple-600">{appearance.logoScale}</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={appearance.logoScale}
                      onChange={e => setAppearance({ ...appearance, logoScale: parseFloat(e.target.value) })}
                      className="w-full accent-purple-600 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}

                <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100 flex items-start gap-3">
                  <div className="p-2 bg-purple-100 text-purple-600 rounded-lg flex-shrink-0">
                    <Sliders size={18} />
                  </div>
                  <p className="text-xs text-purple-800 leading-relaxed">
                    Ces paramètres personnalisent l'apparence visuelle de toutes vos ordonnances. Les modifications s'appliquent immédiatement.
                  </p>
                </div>
              </div>

              {/* Preview */}
              <div className="flex flex-col gap-4">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aperçu de l'Ordonnance</span>
                <div className="flex-1 bg-white rounded-[2.5rem] border-4 border-dashed p-6 flex flex-col shadow-2xl overflow-hidden" style={{ borderColor: appearance.primaryColor }}>
                  {/* Header Preview */}
                  <div className="pb-4 mb-4" style={{ borderBottomColor: appearance.primaryColor, borderBottomWidth: '2px' }}>
                    <p className="font-black text-center" style={{ fontSize: `${14 * settingsService.getFontSizeMultiplier(appearance.fontSize)}px`, color: appearance.primaryColor }}>
                      Dr. Votre Nom
                    </p>
                    <p className="font-bold text-center text-sm mt-1" style={{ fontSize: `${11 * settingsService.getFontSizeMultiplier(appearance.fontSize)}px` }}>
                      Spécialiste en Médecine
                    </p>
                  </div>

                  {/* Logo Preview */}
                  {appearance.logoUrl && (
                    <div className="flex justify-center mb-4">
                      <img
                        src={appearance.logoUrl}
                        alt="Logo"
                        style={{ maxWidth: `${100 * appearance.logoScale}px`, maxHeight: '80px', objectFit: 'contain' }}
                      />
                    </div>
                  )}

                  {/* Content Preview */}
                  <div className="flex-1 space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-2">
                        <span className="font-black" style={{ fontSize: `${12 * settingsService.getFontSizeMultiplier(appearance.fontSize)}px`, color: appearance.primaryColor }}>
                          {i}.
                        </span>
                        <div className="flex-1 space-y-1">
                          <p className="font-bold" style={{ fontSize: `${11 * settingsService.getFontSizeMultiplier(appearance.fontSize)}px` }}>
                            Médicament {i}
                          </p>
                          <p className="text-xs text-gray-600">500mg - Pendant les repas</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer Preview */}
                  <div className="mt-4 pt-4 text-center text-xs font-black" style={{ borderTopColor: appearance.primaryColor, borderTopWidth: '1px', color: appearance.primaryColor }}>
                    Cabinet Médical
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 my-4">
          <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-3"><Lock size={18} /> Verrouillage de l'application</h3>
          <p className="text-sm text-gray-500 mt-2">Activez un code PIN pour restreindre l'accès à l'application.</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="flex items-center gap-3 md:col-span-1">
              <label className="flex items-center gap-2 font-black text-xs uppercase tracking-widest">
                <input type="checkbox" checked={pinEnabledLocal} onChange={e => setPinEnabledLocal(e.target.checked)} className="w-4 h-4" />
                Activer PIN
              </label>
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="password" placeholder="Nouveau PIN" value={pinInput} onChange={e => setPinInput(e.target.value)} className="px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold" />
              <input type="password" placeholder="Confirmer PIN" value={confirmPinInput} onChange={e => setConfirmPinInput(e.target.value)} className="px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold" />
            </div>
            <div className="md:col-span-3">
              <button onClick={handleSaveSecurity} className="px-6 py-3 bg-emerald-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest">Enregistrer Sécurité</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* COLONNE GAUCHE: ÉTAT DE LA BASE & SAUVEGARDE */}
        <div className="lg:col-span-1 space-y-6">

          {/* DATABASE HEALTH PANEL */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-emerald-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <Activity size={20} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">État de vos Dossiers</h3>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-blue-500" />
                  <span className="text-xs font-bold text-gray-600">Total Patients</span>
                </div>
                <span className="font-black text-gray-900">{dbStats.patientCount}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-emerald-500" />
                  <span className="text-xs font-bold text-gray-600">Ordonnances</span>
                </div>
                <span className="font-black text-gray-900">{dbStats.prescriptionCount}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Pill size={16} className="text-purple-500" />
                  <span className="text-xs font-bold text-gray-600">Base Médicaments</span>
                </div>
                <span className="font-black text-gray-900">{dbStats.medicineCount}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-2">
                  <CalendarDays size={16} className="text-orange-500" />
                  <span className="text-xs font-bold text-gray-600">Rendez-vous</span>
                </div>
                <span className="font-black text-gray-900">{dbStats.appointmentCount}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase">
              <ShieldCheck size={14} /> Données stockées localement sur ce PC
            </div>
          </div>

          {/* BACKUP ACTIONS */}
          <div className="bg-emerald-900 text-white p-8 rounded-[2.5rem] shadow-2xl space-y-6">
            <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Database size={24} className="text-emerald-400" /> Sauvegarde Externe
            </h3>
            <p className="text-emerald-100/70 text-xs font-medium leading-relaxed">
              Par précaution, téléchargez une copie de vos données sur une clé USB régulièrement.
            </p>

            <div className="space-y-3">
              <button
                onClick={handleBackupExport}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-emerald-900 font-black rounded-2xl hover:bg-emerald-50 transition-all shadow-lg uppercase text-[10px] tracking-widest"
              >
                <Download size={16} /> Exporter Sauvegarde (.json)
              </button>
              <button
                onClick={() => backupInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-emerald-800 border border-emerald-700 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all uppercase text-[10px] tracking-widest"
              >
                <RefreshCw size={16} /> Restaurer un fichier
              </button>
              <input type="file" ref={backupInputRef} onChange={handleBackupImport} accept=".json" className="hidden" />
            </div>

            <div className="text-[9px] font-black text-emerald-300 uppercase text-center opacity-60">
              Dernière Sauvegarde : {dbStats.lastBackup ? new Date(dbStats.lastBackup).toLocaleDateString() : 'Aucune'}
            </div>
          </div>
        </div>

        {/* COLONNE DROITE: PROFIL DU DOCTEUR */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3 uppercase tracking-tight">
              <Languages size={24} className="text-blue-600" /> Profil Professionnel
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Français</label>
                <input type="text" placeholder="Nom Complet" value={info.nameFr} onChange={e => setInfo({ ...info, nameFr: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                <input type="text" placeholder="Spécialité" value={info.specialtyFr} onChange={e => setInfo({ ...info, specialtyFr: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                <textarea placeholder="Diplômes" value={info.diplomasFr} onChange={e => setInfo({ ...info, diplomasFr: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl h-32 text-sm outline-none font-bold" />
              </div>
              <div className="space-y-4 font-arabic" dir="rtl">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block text-right">العربية</label>
                <input type="text" placeholder="الاسم الكامل" value={info.nameAr} onChange={e => setInfo({ ...info, nameAr: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-right text-lg outline-none font-bold" />
                <input type="text" placeholder="الاختصاص" value={info.specialtyAr} onChange={e => setInfo({ ...info, specialtyAr: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-right text-lg outline-none font-bold" />
                <textarea placeholder="الديبلومات" value={info.diplomasAr} onChange={e => setInfo({ ...info, diplomasAr: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl h-32 text-right text-base outline-none font-bold" />
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3 uppercase tracking-tight">
              <MapPin size={24} className="text-red-600" /> Coordonnées du Cabinet
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-2xl">
                  <Phone size={18} className="text-gray-400" />
                  <input type="text" placeholder="Téléphone" value={info.phone} onChange={e => setInfo({ ...info, phone: e.target.value })} className="flex-1 bg-transparent border-none outline-none font-bold" />
                </div>
                <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-2xl">
                  <Mail size={18} className="text-gray-400" />
                  <input type="text" placeholder="Email" value={info.email} onChange={e => setInfo({ ...info, email: e.target.value })} className="flex-1 bg-transparent border-none outline-none font-bold" />
                </div>
              </div>
              <div className="space-y-4">
                <textarea placeholder="Adresse Fr" value={info.addressFr} onChange={e => setInfo({ ...info, addressFr: e.target.value })} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl h-24 text-sm outline-none font-bold" />
                <textarea dir="rtl" placeholder="العنوان" value={info.addressAr} onChange={e => setInfo({ ...info, addressAr: e.target.value })} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-2xl h-24 text-right text-base font-arabic outline-none font-bold" />
              </div>
            </div>
          </div>
        </div>

        {/* IDENTITY & BRANDING */}
        <div className="lg:col-span-3">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center gap-3 uppercase tracking-tight">
              <ImageIcon size={24} className="text-emerald-600" /> Identité & Branding Ordonnance
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Logo de l'Ordonnance (URL ou Base64)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={info.logoUrl}
                      onChange={e => setInfo({ ...info, logoUrl: e.target.value })}
                      placeholder="https://... ou data:image/..."
                      className="flex-1 px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 flex justify-between">
                      <span>Échelle Logo</span>
                      <span className="text-emerald-600">{info.logoScale}px</span>
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="300"
                      value={info.logoScale}
                      onChange={e => setInfo({ ...info, logoScale: parseInt(e.target.value) })}
                      className="w-full accent-emerald-600 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 flex justify-between">
                      <span>Opacité Fond</span>
                      <span className="text-emerald-600">{Math.round(info.logoOpacity * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={info.logoOpacity}
                      onChange={e => setInfo({ ...info, logoOpacity: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-600 h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">QR Code sur Ordonnance</label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 font-black text-xs uppercase tracking-widest">
                      <input type="checkbox" checked={!!info.showQRCode} onChange={e => setInfo({ ...info, showQRCode: e.target.checked })} className="w-4 h-4" />
                      Afficher QR
                    </label>
                    <input type="text" placeholder="Contenu QR (URL ou texte)" value={info.qrCodeContent} onChange={e => setInfo({ ...info, qrCodeContent: e.target.value })} className="flex-1 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100 outline-none font-bold" />
                  </div>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="w-24 h-24 bg-white p-2 rounded-lg border border-gray-100 flex items-center justify-center">
                      <img src={info.qrCodeContent ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(info.qrCodeContent)}` : '/logo.png'} alt="QR preview" className="max-w-full max-h-full" />
                    </div>
                    <p className="text-xs text-gray-500">Aperçu QR. Le QR se génèrera automatiquement depuis le contenu.</p>
                  </div>
                </div>

                <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                    <Sliders size={20} />
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Ces paramètres affecteront le filigrane et le logo principal sur vos ordonnances PDF.
                    <span className="block mt-1 font-bold">L'opacité s'applique au filigrane central.</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-200">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Aperçu Impression</span>
                <div className="relative w-64 h-80 bg-white shadow-2xl rounded-lg border border-gray-100 flex flex-col items-center p-4">
                  <div className="w-full h-4 bg-gray-50 rounded-full mb-2"></div>
                  <div className="w-2/3 h-4 bg-gray-50 rounded-full mb-8"></div>

                  <div className="flex-1 flex items-center justify-center w-full relative">
                    <img
                      src={info.logoUrl || '/logo.png'}
                      alt="Preview"
                      style={{
                        width: `${info.logoScale / 1.5}px`,
                        opacity: info.logoOpacity
                      }}
                      className="transition-all duration-300"
                    />
                  </div>

                  <div className="w-full space-y-2 mt-4">
                    <div className="w-full h-2 bg-gray-100 rounded-full"></div>
                    <div className="w-full h-2 bg-gray-100 rounded-full"></div>
                    <div className="w-3/4 h-2 bg-gray-100 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
