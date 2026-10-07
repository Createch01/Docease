import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDF_OPEN_OPTIONS } from '../services/pdfRenderer';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

const semverGte = (a: string, b: string) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0); }
    return true;
};

describe('pdf.js : version figée et ressources locales', () => {
    it('le paquet officiel est épinglé (pas de ^ ni ~) et postérieur au correctif CVE-2024-4367 (≥ 4.2.67)', () => {
        const v: string = pkg.dependencies['pdfjs-dist'];
        expect(v).toMatch(/^\d+\.\d+\.\d+$/);
        expect(semverGte(v, '4.2.67')).toBe(true);
        expect(JSON.parse(read('node_modules/pdfjs-dist/package.json')).version).toBe(v);
    });

    it('les ressources embarquées correspondent à la version installée (npm run pdfjs:assets)', () => {
        expect(read('public/pdfjs/VERSION').trim()).toBe(pkg.dependencies['pdfjs-dist']);
        for (const f of ['standard_fonts/LiberationSans-Regular.ttf', 'cmaps/UniJIS-UTF16-H.bcmap', 'wasm/openjpeg.wasm', 'wasm/jbig2.wasm', 'iccs/CGATS001Compat-v2-micro.icc']) {
            expect(fs.existsSync(path.join(ROOT, 'public/pdfjs', f)), f).toBe(true);
        }
    });

    it("le moteur de scripts de pdf.js n'est pas embarqué", () => {
        const all = (function walk(d: string): string[] { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [e.name]); })(path.join(ROOT, 'public/pdfjs'));
        expect(all.filter(n => /quickjs|sandbox/i.test(n))).toEqual([]);
    });

    it('options de sécurité : pas d\'eval, pas de XFA, pas de flux réseau', () => {
        expect(PDF_OPEN_OPTIONS.isEvalSupported).toBe(false);
        expect(PDF_OPEN_OPTIONS.enableXfa).toBe(false);
        expect(PDF_OPEN_OPTIONS.disableAutoFetch).toBe(true);
        expect(PDF_OPEN_OPTIONS.disableStream).toBe(true);
        expect(PDF_OPEN_OPTIONS.disableRange).toBe(true);
    });
});

describe('visionneuse : mémoire seulement', () => {
    const files = ['services/pdfRenderer.ts', 'services/attachmentThumb.ts', 'services/attachmentService.ts', 'components/dossier/AttachmentViewer.tsx', 'components/dossier/AttachmentsTab.tsx'];

    it("aucune URL blob:, aucun createObjectURL, aucun téléchargement, aucun enregistrement de fichier", () => {
        for (const f of files) {
            const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            expect(src, f).not.toMatch(/createObjectURL|URL\.revokeObjectURL|blob:/);
            expect(src, f).not.toMatch(/\bdownload\s*=|<a[^>]+download|showSaveFilePicker|writeFile|plugin-fs|plugin-dialog/);
        }
    });

    it('aucune requête réseau ni chemin de fichier côté interface', () => {
        for (const f of files) {
            const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|https?:\/\//);
            expect(src, f).not.toMatch(/readFile|open\(\{|invoke\('attachment_[a-z_]+', \{ path/);
        }
    });

    it('pdf.js : rendu canvas seul, sans annotations ni scripts ni couche de texte', () => {
        const src = read('services/pdfRenderer.ts');
        expect(src).toContain('AnnotationMode.DISABLE');
        expect(src).not.toMatch(/enableScripting|renderInteractiveForms|TextLayer|AnnotationLayer|getTextContent/);
        expect(src).toContain("import('pdfjs-dist')"); // chargé à la demande
        expect(src).not.toMatch(/^import (?!type).* from 'pdfjs-dist'/m); // jamais d'import statique
    });

    it("l'onglet n'est proposé qu'au médecin", () => {
        const src = read('components/PatientDossier.tsx');
        expect(src).toContain("sessionService.isMedecin() ? [{ id: 'pieces'");
        expect(src).toContain("activeTab === 'pieces' && sessionService.isMedecin()");
    });

    it('la suppression demande une confirmation explicite', () => {
        const src = read('components/dossier/AttachmentsTab.tsx');
        expect(src).toContain('<ConfirmModal');
        expect(src).toMatch(/setDeleting\(m\)/);
        expect(src).toContain('journal d\'accès');
    });
});

describe('sauvegarde et restauration : ce que voit le médecin', () => {
    const settings = read('components/settings/BackupSettings.tsx');

    it('explique comment copier une sauvegarde à la main', () => {
        expect(settings).toContain('Pour copier une sauvegarde à la main, copiez le dossier entier (fichier .dcb + dossier pieces-jointes).');
    });

    it("l'aperçu de restauration signale les pièces introuvables sans bloquer la restauration", () => {
        expect(settings).toContain('preview.attachments_missing > 0');
        expect(settings).toContain('introuvable');
        expect(settings).toContain('La restauration des données reste possible');
        expect(settings).toContain('« fichier manquant »');
    });

    it('alerte orange « lourd » dans les réglages et sur le tableau de bord', () => {
        expect(settings).toContain('export const AttachmentsAlert');
        expect(read('components/BackupDashboardCard.tsx')).toContain('<AttachmentsAlert status={status} />');
    });

    it('SECURITY.md documente les pièces jointes', () => {
        const sec = read('SECURITY.md');
        for (const k of ['Pièces jointes du dossier patient', 'att_key', 'tant qu\'elles sont conservées', 'pdfjs-dist', 'attachment_open']) expect(sec).toContain(k);
    });

    it('les nouveaux fichiers ajoutés depuis les résultats passent par le stockage chiffré', () => {
        const src = read('components/dossier/ResultsSection.tsx');
        expect(src).toContain('attachmentService.add');
        expect(src).not.toMatch(/readAsDataURL|readFileAsDataUrl/); // plus de data: URL stockée dans le résultat
    });
});
