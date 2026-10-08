import { invoke } from '@tauri-apps/api/core';
import { dataService } from './dataService';

// Registre d'encaissements (src-tauri/src/payments.rs) : ajout seul, chaîné par empreintes, écrit par Rust.
// L'interface ne crée, ne modifie ni ne supprime jamais une entrée : un remboursement est une écriture
// négative avec motif obligatoire, décidée et contrôlée par Rust (médecin seulement).

export type PaymentEntryKind = 'payment' | 'refund' | 'migrated';

export interface PaymentEntry {
    seq: number;
    kind: PaymentEntryKind;
    /** Jour du paiement (AAAA-MM-JJ) ; pour une reprise « migrée », la date de la note. */
    date: string;
    noteId: string;
    patientId: string;
    /** Centimes, négatif pour un remboursement. */
    amountCents: number;
    mode: string;
    reason?: string;
    by: string;
}

export interface PaymentRegistryReport {
    ok: boolean;
    count: number;
    migrated: number;
    refunds: number;
    netCents: number;
    /** Net encaissé par jour de paiement, du plus récent au plus ancien. */
    netByDay: { date: string; netCents: number }[];
    /** Notes annulées dont l'encaissement migré à tort a été neutralisé. */
    neutralizedNotes: number;
    /** Notes annulées dont le net n'est pas 0 (anomalie héritée). */
    cancelledNotSettled: number;
    problems: string[];
}

export const PAYMENT_KIND_LABEL: Record<PaymentEntryKind, string> = { payment: 'Encaissement', refund: 'Remboursement', migrated: 'Encaissement migré' };

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("Le registre des encaissements n'est disponible que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new Error(typeof e === 'string' ? e : (e as any)?.message || 'Opération impossible.');
    }
};

export const paymentRegistryService = {
    /** Médecin : rembourse un patient (entrée négative, motif obligatoire). La note est relue après l'écriture. */
    refund: async (noteId: string, amount: number, mode: string, reason: string): Promise<PaymentEntry> => {
        const entry = await call<PaymentEntry>('payment_refund', { noteId, amount, mode, reason });
        await dataService.reloadHonoraryNotes();
        return entry;
    },
    /** Médecin : dernières entrées du registre, les plus récentes d'abord. */
    list: (limit = 100) => call<PaymentEntry[]>('payments_list', { limit }),
    /** Médecin : chaîne d'empreintes, rangs, signes des montants. */
    verify: () => call<PaymentRegistryReport>('payments_verify'),
};
