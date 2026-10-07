/**
 * Migration des anciennes pièces des résultats d'examens.
 *
 * Avant : `MedicalResult.attachments[i] = { name, type, url }` avec `url` = `data:` base64 stocké
 * dans `meddoc_medical_results.json` (fichier gonflé, recopié dans chaque sauvegarde).
 * Après : `{ name, type, attachmentId }`, le fichier vivant dans le stockage chiffré de Rust.
 *
 * Non destructive et relançable : chaque pièce est ajoutée, RELUE (empreinte identique à celle
 * qu'annonce Rust), et SEULEMENT ENSUITE remplacée dans le résultat. Tout écart laisse l'ancienne
 * pièce intacte et la signale dans le rapport.
 *
 * Doublon : si l'application s'arrête entre l'ajout et l'enregistrement du résultat, la relance
 * retrouve la pièce déjà ajoutée (même résultat, même titre, même type, une seule fois chacune)
 * au lieu de la recopier.
 */
import type { MedicalResult, MedicalResultAttachment } from '../types';
import { AddInput, AttachmentCategory, AttachmentMeta, MAX_FILE_BYTES, asDay, base64ToBytes, defaultTitle } from './attachmentService';

export interface SkippedAttachment { resultId: string; name: string; reason: 'format' | 'too_big' | 'refused' | 'verify' }

export interface MigrationReport {
    migrated: number;
    reused: number;
    skipped: SkippedAttachment[];
    /** Résultats mis à jour. */
    results: number;
}

export interface MigrationDeps {
    results: MedicalResult[];
    /** AAAA-MM-JJ local. */
    today: string;
    list: (patientId: string) => Promise<AttachmentMeta[]>;
    add: (input: AddInput, bytes: Uint8Array) => Promise<AttachmentMeta>;
    read: (id: string) => Promise<Uint8Array>;
    sha256: (bytes: Uint8Array) => Promise<string>;
    /** Vignette (data URL) ou undefined. */
    thumb?: (bytes: Uint8Array, mime: string) => Promise<string | undefined>;
    saveResult: (r: MedicalResult) => Promise<void>;
}

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];

/** `data:<mime>[;param];base64,<données>` → { mime, bytes } ; null si ce n'est pas du base64 lisible. */
export function parseDataUrl(url: string | undefined): { mime: string; bytes: Uint8Array } | null {
    const m = /^data:([^;,]+)((?:;[^;,]+)*);base64,([A-Za-z0-9+/=\s]*)$/.exec(url ?? '');
    if (!m) return null;
    try {
        return { mime: m[1].toLowerCase(), bytes: base64ToBytes(m[3].replace(/\s+/g, '')) };
    } catch {
        return null;
    }
}

export const isLegacy = (a: MedicalResultAttachment): boolean => !a.attachmentId && typeof a.url === 'string' && a.url.startsWith('data:');

export const hasLegacyAttachments = (results: MedicalResult[]): boolean => results.some(r => (r.attachments ?? []).some(isLegacy));

const CATEGORY_OF: Record<string, AttachmentCategory> = { biologie: 'biologie', imagerie: 'imagerie', autre: 'autre' };

export async function migrateResultAttachments(deps: MigrationDeps): Promise<MigrationReport> {
    const report: MigrationReport = { migrated: 0, reused: 0, skipped: [], results: 0 };
    const existingByPatient = new Map<string, AttachmentMeta[]>();
    const consumed = new Set<string>();

    for (const result of deps.results) {
        const atts = result.attachments ?? [];
        if (!atts.some(isLegacy)) continue;
        const converted = new Map<number, MedicalResultAttachment>();

        for (let i = 0; i < atts.length; i++) {
            const att = atts[i];
            if (!isLegacy(att)) continue;
            const skip = (reason: SkippedAttachment['reason']) => report.skipped.push({ resultId: result.id, name: att.name, reason });
            const parsed = parseDataUrl(att.url);
            const mime = parsed ? (parsed.mime === 'image/jpg' ? 'image/jpeg' : parsed.mime) : '';
            if (!parsed || !ACCEPTED.includes(mime)) { skip('format'); continue; }
            if (parsed.bytes.length > MAX_FILE_BYTES) { skip('too_big'); continue; }

            const title = defaultTitle(att.name);
            try {
                if (!existingByPatient.has(result.patientId)) existingByPatient.set(result.patientId, await deps.list(result.patientId));
                const known = existingByPatient.get(result.patientId)!;
                let meta = known.find(k => !consumed.has(k.id) && k.linkedType === 'result' && k.linkedId === result.id && k.title === title && k.mime === mime);
                if (meta) {
                    report.reused++;
                } else {
                    const day = asDay(result.date) ?? deps.today;
                    meta = await deps.add({
                        patientId: result.patientId,
                        title,
                        category: CATEGORY_OF[result.resultType] ?? 'autre',
                        examDate: day > deps.today ? deps.today : day,
                        linkedType: 'result',
                        linkedId: result.id,
                        thumb: deps.thumb ? await deps.thumb(parsed.bytes, mime).catch(() => undefined) : undefined,
                    }, parsed.bytes);
                    known.push(meta);
                    report.migrated++;
                }
                consumed.add(meta.id);
                // Relecture de contrôle : le fichier stocké se relit, et son empreinte est celle qu'annonce Rust.
                const back = await deps.read(meta.id);
                if (back.length !== meta.size || (await deps.sha256(back)) !== meta.sha256) throw new Error('verify');
                // Un PDF n'est jamais modifié : son empreinte doit être celle du fichier d'origine.
                if (mime === 'application/pdf' && (await deps.sha256(parsed.bytes)) !== meta.sha256) throw new Error('verify');
                converted.set(i, { name: att.name, type: mime, attachmentId: meta.id });
            } catch (e) {
                skip(e instanceof Error && e.message === 'verify' ? 'verify' : 'refused');
            }
        }

        if (converted.size > 0) {
            await deps.saveResult({ ...result, attachments: atts.map((a, i) => converted.get(i) ?? a) });
            report.results++;
        }
    }
    return report;
}

export const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))).map(b => b.toString(16).padStart(2, '0')).join('');
