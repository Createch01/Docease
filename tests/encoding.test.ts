import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Garde-fou : un accent doublement encodé (UTF-8 relu comme du Windows-1252 puis réenregistré) laisse
 * des suites de caractères parasites (A tilde ou A circonflexe suivi d'un symbole, a circonflexe + euro…) qui n'ont
 * aucune raison d'exister dans du texte français. Les motifs sont écrits en échappements pour que ce
 * fichier ne se déclenche pas lui-même. Le mot « Âge » (A circonflexe + lettre) reste permis.
 */
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', 'DD', '_temp_export_claude_design', '_design_ref', 'gen']);
const TEXT = /\.(ts|tsx|js|jsx|css|html|rs|md|json|toml|yml|yaml)$/i;
const SKIP_FILES = new Set(['package-lock.json', 'Cargo.lock']);

// U+00C3 seul ; U+00C2 suivi d'un caractère Latin-1 haut, d'une espace ou d'une fin de ligne ; U+00E2 + euro ; U+FFFD.
const MOJIBAKE = new RegExp('(\\u00C3|\\u00C2[\\u00A0-\\u00BF]|\\u00C2(?:\\s|$)|\\u00E2\\u20AC|\\u00E2\\u201A\\u00AC|\\uFFFD)', 'u');

function files(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) files(path.join(dir, e.name), out); }
        else if (TEXT.test(e.name) && !SKIP_FILES.has(e.name)) out.push(path.join(dir, e.name));
    }
    return out;
}

describe('encodage', () => {
    it("aucun accent doublement encodé dans le code, les docs et la config", () => {
        const all = files(ROOT);
        expect(all.length).toBeGreaterThan(100); // le parcours trouve bien le dépôt
        const offenders: string[] = [];
        for (const f of all) {
            const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
            lines.forEach((l, i) => { if (MOJIBAKE.test(l)) offenders.push(`${path.relative(ROOT, f).split(path.sep).join('/')}:${i + 1}`); });
        }
        expect(offenders, `Texte doublement encodé :\n${offenders.slice(0, 20).join('\n')}`).toEqual([]);
    });

    it('le motif reconnaît bien les cas typiques et épargne « Âge »', () => {
        const u = (...c: number[]) => String.fromCharCode(...c);
        const mojibake = [u(0xC3, 0xA9), u(0xC3, 0xA8), u(0xC3, 0xA0), u(0xC3, 0xA7), u(0xC3, 0xB4), u(0xE2, 0x20AC, 0x2122), u(0xC2, 0xB7), 'x' + u(0xC2) + ' y', u(0xC3, 0x20)];
        for (const m of mojibake) expect(MOJIBAKE.test(m), JSON.stringify(m)).toBe(true);
        for (const ok of [u(0xC2) + 'ge', u(0xC2) + 'GE MINIMUM', 'déjà liés, ça, l' + u(0x2019) + 'âge', 'a' + u(0xB7) + 'b']) expect(MOJIBAKE.test(ok), ok).toBe(false);
    });
});
