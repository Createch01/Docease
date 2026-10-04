import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BACKUP_CLOSING_EVENT, isTauri } from '../services/backupService';

/**
 * Fermeture de la fenêtre : Rust suspend la fermeture, lance la sauvegarde en arrière-plan et
 * envoie cet événement ; la fenêtre se ferme d'elle-même à la fin (30 s au plus).
 */
const ClosingBackupOverlay: React.FC = () => {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen(BACKUP_CLOSING_EVENT, () => setClosing(true)))
      .then(fn => { if (cancelled) fn(); else unlisten = fn; })
      .catch(() => { /* sans événement, la fermeture se fait simplement sans indicateur */ });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  if (!closing) return null;
  return (
    <div role="alert" aria-live="assertive" className="no-print fixed inset-0 flex items-center justify-center" style={{ zIndex: 10000, background: 'rgba(15,23,42,0.6)' }}>
      <div className="bg-white rounded-xl px-6 py-5 flex items-center gap-3 shadow-lg">
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        <div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>Sauvegarde en cours…</p>
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>DocEase se fermera automatiquement à la fin.</p>
        </div>
      </div>
    </div>
  );
};

export default ClosingBackupOverlay;
