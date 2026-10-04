import { dataService } from './dataService';
import { backupService } from './backupService';
import { toastService } from './toastService';

/**
 * « Fin de journée » : sauvegarde (si elle est configurée) puis archivage de la journée.
 * Renvoie vrai si la journée a été archivée.
 */
export async function endOfDay(): Promise<boolean> {
    let configured = false;
    try { configured = (await backupService.status()).configured; } catch { /* hors application de bureau */ }
    const ok = window.confirm(configured
        ? "Sauvegarder maintenant et archiver la journée ?\n\nLa salle d'attente sera vidée."
        : "Archiver la journée ?\n\nLa sauvegarde automatique n'est pas configurée (Paramètres › Base de données).\nLa salle d'attente sera vidée.");
    if (!ok) return false;
    if (configured) {
        try {
            await backupService.runNow();
            toastService.success('Sauvegarde effectuée.');
        } catch (e: any) {
            if (!window.confirm(`La sauvegarde a échoué : ${e?.message || 'erreur inconnue'}\n\nArchiver la journée quand même ?`)) return false;
        }
    }
    dataService.archiveDay();
    return true;
}
