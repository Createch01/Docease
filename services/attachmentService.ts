/**
 * Pièces jointes du dossier patient (médecin seulement). Tout passe par les commandes Rust
 * `attachment_*` : chiffrement, validation du contenu, nettoyage des métadonnées des images,
 * index et journal. L'interface n'envoie que des octets (jamais un chemin de fichier) et
 * ne reçoit les octets déchiffrés qu'en mémoire.
 */
import { invoke } from '@tauri-apps/api/core';

export type AttachmentCategory = 'ECG' | 'biologie' | 'imagerie' | 'courrier' | 'autre';
export type AttachmentLinkType = 'consultation' | 'result';

export interface AttachmentMeta {
    id: string;
    patientId: string;
    title: string;
    category: AttachmentCategory;
    /** AAAA-MM-JJ */
    examDate: string;
    linkedType?: AttachmentLinkType;
    linkedId?: string;
    mime: 'application/pdf' | 'image/jpeg' | 'image/png';
    size: number;
    sha256: string;
    thumb?: string;
    createdAt: string;
    createdBy: string;
    updatedAt?: string;
    /** Le fichier chiffré manque (sauvegarde restaurée sans lui, disque…). */
    missing?: boolean;
}

export interface AddInput {
    patientId: string;
    title: string;
    category: AttachmentCategory;
    examDate: string;
    linkedType?: AttachmentLinkType;
    linkedId?: string;
    thumb?: string;
}

export interface UpdateInput {
    title?: string;
    category?: AttachmentCategory;
    examDate?: string;
    linkedType?: AttachmentLinkType;
    linkedId?: string;
    clearLink?: boolean;
}

export interface AttachmentsStatus {
    count: number;
    bytes: number;
    level: 'ok' | 'heavy';
    missing: number;
    orphanRecords: number;
    swept: number;
}

/** 20 Mo par fichier. Même valeur que Rust (`attachments::MAX_FILE_BYTES`). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Au-delà : alerte « lourd pour la sauvegarde ». Même valeur que Rust (`HEAVY_BYTES`). */
export const HEAVY_BYTES = 1024 * 1024 * 1024;

export const CATEGORIES: { id: AttachmentCategory; label: string }[] = [
    { id: 'ECG', label: 'ECG' },
    { id: 'biologie', label: 'Biologie' },
    { id: 'imagerie', label: 'Imagerie' },
    { id: 'courrier', label: 'Courrier' },
    { id: 'autre', label: 'Autre' },
];

export const categoryLabel = (c: string) => CATEGORIES.find(x => x.id === c)?.label ?? c;

const EXT_MIME: Record<string, AttachmentMeta['mime']> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

export const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} Go`;
};

export type FileCheck = { ok: true; mime: AttachmentMeta['mime'] } | { ok: false; message: string };

/** Contrôle rapide avant tout envoi à Rust (qui revérifie le CONTENU : signature du fichier). */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    const byExt = EXT_MIME[ext];
    const byType = (['application/pdf', 'image/jpeg', 'image/png'] as const).find(m => m === file.type);
    const mime = byType ?? byExt;
    if (!mime || (byType && byExt && byType !== byExt)) {
        return { ok: false, message: 'Type de fichier non accepté (PDF, JPG ou PNG uniquement).' };
    }
    if (file.size === 0) return { ok: false, message: 'Le fichier est vide.' };
    if (file.size > MAX_FILE_BYTES) return { ok: false, message: `Fichier trop volumineux (${formatSize(file.size)}) : ${MAX_FILE_BYTES / 1024 / 1024} Mo au plus.` };
    return { ok: true, mime };
}

/** Titre proposé : nom du fichier sans extension. */
export const defaultTitle = (fileName: string): string =>
    fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || 'Pièce jointe';

export function bytesToBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
    return btoa(parts.join(''));
}

export const toDataUrl = (bytes: Uint8Array, mime: string): string => `data:${mime};base64,${bytesToBase64(bytes)}`;

export const base64ToBytes = (b64: string): Uint8Array => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

/** Message d'alerte « lourd pour la sauvegarde », ou null. */
export function heavyWarning(status: Pick<AttachmentsStatus, 'bytes' | 'level'> | { attachmentsBytes: number; attachmentsLevel: string }): string | null {
    const bytes = 'bytes' in status ? status.bytes : status.attachmentsBytes;
    const level = 'level' in status ? status.level : status.attachmentsLevel;
    if (level !== 'heavy') return null;
    return `Pièces jointes : ${formatSize(bytes)}. Vérifiez l'espace libre de vos disques de sauvegarde (les pièces y sont copiées une seule fois).`;
}

/** Date (AAAA-MM-JJ) valide, sinon undefined. */
export const asDay = (s: string | undefined): string | undefined => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined);

export const attachmentService = {
    list: (patientId: string) => invoke<AttachmentMeta[]>('attachment_list', { patientId }),

    add: (input: AddInput, bytes: Uint8Array) =>
        invoke<AttachmentMeta>('attachment_add', { meta: input, dataBase64: bytesToBase64(bytes) }),

    update: (id: string, patch: UpdateInput) => invoke<AttachmentMeta>('attachment_update', { id, patch }),

    /** Octets déchiffrés, en mémoire seulement. */
    read: async (id: string): Promise<Uint8Array> => {
        const data = await invoke<ArrayBuffer | number[]>('attachment_read', { id });
        return data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);
    },

    remove: (id: string) => invoke<void>('attachment_delete', { id }),

    status: () => invoke<AttachmentsStatus>('attachments_status'),
};
