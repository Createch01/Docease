import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSourceFiles } from './helpers/sourceFiles';

const read = (f: string) => readFileSync(f, 'utf8');

describe('Registre d\'encaissements (C1) — branchement de l\'interface', () => {
    it('le chèque est un mode de paiement partout où l\'on choisit un mode', () => {
        expect(read('types.ts')).toContain("'CASH' | 'CARD' | 'TRANSFER' | 'CHEQUE'");
        expect(read('services/paymentService.ts')).toContain("'CHEQUE'");
        expect(read('components/CashierView.tsx')).toContain("{ id: 'CHEQUE', label: 'Chèque' }");
        const fields = read('components/PaymentFields.tsx');
        expect(fields).toContain("{ id: 'CHEQUE', label: 'Chèque' }");
        expect(read('components/RecordPaymentDialog.tsx')).toContain('PAY_MODES.map');
        expect(read('services/receiptService.ts')).toContain("CHEQUE: 'Chèque'");
    });

    it('la reprise des paiements existants est lancée par le médecin, dans l\'application de bureau seulement', () => {
        const data = read('services/dataService.ts');
        expect(data).toContain("invoke<number>('payments_migrate')");
        expect(data).toMatch(/sessionService\.isMedecin\(\) && typeof \(window as any\)\.__TAURI_INTERNALS__ !== 'undefined'/);
    });

    it('l\'interface n\'écrit jamais le registre : aucun accès direct au fichier', () => {
        const offenders = appSourceFiles().filter(f => f.text.includes('meddoc_payments')).map(f => f.file);
        expect(offenders).toEqual([]);
    });

    it('le remboursement exige un motif et passe par Rust ; bouton réservé au médecin', () => {
        const dlg = read('components/RefundDialog.tsx');
        expect(dlg).toContain('reason.trim().length >= 3');
        expect(dlg).toContain('paymentRegistryService.refund(note.id');
        const svc = read('services/paymentRegistryService.ts');
        expect(svc).toContain("'payment_refund'");
        const fin = read('components/dossier/FinancesSection.tsx');
        expect(fin).toContain('sessionService.isMedecin() && note.status !== \'UNPAID\' && !note.cancelledAt');
        expect(fin).toContain('<RefundDialog');
    });

    it('le registre est contrôlable dans les réglages du cabinet (médecin)', () => {
        const cab = read('components/settings/CabinetSettings.tsx');
        expect(cab).toContain('sessionService.isMedecin() && <PaymentsRegistryCard />');
    });
});

describe('Registre d\'encaissements (C1) — côté Rust', () => {
    it('les commandes sont réservées au médecin et le fichier est réservé (ni load_json ni save_json)', () => {
        const access = read('src-tauri/src/access.rs');
        for (const c of ['payment_refund', 'payments_list', 'payments_verify', 'payments_migrate']) {
            expect(access).toContain(`("${c}", Rule::Medecin)`);
        }
        expect(access).toContain('"meddoc_payments"');
        const lib = read('src-tauri/src/lib.rs');
        expect(lib).toContain('numbering::on_save(dir, &key, data, &util::today_local(), &session.name)');
        expect(lib).toContain('payments::payment_refund');
    });

    it('montant payé et statut sont rapprochés du registre à chaque écriture de notes (médecin et assistante)', () => {
        expect(read('src-tauri/src/numbering.rs')).toContain('super::payments::reconcile(dir, key, &stored, &mut out, today, by)?');
        expect(read('src-tauri/src/scoped.rs')).toContain('super::payments::reconcile(dir, key, &stored, &mut notes, today, by)?');
    });

    it('la restauration d\'une sauvegarde ne raccourcit jamais le registre', () => {
        expect(read('src-tauri/src/backup.rs')).toContain('super::payments::merge_for_restore(dir, key, &mut merged_files)');
    });
});
