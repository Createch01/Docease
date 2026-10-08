import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { isDevAutoLockDisabled } from '../services/devAutoUnlock';

const read = (f: string) => readFileSync(f, 'utf8');

afterEach(() => vi.unstubAllEnvs());

describe('verrouillage automatique en développement', () => {
    it('désactivé seulement en DEV ET avec VITE_DEV_DISABLE_AUTO_LOCK=1', () => {
        vi.stubEnv('DEV', true);
        vi.stubEnv('VITE_DEV_DISABLE_AUTO_LOCK', '1');
        expect(isDevAutoLockDisabled()).toBe(true);
        vi.stubEnv('VITE_DEV_DISABLE_AUTO_LOCK', '');
        expect(isDevAutoLockDisabled()).toBe(false);
        vi.stubEnv('VITE_DEV_DISABLE_AUTO_LOCK', '0');
        expect(isDevAutoLockDisabled()).toBe(false);
    });
    it('en production (DEV faux) le verrou reste actif, quelle que soit la variable', () => {
        vi.stubEnv('DEV', false);
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_DEV_DISABLE_AUTO_LOCK', '1');
        expect(isDevAutoLockDisabled()).toBe(false);
    });
    it('branchement : App.tsx coupe le minuteur seulement via ce drapeau ; variable documentée ; .env.local jamais suivi', () => {
        expect(read('App.tsx')).toContain('s.enforced && !isDevAutoLockDisabled() ? s.inactivityMinutes : 0');
        const src = read('services/devAutoUnlock.ts');
        expect(src).toMatch(/if \(import\.meta\.env\.DEV\) \{\s*return import\.meta\.env\.VITE_DEV_DISABLE_AUTO_LOCK === '1';/);
        expect(read('.env.local.example')).toContain('VITE_DEV_DISABLE_AUTO_LOCK=');
        expect(read('.gitignore')).toMatch(/^\*\.local$/m);
    });
});

describe('comptabilité — sélecteur de période partagé et mise en page', () => {
    const analytics = read('components/Analytics.tsx');
    it('un seul sélecteur, mémorisé pour la session, partagé par les quatre onglets', () => {
        expect(analytics).toContain('const period = usePeriod();');
        expect(analytics).toContain('<PeriodSelector />');
        expect(analytics).toMatch(/<JournalTab from=\{period\.from\}|<JournalTab from=\{localDateStr\(periodStart\)\}/);
        expect(analytics).not.toMatch(/setTimeRange|TimeRange/);
        const store = read('utils/period.ts');
        expect(store).toContain('sessionStorage');
        expect(store).not.toMatch(/storageService|localStorage/);
    });
    it("l'interface n'envoie que des bornes AAAA-MM-JJ : jamais de toISOString, aucune addition de montant", () => {
        for (const f of ['utils/period.ts', 'components/accounting/PeriodSelector.tsx']) {
            expect(read(f)).not.toMatch(/toISOString|\.reduce\(/);
        }
    });
    it('en-tête : onglets sur une ligne (nowrap), sélecteur dessous, bouton des clôtures à droite', () => {
        expect(analytics).toContain('whitespace-nowrap -mb-px border-b-2');
        expect(analytics).toContain('overflow-x-auto');
        expect(analytics).toContain('<PeriodsPanel left={<PeriodSelector />}');
        expect(read('components/accounting/PeriodsPanel.tsx')).toContain('ml-auto');
    });
    it('cartes : grille auto-fit, montant en une ligne, devise insécable, résultat vert / rouge', () => {
        expect(analytics).toContain('grid-cols-[repeat(auto-fit,minmax(200px,1fr))] lg:grid-cols-3 2xl:grid-cols-5');
        expect(analytics).toContain('text-[26px] leading-8 font-semibold whitespace-nowrap');
        expect(analytics).toMatch(/u00A0.*safeCurrency|safeCurrency.*u00A0/);
        expect(analytics).toContain("valueClass: netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'");
    });
    it('casse normale, pas d\'extra-bold dans les composants du sélecteur', () => {
        expect(read('components/accounting/PeriodSelector.tsx')).not.toMatch(/font-black|font-extrabold|\buppercase\b|tracking-widest/);
    });
});
