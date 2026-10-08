import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExistingNoteNotice, { todaysNotes } from '../components/ExistingNoteNotice';
import PaymentFields, { DEFAULT_PAYMENT, amountPaidOf } from '../components/PaymentFields';
import type { HonoraryNote } from '../types';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const note = (over: Partial<HonoraryNote>): HonoraryNote => ({
    id: 'n', patientId: 'p1', patientName: 'CHTOUKI MOHAMED', date: '2026-10-08', invoiceNumber: '2026-0010',
    services: [], totalAmount: 200, totalInWords: '', status: 'PAID', paymentMode: 'CASH', ...over,
});

describe('une visite = une note', () => {
    it("ne retient que les notes non annulées du même patient, datées du jour", () => {
        const list = [
            note({ id: 'a' }),
            note({ id: 'b', cancelledAt: '2026-10-08T09:00:00Z' }),
            note({ id: 'c', patientId: 'p2' }),
            note({ id: 'd', date: '2026-10-07' }),
        ];
        expect(todaysNotes(list, 'p1', '2026-10-08').map(n => n.id)).toEqual(['a']);
        // Une note annulée libère la visite : on peut en créer une autre sans avertissement.
        expect(todaysNotes([list[1]], 'p1', '2026-10-08')).toEqual([]);
    });

    it("l'avertissement propose d'imprimer la note existante et de créer une autre note seulement sur clic explicite", () => {
        const h = renderToStaticMarkup(React.createElement(ExistingNoteNotice, { note: note({}), currency: 'DH', onOpen() {}, onCreateAnother() {}, onClose() {} }));
        expect(h).toContain('Une note existe déjà aujourd&#x27;hui');
        expect(h).toContain('Imprimer la note 2026-0010');
        expect(h).toContain('Créer une autre note');
        expect(h).toContain('200 DH');
    });
});

describe('paiement à la création : jamais « Payé » par défaut', () => {
    it('le choix par défaut est « Non payé », montant payé 0', () => {
        expect(DEFAULT_PAYMENT.kind).toBe('UNPAID');
        expect(amountPaidOf(DEFAULT_PAYMENT, 300)).toEqual({ paid: 0 });
        const h = renderToStaticMarkup(React.createElement(PaymentFields, { value: DEFAULT_PAYMENT, onChange() {}, currency: 'DH' }));
        expect(h).toMatch(/<input[^>]*checked[^>]*\/>\s*Non payé|Non payé/);
        expect(h).not.toMatch(/name="pay-kind"[^>]*checked=""[^>]*\/>Payé/);
    });

    it('« Payé » = montant total ; « Partiel » exige un montant entre 0 et le dû', () => {
        expect(amountPaidOf({ ...DEFAULT_PAYMENT, kind: 'PAID' }, 300)).toEqual({ paid: 300 });
        expect(amountPaidOf({ ...DEFAULT_PAYMENT, kind: 'PARTIAL', partial: '120,5' }, 300)).toEqual({ paid: 120.5 });
        for (const bad of ['', '0', '-5', '300', '301', 'abc']) {
            expect('error' in amountPaidOf({ ...DEFAULT_PAYMENT, kind: 'PARTIAL', partial: bad }, 300), bad).toBe(true);
        }
    });
});

describe('création de notes : aucun chemin ne crée une note « réglée » d’office', () => {
    const billing = read('services/billingService.ts');
    const editor = read('components/HonoraryNoteEditor.tsx');
    const fin = read('components/dossier/FinancesSection.tsx');
    const quick = read('components/QuickInvoiceDialog.tsx');

    it('la facture rapide ouvre une fenêtre et ne crée plus de note directement', () => {
        expect(billing).not.toContain("status: 'PAID',");
        expect(billing).toContain('amountPaid: params.amountPaid');
        expect(fin).toContain('const handleQuickInvoice = () => setQuickOpen(true);');
        expect(fin).not.toContain('buildQuickInvoice');
        expect(quick).toContain('useState<PaymentChoice>(DEFAULT_PAYMENT)');
        expect(quick).toContain('billingService.defaultQuickAmount()');
        expect(quick).toContain('todaysNotes(');
    });

    it("l'éditeur de notes : paiement explicite, avertissement une visite = une note, jamais deux notes pour un même enregistrement", () => {
        expect(editor).toContain('useState<PaymentChoice>(DEFAULT_PAYMENT)');
        expect(editor).not.toMatch(/useState<'PAID' \| 'UNPAID'>\('PAID'\)/);
        expect(editor).toContain('<PaymentFields');
        expect(editor).toContain('id: savedNote?.id ?? Date.now().toString()');
        expect(editor).toContain('<ExistingNoteNotice');
    });

    it("le statut n'est plus un bouton à cycler : il est affiché, calculé, et l'encaissement passe par un montant", () => {
        expect(fin).not.toContain('cycleStatus');
        expect(fin).toContain('<RecordPaymentDialog');
        expect(read('components/RecordPaymentDialog.tsx')).toContain('amountPaid: Math.round((already + v) * 100) / 100');
    });

    it('note annulée : statut « Annulée » à la place de Réglé / Non payé, montant grisé', () => {
        expect(fin).toContain('data-testid="status-cancelled"');
        expect(fin).toContain("t('note_cancelled')");
        expect(fin).toContain("note.cancelledAt ? 'text-gray-400' : 'text-emerald-700'");
        // Le badge « Réglé » n'est affiché que dans la branche des notes non annulées.
        const i = fin.indexOf('data-testid="status-cancelled"');
        const j = fin.indexOf('data-testid={`status-${note.status}`}');
        expect(i).toBeGreaterThan(0);
        expect(j).toBeGreaterThan(i);
    });

    it('en-têtes du tableau en français et en casse normale', () => {
        const i18n = read('i18n.tsx');
        for (const [k, v] of [['fin_col_note', 'N°'], ['fin_col_date', 'Date'], ['fin_col_benefits', 'Prestations'], ['fin_col_amount', 'Montant'], ['fin_col_status', 'Statut'], ['fin_col_actions', 'Actions']]) {
            expect(i18n).toContain(`${k}: '${v}'`);
            expect(fin).toContain(`t('${k}')`);
        }
        const thead = fin.slice(fin.indexOf('<thead>'), fin.indexOf('</thead>'));
        expect(thead).not.toContain('uppercase');
        expect(thead).not.toContain('tracking-');
    });

    it('tableau des reçus : numéro de la note liée', () => {
        expect(fin).toContain('data-testid="receipt-note"');
        expect(fin).toContain('honoraryNotes.find(n => n.id === r.noteId)?.invoiceNumber');
        expect(fin).toContain('<th>Note</th>');
    });

    it("encaissement de l'assistante : montant payé, jamais de statut envoyé ; libellé « Paiement »", () => {
        const cashier = read('components/CashierView.tsx');
        expect(cashier).not.toMatch(/paymentMode: row\.mode, status: row\.status/);
        expect(cashier).toContain('Paiement');
        expect(cashier).toContain("?? 'UNPAID'"); // nouvelle ligne : jamais « Payé » d'office
    });
});
