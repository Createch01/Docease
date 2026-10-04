/** Sécurité & données : Sécurité (mot de passe), Collaborateurs, Base de données. */
import React, { useEffect, useRef, useState } from 'react';
import { Database, Download, Eye, EyeOff, KeyRound, ScrollText, Timer, Lock, Plus, RefreshCw, Trash2, Upload, Users, X, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import packageJson from '../../package.json';
import { AppUser, UserRole } from '../../types';
import { dataService } from '../../services/dataService';
import { securityService, AuditEntry } from '../../services/securityService';
import { sessionService } from '../../services/sessionService';
import { minPasswordLength, validatePassword } from '../../services/passwordPolicy';
import { toastService } from '../../services/toastService';
import { SettingsPageFrame, SettingsCard, input40, inputStyle, cardStyle, primaryButton } from './SettingsUI';
import { SettingsPageProps } from './ProfileSettings';
import { AiSettingsCard } from './AiSettingsCard';

const errText = (e: unknown) => (typeof e === 'string' ? e : (e as any)?.message || 'Opération impossible.');
const ROLE_LABEL: Record<UserRole, string> = { Medecin: 'Médecin', Assistant: 'Assistante' };

// ═══════════ Journal d'accès ═══════════
const ACTION_LABEL: Record<string, string> = {
  login: 'Connexion', login_failed: 'Connexion refusée', login_blocked: 'Connexion bloquée (trop d\'essais)',
  lock: 'Verrouillage', access_denied: 'Accès refusé', setup: 'Installation', migration: 'Migration',
  recover_with_phrase: 'Récupération par phrase', recovery_phrase_regenerated: 'Nouvelle phrase de récupération',
  password_changed: 'Mot de passe changé', password_change_failed: 'Changement de mot de passe refusé',
  password_check_failed: 'Mot de passe incorrect',
  create_user: 'Compte créé', delete_user: 'Compte supprimé', set_user_role: 'Rôle modifié', reset_user_password: 'Mot de passe réinitialisé',
  patients_save_identity: 'Patients modifiés', queue_save_identity: "Salle d'attente modifiée", billing_today_save: 'Encaissement saisi',
  ai_parse_prescription: 'IA : ordonnance', ai_analyze_consultation: 'IA : consultation', ai_analyze_document: 'IA : document', ai_classify_priority: 'IA : priorité',
};

const AccessLogCard: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');
  const load = () => securityService.auditLog(300).then(e => { setEntries(e); setError(''); }).catch(e => setError(errText(e)));
  useEffect(() => { void load(); }, []);

  return (
    <SettingsCard title="Journal d'accès" icon={<ScrollText size={16} />}
                  description="Qui a fait quoi et quand : connexions, refus d'accès, comptes, écritures de l'assistante. Aucun contenu patient."
                  actions={<button type="button" onClick={load} className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}><RefreshCw size={13} /> Actualiser</button>}>
      {error && <p role="alert" className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div className="max-h-80 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-left text-[12px]">
          <thead style={{ background: 'var(--color-surface-alt)' }}>
            <tr>
              {['Date', 'Utilisateur', 'Action', 'Détail'].map(h => (
                <th key={h} className="px-3 py-2 text-[11px] font-medium uppercase" style={{ color: 'var(--color-text-subtle)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--color-border)', color: e.ok ? 'var(--color-text)' : 'var(--color-danger)' }}>
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{new Date(e.t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td className="px-3 py-1.5">{e.user}{e.role ? <span className="ml-1" style={{ color: 'var(--color-text-faint)' }}>({e.role === 'Medecin' ? 'médecin' : 'assistante'})</span> : null}</td>
                <td className="px-3 py-1.5">{ACTION_LABEL[e.action] || e.action}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--color-text-subtle)' }}>{e.detail}</td>
              </tr>
            ))}
            {entries && entries.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center italic" style={{ color: 'var(--color-text-faint)' }}>Aucun événement.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </SettingsCard>
  );
};

// ═══════════ Verrouillage automatique ═══════════
const DELAYS = [5, 10, 15, 30, 60];

const AutoLockCard: React.FC = () => {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [enforced, setEnforced] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    securityService.getSettings().then(s => { setMinutes(s.inactivityMinutes); setEnforced(s.enforced); }).catch(e => setError(errText(e)));
  }, []);

  const change = async (value: number) => {
    const previous = minutes;
    setMinutes(value);
    try {
      await securityService.setInactivityMinutes(value);
      toastService.success(value === 0 ? 'Verrouillage automatique désactivé' : `Verrouillage après ${value} min d'inactivité`);
    } catch (e) { setMinutes(previous); setError(errText(e)); }
  };

  return (
    <SettingsCard title="Verrouillage automatique" icon={<Timer size={16} />}
                  description="DocEase se verrouille seul après ce délai sans activité ; il faut ressaisir son mot de passe. Appliqué à tous les comptes.">
      <div className="flex flex-wrap items-center gap-3">
        <select value={minutes ?? ''} onChange={e => change(Number(e.target.value))} disabled={minutes === null}
                aria-label="Délai d'inactivité" className={`${input40} max-w-[220px]`} style={inputStyle}>
          {DELAYS.map(m => <option key={m} value={m}>{m} minutes</option>)}
          {minutes !== null && !DELAYS.includes(minutes) && minutes !== 0 && <option value={minutes}>{minutes} minutes</option>}
          <option value={0}>Jamais (déconseillé)</option>
        </select>
        {!enforced && <span className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Désactivé en développement.</span>}
      </div>
      {error && <p role="alert" className="text-[12px] mt-2" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </SettingsCard>
  );
};

// ═══════════ Sécurité ═══════════
export const SecuritySettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const role = sessionService.role() ?? 'Medecin';
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const check = validatePassword(newPassword, role);
    if (!check.valid) { setError(check.error!); return; }
    if (newPassword !== confirm) { setError('La confirmation ne correspond pas au nouveau mot de passe.'); return; }
    try {
      await securityService.changeOwnPassword(oldPassword, newPassword);
      setOldPassword(''); setNewPassword(''); setConfirm(''); setError('');
      toastService.success('Mot de passe mis à jour');
    } catch (e) {
      setError(errText(e));
    }
  };

  const field = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      type={show ? 'text' : 'password'} aria-label={placeholder} maxLength={64}
      value={value} onChange={e => { set(e.target.value); setError(''); }} placeholder={placeholder}
      className={input40} style={inputStyle}
    />
  );

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate}>
      <div className="max-w-3xl space-y-6">
        <SettingsCard title="Mon mot de passe" icon={<KeyRound size={16} />}
                      description={`Chaque utilisateur a son propre mot de passe (${minPasswordLength(role)} caractères minimum).`}>
          <div className="space-y-3 max-w-sm">
            {field(oldPassword, setOldPassword, 'Mot de passe actuel')}
            {field(newPassword, setNewPassword, 'Nouveau mot de passe')}
            {field(confirm, setConfirm, 'Confirmer le nouveau mot de passe')}
            <button type="button" onClick={() => setShow(v => !v)} className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Masquer' : 'Afficher'}
            </button>
            {error && <p role="alert" className="text-[12px] font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <button type="button" onClick={save} disabled={!oldPassword || !newPassword} className={primaryButton} style={{ background: 'var(--color-primary)' }}>
              <Lock size={15} /> Changer le mot de passe
            </button>
          </div>
        </SettingsCard>
        <AutoLockCard />
        <AiSettingsCard />
        <AccessLogCard />
      </div>
    </SettingsPageFrame>
  );
};

// ═══════════ Collaborateurs ═══════════
// Seul le médecin crée/supprime des comptes, change les rôles et réinitialise le mot
// de passe d'une assistante — contrôlé côté Rust (commandes réservées au médecin).
export const UsersSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Assistant');
  const [password, setPassword] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [error, setError] = useState('');
  const selfId = sessionService.get()?.userId;

  const refresh = () => securityService.listUsers().then(setUsers).catch(e => setError(errText(e)));
  useEffect(() => { void refresh(); }, []);

  const add = async () => {
    const check = validatePassword(password, role);
    if (!name.trim()) { setError('Le nom est requis.'); return; }
    if (!check.valid) { setError(check.error!); return; }
    try {
      await securityService.createUser(name.trim(), role, password);
      setName(''); setPassword(''); setRole('Assistant'); setShowForm(false); setError('');
      toastService.success('Compte créé : le mot de passe devra être changé à la première connexion');
      await refresh();
    } catch (e) { setError(errText(e)); }
  };

  const remove = async (u: AppUser) => {
    if (!window.confirm(`Supprimer le compte de ${u.name} ?`)) return;
    try { await securityService.deleteUser(u.id); await refresh(); } catch (e) { setError(errText(e)); }
  };

  const changeRole = async (u: AppUser, next: UserRole) => {
    if (next === u.role) return;
    try { await securityService.setUserRole(u.id, next); await refresh(); } catch (e) { setError(errText(e)); }
  };

  const doReset = async (u: AppUser) => {
    const check = validatePassword(resetPassword, 'Assistant');
    if (!check.valid) { setError(check.error!); return; }
    try {
      await securityService.resetUserPassword(u.id, resetPassword);
      setResetFor(null); setResetPassword(''); setError('');
      toastService.success(`Mot de passe de ${u.name} réinitialisé`);
      await refresh();
    } catch (e) { setError(errText(e)); }
  };

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate}
      actions={
        <button type="button" onClick={() => setShowForm(s => !s)} className={primaryButton} style={{ background: 'var(--color-primary)' }}>
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? 'Annuler' : 'Nouveau compte'}
        </button>
      }>
      <div className="space-y-5 max-w-4xl">
        {error && <p role="alert" className="text-[13px] font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}

        {showForm && (
          <SettingsCard title="Nouveau compte" icon={<Users size={16} />}
                        description="L'utilisateur choisira son propre mot de passe à sa première connexion.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Nom" aria-label="Nom" maxLength={80} className={input40} style={inputStyle} />
              <select value={role} onChange={e => setRole(e.target.value as UserRole)} aria-label="Rôle" className={input40} style={inputStyle}>
                <option value="Assistant">Assistante</option>
                <option value="Medecin">Médecin</option>
              </select>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} maxLength={64}
                     placeholder={`Mot de passe provisoire (${minPasswordLength(role)} car. min.)`} aria-label="Mot de passe provisoire" className={input40} style={inputStyle} />
            </div>
            <button type="button" onClick={add} className={primaryButton} style={{ background: 'var(--color-primary)' }}>
              <Plus size={15} /> Créer le compte
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
                <React.Fragment key={u.id}>
                  <tr style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--color-text)' }}>
                      {u.name}{u.id === selfId && <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--color-text-faint)' }}>(vous)</span>}
                      {u.mustChangePassword && <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--color-warning-hover)' }}>mot de passe à changer</span>}
                    </td>
                    <td className="px-5 py-3">
                      {u.id === selfId ? (
                        <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{ROLE_LABEL[u.role]}</span>
                      ) : (
                        <select value={u.role} onChange={e => changeRole(u, e.target.value as UserRole)} aria-label={`Rôle de ${u.name}`}
                                className="h-8 px-2 rounded-md border text-[12px] bg-white" style={{ borderColor: 'var(--color-border)' }}>
                          <option value="Assistant">Assistante</option>
                          <option value="Medecin">Médecin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {u.role === 'Assistant' && (
                        <button type="button" onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPassword(''); setError(''); }}
                                className="text-[12px] font-medium px-2 py-1 rounded-md mr-1" style={{ color: 'var(--color-text-muted)' }}>
                          Réinitialiser le mot de passe
                        </button>
                      )}
                      {u.id !== selfId && (
                        <button type="button" onClick={() => remove(u)} aria-label={`Supprimer ${u.name}`} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--color-text-faint)' }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {resetFor === u.id && (
                    <tr>
                      <td colSpan={3} className="px-5 pb-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="password" value={resetPassword} onChange={e => { setResetPassword(e.target.value); setError(''); }} maxLength={64}
                                 placeholder={`Nouveau mot de passe provisoire (${minPasswordLength('Assistant')} car. min.)`} aria-label="Nouveau mot de passe provisoire"
                                 className={`${input40} max-w-xs`} style={inputStyle} />
                          <button type="button" onClick={() => doReset(u)} className={primaryButton} style={{ background: 'var(--color-primary)' }}>Valider</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-[13px] italic" style={{ color: 'var(--color-text-faint)' }}>Aucun compte.</td>
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
  // Mot de passe de la sauvegarde : saisi à chaque fois (il n'est plus dérivé d'un PIN stocké).
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const passphrase = () => backupPassphrase;

  const exportBackup = async () => {
    if (backupPassphrase.length < 8) { toastService.error('Saisissez un mot de passe de sauvegarde (8 caractères minimum).'); return; }
    await dataService.exportFullBackup(passphrase());
    setStats(dataService.getDatabaseStats());
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
            <input type="password" value={backupPassphrase} onChange={e => setBackupPassphrase(e.target.value)} maxLength={64}
                   placeholder="Mot de passe de la sauvegarde" aria-label="Mot de passe de la sauvegarde" className={input40} style={inputStyle} />
            <button type="button" onClick={exportBackup} className="w-full h-11 rounded-lg text-white font-medium text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]" style={{ background: 'var(--color-primary)' }}>
              <Download size={15} /> Exporter la sauvegarde
            </button>
            <button type="button" disabled aria-disabled="true" title="Restauration en cours de refonte"
                    className="w-full h-11 rounded-lg border-2 border-dashed font-medium text-[13px] flex items-center justify-center gap-2 bg-white opacity-60 cursor-not-allowed" style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-subtle)' }}>
              <Upload size={15} /> Importer une sauvegarde
            </button>
            <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Restauration en cours de refonte.</p>
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
