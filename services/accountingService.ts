import { invoke } from '@tauri-apps/api/core';

// Agrégats comptables : TOUT est calculé par Rust (src-tauri/src/accounting.rs), en centimes entiers.
// L'interface n'additionne jamais de montants : elle affiche ce que Rust renvoie.

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface ModeTotal {
    mode: string;
    grossCents: number;
    refundsCents: number;
    netCents: number;
    paymentsCount: number;
}

export interface Bucket {
    /** Jour, lundi de la semaine, AAAA-MM ou AAAA selon la granularité. */
    key: string;
    grossCents: number;
    refundsCents: number;
    netCents: number;
    paymentsCount: number;
    patientsCount: number;
    byMode: ModeTotal[];
    invoicedCents: number;
    invoicedCount: number;
}

export interface Summary {
    from: string;
    to: string;
    granularity: Granularity;
    grossCents: number;
    refundsCents: number;
    netCents: number;
    paymentsCount: number;
    patientsCount: number;
    /** Part du brut issue de la reprise des paiements antérieurs au registre. */
    migratedCents: number;
    migratedCount: number;
    /** Encaissements migrés à tort sur des notes annulées, compensés (hors brut et hors remboursements). */
    neutralizedCents: number;
    byMode: ModeTotal[];
    buckets: Bucket[];
    invoicedCents: number;
    invoicedCount: number;
    /** Σ (dû − net encaissé) des notes non annulées, toutes dates. */
    outstandingCents: number;
    outstandingNotes: number;
}

export interface JournalRow {
    seq: number;
    date: string;
    /** HH:MM local ; vide pour une reprise. */
    time: string;
    noteId: string;
    noteNumber: string;
    patientName: string;
    kind: 'payment' | 'refund';
    mode: string;
    amountCents: number;
    by: string;
    reason?: string;
    migrated: boolean;
    noteCancelled: boolean;
    /** Visible mais hors totaux (compensation d'un encaissement migré à tort sur une note annulée). */
    neutralized: boolean;
}

export interface DayTotal { date: string; grossCents: number; refundsCents: number; netCents: number }

export interface Journal {
    rows: JournalRow[];
    dayTotals: DayTotal[];
    modeTotals: ModeTotal[];
    grossCents: number;
    refundsCents: number;
    netCents: number;
}

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("La comptabilité n'est disponible que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new Error(typeof e === 'string' ? e : (e as any)?.message || 'Opération impossible.');
    }
};

export const accountingService = {
    summary: (from: string, to: string, granularity: Granularity) => call<Summary>('accounting_summary', { from, to, granularity }),
    journal: (from: string, to: string, mode?: string, kind?: 'payment' | 'refund') =>
        call<Journal>('accounting_journal', { from, to, mode: mode || null, kind: kind || null }),
    /** Écritures du jour seulement, sans nom de patient (assistante comprise). */
    journalToday: () => call<Journal>('accounting_journal_today'),
};

/** Centimes → dirhams, pour l'AFFICHAGE seulement. */
export const toDh = (cents: number): number => cents / 100;

export const MODE_LABEL: Record<string, string> = {
    CASH: 'Espèces', CHEQUE: 'Chèque', TRANSFER: 'Virement', CARD: 'Carte bancaire', DEBIT: 'Prélèvement',
};
