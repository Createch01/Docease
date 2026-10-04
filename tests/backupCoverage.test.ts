import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

// Liste unique des fichiers sauvegardés : src-tauri/src/backup.rs (`is_backup_data_file`).
// Ce test garantit que chaque fichier de données écrit par l'application y est couvert,
// y compris les champs récents (consentement WhatsApp, …SentAt, modèles de messages,
// cabinetName) qui vivent dans les fichiers meddoc_patients / meddoc_appointments /
// meddoc_appointment_settings / meddoc_doctor_info.
describe('couverture de la sauvegarde', () => {
    const rust = read('src-tauri/src/backup.rs');
    const extras = [...rust.matchAll(/EXTRA_DATA_FILES: &\[&str\] = &\[([^\]]*)\]/g)][0]?.[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? [];

    const storageKeys = (() => {
        const src = read('services/dataService.ts');
        const block = src.slice(src.indexOf('const STORAGE_KEYS = {'), src.indexOf('};', src.indexOf('const STORAGE_KEYS = {')));
        return [...block.matchAll(/'(meddoc_[a-z_]+)'/g)].map(m => m[1]);
    })();

    it('le préfixe meddoc_ est la règle de Rust', () => {
        expect(rust).toContain('name.starts_with("meddoc_")');
    });

    it('chaque clé de données de dataService est un fichier meddoc_*', () => {
        expect(storageKeys.length).toBeGreaterThanOrEqual(15);
        for (const k of storageKeys) expect(k.startsWith('meddoc_')).toBe(true);
    });

    it('les fichiers qui portent les nouveaux champs sont bien des clés sauvegardées', () => {
        for (const k of ['meddoc_patients', 'meddoc_appointments', 'meddoc_appointment_settings', 'meddoc_doctor_info']) {
            expect(storageKeys).toContain(k);
        }
    });

    it('les surcharges du catalogue sont dans la liste de Rust', () => {
        const admin = read('services/medicamentAdminService.ts');
        const overrides = /OVERRIDES_FILE = '([^']+)'/.exec(admin)![1];
        const audit = /AUDIT_LOG_FILE = '([^']+)'/.exec(admin)![1];
        expect(extras).toContain(`${overrides}.json`);
        expect(extras).toContain(`${audit}.json`);
    });

    it('aucun fichier écrit par storageService.save ne sort de la liste', () => {
        const names = new Set<string>();
        for (const f of ['services/dataService.ts', 'services/medicamentAdminService.ts']) {
            for (const m of read(f).matchAll(/storageService\.save\(\s*'([^']+)'/g)) names.add(m[1]);
        }
        for (const n of names) {
            const file = `${n}.json`;
            expect(n.startsWith('meddoc_') || extras.includes(file), `${file} doit être sauvegardé`).toBe(true);
        }
    });

    it('les fichiers de sécurité ne sont jamais sauvegardés', () => {
        for (const bad of ['users_meta', 'security_meta', 'audit_log', 'app_settings', 'backup_meta', 'meddoc_ai']) {
            expect(extras.some(e => e.startsWith(bad))).toBe(false);
        }
    });
});
