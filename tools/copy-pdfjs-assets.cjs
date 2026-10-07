// Copie les ressources de pdf.js (polices, cmaps, profils ICC, décodeurs wasm) dans public/pdfjs/ :
// elles sont servies localement, jamais téléchargées. À relancer après toute mise à jour de pdfjs-dist
// (npm run pdfjs:assets) ; tests/pdfjsAssets.test.ts vérifie que la copie correspond à la version figée.
// Le moteur de scripts (quickjs-eval) n'est volontairement PAS copié : les scripts PDF ne sont jamais exécutés.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const dest = path.join(root, 'public', 'pdfjs');
const version = require(path.join(src, 'package.json')).version;

fs.rmSync(dest, { recursive: true, force: true });
for (const dir of ['standard_fonts', 'cmaps', 'iccs', 'wasm']) {
  fs.cpSync(path.join(src, dir), path.join(dest, dir), {
    recursive: true,
    filter: p => !/quickjs-eval/.test(p),
  });
}
fs.writeFileSync(path.join(dest, 'VERSION'), version + '\n');
console.log(`pdfjs-dist ${version} : ressources copiées dans public/pdfjs/`);
