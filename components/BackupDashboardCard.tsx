import React, { useCallback, useEffect, useState } from 'react';
import { BACKUP_STATUS_EVENT, BackupStatus, backupService, isTauri } from '../services/backupService';
import { AlteredAttachmentsAlert, AttachmentsAlert, BackupBanner, RedundancyAlert } from './settings/BackupSettings';

const REFRESH_MS = 5 * 60 * 1000;

/** Tableau de bord médecin : « Dernière sauvegarde : il y a 3 h ✓ », ou alerte rouge. */
const BackupDashboardCard: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const [status, setStatus] = useState<BackupStatus | null>(null);

  const refresh = useCallback(() => { backupService.status().then(setStatus).catch(() => setStatus(null)); }, []);

  useEffect(() => {
    if (!isTauri()) return;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener(BACKUP_STATUS_EVENT, refresh);
    return () => { clearInterval(timer); window.removeEventListener(BACKUP_STATUS_EVENT, refresh); };
  }, [refresh]);

  if (!status) return null;
  return (
    <div className="space-y-2">
      <BackupBanner status={status} />
      <RedundancyAlert status={status} />
      <AttachmentsAlert status={status} />
      <AlteredAttachmentsAlert status={status} />
      {(status.level !== 'ok' || status.redundancy || status.attachments_level === 'heavy') && (
        <button type="button" onClick={onOpenSettings} className="text-[13px] font-medium underline" style={{ color: 'var(--color-primary)' }}>
          Ouvrir Paramètres › Base de données
        </button>
      )}
    </div>
  );
};

export default BackupDashboardCard;
