import { invoke } from '@tauri-apps/api/core';

// Sauvegarde automatique chiffrée : tout se passe côté Rust (src-tauri/src/backup.rs), réservé
// au médecin. La phrase de passe n'est jamais conservée côté interface.

export type BackupLevel = 'ok' | 'warning' | 'alert';

/** Alerte orange permanente : pas de second emplacement, ou second emplacement sur le même disque. */
export type BackupRedundancy = 'no_secondary' | 'same_disk';

export interface BackupDestStatus { role: 'principal' | 'secours'; path: string; accessible: boolean; error: string | null }

export interface BackupStatus {
    has_passphrase: boolean;
    configured: boolean;
    last_success_at: number | null;
    age_secs: number | null;
    last_error: string | null;
    destinations: BackupDestStatus[];
    level: BackupLevel;
    reason: string | null;
    redundancy: BackupRedundancy | null;
    /** Pièces jointes de ce poste : nombre, taille cumulée, niveau (`heavy` au-delà de 1 Go). */
    attachments_count: number;
    attachments_bytes: number;
    attachments_level: 'ok' | 'heavy';
    /** Pièces locales altérées, exclues de la dernière sauvegarde : alerte rouge jusqu'à résolution. */
    altered_attachments: { id: string; patient_id: string; patient_name: string | null }[];
}

export interface BackupEntry { path: string; name: string; role: 'principal' | 'secours'; stamp: string; size: number }

export interface BackupRunReport {
    file_name: string;
    bytes: number;
    files: number;
    destinations: { path: string; ok: boolean; error: string | null }[];
    rotated: number;
    attachments: number;
    attachments_copied: number;
    /** Pièces dont le fichier chiffré manque sur ce poste (non sauvegardées). */
    attachments_missing: number;
    /** Pièces locales altérées : exclues de cette sauvegarde (le reste est sauvegardé), signalées. */
    attachments_altered: number;
}

export interface BackupPreview {
    format: number;
    created_at: string | null;
    app_version: string | null;
    files: number;
    patients: number;
    consultations: number;
    prescriptions: number;
    appointments: number;
    last_activity: string | null;
    attachments: number;
    /** Pièces jointes introuvables à côté du fichier de sauvegarde. */
    attachments_missing: number;
}

export interface BackupRestoreReport {
    restored: number;
    removed: number;
    safety_copy: string | null;
    attachments_restored: number;
    /** Pièces introuvables ou altérées : elles apparaissent « fichier manquant » dans le dossier. */
    attachments_missing: number;
}

/** Erreur Rust `CODE|message` → code stable + message affichable. */
export class BackupError extends Error {
    code: string;
    constructor(raw: unknown) {
        const text = typeof raw === 'string' ? raw : (raw as any)?.message || 'Erreur de sauvegarde.';
        const i = text.indexOf('|');
        const known = i > 0 && /^[A-Z_]+$/.test(text.slice(0, i));
        super(known ? text.slice(i + 1) : text);
        this.code = known ? text.slice(0, i) : 'UNKNOWN';
    }
}

export const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new BackupError("La sauvegarde n'est disponible que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new BackupError(e);
    }
};

/** Événement Rust : la fenêtre est en cours de fermeture le temps d'une sauvegarde (voir `backup.rs`). */
export const BACKUP_CLOSING_EVENT = 'backup-closing';
export const BACKUP_STATUS_EVENT = 'docease_backup_status';
const changed = () => window.dispatchEvent(new CustomEvent(BACKUP_STATUS_EVENT));

export const backupService = {
    status: () => call<BackupStatus>('backup_status'),
    setPassphrase: async (passphrase: string) => { await call<void>('backup_set_passphrase', { passphrase }); changed(); },
    changePassphrase: async (oldPassphrase: string, newPassphrase: string) => {
        await call<void>('backup_change_passphrase', { oldPassphrase, newPassphrase });
        changed();
    },
    setDestinations: async (primary: string | null, secondary: string | null) => {
        await call<void>('backup_set_destinations', { primary, secondary });
        changed();
    },
    runNow: async () => { const r = await call<BackupRunReport>('backup_run_now'); changed(); return r; },
    /** Sauvegarde seulement si la dernière date de plus de 24 h (décision prise par Rust). */
    runIfDue: async () => { const r = await call<BackupRunReport | null>('backup_run_if_due'); if (r) changed(); return r; },
    list: () => call<BackupEntry[]>('backup_list'),
    inspect: (path: string, passphrase: string) => call<BackupPreview>('backup_inspect', { path, passphrase }),
    restore: (path: string, passphrase: string) => call<BackupRestoreReport>('backup_restore', { path, passphrase }),
};

/** « il y a 3 h », « il y a 2 jours »… */
export const formatAge = (secs: number | null): string => {
    if (secs === null) return 'jamais';
    if (secs < 90) return "à l'instant";
    const min = Math.round(secs / 60);
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(secs / 3600);
    if (h < 48) return `il y a ${h} h`;
    return `il y a ${Math.round(secs / 86400)} jours`;
};

/** `20261004-153000` (UTC, lu dans le nom du fichier) → date locale lisible. */
export const formatStamp = (stamp: string): string => {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp);
    if (!m) return stamp;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
};

export const MIN_PASSPHRASE = 12;

export const redundancyMessage = (r: BackupRedundancy | null): string | null => {
    if (r === 'no_secondary') return "Aucun second emplacement : si le disque de l'ordinateur ou du dossier de sauvegarde tombe en panne, vous perdez tout. Ajoutez une clé USB, un disque externe ou un dossier synchronisé.";
    if (r === 'same_disk') return "Le second emplacement est sur le même disque que le premier : une panne de ce disque détruirait les deux copies. Choisissez un autre disque, une clé USB ou un dossier synchronisé.";
    return null;
};
