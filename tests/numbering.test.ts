import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HonoraryNoteTemplate from '../components/HonoraryNoteTemplate';
import type { DoctorInfo, HonoraryNote } from '../types';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe("numérotation des notes : l'interface n'attribue plus de numéro", () => {
    const billing = read('services/billingService.ts');
    const editor = read('components/HonoraryNoteEditor.tsx');
    const data = read('services/dataService.ts');

    it('plus aucun calcul de numéro côté interface', () => {
        for (const [name, src] of [['billingService', billing], ['HonoraryNoteEditor', editor]] as const) {
            expect(src, name).not.toMatch(/generateInvoiceNumber|notesThisYear|padStart\(4|getFullYear\(\)/);
        }
        expect(billing).toContain("invoiceNumber: ''");
        expect(editor).toContain("invoiceNumber: '', // attribué par Rust");
    });

    it("l'éditeur affiche la date en lecture seule et utilise la note relue (numéro de Rust)", () => {
        expect(editor).not.toContain('type="date"');
        expect(editor).toContain('note-date-readonly');
        expect(editor).toContain('const stored = await dataService.saveHonoraryNote(note);');
        expect(editor).toContain('setSavedNote(stored);');
    });

    it("saveHonoraryNote relit le fichier après l'écriture et renvoie la note telle que stockée", () => {
        expect(data).toContain('await dataService.reloadHonoraryNotes();');
        expect(data).toContain("return dataService.getAllHonoraryNotes().find(n => n.id === note.id) ?? note;");
        // L'écriture part de la liste COMPLÈTE (annulées comprises), sinon Rust verrait des suppressions.
        const save = data.slice(data.indexOf('saveHonoraryNote:'), data.indexOf('deleteHonoraryNote:'));
        expect(save).toContain('getAllHonoraryNotes()');
        expect(save).not.toContain('getHonoraryNotes()');
    });

    it('une note numérotée ne se supprime pas côté interface non plus', () => {
        const del = data.slice(data.indexOf('deleteHonoraryNote:'));
        expect(del).toContain("if (existing?.invoiceNumber) throw new Error('Une note numérotée ne peut pas être supprimée");
    });

    it('les notes annulées sont exclues par défaut des montants, impayés et statistiques', () => {
        expect(data).toContain('dataService.getAllHonoraryNotes(patientId).filter(n => !n.cancelledAt)');
        const fin = read('components/dossier/FinancesSection.tsx');
        expect(fin).toContain('getAllHonoraryNotes(patientId)');
        expect(fin).toContain('billingService.computeStats(activeNotes)');
        expect(fin).toContain('<CancelNoteDialog');
        // Le bouton « supprimer » n'existe que pour une note sans numéro.
        expect(fin).toMatch(/note\.invoiceNumber \? \(/);
        // Les exports gardent le numéro des notes annulées, hors totaux.
        expect(read('components/Analytics.tsx')).toContain('Notes annulées (hors totaux)');
    });

    it("l'annulation passe par la commande Rust, le motif est obligatoire", () => {
        const svc = read('services/honoraryNoteService.ts');
        expect(svc).toContain("'honorary_note_cancel', { id, reason }");
        expect(svc).toContain("'invoice_numbering_check'");
        expect(svc).not.toMatch(/honorary_note_(delete|update|number)/);
        expect(read('components/CancelNoteDialog.tsx')).toContain('reason.trim().length >= 3');
    });

    it('réglages et « À faire » : contrôle de numérotation câblé', () => {
        expect(read('components/settings/CabinetSettings.tsx')).toContain('<NumberingCard />');
        expect(read('App.tsx')).toContain("case 'open_numbering_settings'");
        expect(read('components/TodoDrawer.tsx')).toContain('open_numbering_settings');
    });

    it("les notes héritées sont numérotées par la commande de migration à l'ouverture de la session médecin", () => {
        expect(data).toContain("invoke<number>('invoice_numbering_migrate')");
        expect(data).toContain('sessionService.isMedecin()');
        expect(read('src-tauri/src/lib.rs')).toContain('numbering::invoice_numbering_migrate');
    });

    it('SECURITY.md documente la numérotation', () => {
        const sec = read('SECURITY.md');
        for (const k of ['Numérotation des notes d\'honoraires', 'meddoc_invoice_counter.json', 'jour d\'émission', 'annulation', 'jamais réattribué']) expect(sec).toContain(k);
    });
});

describe('note annulée : gabarit', () => {
    const doctor = { cabinetName: 'Cabinet', nameFr: 'Dr X' } as unknown as DoctorInfo;
    const base: HonoraryNote = {
        id: 'n1', patientId: 'p1', patientName: 'HAYAT Salma', date: '2026-10-08', invoiceNumber: '2026-0042',
        services: [{ name: 'Consultation', price: 300, checked: true }], totalAmount: 300, totalInWords: 'Trois cents', status: 'PAID', paymentMode: 'CASH',
    };
    const html = (n: HonoraryNote) => renderToStaticMarkup(React.createElement(HonoraryNoteTemplate, { doctor, note: n }));

    it('affiche le numéro ; sans annulation, aucun bandeau', () => {
        const h = html(base);
        expect(h).toContain('N° 2026-0042');
        expect(h).not.toContain('note-cancelled');
    });

    it("note annulée : bandeau avec la date et le motif, numéro conservé", () => {
        const h = html({ ...base, cancelledAt: '2026-10-09T08:00:00Z', cancelledBy: 'Dr', cancellationReason: 'Émise par erreur' });
        expect(h).toContain('N° 2026-0042');
        expect(h).toContain('NOTE ANNULÉE le 2026-10-09');
        expect(h).toContain('Motif : Émise par erreur');
    });
});
