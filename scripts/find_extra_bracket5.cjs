const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// Compute depth up to 5800000
let depth = 0, inString = false, escape = false;
for (let i = 0; i < 5800000; i++) {
  const c = text[i];
  if (escape) { escape = false; continue; }
  if (c === '\\' && inString) { escape = true; continue; }
  if (c === '"') { inString = !inString; continue; }
  if (inString) continue;
  if (c === '[') depth++;
  else if (c === ']') depth--;
}
console.log(`Depth at 5800000: ${depth}`);

// Now scan 5800000-6200000 fine grain, looking for depth > 3
// Track each [ and ] with line numbers
let prevDepth = depth;
for (let i = 5800000; i < Math.min(6200000, text.length); i++) {
  const c = text[i];
  if (escape) { escape = false; continue; }
  if (c === '\\' && inString) { escape = true; continue; }
  if (c === '"') { inString = !inString; continue; }
  if (inString) continue;

  if (c === '[') {
    depth++;
    if (depth >= 4) {
      const line = text.slice(0, i).split('\n').length;
      console.log(`[ opens depth ${depth} at pos ${i} line ${line}: ${JSON.stringify(text.slice(Math.max(0,i-80), i+80))}`);
    }
  } else if (c === ']') {
    if (depth >= 4) {
      const line = text.slice(0, i).split('\n').length;
      console.log(`] closes depth ${depth} at pos ${i} line ${line}`);
    }
    depth--;
  }
}
console.log(`Depth at 6200000: ${depth}`);
