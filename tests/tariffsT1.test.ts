import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HonoraryNoteTemplate, { discountText, legalFooterOf, issuerDoctor } from '../components/HonoraryNoteTemplate';
import ReceiptTemplate from '../components/ReceiptTemplate';
import { newDiscount, newLine, draftToInput } from '../components/tariffs/NoteLinesEditor';
import { gridIsEmpty, isUsableAct, reasonLabel, DISCOUNT_REASONS, ACT_CATEGORIES } from '../services/tariffService';
import { parseCents, centsToText } from '../utils/cents';
import type { DoctorInfo, HonoraryNote } from '../types';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const doctor = { nameFr: 'Alami', specialtyFr: 'Cardiologie', addressFr: '99 avenue Neuve', phone: '0500', email: 'a@b.ma', inpe: '999', taxId: '888', ice: '', patente: '', logoOpacity: 1, logoScale: 1 } as unknown as DoctorInfo;

const note = (over: Partial<HonoraryNote> = {}): HonoraryNote => ({
    id: 'n1', patientId: 'p1', patientName: 'CHTOUKI MOHAMED', date: '2026-10-08', invoiceNumber: '2026-0007',
    services: [], totalAmount: 270, totalInWords: 'Deux cent soixante-dix dirhams', status: 'PARTIAL', paymentMode: 'CASH',
    amountPaid: 100, grossCents: 50000, discountCents: 23000, netCents: 27000, paidCents: 10000, balanceCents: 17000,
    lines: [
        { actId: 'act-consultation', code: 'CS', label: 'Consultation', quantity: 1, unitPriceCents: 30000, grossCents: 30000, discountCents: 3000, netCents: 27000,
          discount: { kind: 'PERCENT', percent: 10, reason: 'CONFRERE', cents: 3000, by: 'Dr', at: 'x', date: '2026-10-08' } },
        { actId: 'act-ecg', code: 'ECG', label: 'ECG', quantity: 1, unitPriceCents: 20000, grossCents: 20000, discountCents: 20000, netCents: 0,
          discount: { kind: 'FREE', reason: 'FAMILLE', cents: 20000, by: 'Dr', at: 'x', date: '2026-10-08' } },
    ],
    issuer: { name: 'Alami', address: '12 rue des Lilas', ifNumber: '98765', tp: '555', ice: '001234567000087', inpe: '123456' },
    ...over,
});

describe('T1 — saisie : rien n’est calculé ni décidé par l’interface', () => {
    it('les lignes envoyées à Rust sont des choix (acte, quantité, remise) ; le prix d’une ligne de grille n’est jamais envoyé', () => {
        const l = { ...newLine('act-consultation'), quantity: '2', discount: { ...newDiscount('PERCENT', 'CONFRERE'), percent: '10' } };
        const { lines, incomplete } = draftToInput({ lines: [l], noteDiscount: null });
        expect(incomplete).toBeNull();
        expect(lines).toEqual([{ actId: 'act-consultation', quantity: 2, discount: { kind: 'PERCENT', reason: 'CONFRERE', percent: 10 } }]);
        expect(lines[0]).not.toHaveProperty('unitPriceCents');
    });

    it('remise sans motif, pourcentage ou montant manquants : saisie incomplète (Rust refuserait aussi)', () => {
        const base = newLine('act-ecg');
        expect(draftToInput({ lines: [{ ...base, discount: { ...newDiscount('PERCENT', ''), percent: '10' } }], noteDiscount: null }).incomplete).toMatch(/motif/);
        expect(draftToInput({ lines: [{ ...base, discount: newDiscount('PERCENT', 'GESTE') }], noteDiscount: null }).incomplete).toMatch(/pourcentage/);
        expect(draftToInput({ lines: [{ ...base, discount: newDiscount('AMOUNT', 'GESTE') }], noteDiscount: null }).incomplete).toMatch(/montant/);
        const free = draftToInput({ lines: [{ ...base, discount: newDiscount('FREE', 'CONTROLE_GRATUIT') }], noteDiscount: null });
        expect(free.incomplete).toBeNull();
        expect(free.lines[0].discount).toEqual({ kind: 'FREE', reason: 'CONTROLE_GRATUIT' });
    });

    it('« Autre » transmet le texte du motif ; la ligne libre transmet libellé et prix en centimes', () => {
        const l = { ...newLine('', true), label: 'Visite à domicile', price: '400,50', discount: { ...newDiscount('AMOUNT', 'AUTRE'), amount: '50', reasonText: 'Voisin' } };
        const { lines } = draftToInput({ lines: [l], noteDiscount: null });
        expect(lines[0]).toMatchObject({ label: 'Visite à domicile', unitPriceCents: 40050, discount: { kind: 'AMOUNT', amountCents: 5000, reason: 'AUTRE', reasonText: 'Voisin' } });
    });

    it('motifs et catégories : listes demandées, libellés français', () => {
        expect(DISCOUNT_REASONS.map(r => r.label)).toEqual(['Confrère', 'Famille / proche', 'Situation sociale', 'Contrôle gratuit', 'Geste du cabinet', 'Autre']);
        expect(ACT_CATEGORIES.map(c => c.label)).toEqual(['Consultation', 'Exploration', 'Contrôle', 'Certificat / document', 'Autre']);
        expect(reasonLabel('SOCIAL')).toBe('Situation sociale');
    });

    it('acte utilisable = actif ET avec prix ; grille sans aucun prix = « Complétez vos tarifs »', () => {
        const a = { id: 'a', code: 'CS', label: 'Consultation', category: 'CONSULTATION' as const, priceCents: null, active: true, order: 1, priceHistory: [] };
        expect(isUsableAct(a)).toBe(false);
        expect(isUsableAct({ ...a, priceCents: 30000 })).toBe(true);
        expect(isUsableAct({ ...a, priceCents: 30000, active: false })).toBe(false);
        expect(gridIsEmpty({ version: 1, settings: { assistantDiscountCapPct: 0, freeControlDays: 0 }, acts: [a] })).toBe(true);
        expect(gridIsEmpty({ version: 1, settings: { assistantDiscountCapPct: 0, freeControlDays: 0 }, acts: [{ ...a, priceCents: 30000 }] })).toBe(false);
    });

    it('saisie des montants : virgule décimale, deux décimales au plus', () => {
        expect(parseCents('1 250,50')).toBe(125050);
        expect(parseCents('300')).toBe(30000);
        expect(parseCents('1,234')).toBeNull();
        expect(parseCents('abc')).toBeNull();
        expect(centsToText(30050)).toBe('300,50');
    });
});

describe('T1 — impression de la note d’honoraires', () => {
    const html = renderToStaticMarkup(React.createElement(HonoraryNoteTemplate, { doctor, note: note() }));

    it('tableau des lignes : libellé, qté, P.U., remise, total ; lignes gratuites « Gratuit – motif »', () => {
        for (const h of ['Désignation', 'Qté', 'P.U.', 'Remise', 'Total', 'Consultation', 'ECG']) expect(html, h).toContain(h);
        expect(html).toContain('Gratuit – Famille / proche');
        expect(html).toContain('Remise 10 % – Confrère');
    });

    it('sous-total au tarif, remises avec motif, net à payer, déjà payé, reste, montant en lettres', () => {
        for (const h of ['Sous-total au tarif', 'Net à payer', 'Déjà payé', 'Reste à payer']) expect(html, h).toContain(h);
        expect(html).toContain('Arrêtée la présente note à la somme de');
        expect(html).toContain('Deux cent soixante-dix dirhams');
        expect(html).toMatch(/500,00\s*DH/);
        expect(html).toMatch(/270,00\s*DH/);
        expect(html).toMatch(/170,00\s*DH/);
    });

    it('pied de page : instantané figé (IF, TP, ICE, INPE), jamais la fiche actuelle ; en-tête = adresse figée', () => {
        expect(legalFooterOf(note(), doctor)).toBe('IF 98765  ·  TP 555  ·  ICE 001234567000087  ·  INPE 123456');
        expect(html).toContain('IF 98765');
        expect(html).toContain('12 rue des Lilas');
        expect(html).not.toContain('99 avenue Neuve');
        expect(issuerDoctor(note(), doctor).addressFr).toBe('12 rue des Lilas');
        // Sans instantané (note héritée) : fiche actuelle, mentions renseignées seulement.
        expect(legalFooterOf(note({ issuer: undefined }), doctor)).toBe('IF 888  ·  INPE 999');
    });

    it('note à 0 DH : statut Gratuit affiché, pas de « Reste à payer »', () => {
        const free = renderToStaticMarkup(React.createElement(HonoraryNoteTemplate, { doctor, note: note({ status: 'FREE', netCents: 0, totalAmount: 0, paidCents: 0, balanceCents: 0, totalInWords: 'Zéro dirham' }) }));
        expect(free).toContain('data-testid="note-free"');
        expect(free).not.toContain('Reste à payer');
        expect(free).toContain('Zéro dirham');
    });

    it('note héritée sans lignes : prestations cochées affichées, aucune remise inventée', () => {
        const legacy = renderToStaticMarkup(React.createElement(HonoraryNoteTemplate, { doctor, note: note({ lines: undefined, issuer: undefined, grossCents: undefined, discountCents: undefined, netCents: undefined, paidCents: undefined, balanceCents: undefined, services: [{ name: 'Consultation', price: 300, checked: true }], totalAmount: 300 }) }));
        expect(legacy).toContain('Consultation');
        expect(legacy).not.toContain('Sous-total au tarif');
        expect(legacy).not.toContain('Remise 10');
    });

    it('aucun texte doublement encodé dans la sortie', () => {
        const mojibake = new RegExp('[' + String.fromCharCode(0xC3) + '][' + String.fromCharCode(0xA0) + '-' + String.fromCharCode(0xBF) + ']|' + String.fromCharCode(0xE2) + String.fromCharCode(0x20AC));
        expect(html).not.toMatch(mojibake);
        expect(discountText({ kind: 'PERCENT', percent: 15, reason: 'GESTE' })).toBe('Remise 15 % – Geste du cabinet');
        expect(discountText({ kind: 'AMOUNT', reason: 'AUTRE', reasonText: 'Voisin' })).toBe('Remise – Autre : Voisin');
    });
});

describe('T1 — reçu', () => {
    const receipt = {
        kind: 'receipt', number: 'REC-2026-00001', seq: 1, year: 2026, date: '2026-10-08', issuedAt: '2026-10-08T09:00:00Z', issuedBy: 'Sara',
        noteId: 'n1', patientId: 'p1', patientName: 'CHTOUKI MOHAMED', amountCents: 10000, amountInWords: 'Cent dirhams', paymentMode: 'CASH', label: 'Consultation',
        balanceDueCents: 17000, legal: { inpe: '123456', if: '98765', ice: '001234567000087', professionalTax: '555' }, status: 'valid', cancelledBy: null,
        duplicates: 0, duplicateRank: null, duplicateAt: null, noteNumber: '2026-0007', grossCents: 50000, discountCents: 23000, noteTotalCents: 27000,
    } as any;

    it('rappelle le n° de note, le brut, les remises et le net ; pied IF / TP / ICE / INPE', () => {
        const h = renderToStaticMarkup(React.createElement(ReceiptTemplate, { receipt, doctor }));
        expect(h).toContain('N° 2026-0007');
        expect(h).toMatch(/500,00\s*DH/);
        expect(h).toMatch(/270,00\s*DH/);
        expect(h).toContain('Remises');
        for (const m of ['INPE 123456', 'IF 98765', 'ICE 001234567000087', 'Taxe professionnelle 555']) expect(h, m).toContain(m);
    });

    it('un reçu ancien (sans rappel de note) s’imprime comme avant', () => {
        const h = renderToStaticMarkup(React.createElement(ReceiptTemplate, { receipt: { ...receipt, noteNumber: undefined, grossCents: undefined, discountCents: undefined, noteTotalCents: undefined }, doctor }));
        expect(h).not.toContain('note-recall');
        expect(h).toContain('Reste dû');
    });
});

describe('T1 — branchement (sources)', () => {
    it('la ligne libre et l’ajout de ligne ne sont proposés qu’au médecin ; aucun calcul de montant dans l’éditeur', () => {
        const ed = read('components/tariffs/NoteLinesEditor.tsx');
        expect(ed).toMatch(/isMedecin && \(\s*<button[^>]*>[^]*Ligne libre/);
        expect(ed).toContain('tariffService.preview(');
        expect(ed).not.toMatch(/reduce\(|\.toFixed\(|Math\.round\(.*\*/);
    });

    it('la grille : aucune suppression d’acte, désactivation seulement ; réservée au médecin', () => {
        const ts = read('components/settings/TariffsSettings.tsx');
        expect(ts).not.toMatch(/Supprimer|delete|remove/i);
        expect(ts).toContain('Désactiver');
        const cab = read('components/settings/CabinetSettings.tsx');
        expect(cab).toContain("tab === 'tarifs' && sessionService.isMedecin()");
        expect(read('services/tariffService.ts')).toContain("'tariff_act_save'");
    });

    it('la caisse crée les notes depuis la grille, sans montant libre ; le statut Gratuit désactive l’encaissement', () => {
        const c = read('components/CashierView.tsx');
        expect(c).toContain('NoteLinesEditor');
        expect(c).toContain("r.status === 'FREE'");
        expect(c).not.toMatch(/totalAmount: due,\s*amountPaid/);
    });

    it('migration au démarrage (médecin) et statut FREE hors « à régulariser »', () => {
        expect(read('services/dataService.ts')).toContain("invoke<number>('tariffs_migrate')");
        expect(read('components/Dashboard.tsx')).toContain("n.status !== 'PAID' && n.status !== 'FREE'");
    });
});
