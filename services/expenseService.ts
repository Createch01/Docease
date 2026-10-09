import { invoke } from '@tauri-apps/api/core';
import { bytesToBase64 } from './attachmentService';

// Dépenses et clôtures de période : tout est décidé et calculé par Rust (src-tauri/src/expenses.rs, periods.rs).
// L'interface n'écrit aucune dépense, n'attribue aucun numéro DEP et n'additionne aucun montant.

export type ExpenseMode = 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD' | 'DEBIT';

export const EXPENSE_MODES: { id: ExpenseMode; label: string }[] = [
    { id: 'CASH', label: 'Espèces' },
    { id: 'CHEQUE', label: 'Chèque' },
    { id: 'TRANSFER', label: 'Virement' },
    { id: 'CARD', label: 'Carte bancaire' },
    { id: 'DEBIT', label: 'Prélèvement' },
];

export interface ExpenseInput {
    dateExpense: string;
    category: string;
    subCategory?: string;
    supplier: string;
    supplierInvoice?: string;
    label: string;
    /** Centimes (TTC). */
    amountCents: number;
    vatCents?: number;
    mode: ExpenseMode;
    chequeNumber?: string;
    receiptIds: string[];
}

export interface ExpenseEntry {
    seq: number;
    kind: 'expense' | 'cancellation';
    id: string;
    dateExpense: string;
    dateEntry: string;
    at: string;
    category: string;
    subCategory?: string;
    supplier: string;
    supplierInvoice?: string;
    label: string;
    amountCents: number;
    vatCents?: number;
    mode: ExpenseMode;
    chequeNumber?: string;
    receiptIds: string[];
    amortizable: boolean;
    by: string;
    migrated: boolean;
}

export interface ExpenseView extends ExpenseEntry {
    status: 'active' | 'cancelled';
    cancelledReason?: string;
    cancelledOn?: string;
    cancelledBy?: string;
    hasReceipt: boolean;
}

export interface CategoryTotal { category: string; cents: number; count: number; amortizable: boolean }
export interface ModeAmount { mode: string; cents: number }

export interface ExpenseTotals {
    /** Dépenses actives hors « à amortir ». */
    expensesCents: number;
    amortizableCents: number;
    count: number;
    withoutReceipt: number;
    byCategory: CategoryTotal[];
    byMode: ModeAmount[];
}

export interface ExpenseList { rows: ExpenseView[]; totals: ExpenseTotals }

export interface ExpenseCategory { name: string; active: boolean; amortizable: boolean; builtin: boolean }

export interface PeriodEntry { seq: number; kind: 'close' | 'reopen'; month: string; date: string; by: string; reason?: string }
export interface PeriodsView { closed: string[]; entries: PeriodEntry[]; problems: string[] }

export interface ExpensesVerify { ok: boolean; count: number; expenses: number; cancellations: number; problems: string[] }

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("Les dépenses ne sont disponibles que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new Error(typeof e === 'string' ? e : (e as any)?.message || 'Opération impossible.');
    }
};

export const expenseService = {
    add: (expense: ExpenseInput) => call<ExpenseEntry>('expense_add', { expense }),
    /**
     * Justificatif (photo / PDF) d'une dépense du jour : pièce chiffrée créée par Rust (EXIF supprimé), accessible
     * aussi à l'assistante. L'identifiant renvoyé est transmis ensuite à `add` dans `receiptIds`.
     */
    addReceipt: (bytes: Uint8Array, title: string) =>
        call<{ id: string; title: string }>('expense_receipt_add', { dataBase64: bytesToBase64(bytes), title }),
    cancel: (id: string, reason: string) => call<ExpenseEntry>('expense_cancel', { id, reason }),
    /** « Corriger » : annulation de l'originale + nouvelle dépense, en une seule écriture. */
    correct: (id: string, reason: string, expense: ExpenseInput) => call<ExpenseEntry>('expense_correct', { id, reason, expense }),
    list: (from: string, to: string, filters: { category?: string; mode?: string; receipt?: boolean } = {}) =>
        call<ExpenseList>('expense_list', { from, to, category: filters.category || null, mode: filters.mode || null, receipt: filters.receipt ?? null }),
    today: () => call<ExpenseList>('expenses_today'),
    suppliers: () => call<string[]>('expense_suppliers'),
    categories: () => call<ExpenseCategory[]>('expense_categories'),
    addCategory: (name: string) => call<ExpenseCategory[]>('expense_category_add', { name }),
    setCategoryActive: (name: string, active: boolean) => call<ExpenseCategory[]>('expense_category_set_active', { name, active }),
    verify: () => call<ExpensesVerify>('expenses_verify'),
};

export const periodService = {
    list: () => call<PeriodsView>('periods_list'),
    close: (month: string) => call<PeriodEntry>('period_close', { month }),
    reopen: (month: string, reason: string) => call<PeriodEntry>('period_reopen', { month, reason }),
};

/** Mois AAAA-MM → « septembre 2026 » (affichage). */
export const monthLabel = (m: string): string => {
    const [y, mm] = m.split('-').map(Number);
    return new Date(y, (mm || 1) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};
