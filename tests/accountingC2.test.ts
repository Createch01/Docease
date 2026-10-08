import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(f, 'utf8');
const analytics = read('components/Analytics.tsx');

describe('Comptabilité C2 — recettes sur le registre', () => {
    it("l'encaissé ne lit plus le statut des notes : il vient de accounting_summary (Rust)", () => {
        expect(analytics).toContain('accountingService.summary(');
        expect(analytics).not.toMatch(/status === 'PAID'|status === 'PARTIAL'|\.amountPaid/);
        expect(analytics).not.toContain('collectedOf');
        expect(analytics).toContain('const recettesEncaissees = toDh(summary?.netCents ?? 0);');
    });
    it('le facturé reste séparé ; carte « Reste à encaisser » ; résultat sur l\'encaissé', () => {
        expect(analytics).toContain("label: 'Facturé'");
        expect(analytics).toContain("label: 'Reste à encaisser'");
        expect(analytics).toContain('const netProfit = toDh(summary?.resultCents ?? 0);');
    });
    it("le front n'additionne aucun montant du registre (agrégats calculés par Rust)", () => {
        const svc = read('services/accountingService.ts');
        const journal = read('components/accounting/JournalTab.tsx');
        expect(svc + journal).not.toMatch(/\.reduce\(/);
        expect(journal).not.toMatch(/\+=|reduce/);
    });
    it('onglet Journal des recettes : colonnes, filtres, intégrité déplacée ici', () => {
        const j = read('components/accounting/JournalTab.tsx');
        for (const h of ['Date', 'Heure', 'N° note', 'Patient', 'Type', 'Mode', 'Montant', 'Auteur', 'Motif']) expect(j).toContain(`'${h}'`);
        expect(j).toContain('accountingService.journal(from, to');
        expect(j).toContain("Vérifier l'intégrité");
        expect(j).toContain("var(--color-danger-700, #b91c1c)"); // montants négatifs en rouge
        expect(analytics).toContain("setActiveTab('journal')");
        expect(read('components/settings/CabinetSettings.tsx')).toContain('PaymentsRegistryCard'); // contrôle détaillé conservé dans les réglages
    });
    it('droits Rust : agrégats médecin seulement, journal du jour pour toute session', () => {
        const a = read('src-tauri/src/access.rs');
        expect(a).toContain('("accounting_summary", Rule::Medecin)');
        expect(a).toContain('("accounting_journal", Rule::Medecin)');
        expect(a).toContain('("accounting_journal_today", Rule::AnySession)');
    });
});
