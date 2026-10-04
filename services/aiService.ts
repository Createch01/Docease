import { invoke } from '@tauri-apps/api/core';
import { Patient } from '../types';

// Fonctions IA (Gemini). Les appels passent par des commandes Rust
// (src-tauri/src/ai.rs) : la clé API n'existe jamais côté frontend. Le Rust
// vérifie lui-même l'interrupteur « Fonctions IA » et minimise les données.

export interface AiStatus {
    enabled: boolean;
    hasKey: boolean;
    keySuffix: string | null;
    fromDev: boolean;
}

interface RawStatus {
    enabled: boolean;
    has_key: boolean;
    key_suffix: string | null;
    from_dev: boolean;
}

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const toMessage = (err: unknown): string =>
    typeof err === 'string' ? err : (err as any)?.message || 'Erreur du service IA.';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("Les fonctions IA sont disponibles uniquement dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (err) {
        throw new Error(toMessage(err));
    }
};

// Dernier état connu de l'interrupteur « Fonctions IA » (faux tant que non lu) : les écrans
// qui dépendent de l'IA (SmartDoc) ne s'affichent que s'il est activé.
export const AI_STATUS_EVENT = 'docease_ai_status';
let enabledCache = false;

const toStatus = (r: RawStatus): AiStatus => {
    enabledCache = r.enabled;
    window.dispatchEvent(new CustomEvent(AI_STATUS_EVENT, { detail: { enabled: r.enabled } }));
    return { enabled: r.enabled, hasKey: r.has_key, keySuffix: r.key_suffix, fromDev: r.from_dev };
};

// Identifiants du patient que le Rust doit retirer des textes libres avant envoi.
// Ils restent sur la machine : ils servent uniquement à les masquer.
const identifiersOf = (p?: Partial<Patient> | null): string[] =>
    p ? [p.name, p.lastName, p.firstName, p.phone, p.cin, p.address, p.id]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];

const patientContext = (p?: Partial<Patient> | null) =>
    p ? { age: p.age ?? null, sex: p.sex ?? null, weight: p.weight ? parseFloat(p.weight) || null : null } : null;

export const aiService = {
    isTauri,
    isEnabledCached: (): boolean => enabledCache,

    getStatus: async (): Promise<AiStatus> => toStatus(await call<RawStatus>('ai_status')),
    setEnabled: async (enabled: boolean): Promise<AiStatus> => toStatus(await call<RawStatus>('ai_set_enabled', { enabled })),
    saveKey: async (apiKey: string): Promise<AiStatus> => toStatus(await call<RawStatus>('ai_save_key', { apiKey })),
    deleteKey: async (): Promise<AiStatus> => toStatus(await call<RawStatus>('ai_delete_key')),
    testKey: (): Promise<void> => call<void>('ai_test_key'),

    parsePrescription: (text: string, patient: Patient) =>
        call<any>('ai_parse_prescription', { text, patient: patientContext(patient), redact: identifiersOf(patient) }),

    analyzeConsultation: (symptoms: string, clinicalExam: string, patient?: Partial<Patient> | null) =>
        call<any>('ai_analyze_consultation', {
            symptoms, clinicalExam, patient: patientContext(patient), redact: identifiersOf(patient),
        }),

    analyzeDocument: async (dataBase64: string, mimeType: string) =>
        call<any>('ai_analyze_document', { dataBase64, mimeType }),

    classifyPriority: (note: string) =>
        call<{ priority: string; reason: string }>('ai_classify_priority', { note, redact: [] }),
};
