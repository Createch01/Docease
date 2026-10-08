import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const read = (f: string) => readFileSync(f, 'utf8');

describe('Comptabilité C3 — dépenses et clôture de période (interface)', () => {
    it("l'ancienne saisie locale a disparu : plus de base64, plus d'accès direct au fichier, plus d'addition de dépenses", () => {
        const analytics = read('components/Analytics.tsx');
        expect(analytics).not.toMatch(/receiptDataUrl|getExpenses|saveExpense|deleteExpense|EXPENSE_CATEGORIES/);
        expect(analytics).toContain('const netProfit = toDh(summary?.resultCents ?? 0);');
        expect(analytics).toContain('<ExpensesTab');
        const data = read('services/dataService.ts');
        expect(data).not.toMatch(/getExpenses|saveExpense|deleteExpense|meddoc_expenses/);
        expect(data).toContain("invoke<number>('expenses_migrate')");
        expect(read('types.ts')).not.toMatch(/interface Expense\b|EXPENSE_CATEGORIES/);
    });
    it("l'interface n'additionne rien : totaux par catégorie, résultat et agrégats viennent de Rust", () => {
        const files = ['components/accounting/ExpensesTab.tsx', 'components/accounting/ExpenseDialog.tsx', 'components/accounting/PeriodsPanel.tsx', 'services/expenseService.ts'];
        for (const f of files) expect(read(f), f).not.toMatch(/\.reduce\(/);
        expect(read('components/accounting/ExpensesTab.tsx')).toContain('data.totals.byCategory');
    });
    it('justificatifs : pièces jointes chiffrées du cabinet, aucun base64 stocké dans la dépense', () => {
        const dlg = read('components/accounting/ExpenseDialog.tsx');
        expect(dlg).toContain("const CABINET = '__cabinet__'");
        expect(dlg).toContain('attachmentService.add(');
        expect(dlg).not.toMatch(/readAsDataURL|dataUrl/);
    });
    it('nouveaux écrans : casse normale, ni extra-bold ni majuscules forcées', () => {
        const dirs = ['components/accounting', 'components/settings/ExpenseCategoriesCard.tsx', 'components/settings/PaymentsRegistryCard.tsx', 'components/RefundDialog.tsx'];
        const files: string[] = [];
        for (const d of dirs) {
            if (d.endsWith('.tsx')) files.push(d); else readdirSync(d).forEach(f => files.push(`${d}/${f}`));
        }
        for (const f of files) expect(read(f), f).not.toMatch(/font-black|font-extrabold|\buppercase\b|tracking-widest/);
    });
    it('« Corriger » = annuler + recréer en une écriture ; motif obligatoire à l\'annulation', () => {
        expect(read('services/expenseService.ts')).toContain("'expense_correct'");
        expect(read('components/accounting/ExpenseDialog.tsx')).toContain('Le motif de la correction est obligatoire.');
        expect(read('components/accounting/ExpensesTab.tsx')).toContain('cancelReason.trim().length < 3');
    });
});

describe('Comptabilité C3 — droits et fichiers réservés (Rust)', () => {
    const access = read('src-tauri/src/access.rs');
    it("l'assistante saisit une dépense du jour et voit celles du jour ; tout le reste est réservé au médecin", () => {
        for (const c of ['expense_add', 'expenses_today', 'expense_suppliers', 'expense_categories']) expect(access).toContain(`("${c}", Rule::AnySession)`);
        for (const c of ['expense_cancel', 'expense_correct', 'expense_list', 'expense_category_add', 'expense_category_set_active', 'expenses_migrate', 'expenses_verify', 'periods_list', 'period_close', 'period_reopen']) expect(access).toContain(`("${c}", Rule::Medecin)`);
    });
    it('registres, compteur et catégories réservés : ni load_json ni save_json', () => {
        for (const s of ['meddoc_expenses', 'meddoc_expense_counter', 'meddoc_expense_categories', 'meddoc_periods']) expect(access).toContain(`"${s}"`);
    });
    it('toutes les commandes sont enregistrées ; restauration et clôtures branchées', () => {
        const lib = read('src-tauri/src/lib.rs');
        for (const c of ['expenses::expense_add', 'expenses::expense_correct', 'periods::period_close', 'periods::period_reopen']) expect(lib).toContain(c);
        const backup = read('src-tauri/src/backup.rs');
        expect(backup).toContain('super::expenses::merge_for_restore');
        expect(backup).toContain('super::periods::merge_for_restore');
        expect(read('src-tauri/src/payments.rs')).toContain('super::periods::ensure_open(dir, key, today)?');
    });
});
