import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', 'DD', '_temp_export_claude_design', '_design_ref', 'docs', 'public', 'tools', 'docease-app', 'tests', 'src-tauri']);
const EXT = /\.(ts|tsx|js|jsx|css|html)$/;

/** Code source de l'application (hors dépendances, builds, tests et dossiers d'archive). */
export function appSourceFiles(): { file: string; text: string }[] {
    const out: { file: string; text: string }[] = [];
    const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); }
            else if (EXT.test(e.name)) out.push({ file: path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join('/'), text: fs.readFileSync(path.join(dir, e.name), 'utf8') });
        }
    };
    walk(ROOT);
    return out;
}
