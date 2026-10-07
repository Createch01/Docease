import { invoke } from '@tauri-apps/api/core';

// Reçus de paiement : tout se passe côté Rust (src-tauri/src/receipts.rs). Numéro, année, date,
// montant en centimes et montant en lettres sont attribués par Rust ; l'interface n'en calcule
// aucun et n'envoie que l'identifiant de l'encaissement. Registre immuable : ni modification ni
// suppression, seulement un reçu d'annulation.

export interface ReceiptLegal {
    inpe?: string;
    if?: string;
    ice?: string;
    professionalTax?: string;
    orderNumber?: string;
    vatNote?: string;
}

export type ReceiptKind = 'receipt' | 'cancellation' | 'duplicate';
/** `valid` · `cancelled` (reçu annulé) · `cancellation` (reçu d'annulation). */
export type ReceiptStatus = 'valid' | 'cancelled' | 'cancellation';

export interface ReceiptView {
    kind: ReceiptKind;
    number: string;
    seq: number;
    year: number;
    date: string;
    issuedAt: string;
    issuedBy: string;
    noteId: string;
    patientId: string;
    patientName: string;
    /** Négatif pour un reçu d'annulation. */
    amountCents: number;
    amountInWords: string;
    paymentMode: 'CASH' | 'CARD' | 'TRANSFER' | string;
    label: string;
    balanceDueCents: number;
    legal: ReceiptLegal;
    cancelsNumber?: string;
    reason?: string;
    status: ReceiptStatus;
    cancelledBy: string | null;
    duplicates: number;
    /** Rang du duplicata qui vient d'être enregistré (réponse de `duplicate` seulement). */
    duplicateRank: number | null;
}

export interface ReceiptVerifyReport { ok: boolean; count: number; lastNumber: string | null; problems: string[] }

export const RECEIPTS_CHANGED_EVENT = 'docease_receipts_changed';

export const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("Les reçus ne sont disponibles que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new Error(typeof e === 'string' ? e : (e as any)?.message || 'Erreur de reçu.');
    }
};

const changed = () => window.dispatchEvent(new CustomEvent(RECEIPTS_CHANGED_EVENT));

export const receiptService = {
    /** Émet le reçu du versement non encore couvert. `detail` (médecin seulement) : noms des prestations. */
    issue: async (noteId: string, detail = false) => { const r = await call<ReceiptView>('receipt_issue', { noteId, detail }); changed(); return r; },
    /** Enregistre une réimpression (aucun nouveau numéro) et renvoie le reçu figé. */
    duplicate: async (number: string) => { const r = await call<ReceiptView>('receipt_duplicate', { number }); changed(); return r; },
    /** Médecin : émet un reçu d'annulation (motif obligatoire). Le reçu d'origine n'est jamais modifié. */
    cancel: async (number: string, reason: string) => { const r = await call<ReceiptView>('receipt_cancel', { number, reason }); changed(); return r; },
    get: (number: string) => call<ReceiptView>('receipt_get', { number }),
    /** Reçus émis aujourd'hui (assistante et médecin). */
    listToday: () => call<ReceiptView[]>('receipt_list_today'),
    /** Médecin : registre complet, ou filtré sur un patient. */
    list: (patientId?: string) => call<ReceiptView[]>('receipt_list', { patientId: patientId ?? null }),
    /** Médecin : contrôle du registre (chaîne, suite continue, compteur). */
    verify: () => call<ReceiptVerifyReport>('receipts_verify'),
};

/** 25050 → « 250,50 DH » (centimes entiers fournis par Rust ; aucun calcul de montant). */
export const formatCents = (cents: number): string => {
    const abs = Math.abs(cents);
    const text = `${Math.floor(abs / 100).toLocaleString('fr-FR')},${String(abs % 100).padStart(2, '0')} DH`;
    return cents < 0 ? `− ${text}` : text;
};

export const PAYMENT_MODE_LABEL: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte bancaire', TRANSFER: 'Virement' };

/** Mentions légales renseignées, dans l'ordre d'affichage. Une mention vide n'apparaît jamais. */
export const legalLines = (legal: ReceiptLegal): string[] => {
    const out: string[] = [];
    const add = (label: string, v?: string) => { if (v && v.trim()) out.push(`${label} ${v.trim()}`); };
    add('INPE', legal.inpe);
    add('IF', legal.if);
    add('ICE', legal.ice);
    add('Taxe professionnelle', legal.professionalTax);
    add("N° d'inscription à l'Ordre", legal.orderNumber);
    return out;
};

export const STATUS_LABEL: Record<ReceiptStatus, string> = { valid: 'Valide', cancelled: 'Annulé', cancellation: "Reçu d'annulation" };
