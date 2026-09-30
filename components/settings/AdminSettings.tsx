/** Sécurité & données : Sécurité (PIN), Collaborateurs, Base de données. */
import React, { useRef, useState } from 'react';
import { Database, Download, Eye, EyeOff, Lock, Plus, RefreshCw, Trash2, Upload, Users, X, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import packageJson from '../../package.json';
import { AppUser, UserRole } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import { SettingsPageFrame, SettingsCard, Toggle, input40, inputStyle, cardStyle, primaryButton } from './SettingsUI';
import { SettingsPageProps } from './ProfileSettings';

const pinInputClass = 'w-full h-14 px-5 rounded-lg border text-center text-[20px] font-semibold outline-none transition-all';
const pinInputStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' } as React.CSSProperties;
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

// ═══════════ Zone sécurisée ═══════════
export const AdminLock: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [value, setValue] = useState('');
  const verify = () => {
    if (value === dataService.getDoctorInfo().pin) { onUnlock(); return; }
    alert('Code PIN incorrect.');
    setValue('');
  };
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-in">
      <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-5" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}>
        <Lock size={28} />
      </div>
      <h3 className="text-[18px] font-semibold" style={{ color: 'var(--color-text)' }}>Zone sécurisée</h3>
      <p className="mt-1.5 text-[13px] text-center max-w-xs" style={{ color: 'var(--color-text-subtle)' }}>
        Cette section contient des paramètres sensibles. Veuillez saisir votre code PIN administrateur.
      </p>
      <div className="mt-7 space-y-3 w-full max-w-xs">
        <input
          type="password" inputMode="numeric" autoFocus aria-label="Code PIN administrateur"
          value={value} onChange={e => setValue(digits(e.target.value))} placeholder="••••••"
          onKeyDown={e => e.key === 'Enter' && verify()}
          className="w-full h-14 px-5 rounded-lg border text-center text-[22px] font-semibold tracking-[0.5em] outline-none transition-all"
          style={{ ...pinInputStyle, fontFamily: 'var(--font-mono)' }}
        />
        <button type="button" onClick={verify} className="w-full h-11 rounded-lg text-white font-medium text-[13px] transition-all active:scale-[0.98]" style={{ background: 'var(--color-text)' }}>
          Déverrouiller
        </button>
      </div>
    </div>
  );
};

// ═══════════ Sécurité ═══════════
export const SecuritySettings: React.FC<SettingsPageProps & { onUnlocked: () => void }> = ({ route, onNavigate, onUnlocked }) => {
  const [pinEnabled, setPinEnabled] = useState(() => !!dataService.getDoctorInfo().pinEnabled);
  const [hasPin, setHasPin] = useState(() => !!dataService.getDoctorInfo().pin);
  // Création demandée sans PIN existant : le verrou n'est activé qu'une fois le
  // PIN créé et confirmé, sinon les sections sensibles se verrouilleraient sans
  // code permettant de les rouvrir.
  const [setupOpen, setSetupOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => { setCurrentPin(''); setNewPin(''); setConfirmPin(''); setError(''); };

  const toggle = async () => {
    const saved = dataService.getDoctorInfo();
    if (pinEnabled) {
      await dataService.saveDoctorInfo({ ...saved, pinEnabled: false });
      setPinEnabled(false); setSetupOpen(false); resetForm();
    } else if (saved.pin) {
      await dataService.saveDoctorInfo({ ...saved, pinEnabled: true });
      setPinEnabled(true); onUnlocked();
    } else {
      setSetupOpen(o => !o); resetForm();
    }
  };

  const savePin = async () => {
    const saved = dataService.getDoctorInfo();
    if (saved.pin && currentPin !== saved.pin) { setError('Ancien PIN incorrect.'); return; }
    if (!/^\d{4,6}$/.test(newPin)) { setError('Le PIN doit contenir 4 à 6 chiffres.'); return; }
    if (newPin !== confirmPin) { setError('La confirmation ne correspond pas au nouveau PIN.'); return; }
    const created = !saved.pin;
    await dataService.saveDoctorInfo({ ...saved, pin: newPin, pinEnabled: true });
    setHasPin(true); setPinEnabled(true); setSetupOpen(false); resetForm();
    onUnlocked();
    toastService.success(created ? 'PIN créé et verrouillage activé' : 'PIN mis à jour');
  };

  const pinField = (value: string, set: (v: string) => void, placeholder: string, onEnter?: () => void) => (
    <input
      type={showPins ? 'text' : 'password'} inputMode="numeric" aria-label={placeholder}
      value={value} onChange={e => { set(digits(e.target.value)); setError(''); }} placeholder={placeholder}
      onKeyDown={onEnter ? e => e.key === 'Enter' && onEnter() : undefined}
      className={pinInputClass} style={pinInputStyle}
    />
  );

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate}>
      <div className="max-w-2xl">
        <SettingsCard title="Verrouillage par code PIN" icon={<Lock size={16} />}
                      description="Demandé au démarrage et pour ouvrir Sécurité, Collaborateurs et Base de données."
                      actions={<Toggle danger label="Verrouillage par code PIN" checked={pinEnabled} onChange={toggle} />}>
          {(pinEnabled || setupOpen) && (
            <div className="space-y-4 max-w-sm">
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                {hasPin ? 'Modifier le code PIN (4 à 6 chiffres).' : 'Créez un code PIN de 4 à 6 chiffres pour activer le verrouillage.'}
              </p>
              <div className="space-y-3">
                {hasPin && pinField(currentPin, setCurrentPin, 'Ancien PIN')}
                {pinField(newPin, setNewPin, 'Nouveau PIN')}
                {pinField(confirmPin, setConfirmPin, 'Confirmer le nouveau PIN', savePin)}
                <button type="button" onClick={() => setShowPins(v => !v)} className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  {showPins ? <EyeOff size={14} /> : <Eye size={14} />} {showPins ? 'Masquer les codes' : 'Afficher les codes'}
                </button>
                {error && <p role="alert" className="text-[12px] font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}
              </div>
              <button type="button" onClick={savePin} className="w-full h-11 rounded-lg text-white font-medium text-[13px] transition-all active:scale-[0.98]" style={{ background: 'var(--color-danger)' }}>
                {hasPin ? 'Sauvegarder le PIN' : 'Créer le PIN'}
              </button>
            </div>
          )}
        </SettingsCard>
      </div>
    </SettingsPageFrame>
  );
};

// ═══════════ Collaborateurs ═══════════
export const UsersSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const [users, setUsers] = useState<AppUser[]>(() => dataService.getUsers());
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState<Partial<AppUser>>({ name: '', pin: '', role: 'User', permissions: [] });

  const add = async () => {
    if (!newUser.name || !newUser.pin || newUser.pin.length < 4) {
      alert("Veuillez remplir le nom et un PIN d'au moins 4 chiffres.");
      return;
    }
    await dataService.saveUser({
      id: Date.now().toString(),
      name: newUser.name,
      pin: newUser.pin,
      role: (newUser.role as UserRole) || 'User',
      permissions: newUser.permissions || [],
      createdAt: new Date().toISOString(),
    });
    setUsers(dataService.getUsers());
    setNewUser({ name: '', pin: '', role: 'User', permissions: [] });
    setShowForm(false);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    await dataService.deleteUser(id);
    setUsers(dataService.getUsers());
  };

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate}
      actions={
        <button type="button" onClick={() => setShowForm(s => !s)} className={primaryButton} style={{ background: 'var(--color-primary)' }}>
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Annuler' : 'Nouveau collaborateur'}
        </button>
      }>
      <div className="space-y-5 max-w-4xl">
        {showForm && (
          <SettingsCard title="Nouveau collaborateur" icon={<Users size={16} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} placeholder="Nom" aria-label="Nom" className={input40} style={inputStyle} />
              <input type="password" inputMode="numeric" value={newUser.pin} onChange={e => setNewUser({ ...newUser, pin: e.target.value })} placeholder="PIN" aria-label="PIN" className={input40} style={inputStyle} />
            </div>
            <button type="button" onClick={add} className={primaryButton} style={{ background: 'var(--color-primary)' }}>
              <Plus size={15} /> Ajouter
            </button>
          </SettingsCard>
        )}

        <div className="bg-white rounded-xl border overflow-hidden" style={cardStyle}>
          <table className="striped w-full text-left text-[13px]">
            <thead style={{ background: 'var(--color-surface-alt)' }}>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Utilisateur</th>
                <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>Rôle</th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{u.name}</td>
                  <td className="px-5 py-3 text-[11px] font-medium uppercase" style={{ color: 'var(--color-text-muted)' }}>{u.role}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => remove(u.id)} aria-label={`Supprimer ${u.name}`} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--color-text-faint)' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-[13px] italic" style={{ color: 'var(--color-text-faint)' }}>Aucun collaborateur ajouté.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SettingsPageFrame>
  );
};

// ═══════════ Base de données ═══════════
export const DatabaseSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const [stats, setStats] = useState(() => dataService.getDatabaseStats());
  const [checking, setChecking] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const passphrase = () => dataService.getDoctorInfo().pin || 'backup-key';

  const exportBackup = async () => {
    await dataService.exportFullBackup(passphrase());
    setStats(dataService.getDatabaseStats());
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('ATTENTION : Cette action remplacera toutes vos données actuelles. Continuer ?')) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (typeof event.target?.result !== 'string') return;
      if (await dataService.importFullBackup(event.target.result, passphrase())) {
        alert('Restauration réussie !');
        window.location.reload();
      } else {
        alert('Fichier de sauvegarde invalide.');
      }
    };
    reader.readAsText(file);
  };

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const update = await invoke('plugin:updater|check');
      alert(update ? 'Mise à jour disponible !' : 'Aucune mise à jour disponible.');
    } catch (err) {
      console.error(err);
      alert('Impossible de vérifier les mises à jour.');
    } finally {
      setChecking(false);
    }
  };

  const stat = (value: number, label: string) => (
    <div className="bg-white p-4 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <span className="block text-[28px] font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{value}</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>{label}</span>
    </div>
  );

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
        <SettingsCard title="Statistiques" icon={<Database size={16} />}>
          <div className="grid grid-cols-2 gap-3">
            {stat(stats.patientCount, 'Patients')}
            {stat(stats.prescriptionCount, 'Ordonnances')}
          </div>
        </SettingsCard>

        <SettingsCard title="Sauvegardes" icon={<Download size={16} />} description="Fichier chiffré contenant toutes vos données.">
          <div className="flex flex-col gap-3">
            <button type="button" onClick={exportBackup} className="w-full h-11 rounded-lg text-white font-medium text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]" style={{ background: 'var(--color-primary)' }}>
              <Download size={15} /> Exporter la sauvegarde
            </button>
            <button type="button" onClick={() => backupInputRef.current?.click()} className="w-full h-11 rounded-lg border-2 border-dashed font-medium text-[13px] flex items-center justify-center gap-2 transition-all bg-white" style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-subtle)' }}>
              <Upload size={15} /> Importer une sauvegarde
            </button>
            <input type="file" ref={backupInputRef} onChange={importBackup} accept=".json" className="hidden" />
          </div>
        </SettingsCard>

        <SettingsCard title="Application" icon={<Info size={16} />} className="md:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
              DocEase <span style={{ fontFamily: 'var(--font-mono)' }}>v{packageJson.version}</span>
            </span>
            <button type="button" onClick={checkUpdate} disabled={checking}
                    className="h-10 px-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white transition-all disabled:opacity-60"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              <RefreshCw size={14} className={checking ? 'animate-spin' : ''} /> Vérifier les mises à jour
            </button>
          </div>
        </SettingsCard>
      </div>
    </SettingsPageFrame>
  );
};
