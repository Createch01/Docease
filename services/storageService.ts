import { invoke } from '@tauri-apps/api/core';
import { sessionService } from './sessionService';

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

// Pour l'assistante, les fichiers sensibles ne passent JAMAIS par load_json/save_json
// (refusés côté Rust) mais par des commandes typées qui filtrent les champs.
// Tout fichier absent de ces tables est ignoré : pas d'appel, valeur par défaut.
const ASSISTANT_TYPED_LOAD: Record<string, string> = {
    meddoc_patients: 'patients_list_identity',
    meddoc_today_queue: 'queue_list_identity',
    meddoc_honorary_notes: 'billing_today_list',
    meddoc_doctor_info: 'clinic_public_info',
};
const ASSISTANT_TYPED_SAVE: Record<string, { command: string; arg: string }> = {
    meddoc_patients: { command: 'patients_save_identity', arg: 'patients' },
    meddoc_today_queue: { command: 'queue_save_identity', arg: 'queue' },
};
const ASSISTANT_FILE_READ = new Set(['meddoc_appointments', 'meddoc_appointment_settings']);
const ASSISTANT_FILE_WRITE = new Set(['meddoc_appointments']);

export const storageService = {
    /**
     * Saves data to a JSON file via custom Tauri command (encrypted at rest — see
     * save_json/load_json in src-tauri/src/lib.rs). localStorage is written to ONLY
     * as a fallback when Tauri isn't available (plain browser dev preview) or when
     * the encrypted write itself fails — it is no longer a permanent plaintext mirror
     * of every save, since that defeated the point of encrypting the JSON files.
     */
    save: async (filename: string, data: any): Promise<void> => {
        if (!isTauri()) {
            localStorage.setItem(filename, JSON.stringify(data));
            return;
        }
        try {
            if (sessionService.isAssistant()) {
                const typed = ASSISTANT_TYPED_SAVE[filename];
                if (typed) await invoke(typed.command, { [typed.arg]: data });
                else if (ASSISTANT_FILE_WRITE.has(filename)) await invoke('save_json', { filename: `${filename}.json`, data });
                // Autres fichiers : écriture non autorisée pour ce rôle, ignorée.
                return;
            }
            await invoke('save_json', { filename: `${filename}.json`, data });
            console.log(`💾 Data saved to ${filename}.json`);
        } catch (error) {
            console.error(`❌ Error saving ${filename}:`, error);
            localStorage.setItem(filename, JSON.stringify(data));
        }
    },

    /**
     * Loads data from a JSON file via custom Tauri command.
     *
     * The encrypted Tauri store is the single source of truth once running under
     * Tauri — it must NOT silently fall back to localStorage on a real read error
     * (corrupt file, wrong key, etc.), because localStorage belongs to a completely
     * separate webview/browser profile and can hold stale or unrelated data (e.g.
     * from a plain `npm run dev` browser session). Silently serving that data is
     * what caused PINs and other settings to appear to "revert" after a rebuild.
     * localStorage is only ever consulted here in plain-browser dev preview, where
     * there is no Tauri backend to read from at all.
     */
    load: async <T>(filename: string, defaultValue: T): Promise<T> => {
        if (!isTauri()) {
            const localData = localStorage.getItem(filename) || localStorage.getItem(`doc_ease_${filename}`);
            return localData ? JSON.parse(localData) : defaultValue;
        }
        try {
            if (sessionService.isAssistant()) {
                const typed = ASSISTANT_TYPED_LOAD[filename];
                if (typed) return await invoke<T>(typed);
                if (!ASSISTANT_FILE_READ.has(filename)) return defaultValue;
            }
            const data = await invoke<T>('load_json', { filename: `${filename}.json` });
            console.log(`📖 Data loaded from ${filename}.json`);
            return data;
        } catch (error) {
            const message = String(error);
            if (!message.includes('File not found')) {
                // A real failure, not just "nothing saved yet" — surface it loudly
                // instead of masking it with unrelated localStorage data.
                console.error(`❌ Could not read ${filename}.json from the encrypted store. Using defaults rather than risking stale/mismatched data.`, error);
            }
            return defaultValue;
        }
    },

    /**
     * Periodic backup utility
     */
    backup: async (filename: string, data: any): Promise<void> => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backups/${filename}_${timestamp}`;
        try {
            // Create backup directory if it doesn't exist (handled implicitly by save_json if logic added, 
            // but for now we save in root or ensure backups/ exists)
            await invoke('save_json', { filename: `${backupName}.json`, data });
        } catch (error) {
            console.error("Backup failed", error);
        }
    }
};
