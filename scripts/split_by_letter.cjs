/**
 * Split medicament_A.json into per-letter files (medicament_B.json ... medicament_Z.json)
 * Skips letter A (already done).
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../medicaments/medicament_A.json');
const OUT_DIR = path.join(__dirname, '../medicaments');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const byLetter = {};

for (const drug of data) {
  const firstChar = (drug.brand_name || '').trim().toUpperCase()[0];
  if (!firstChar || !/[A-Z]/.test(firstChar)) continue;
  if (!byLetter[firstChar]) byLetter[firstChar] = [];
  byLetter[firstChar].push(drug);
}

let report = '';
for (const [letter, drugs] of Object.entries(byLetter).sort()) {
  if (letter === 'A') {
    report += `A: ${drugs.length} entries (skipped — already medicament_A.json)\n`;
    continue;
  }
  const outPath = path.join(OUT_DIR, `medicament_${letter}.json`);
  fs.writeFileSync(outPath, JSON.stringify(drugs, null, 2), 'utf8');
  report += `${letter}: ${drugs.length} entries → medicament_${letter}.json\n`;
}

console.log(report);
