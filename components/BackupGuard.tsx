import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  BACKUP_STATUS_EVENT, BackupError, BackupHealth, BackupStatus, ageDays, backupService, isTauri, requestBackupConfigFocus,
} from '../services/backupService';
import { toastService } from '../services/toastService';
import RecoverySheetModal from './settings/RecoverySheetModal';
import { DestinationsCard, PassphraseCard, RunFn } from './settings/BackupSettings';
import { primaryButton } from './settings/SettingsUI';

const REFRESH_MS = 5 * 60 * 1000;

const RED = { bg: 'var(--color-danger-50)', fg: 'var(--color-danger-700)' };
const ORANGE = { bg: 'var(--color-warning-50, #fffbeb)', fg: 'var(--color-warning-700, #b45309)' };

/**
 * Sauvegarde obligatoire. Médecin : assistant de configuration au premier lancement (« Plus tard »
 * possible) puis bandeau rouge permanent tant que rien n'est configuré ; bandeau orange si la dernière
 * sauvegarde réussie date de plus de 3 jours. Assistante : bandeau informatif seulement (Rust décide
 * de tout : `backup_health`, lisible par toute session, sans chemin ni détail).
 */
const BackupGuard: React.FC<{ isMedecin: boolean; onOpenSettings: () => void }> = ({ isMedecin, onOpenSettings }) => {
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [postponed, setPostponed] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => { backupService.health().then(setHealth).catch(() => setHealth(null)); }, []);

  useEffect(() => {
    if (!isTauri()) return;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(BACKUP_STATUS_EVENT, refresh);
    return () => { clearInterval(timer); window.removeEventListener(BACKUP_STATUS_EVENT, refresh); };
  }, [refresh]);

  // Assistant ouvert d'office tant que la sauvegarde n'est pas configurée, jusqu'à « Plus tard ».
  const wizardOpen = isMedecin && !!health && !health.configured && (wizard || !postponed);

  if (!health) return null;

  const backupNow = async () => {
    setBusy(true);
    try { await backupService.runNow(); toastService.success('Sauvegarde effectuée'); }
    catch (e) { toastService.error(e instanceof BackupError ? e.message : 'Sauvegarde impossible.'); }
    finally { setBusy(false); refresh(); }
  };

  const days = ageDays(health.age_secs);
  let banner: React.ReactNode = null;
  if (!health.configured) {
    banner = (
      <div role="alert" className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ background: RED.bg, color: RED.fg }}>
        <ShieldAlert size={20} className="shrink-0 mt-0.5" />
        <div className="flex-1 text-[13px]">
          {isMedecin ? (
            <p className="font-semibold">Vos données ne sont pas sauvegardées. Une panne de l'ordinateur ferait perdre dossiers, ordonnances et comptabilité.</p>
          ) : (
            <p className="font-semibold">Les données du cabinet ne sont pas sauvegardées. Prévenez le médecin.</p>
          )}
        </div>
        {isMedecin && (
          <button type="button" onClick={() => setWizard(true)} className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white shrink-0" style={{ background: 'var(--color-danger-700, #b91c1c)' }}>
            Configurer maintenant
          </button>
        )}
      </div>
    );
  } else if (health.stale) {
    const text = days === null ? "Aucune sauvegarde réussie pour l'instant." : `La dernière sauvegarde réussie date de ${days} jour${days > 1 ? 's' : ''}.`;
    banner = (
      <div role="status" className="flex items-start gap-3 p-3 rounded-lg mb-4" style={{ background: ORANGE.bg, color: ORANGE.fg }}>
        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
        <p className="flex-1 text-[13px] font-semibold">{text}{!isMedecin && ' Prévenez le médecin.'}</p>
        {isMedecin && (
          <>
            <button type="button" disabled={busy} onClick={backupNow} className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white shrink-0 disabled:opacity-50" style={{ background: 'var(--color-warning-700, #b45309)' }}>
              {busy ? 'En cours…' : 'Sauvegarder maintenant'}
            </button>
            <button type="button" onClick={() => { requestBackupConfigFocus(); onOpenSettings(); }} className="h-9 px-2 text-[13px] font-medium underline shrink-0">Paramètres</button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {banner}
      {wizardOpen && <SetupWizard onLater={() => { setPostponed(true); setWizard(false); }} onDone={() => { setWizard(false); refresh(); }} />}
    </>
  );
};

/** Trois étapes : phrase de passe → dossier(s) → première sauvegarde. Rust valide chaque étape. */
const SetupWizard: React.FC<{ onLater: () => void; onDone: () => void }> = ({ onLater, onDone }) => {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetPhrase, setSheetPhrase] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await backupService.status()); } catch { setStatus(null); }
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener(BACKUP_STATUS_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_STATUS_EVENT, refresh);
  }, [refresh]);

  const run: RunFn = async fn => {
    setBusy(true);
    try { await fn(); } catch (e) { toastService.error(e instanceof BackupError ? e.message : 'Erreur.'); }
    finally { setBusy(false); void refresh(); }
  };

  if (!status) return null;
  const step = !status.has_passphrase ? 1 : !status.configured ? 2 : 3;

  return (
    <div role="dialog" aria-modal="true" aria-label="Configurer la sauvegarde" className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/50">
      <div className="w-full max-w-2xl my-8 rounded-xl shadow-2xl p-5 space-y-4" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold" style={{ color: 'var(--color-text)' }}>Protégez vos données</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Étape {step} sur 3 · {step === 1 ? 'phrase de passe' : step === 2 ? 'dossier de sauvegarde' : 'première sauvegarde'}
            </p>
          </div>
          <button type="button" onClick={onLater} className="h-9 px-3 rounded-lg border text-[13px] font-medium bg-white shrink-0" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
            Plus tard
          </button>
        </div>

        {step === 1 && <PassphraseCard busy={busy} run={run} onSaved={setSheetPhrase} />}
        {step === 2 && (
          <>
            <DestinationsCard status={status} busy={busy} run={run} disabled={false} />
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Idéal : un second emplacement (clé USB, disque externe ou dossier synchronisé) pour résister à la panne du disque principal. Vous pourrez l'ajouter plus tard dans Paramètres › Base de données.</p>
          </>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[13px] font-medium flex items-center gap-2" style={{ color: 'var(--color-success-700, #15803d)' }}><CheckCircle2 size={16} /> La sauvegarde est configurée.</p>
            <button type="button" className={primaryButton} style={{ background: 'var(--color-primary)' }} disabled={busy}
                    onClick={() => run(async () => { await backupService.runNow(); toastService.success('Première sauvegarde effectuée.'); onDone(); })}>
              {busy ? 'En cours…' : 'Lancer la première sauvegarde'}
            </button>
          </div>
        )}
        <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
          « Plus tard » est possible, mais un bandeau rouge restera affiché en haut de l'application tant que la sauvegarde n'est pas configurée.
        </p>
      </div>
      {sheetPhrase && <RecoverySheetModal phrase={sheetPhrase} onClose={() => setSheetPhrase(null)} />}
    </div>
  );
};

export default BackupGuard;
