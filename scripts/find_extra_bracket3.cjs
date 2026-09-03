const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// Scan entire file in chunks and log depth at each 100k boundary
let depth = 0;
let inString = false;
let escape = false;
const CHUNK = 100000;

for (let start = 0; start < text.length; start += CHUNK) {
  const end = Math.min(start + CHUNK, text.length);
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') depth--;
  }
  const pct = (start / text.length * 100).toFixed(1);
  if (depth !== 1 || start === 0) {
    console.log(`pos ${start}-${end} (${pct}%): depth=${depth}`);
  }
}
console.log('Final depth:', depth);
