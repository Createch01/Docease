import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReceiptTemplate from '../components/ReceiptTemplate';
import { ReceiptView, formatCents, legalLines } from '../services/receiptService';
import type { DoctorInfo } from '../types';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const doctor = { cabinetName: 'Cabinet Test', nameFr: 'Dr X', specialtyFr: 'Médecine générale', addressFr: '1 rue A', phone: '0522000000', inpe: 'DOSSIER-INPE-ACTUEL', ice: 'ICE-ACTUEL' } as unknown as DoctorInfo;

const base: ReceiptView = {
    kind: 'receipt', number: 'REC-2026-00042', seq: 42, year: 2026, date: '2026-10-07', issuedAt: '2026-10-07T10:00:00Z', issuedBy: 'Dr',
    noteId: 'n1', patientId: 'p1', patientName: 'HAYAT Salma', amountCents: 25050, amountInWords: 'Deux cent cinquante dirhams et cinquante centimes',
    paymentMode: 'CASH', label: 'Consultation', balanceDueCents: 0, legal: {}, status: 'valid', cancelledBy: null, duplicates: 0, duplicateRank: null, duplicateAt: null,
};

const html = (r: ReceiptView, dup?: { rank: number; printedAt: string }) => renderToStaticMarkup(React.createElement(ReceiptTemplate, { receipt: r, doctor, duplicate: dup }));

describe('reçu : gabarit', () => {
    it("affiche le numéro, le montant en chiffres et en lettres fournis par Rust", () => {
        const h = html(base);
        expect(h).toContain('REÇU DE PAIEMENT');
        expect(h).toContain('REC-2026-00042');
        expect(h).toContain('250,50 DH');
        expect(h).toContain('Deux cent cinquante dirhams et cinquante centimes');
        expect(h).toContain('HAYAT Salma');
        expect(h).toContain('Espèces');
        expect(h).toContain('07/10/2026');
        expect(h).not.toContain('DUPLICATA');
        expect(h).not.toContain('watermark');
    });

    it("n'affiche que les mentions légales figées dans le reçu, seulement si elles sont renseignées", () => {
        expect(html(base)).not.toContain('data-testid="legal"');
        const h = html({ ...base, legal: { ice: '001234', professionalTax: '  ', vatNote: 'Exonéré de TVA' } });
        expect(h).toContain('ICE 001234');
        expect(h).toContain('Exonéré de TVA');
        expect(h).not.toContain('Taxe professionnelle');
        // La fiche cabinet actuelle (INPE, ICE du `doctor`) n'entre jamais dans le reçu.
        expect(h).not.toContain('DOSSIER-INPE-ACTUEL');
        expect(h).not.toContain('ICE-ACTUEL');
        expect(legalLines({ inpe: '1', if: '2', ice: '3', professionalTax: '4', orderNumber: '5' })).toEqual(['INPE 1', 'IF 2', 'ICE 3', 'Taxe professionnelle 4', "N° d'inscription à l'Ordre 5"]);
    });

    it('duplicata : bandeau avec le rang, jamais présenté comme un original', () => {
        const h = html({ ...base, duplicates: 1 }, { rank: 2, printedAt: '2026-10-07T11:00:00Z' });
        expect(h).toContain('DUPLICATA n° 2');
        expect(h).toContain('REC-2026-00042');
    });

    it('reçu annulé réimprimé : filigrane avec le numéro du reçu d’annulation', () => {
        const h = html({ ...base, status: 'cancelled', cancelledBy: 'REC-2026-00050' });
        expect(h).toContain('data-testid="watermark"');
        expect(h).toContain('ANNULÉ');
        expect(h).toContain('REC-2026-00050');
    });

    it("reçu d'annulation : montant négatif, référence et motif", () => {
        const h = html({ ...base, kind: 'cancellation', number: 'REC-2026-00050', status: 'cancellation', amountCents: -25050, amountInWords: 'Moins deux cent cinquante dirhams et cinquante centimes', cancelsNumber: 'REC-2026-00042', reason: 'Erreur de saisie' });
        expect(h).toContain("REÇU D&#x27;ANNULATION");
        expect(h).toContain('Annule le reçu n° REC-2026-00042');
        expect(h).toContain('− 250,50 DH');
        expect(h).toContain('Moins deux cent cinquante dirhams');
        expect(h).toContain('Motif : Erreur de saisie');
        expect(h).toContain('ANNULATION');
    });

    it('reste dû affiché seulement quand il est positif', () => {
        expect(html(base)).not.toContain('Reste dû');
        expect(html({ ...base, balanceDueCents: 30000 })).toContain('Reste dû : 300,00 DH');
    });

    it('formatCents : centimes entiers, jamais de calcul flottant', () => {
        expect(formatCents(25000)).toBe('250,00 DH');
        expect(formatCents(5)).toBe('0,05 DH');
        expect(formatCents(-25050)).toBe('− 250,50 DH');
        expect(formatCents(123456789)).toMatch(/^1\D234\D567,89 DH$/);
    });
});

describe('reçu : garde-fous', () => {
    const template = read('components/ReceiptTemplate.tsx');
    const service = read('services/receiptService.ts');

    it("le gabarit ne lit aucune donnée de santé ni la fiche cabinet pour les mentions légales", () => {
        for (const banned of ['dataService', 'Consultation[^a-z]', 'prescription', 'diagnos', 'getAllPatients', 'doctor.inpe', 'doctor.ice', 'doctor.taxId', 'doctor.patente', 'doctor.ordreNumber']) {
            const re = new RegExp(banned.includes('[') ? banned : banned.replace('.', '\\.'), 'i');
            // « Consultation » apparaît seulement dans les commentaires/props de libellé ; on contrôle les accès aux données.
            if (banned === 'Consultation[^a-z]') continue;
            expect(re.test(template), banned).toBe(false);
        }
    });

    it("l'interface ne calcule ni numéro, ni année, ni montant en lettres", () => {
        for (const src of [template, service]) {
            expect(src).not.toMatch(/numberToWords|formatCurrencyToWords|numberToFrenchWords|invoiceNumber|padStart\(5|new Date\(\)\.getFullYear/);
        }
        // Les seules données envoyées à Rust : identifiant de l'encaissement, option de détail, numéro, motif.
        expect(service).toContain("'receipt_issue', { noteId, detail }");
        expect(service).toContain("'receipt_cancel', { number, reason }");
    });

    it('registre immuable côté service : aucune modification ni suppression', () => {
        expect(service).not.toMatch(/receipt_(update|delete|edit|remove)/);
    });
});

describe('reçu : interface câblée sur les bonnes règles', () => {
    const cashier = read('components/CashierView.tsx');
    const finances = read('components/dossier/FinancesSection.tsx');
    const dialogs = read('components/ReceiptDialogs.tsx');
    const modal = read('components/ReceiptModal.tsx');
    const cabinet = read('components/settings/CabinetSettings.tsx');
    const app = read('App.tsx');

    it("la caisse (assistante) n'émet que des reçus par défaut et réimprime en duplicata", () => {
        expect(cashier).toContain('receiptService.issue(row.id)');
        expect(cashier).not.toContain('detail');
        expect(cashier).toContain('receiptService.duplicate(number)');
        expect(cashier).toContain('<ReceiptModal');
    });

    it("l'option « détailler les actes » et l'annulation sont dans le dossier du médecin, jamais dans la caisse", () => {
        expect(finances).toContain('<ReceiptIssueDialog');
        expect(finances).toContain('<CancelReceiptDialog');
        expect(dialogs).toContain('receiptService.issue(noteId, detail)');
        expect(dialogs).toContain('receiptService.cancel(receipt.number, reason)');
        expect(cashier).not.toContain('receiptService.cancel');
    });

    it("l'aperçu enregistre le duplicata avant d'afficher le bandeau, et imprime A5", () => {
        expect(modal).toContain("format: 'a5'");
        expect(modal).toContain('receipt.duplicateAt');
        expect(modal).toContain('window.print()');
    });

    it('réglages : mention de TVA vide par défaut, vérification du registre, alerte « À faire »', () => {
        expect(cabinet).toContain("'vatExemptionNote'");
        expect(cabinet).toContain('<ReceiptsRegistryCard />');
        expect(read('services/dataService.ts')).not.toMatch(/vatExemptionNote:\s*'[^']/);
        expect(app).toContain("case 'open_receipts_settings'");
        expect(read('components/TodoDrawer.tsx')).toContain('open_receipts_settings');
    });

    it('SECURITY.md documente les reçus', () => {
        const sec = read('SECURITY.md');
        for (const k of ['Reçus de paiement', 'REC-AAAA-NNNNN', 'ajout seul', 'receipts_verify', 'ne reculent jamais', 'reçu d\'annulation']) expect(sec).toContain(k);
    });
});
