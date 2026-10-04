import { useEffect } from 'react';
import { backupService, isTauri } from './backupService';
import { sessionService } from './sessionService';
import { toastService } from './toastService';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * Sauvegarde automatique pendant la session du médecin : au déverrouillage si la dernière
 * date de plus de 24 h, puis tous les contrôles de 30 min (Rust décide : seulement si > 24 h).
 * Les sauvegardes au verrouillage et à la fermeture sont faites côté Rust.
 */
export function useAutoBackup(active: boolean): void {
    useEffect(() => {
        if (!active || !isTauri() || !sessionService.isMedecin()) return;
        let alive = true;
        let lastToast = '';
        const tick = async () => {
            try { await backupService.runIfDue(); }
            catch (e: any) {
                const msg = e?.message || 'Sauvegarde automatique échouée.';
                // Un message par erreur différente : pas de rafale toutes les 30 minutes.
                if (alive && msg !== lastToast) { lastToast = msg; toastService.error(`Sauvegarde automatique : ${msg}`); }
            }
        };
        void tick();
        const timer = setInterval(tick, CHECK_EVERY_MS);
        return () => { alive = false; clearInterval(timer); };
    }, [active]);
}
