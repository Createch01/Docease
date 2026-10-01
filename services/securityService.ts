import { invoke } from '@tauri-apps/api/core';
import { AppUser, UserRole } from '../types';
import { Session, sessionFromRust, sessionService } from './sessionService';

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

export interface Profile {
    id: string;
    name: string;
    role: UserRole;
}

export interface UnlockResult {
    ok: boolean;
    needsMigration: boolean;
    retryAfterSecs?: number;
    session?: Session;
    error?: string;
}

export interface AuditEntry {
    t: string;
    user: string;
    role: UserRole | null;
    action: string;
    detail: string;
    ok: boolean;
}

const errorText = (e: unknown): string => (typeof e === 'string' ? e : (e as any)?.message || 'Erreur inconnue');

// Aperçu navigateur (npm run dev sans Tauri) : pas de Rust, donc pas de vraie
// sécurité. Le rôle peut être simulé en développement avec localStorage
// `docease_dev_role` = Assistant, uniquement pour vérifier l'interface.
const devPreviewSession = (): Session => {
    let role: UserRole = 'Medecin';
    try {
        if (import.meta.env.DEV && localStorage.getItem('docease_dev_role') === 'Assistant') role = 'Assistant';
    } catch { /* stockage indisponible */ }
    return { userId: 'dev-preview', name: role === 'Medecin' ? 'Médecin (aperçu)' : 'Assistante (aperçu)', role, mustChangePassword: false };
};

// Gates access to the encrypted local store (see src-tauri/src/lib.rs, users.rs).
// Chaque utilisateur déverrouille avec SON mot de passe ; la clé de données et le
// rôle de la session restent côté Rust.
export const securityService = {
    isTauri,

    isConfigured: async (): Promise<boolean> => {
        if (!isTauri()) return true; // Browser-only dev preview: nothing to encrypt, skip the gate.
        try { return await invoke<boolean>('security_status'); } catch { return false; }
    },

    // Profils affichés sur l'écran de verrouillage (nom + rôle, jamais de secret).
    listProfiles: async (): Promise<Profile[]> => {
        if (!isTauri()) {
            const s = devPreviewSession();
            return [{ id: s.userId, name: s.name, role: s.role }];
        }
        try { return await invoke<Profile[]>('list_profiles'); } catch { return []; }
    },

    // Crée le compte médecin et renvoie la phrase de récupération à afficher une fois.
    setupPin: async (password: string, name?: string): Promise<string | null> => {
        if (!isTauri()) return null;
        const phrase = await invoke<string>('setup_pin', { pin: password, name: name ?? null });
        sessionService.set(await securityService.currentSession());
        return phrase;
    },

    unlock: async (userId: string | null, password: string): Promise<UnlockResult> => {
        if (!isTauri()) {
            const session = devPreviewSession();
            sessionService.set(session);
            return { ok: true, needsMigration: false, session };
        }
        try {
            const res = await invoke<{ ok: boolean; needs_migration: boolean; retry_after_secs: number | null; session: any }>('unlock', { userId, password });
            const session = res.session ? sessionFromRust(res.session) : undefined;
            if (res.ok && session) sessionService.set(session);
            return { ok: res.ok, needsMigration: res.needs_migration, retryAfterSecs: res.retry_after_secs ?? undefined, session };
        } catch (e) {
            return { ok: false, needsMigration: false, error: errorText(e) };
        }
    },

    currentSession: async (): Promise<Session | null> => {
        if (!isTauri()) return sessionService.get();
        const s = await invoke<any>('current_session');
        return s ? sessionFromRust(s) : null;
    },

    // Verrouille : la clé et la session sont effacées côté Rust.
    lock: async (): Promise<void> => {
        sessionService.clear();
        if (!isTauri()) return;
        try { await invoke('lock'); } catch { /* déjà verrouillé */ }
    },

    // Re-vérifie le mot de passe de la session (sortie du mode salle d'attente).
    verifyPassword: async (password: string): Promise<boolean> => {
        if (!isTauri()) return true;
        return invoke<boolean>('verify_password', { password });
    },

    changeOwnPassword: async (oldPassword: string, newPassword: string): Promise<void> => {
        if (!isTauri()) return;
        await invoke('change_own_password', { oldPassword, newPassword });
        const s = sessionService.get();
        if (s) sessionService.set({ ...s, mustChangePassword: false });
    },

    // Migration unique des très anciennes installations (avant la phrase de récupération).
    migrateToRecovery: async (password: string): Promise<string> => {
        const phrase = await invoke<string>('migrate_to_recovery', { pin: password });
        sessionService.set(await securityService.currentSession());
        return phrase;
    },

    // « Mot de passe oublié » du médecin : phrase de 24 mots + nouveau mot de passe.
    recoverWithPhrase: async (phrase: string, newPassword: string, userId?: string): Promise<string> => {
        const newPhrase = await invoke<string>('recover_with_phrase', { phrase, newPin: newPassword, userId: userId ?? null });
        sessionService.set(await securityService.currentSession());
        return newPhrase;
    },

    regenerateRecovery: async (password: string): Promise<string> => {
        return invoke<string>('regenerate_recovery', { pin: password });
    },

    // Journal d'accès (médecin uniquement) : du plus récent au plus ancien.
    auditLog: async (limit = 500): Promise<AuditEntry[]> => {
        if (!isTauri()) return [];
        return invoke<AuditEntry[]>('audit_log_list', { limit });
    },

    // ── Gestion des comptes (médecin uniquement, contrôlé côté Rust) ──
    listUsers: async (): Promise<AppUser[]> => {
        if (!isTauri()) return [];
        const rows = await invoke<any[]>('list_users');
        return rows.map(r => ({ id: r.id, name: r.name, role: r.role, createdAt: r.created_at, mustChangePassword: r.must_change_password }));
    },
    createUser: (name: string, role: UserRole, password: string) => invoke('create_user', { name, role, password }),
    deleteUser: (id: string) => invoke('delete_user', { id }),
    setUserRole: (id: string, role: UserRole) => invoke('set_user_role', { id, role }),
    resetUserPassword: (id: string, newPassword: string) => invoke('reset_user_password', { id, newPassword }),
};
