import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, HardDriveDownload, KeyRound, RotateCcw, ShieldAlert, X } from 'lucide-react';
import {
  BACKUP_STATUS_EVENT, BackupEntry, BackupError, BackupPreview, BackupStatus, MIN_PASSPHRASE,
  backupService, formatAge, formatStamp, isTauri, redundancyMessage,
} from '../../services/backupService';
import { dataService } from '../../services/dataService';
import { formatSize as formatBytes, heavyWarning } from '../../services/attachmentService';
import { toastService } from '../../services/toastService';
import RecoverySheetModal from './RecoverySheetModal';
import { SettingsCard, input40, inputStyle, primaryButton } from './SettingsUI';

const secondaryButton = 'h-10 px-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white transition-all disabled:opacity-40 disabled:cursor-not-allowed';
const secondaryStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' } as React.CSSProperties;

const LEVEL_STYLE = {
  ok: { bg: 'var(--color-success-50, #ecfdf5)', fg: 'var(--color-success-700, #15803d)' },
  warning: { bg: 'var(--color-warning-50, #fffbeb)', fg: 'var(--color-warning-700, #b45309)' },
  alert: { bg: 'var(--color-danger-50)', fg: 'var(--color-danger-700)' },
} as const;

const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} Ko` : `${(b / 1024 / 1024).toFixed(1)} Mo`);

async function pickFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: true, multiple: false });
  return typeof r === 'string' ? r : null;
}

async function pickFile(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: false, multiple: false, filters: [{ name: 'Sauvegarde DocEase', extensions: ['dcb', 'json'] }] });
  return typeof r === 'string' ? r : null;
}

/** Bandeau d'état : « Dernière sauvegarde : il y a 3 h ✓ » ou alerte rouge. */
export const BackupBanner: React.FC<{ status: BackupStatus }> = ({ status }) => {
  const st = LEVEL_STYLE[status.level];
  const text = status.level === 'ok'
    ? `Dernière sauvegarde : ${formatAge(status.age_secs)} ✓`
    : status.configured && status.last_success_at
      ? `Dernière sauvegarde : ${formatAge(status.age_secs)}`
      : 'Aucune sauvegarde';
  return (
    <div role={status.level === 'alert' ? 'alert' : 'status'} className="flex items-start gap-3 p-4 rounded-lg" style={{ background: st.bg, color: st.fg }}>
      {status.level === 'ok' ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
      <div className="text-[13px]">
        <p className="font-semibold">{text}</p>
        {status.reason && <p className="mt-0.5">{status.reason}</p>}
        {status.last_error && status.level !== 'ok' && <p className="mt-0.5 opacity-80">{status.last_error}</p>}
      </div>
    </div>
  );
};

/** Alerte orange permanente (non fermable) tant que les sauvegardes ne sont pas sur deux disques distincts. */
/** Pièces jointes : alerte orange au-delà de 1 Go (espace des disques de sauvegarde), sinon rappel du volume. */
export const AttachmentsAlert: React.FC<{ status: BackupStatus; always?: boolean }> = ({ status, always }) => {
  const warning = heavyWarning({ bytes: status.attachments_bytes, level: status.attachments_level });
  if (!warning && !(always && status.attachments_count > 0)) return null;
  const st = LEVEL_STYLE.warning;
  if (!warning) {
    return <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Pièces jointes : {status.attachments_count} fichier{status.attachments_count > 1 ? 's' : ''}, {formatBytes(status.attachments_bytes)} (copiés une seule fois à côté des sauvegardes).</p>;
  }
  return (
    <div role="status" className="flex items-start gap-3 p-4 rounded-lg" style={{ background: st.bg, color: st.fg }}>
      <AlertTriangle size={20} className="shrink-0" />
      <p className="text-[13px] font-medium">{warning}</p>
    </div>
  );
};

export const RedundancyAlert: React.FC<{ status: BackupStatus }> = ({ status }) => {
  const text = redundancyMessage(status.redundancy);
  if (!text) return null;
  const st = LEVEL_STYLE.warning;
  return (
    <div role="status" className="flex items-start gap-3 p-4 rounded-lg" style={{ background: st.bg, color: st.fg }}>
      <AlertTriangle size={20} className="shrink-0" />
      <p className="text-[13px] font-medium">{text}</p>
    </div>
  );
};

const BackupSettings: React.FC = () => {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Phrase tout juste saisie, gardée en mémoire le temps de proposer la fiche de secours.
  const [sheetPhrase, setSheetPhrase] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await backupService.status()); setLoadError(null); }
    catch (e) { setLoadError(e instanceof BackupError ? e.message : 'Erreur.'); }
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(BACKUP_STATUS_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_STATUS_EVENT, refresh);
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toastService.error(e instanceof BackupError ? e.message : 'Erreur.'); }
    finally { setBusy(false); void refresh(); }
  };

  if (!isTauri()) {
    return <SettingsCard title="Sauvegardes" icon={<HardDriveDownload size={16} />} description="Disponible uniquement dans l'application de bureau." children={null} />;
  }
  if (loadError && !status) {
    return <SettingsCard title="Sauvegardes" icon={<HardDriveDownload size={16} />} description={loadError} children={null} />;
  }
  if (!status) return null;

  return (
    <div className="space-y-5 md:col-span-2">
      <SettingsCard
        title="Sauvegardes automatiques"
        icon={<HardDriveDownload size={16} />}
        description="Fichiers chiffrés (AES-256, clé dérivée de votre phrase de passe de sauvegarde) contenant toutes vos données."
      >
        <BackupBanner status={status} />
        <RedundancyAlert status={status} />
        <AttachmentsAlert status={status} always />
        <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} disabled={busy || !status.configured}
                onClick={() => run(async () => {
                  const r = await backupService.runNow();
                  const bad = r.destinations.filter(d => !d.ok);
                  if (bad.length) toastService.error(`Sauvegarde faite, mais un emplacement a échoué : ${bad[0].error}`);
                  else if (r.attachments_missing > 0) toastService.warning(`Sauvegarde effectuée, mais ${r.attachments_missing} pièce${r.attachments_missing > 1 ? 's' : ''} jointe${r.attachments_missing > 1 ? 's' : ''} manque${r.attachments_missing > 1 ? 'nt' : ''} sur ce poste et n'${r.attachments_missing > 1 ? 'ont' : 'a'} pas pu être sauvegardée${r.attachments_missing > 1 ? 's' : ''}.`);
                  else toastService.success(`Sauvegarde effectuée (${r.files} fichiers${r.attachments ? `, ${r.attachments} pièce${r.attachments > 1 ? 's' : ''} jointe${r.attachments > 1 ? 's' : ''}` : ''}).`);
                })}>
          <HardDriveDownload size={15} /> {busy ? 'En cours…' : 'Sauvegarder maintenant'}
        </button>
        <p className="text-[12px] flex items-start gap-2" style={{ color: 'var(--color-text-muted)' }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            La sauvegarde automatique ne s'exécute que lorsque DocEase est <strong>ouvert et déverrouillé</strong> : au déverrouillage
            si la dernière date de plus de 24 h, puis toutes les 24 h pendant la session, au verrouillage et à la fermeture (la fenêtre attend alors la fin de la sauvegarde, 30 s au plus, avec l'indicateur « Sauvegarde en cours… »).
            <strong> Aucune sauvegarde n'a lieu application fermée.</strong> Conservation : 7 quotidiennes, 4 hebdomadaires, 12 mensuelles.
          </span>
        </p>
        <p className="text-[12px] flex items-start gap-2" style={{ color: 'var(--color-text-muted)' }}>
          <HardDriveDownload size={14} className="mt-0.5 shrink-0" />
          <span><strong>Pour copier une sauvegarde à la main, copiez le dossier entier (fichier .dcb + dossier pieces-jointes).</strong> Les pièces jointes sont dans le dossier « pieces-jointes », à côté des fichiers .dcb.</span>
        </p>
      </SettingsCard>

      {!status.has_passphrase ? <PassphraseCard busy={busy} run={run} onSaved={setSheetPhrase} /> : <ChangePassphraseCard busy={busy} run={run} onSaved={setSheetPhrase} />}

      <DestinationsCard status={status} busy={busy} run={run} disabled={!status.has_passphrase} />
      <RestoreCard status={status} />
      {sheetPhrase && <RecoverySheetModal phrase={sheetPhrase} onClose={() => setSheetPhrase(null)} />}
    </div>
  );
};

type RunFn = (fn: () => Promise<void>) => Promise<void>;

const PassphraseCard: React.FC<{ busy: boolean; run: RunFn; onSaved: (phrase: string) => void }> = ({ busy, run, onSaved }) => {
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [noted, setNoted] = useState(false);
  const ok = pass.length >= MIN_PASSPHRASE && pass === again && noted;
  return (
    <SettingsCard title="Phrase de passe de sauvegarde" icon={<ShieldAlert size={16} />} description="À définir une seule fois, avant la première sauvegarde.">
      <div className="p-3 rounded-lg text-[13px] font-medium" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>
        Sans cette phrase, vos sauvegardes sont irrécupérables. Notez-la et gardez-la hors du cabinet.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password"
               placeholder={`Phrase de passe (${MIN_PASSPHRASE} caractères minimum)`} aria-label="Phrase de passe" className={input40} style={inputStyle} />
        <input type="password" value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password"
               placeholder="Confirmer la phrase de passe" aria-label="Confirmer la phrase de passe" className={input40} style={inputStyle} />
      </div>
      {pass.length > 0 && pass.length < MIN_PASSPHRASE && <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Encore {MIN_PASSPHRASE - pass.length} caractère(s).</p>}
      {again.length > 0 && pass !== again && <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Les deux phrases sont différentes.</p>}
      <label className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--color-text)' }}>
        <input type="checkbox" checked={noted} onChange={e => setNoted(e.target.checked)} className="mt-1" />
        J'ai noté ma phrase de passe et je la conserve hors du cabinet. Je comprends que sans elle mes sauvegardes sont irrécupérables.
      </label>
      <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} disabled={!ok || busy}
              onClick={() => run(async () => { await backupService.setPassphrase(pass); onSaved(pass); setPass(''); setAgain(''); setNoted(false); toastService.success('Phrase de passe définie.'); })}>
        Définir la phrase de passe
      </button>
    </SettingsCard>
  );
};

const ChangePassphraseCard: React.FC<{ busy: boolean; run: RunFn; onSaved: (phrase: string) => void }> = ({ busy, run, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [oldPass, setOldPass] = useState('');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [noted, setNoted] = useState(false);
  const ok = oldPass.length > 0 && pass.length >= MIN_PASSPHRASE && pass === again && pass !== oldPass && noted;
  const close = () => { setOpen(false); setOldPass(''); setPass(''); setAgain(''); setNoted(false); };

  return (
    <SettingsCard title="Phrase de passe de sauvegarde" icon={<CheckCircle2 size={16} />}
                  description="Définie. Elle est conservée chiffrée par la clé de vos données et ne peut pas s'afficher. Gardez votre copie hors du cabinet : sans elle, vos sauvegardes sont irrécupérables.">
      {!open ? (
        <div>
          <button type="button" className={secondaryButton} style={secondaryStyle} disabled={busy} onClick={() => setOpen(true)}>
            <KeyRound size={15} /> Changer la phrase de passe…
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-lg text-[13px] font-medium" style={{ background: 'var(--color-warning-50, #fffbeb)', color: 'var(--color-warning-700, #b45309)' }}>
            Les <strong>nouvelles</strong> sauvegardes utiliseront la nouvelle phrase. Les sauvegardes <strong>déjà faites</strong> restent
            chiffrées avec l'<strong>ancienne</strong> : conservez-la tant que vous pourriez avoir besoin de les restaurer
            (jusqu'à 12 mois d'historique).
          </div>
          <input type="password" value={oldPass} onChange={e => setOldPass(e.target.value)} autoComplete="off"
                 placeholder="Ancienne phrase de passe" aria-label="Ancienne phrase de passe" className={input40} style={inputStyle} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="new-password"
                   placeholder={`Nouvelle phrase de passe (${MIN_PASSPHRASE} caractères minimum)`} aria-label="Nouvelle phrase de passe" className={input40} style={inputStyle} />
            <input type="password" value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password"
                   placeholder="Confirmer la nouvelle phrase" aria-label="Confirmer la nouvelle phrase de passe" className={input40} style={inputStyle} />
          </div>
          {pass.length > 0 && pass.length < MIN_PASSPHRASE && <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Encore {MIN_PASSPHRASE - pass.length} caractère(s).</p>}
          {again.length > 0 && pass !== again && <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>Les deux phrases sont différentes.</p>}
          {pass.length > 0 && pass === oldPass && <p className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>La nouvelle phrase doit différer de l'ancienne.</p>}
          <label className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--color-text)' }}>
            <input type="checkbox" checked={noted} onChange={e => setNoted(e.target.checked)} className="mt-1" />
            J'ai noté la nouvelle phrase hors du cabinet et je garde l'ancienne pour les sauvegardes existantes.
          </label>
          <div className="flex gap-2">
            <button type="button" className={secondaryButton} style={secondaryStyle} disabled={busy} onClick={close}>Annuler</button>
            <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} disabled={!ok || busy}
                    onClick={() => run(async () => { await backupService.changePassphrase(oldPass, pass); onSaved(pass); close(); toastService.success("Phrase de passe changée. Les prochaines sauvegardes l'utilisent."); })}>
              Changer la phrase de passe
            </button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
};

const DestinationsCard: React.FC<{ status: BackupStatus; busy: boolean; run: RunFn; disabled: boolean }> = ({ status, busy, run, disabled }) => {
  const current = (role: 'principal' | 'secours') => status.destinations.find(d => d.role === role);
  const [primary, setPrimary] = useState<string | null>(current('principal')?.path ?? null);
  const [secondary, setSecondary] = useState<string | null>(current('secours')?.path ?? null);
  useEffect(() => { setPrimary(current('principal')?.path ?? null); setSecondary(current('secours')?.path ?? null); }, [status.destinations]);
  const dirty = primary !== (current('principal')?.path ?? null) || secondary !== (current('secours')?.path ?? null);

  const row = (label: string, value: string | null, set: (v: string | null) => void, role: 'principal' | 'secours', optional: boolean) => {
    const st = current(role);
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)' }}>{label}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex-1 min-w-[200px] h-10 px-3 rounded-md border bg-white flex items-center text-[13px] truncate" style={{ borderColor: 'var(--color-border)', color: value ? 'var(--color-text)' : 'var(--color-text-subtle)' }}>
            {value || (optional ? 'Aucun (facultatif)' : 'Aucun dossier choisi')}
          </span>
          <button type="button" className={secondaryButton} style={secondaryStyle} disabled={busy || disabled}
                  onClick={() => run(async () => { const p = await pickFolder(); if (p) set(p); })}>
            <FolderOpen size={15} /> Choisir…
          </button>
          {optional && value && <button type="button" className={secondaryButton} style={secondaryStyle} onClick={() => set(null)} aria-label="Retirer le second emplacement"><X size={15} /></button>}
        </div>
        {st && !st.accessible && <p className="text-[12px] font-medium" style={{ color: 'var(--color-danger-700)' }}>Inaccessible : branchez le disque ou la clé, ou choisissez un autre dossier.</p>}
      </div>
    );
  };

  return (
    <SettingsCard title="Emplacements" icon={<FolderOpen size={16} />}
                  description="Dossier local, et idéalement un second emplacement : clé USB, disque externe ou dossier synchronisé (OneDrive, Google Drive). Les fichiers sont déposés dans un sous-dossier « DocEase-Sauvegardes ».">
      {disabled && <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Définissez d'abord la phrase de passe.</p>}
      {row('Emplacement principal', primary, setPrimary, 'principal', false)}
      {row('Second emplacement', secondary, setSecondary, 'secours', true)}
      <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} disabled={busy || disabled || !primary || !dirty}
              onClick={() => run(async () => { await backupService.setDestinations(primary, secondary); toastService.success('Emplacements enregistrés.'); })}>
        Enregistrer les emplacements
      </button>
    </SettingsCard>
  );
};

type RestoreStep = 'choose' | 'preview' | 'done';

const RestoreCard: React.FC<{ status: BackupStatus }> = ({ status }) => {
  const [step, setStep] = useState<RestoreStep>('choose');
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [pass, setPass] = useState('');
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [attRestore, setAttRestore] = useState<{ restored: number; missing: number } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [safety, setSafety] = useState<string | null>(null);

  useEffect(() => { backupService.list().then(setEntries).catch(() => setEntries([])); }, [status.last_success_at, status.destinations.length]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof BackupError ? e.message : 'Erreur inattendue.'); }
    finally { setBusy(false); }
  };
  const reset = () => { setStep('choose'); setPreview(null); setAttRestore(null); setPass(''); setConfirmText(''); setError(null); };

  return (
    <SettingsCard title="Restaurer une sauvegarde" icon={<RotateCcw size={16} />}
                  description="Restauration guidée : choisissez une date, vérifiez le contenu, confirmez. L'état actuel est copié avant d'être remplacé. Sur un nouveau poste : créez d'abord votre compte, puis restaurez.">
      {step === 'choose' && (
        <div className="space-y-3">
          {entries.length === 0 && <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Aucune sauvegarde trouvée dans les emplacements configurés.</p>}
          <ul className="space-y-1.5 max-h-56 overflow-y-auto">
            {entries.map(e => (
              <li key={e.path}>
                <label className="flex items-center gap-3 p-2.5 rounded-md border bg-white cursor-pointer text-[13px]" style={{ borderColor: path === e.path ? 'var(--color-primary)' : 'var(--color-border)' }}>
                  <input type="radio" name="backup" checked={path === e.path} onChange={() => { setPath(e.path); setLabel(formatStamp(e.stamp)); }} />
                  <span className="flex-1" style={{ color: 'var(--color-text)' }}>{formatStamp(e.stamp)}</span>
                  <span style={{ color: 'var(--color-text-subtle)' }}>{e.role === 'principal' ? 'Principal' : 'Secours'} · {formatSize(e.size)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} style={secondaryStyle} disabled={busy}
                    onClick={() => guard(async () => { const p = await pickFile(); if (p) { setPath(p); setLabel(p.split(/[\\/]/).pop() || p); } })}>
              <FolderOpen size={15} /> Choisir un autre fichier (ancien export compris)…
            </button>
          </div>
          {path && (
            <div className="space-y-2">
              <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>Sauvegarde choisie : <strong>{label}</strong></p>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="off" placeholder="Phrase de passe de cette sauvegarde"
                     aria-label="Phrase de passe de la sauvegarde" className={input40} style={inputStyle} />
              <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} disabled={busy || !pass}
                      onClick={() => guard(async () => { setPreview(await backupService.inspect(path, pass)); setStep('preview'); })}>
                {busy ? 'Lecture…' : 'Voir le contenu'}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'preview' && preview && path && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Patients', preview.patients], ['Consultations', preview.consultations], ['Ordonnances', preview.prescriptions], ['Rendez-vous', preview.appointments]].map(([k, v]) => (
              <div key={k as string} className="bg-white p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                <span className="block text-[22px] font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{v}</span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>{k}</span>
              </div>
            ))}
          </div>
          <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
            {preview.attachments > 0 && <>Pièces jointes : <strong>{preview.attachments}</strong> · </>}Dernière activité : <strong>{preview.last_activity || 'inconnue'}</strong>
            {preview.created_at && <> · sauvegarde créée le {new Date(preview.created_at).toLocaleString('fr-FR')}</>}
            {preview.format === 1 && <> · ancien format d'export</>}
          </p>
          {preview.attachments_missing > 0 && (
            <div role="alert" className="p-3 rounded-lg text-[13px] flex items-start gap-2" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span><strong>{preview.attachments_missing} pièce{preview.attachments_missing > 1 ? 's' : ''} jointe{preview.attachments_missing > 1 ? 's' : ''} introuvable{preview.attachments_missing > 1 ? 's' : ''}</strong> à côté de cette sauvegarde (dossier « pieces-jointes »). La restauration des données reste possible ; ces pièces apparaîtront « fichier manquant » dans le dossier du patient.</span>
            </div>
          )}
          <div className="p-3 rounded-lg text-[13px]" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>
            Cette action <strong>remplace toutes les données actuelles</strong> (patients, ordonnances, rendez-vous, réglages du cabinet, catalogue). Les comptes et mots de passe ne changent pas. Une copie de sécurité de l'état actuel est faite avant.
          </div>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Tapez RESTAURER pour confirmer" aria-label="Confirmation" className={input40} style={inputStyle} />
          <div className="flex gap-2">
            <button type="button" className={secondaryButton} style={secondaryStyle} onClick={reset} disabled={busy}>Retour</button>
            <button type="button" className={primaryButton} style={{ background: 'var(--color-danger-700, #b91c1c)' }} disabled={busy || confirmText.trim().toUpperCase() !== 'RESTAURER'}
                    onClick={() => guard(async () => { const r = await backupService.restore(path, pass); setSafety(r.safety_copy); setAttRestore({ restored: r.attachments_restored, missing: r.attachments_missing }); setStep('done'); })}>
              {busy ? 'Restauration…' : 'Restaurer'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-3">
          <p className="text-[13px] font-medium flex items-center gap-2" style={{ color: 'var(--color-success-700, #15803d)' }}><CheckCircle2 size={16} /> Restauration terminée.</p>
          {attRestore && (attRestore.restored > 0 || attRestore.missing > 0) && (
            <p className="text-[13px]" style={{ color: attRestore.missing > 0 ? 'var(--color-warning-800)' : 'var(--color-text-muted)' }}>
              Pièces jointes restaurées : {attRestore.restored}{attRestore.missing > 0 && <> · <strong>{attRestore.missing} introuvable{attRestore.missing > 1 ? 's' : ''}</strong> (« fichier manquant » dans le dossier du patient)</>}.
            </p>
          )}
          {safety && <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Copie de sécurité de l'état précédent : {safety}</p>}
          <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} onClick={() => { dataService.reset(); window.location.reload(); }}>
            Recharger DocEase
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-[13px] font-medium" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
    </SettingsCard>
  );
};

export default BackupSettings;
