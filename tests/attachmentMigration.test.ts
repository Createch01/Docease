import { describe, it, expect } from 'vitest';
import type { MedicalResult } from '../types';
import { AddInput, AttachmentMeta, MAX_FILE_BYTES, bytesToBase64, checkFile, defaultTitle, formatSize, heavyWarning, base64ToBytes } from '../services/attachmentService';
import { hasLegacyAttachments, isLegacy, migrateResultAttachments, parseDataUrl, sha256Hex, MigrationDeps } from '../services/attachmentMigration';

const enc = (s: string) => new TextEncoder().encode(s);
const dataUrl = (mime: string, bytes: Uint8Array) => `data:${mime};base64,${bytesToBase64(bytes)}`;
const PDF = enc('%PDF-1.4 contenu de test');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);

const result = (id: string, atts: any[], over: Partial<MedicalResult> = {}): MedicalResult => ({
    id, patientId: 'p1', date: '2026-09-30', receivedDate: '2026-09-30', title: 'NFS', interpretation: '', resultType: 'biologie', attachments: atts, ...over,
} as MedicalResult);

/** Faux Rust : stockage en mémoire ; les images « nettoyées » perdent leur dernier octet. */
function backend(opts: { failAdd?: (title: string) => boolean; corruptRead?: boolean } = {}) {
    const store = new Map<string, { meta: AttachmentMeta; bytes: Uint8Array }>();
    let n = 0;
    const saved: MedicalResult[] = [];
    const deps = (results: MedicalResult[]): MigrationDeps => ({
        results,
        today: '2026-10-07',
        list: async patientId => [...store.values()].filter(v => v.meta.patientId === patientId).map(v => v.meta),
        add: async (input: AddInput, bytes: Uint8Array) => {
            if (opts.failAdd?.(input.title)) throw 'Refusé par Rust';
            const mime = bytes[0] === 0x25 ? 'application/pdf' : 'image/png';
            const stored = mime === 'application/pdf' ? bytes : bytes.slice(0, -1);
            const meta = { ...input, id: `pj-${String(++n).padStart(16, '0')}`, mime, size: stored.length, sha256: await sha256Hex(stored), createdAt: 't', createdBy: 'Dr' } as AttachmentMeta;
            store.set(meta.id, { meta, bytes: stored });
            return meta;
        },
        read: async id => {
            const b = store.get(id)!.bytes;
            return opts.corruptRead ? b.slice(0, -1) : b;
        },
        sha256: sha256Hex,
        saveResult: async r => { saved.push(r); },
    });
    return { store, saved, deps };
}

describe('migration des pièces des résultats', () => {
    it('repère les anciennes pièces et lit les data: URL', () => {
        expect(isLegacy({ name: 'a', type: 'application/pdf', url: dataUrl('application/pdf', PDF) })).toBe(true);
        expect(isLegacy({ name: 'a', type: 'application/pdf', attachmentId: 'pj-0123456789abcdef' })).toBe(false);
        expect(isLegacy({ name: 'a', type: 'x', url: 'https://x' })).toBe(false);
        expect(hasLegacyAttachments([result('r', [{ name: 'a', type: 't', url: dataUrl('application/pdf', PDF) }])])).toBe(true);
        expect(hasLegacyAttachments([result('r', [])])).toBe(false);
        const p = parseDataUrl(dataUrl('application/pdf', PDF))!;
        expect(p.mime).toBe('application/pdf');
        expect(Array.from(p.bytes)).toEqual(Array.from(PDF));
        expect(parseDataUrl('data:text/plain,hello')).toBeNull();
        expect(parseDataUrl('data:application/pdf;base64,@@@')).toBeNull();
        expect(parseDataUrl(undefined)).toBeNull();
    });

    it('migre, relit pour contrôle, puis remplace par attachmentId (le PDF garde son empreinte)', async () => {
        const b = backend();
        const r = result('r1', [
            { name: 'bilan_sanguin.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) },
            { name: 'radio.png', type: 'image/png', url: dataUrl('image/png', PNG) },
        ], { resultType: 'imagerie' });
        const report = await migrateResultAttachments(b.deps([r]));
        expect(report).toMatchObject({ migrated: 2, reused: 0, results: 1 });
        expect(report.skipped).toEqual([]);
        expect(b.saved).toHaveLength(1);
        const out = b.saved[0].attachments;
        expect(out.map(a => a.url)).toEqual([undefined, undefined]); // plus de data: dans le résultat
        expect(out[0]).toMatchObject({ name: 'bilan_sanguin.pdf', type: 'application/pdf' });
        expect(out.every(a => /^pj-/.test(a.attachmentId!))).toBe(true);
        const metas = [...b.store.values()].map(v => v.meta);
        expect(metas[0]).toMatchObject({ title: 'bilan sanguin', category: 'imagerie', examDate: '2026-09-30', linkedType: 'result', linkedId: 'r1', patientId: 'p1' });
        expect(metas[0].sha256).toBe(await sha256Hex(PDF));
    });

    it("n'écrit rien tant que la relecture de contrôle échoue : l'ancienne pièce reste intacte", async () => {
        const b = backend({ corruptRead: true });
        const r = result('r1', [{ name: 'a.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) }]);
        const report = await migrateResultAttachments(b.deps([r]));
        expect(report.skipped).toEqual([{ resultId: 'r1', name: 'a.pdf', reason: 'verify' }]);
        expect(report.results).toBe(0);
        expect(b.saved).toEqual([]);
        expect(isLegacy(r.attachments[0])).toBe(true);
    });

    it('laisse en l\'état ce que Rust refuse, les formats inconnus et les fichiers trop gros', async () => {
        const b = backend({ failAdd: t => t === 'refusé' });
        const big = new Uint8Array(MAX_FILE_BYTES + 1);
        big[0] = 0x25;
        const r = result('r1', [
            { name: 'refusé.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) },
            { name: 'note.txt', type: 'text/plain', url: dataUrl('text/plain', enc('bonjour')) },
            { name: 'gros.pdf', type: 'application/pdf', url: dataUrl('application/pdf', big) },
            { name: 'ok.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) },
        ]);
        const report = await migrateResultAttachments(b.deps([r]));
        expect(report.migrated).toBe(1);
        expect(report.skipped.map(s => s.reason)).toEqual(['refused', 'format', 'too_big']);
        const out = b.saved[0].attachments;
        expect(isLegacy(out[0]) && isLegacy(out[1]) && isLegacy(out[2])).toBe(true); // intactes
        expect(out[3].attachmentId).toBeTruthy();
        expect(out[3].url).toBeUndefined();
    });

    it('est idempotente : une relance ne recopie rien', async () => {
        const b = backend();
        const r = result('r1', [{ name: 'a.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) }]);
        await migrateResultAttachments(b.deps([r]));
        const migrated = b.saved[0];
        const again = await migrateResultAttachments(b.deps([migrated]));
        expect(again).toMatchObject({ migrated: 0, results: 0 });
        expect(b.store.size).toBe(1);
    });

    it("reprise après interruption entre l'ajout et l'enregistrement : pas de doublon", async () => {
        const b = backend();
        const r = result('r1', [
            { name: 'a.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) },
            { name: 'a.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) },
        ]);
        // 1re passe : les pièces sont ajoutées mais le résultat n'est pas enregistré (arrêt).
        const crashing = b.deps([r]);
        crashing.saveResult = async () => { throw new Error('arrêt'); };
        await expect(migrateResultAttachments(crashing)).rejects.toThrow('arrêt');
        expect(b.store.size).toBe(2);
        // 2e passe : les deux pièces déjà ajoutées sont retrouvées (une fois chacune), rien n'est recopié.
        const report = await migrateResultAttachments(b.deps([r]));
        expect(report).toMatchObject({ migrated: 0, reused: 2, results: 1 });
        expect(b.store.size).toBe(2);
        expect(new Set(b.saved[0].attachments.map(a => a.attachmentId)).size).toBe(2);
    });

    it('une date de résultat future est ramenée à aujourd\'hui, une date illisible aussi', async () => {
        const b = backend();
        await migrateResultAttachments(b.deps([
            result('r1', [{ name: 'a.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) }], { date: '2027-01-01' }),
            result('r2', [{ name: 'b.pdf', type: 'application/pdf', url: dataUrl('application/pdf', PDF) }], { date: 'hier' }),
        ]));
        expect([...b.store.values()].map(v => v.meta.examDate)).toEqual(['2026-10-07', '2026-10-07']);
    });
});

describe('service pièces jointes', () => {
    it('contrôle les fichiers avant envoi', () => {
        expect(checkFile({ name: 'ecg.PDF', type: 'application/pdf', size: 10 })).toEqual({ ok: true, mime: 'application/pdf' });
        expect(checkFile({ name: 'photo.jpeg', type: '', size: 10 })).toEqual({ ok: true, mime: 'image/jpeg' });
        expect(checkFile({ name: 'x.png', type: 'image/png', size: 10 })).toEqual({ ok: true, mime: 'image/png' });
        for (const bad of [
            { name: 'virus.exe', type: 'application/octet-stream', size: 10 },
            { name: 'a.gif', type: 'image/gif', size: 10 },
            { name: 'faux.pdf', type: 'image/png', size: 10 },
            { name: 'a.pdf', type: 'application/pdf', size: 0 },
            { name: 'a.pdf', type: 'application/pdf', size: MAX_FILE_BYTES + 1 },
            { name: 'sans-extension', type: '', size: 10 },
        ]) expect(checkFile(bad).ok, bad.name).toBe(false);
        expect(checkFile({ name: 'a.pdf', type: 'application/pdf', size: MAX_FILE_BYTES }).ok).toBe(true);
        expect((checkFile({ name: 'a.pdf', type: 'application/pdf', size: MAX_FILE_BYTES + 1 }) as any).message).toContain('20 Mo');
    });

    it('titre par défaut, tailles, base64', () => {
        expect(defaultTitle('ECG_repos_2026.pdf')).toBe('ECG repos 2026');
        expect(defaultTitle('.pdf')).toBe('Pièce jointe');
        expect(formatSize(500)).toBe('500 o');
        expect(formatSize(2048)).toBe('2 Ko');
        expect(formatSize(3 * 1024 * 1024)).toBe('3.0 Mo');
        expect(formatSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 Go');
        const big = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
        expect(Array.from(base64ToBytes(bytesToBase64(big)))).toEqual(Array.from(big));
    });

    it("l'alerte « lourd » apparaît au-delà de 1 Go, depuis l'état des pièces ou celui de la sauvegarde", () => {
        expect(heavyWarning({ bytes: 5, level: 'ok' })).toBeNull();
        expect(heavyWarning({ attachmentsBytes: 5, attachmentsLevel: 'ok' })).toBeNull();
        expect(heavyWarning({ bytes: 1.4 * 1024 ** 3, level: 'heavy' })).toContain('1.4 Go');
        expect(heavyWarning({ attachmentsBytes: 2 * 1024 ** 3, attachmentsLevel: 'heavy' })).toContain('espace libre');
    });
});
