import { invoke } from '@tauri-apps/api/core';

export const storageService = {
    /**
     * Saves data to a JSON file via custom Tauri command
     */
    save: async (filename: string, data: any): Promise<void> => {
        try {
            await invoke('save_json', { filename: `${filename}.json`, data });
            console.log(`💾 Data saved to ${filename}.json`);
            // Standardize prefix: dataService already uses 'meddoc_' prefix in STORAGE_KEYS
            localStorage.setItem(filename, JSON.stringify(data));
        } catch (error) {
            console.error(`❌ Error saving ${filename}:`, error);
            localStorage.setItem(filename, JSON.stringify(data));
            throw error;
        }
    },

    /**
     * Loads data from a JSON file via custom Tauri command
     */
    load: async <T>(filename: string, defaultValue: T): Promise<T> => {
        try {
            const data = await invoke<T>('load_json', { filename: `${filename}.json` });
            console.log(`📖 Data loaded from ${filename}.json`);
            return data;
        } catch (error) {
            console.warn(`⚠️ Could not load ${filename}.json, using fallback:`, error);
            const localData = localStorage.getItem(filename) || localStorage.getItem(`doc_ease_${filename}`);
            return localData ? JSON.parse(localData) : defaultValue;
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
