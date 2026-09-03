import { invoke } from '@tauri-apps/api/core';

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

interface UnlockResult {
    ok: boolean;
    needsMigration: boolean;
}

// Gates access to the encrypted local store (see src-tauri/src/lib.rs). A master PIN
// is mandatory: nothing in dataService can load until this reports unlocked, because
// save_json/load_json refuse to run without an in-memory encryption key.
export const securityService = {
    isTauri,

    // Whether a master PIN has ever been configured on this install.
    isConfigured: async (): Promise<boolean> => {
        if (!isTauri()) return true; // Browser-only dev preview: nothing to encrypt, skip the gate.
        try { return await invoke<boolean>('security_status'); } catch { return false; }
    },

    // Creates the master PIN and returns the 24-word recovery phrase, which must be
    // shown to the user once — it is never persisted anywhere by the backend.
    setupPin: async (pin: string): Promise<string | null> => {
        if (!isTauri()) return null;
        return invoke<string>('setup_pin', { pin });
    },

    unlock: async (pin: string): Promise<UnlockResult> => {
        if (!isTauri()) return { ok: true, needsMigration: false };
        try {
            const res = await invoke<{ ok: boolean; needs_migration: boolean }>('unlock', { pin });
            return { ok: res.ok, needsMigration: res.needs_migration };
        } catch {
            return { ok: false, needsMigration: false };
        }
    },

    // One-time migration for installs created before the recovery-key feature
    // existed. Returns the newly generated recovery phrase to display.
    migrateToRecovery: async (pin: string): Promise<string> => {
        return invoke<string>('migrate_to_recovery', { pin });
    },

    // Rotates the master PIN. On the current scheme this only re-wraps the data key
    // (patient files are untouched). Throws with a user-facing message
    // (e.g. "Ancien PIN incorrect") on failure; nothing is changed on disk if it fails.
    changeMasterPin: async (oldPin: string, newPin: string): Promise<void> => {
        if (!isTauri()) return;
        await invoke('change_master_pin', { oldPin, newPin });
    },

    // Recovers access using the 24-word phrase and sets a new master PIN in the same
    // step. Returns a freshly generated recovery phrase (the one just used is retired).
    recoverWithPhrase: async (phrase: string, newPin: string): Promise<string> => {
        return invoke<string>('recover_with_phrase', { phrase, newPin });
    },

    // Regenerates the recovery phrase without changing the PIN (e.g. the doctor
    // suspects the previous phrase was seen by someone else).
    regenerateRecovery: async (pin: string): Promise<string> => {
        return invoke<string>('regenerate_recovery', { pin });
    },
};
