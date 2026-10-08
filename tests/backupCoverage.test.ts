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

    it('les carnets de vaccination sont un fichier chiffré sauvegardé, plus des clés localStorage', () => {
        expect(storageKeys).toContain('meddoc_vaccinations');
        // La seule lecture d'anciennes clés `vaccinations_*` est la migration : plus aucune écriture en clair.
        const svc = read('services/vaccinationService.ts');
        expect(svc).not.toMatch(/localStorage\.(setItem|getItem)/);
        const mig = read('services/vaccinationMigration.ts');
        expect(mig).not.toContain('setItem');
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

describe('pièces jointes dans la sauvegarde', () => {
    const rust = read('src-tauri/src/backup.rs');
    const pj = read('src-tauri/src/backup_pj.rs');
    const att = read('src-tauri/src/attachments.rs');

    it("l'index des pièces est un fichier meddoc_* géré par Rust, donc sauvegardé", () => {
        expect(att).toContain('pub const INDEX_FILE: &str = "meddoc_attachments.json"');
        expect(rust).toContain('name.starts_with("meddoc_")');
        const access = read('src-tauri/src/access.rs');
        expect(access).toContain('"meddoc_attachments"'); // réservé : jamais lu/écrit par load_json / save_json
    });

    it('les fichiers des pièces sont copiés à côté du .dcb, hors du .dcb', () => {
        expect(pj).toContain('pub const SUBDIR: &str = "pieces-jointes"');
        expect(rust).toContain('attachments');
        expect(rust).toContain('pj::sync_dest');
        expect(rust).toContain('pj::stage_restore');
        // Le dossier local des pièces n'est PAS un fichier racine .json : il est géré par backup_pj, pas par collect().
        expect(att).toContain('pub const DIR: &str = "pieces_jointes"');
    });

    it('la sauvegarde ne contourne jamais la copie unique : aucune pièce lue dans collect()', () => {
        const collect = rust.slice(rust.indexOf('pub fn collect'), rust.indexOf('fn bundle_bytes_with'));
        expect(collect).not.toContain('pieces_jointes');
    });
});

describe('registre des reçus dans la sauvegarde', () => {
    const rec = read('src-tauri/src/receipts.rs');
    const access = read('src-tauri/src/access.rs');
    const backup = read('src-tauri/src/backup.rs');

    it('le registre et le compteur sont des fichiers meddoc_* gérés par Rust, donc sauvegardés', () => {
        expect(rec).toContain('pub const REGISTRY_FILE: &str = "meddoc_receipts.json"');
        expect(rec).toContain('pub const COUNTER_FILE: &str = "meddoc_receipt_counter.json"');
        expect(access).toContain('"meddoc_receipts"');
        expect(access).toContain('"meddoc_receipt_counter"');
    });

    it('la restauration ne fait jamais reculer le registre ni le compteur', () => {
        expect(backup).toContain('receipts::merge_for_restore');
        expect(rec).toContain('pub fn merge_for_restore');
    });
});
