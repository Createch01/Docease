const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// First, compute depth up to pos 7100000 (where depth is still 2 going into last chunk)
let depth = 0;
let inString = false;
let escape = false;
let i = 0;
const START_ANALYSIS = 7100000;

for (i = 0; i < START_ANALYSIS; i++) {
  const c = text[i];
  if (escape) { escape = false; continue; }
  if (c === '\\' && inString) { escape = true; continue; }
  if (c === '"') { inString = !inString; continue; }
  if (inString) continue;
  if (c === '[') depth++;
  else if (c === ']') depth--;
}

console.log(`Depth at pos ${START_ANALYSIS}: ${depth}`);

// Now find the extra [ in the remaining section
const WINDOW = 10000;
for (let start = START_ANALYSIS; start < text.length; start += WINDOW) {
  let localDepth = depth;
  let localInStr = inString;
  let localEsc = escape;
  const end = Math.min(start + WINDOW, text.length);

  for (let j = start; j < end; j++) {
    const c = text[j];
    if (localEsc) { localEsc = false; continue; }
    if (c === '\\' && localInStr) { localEsc = true; continue; }
    if (c === '"') { localInStr = !localInStr; continue; }
    if (localInStr) continue;
    if (c === '[') localDepth++;
    else if (c === ']') localDepth--;
  }

  // Update state
  for (let j = start; j < end; j++) {
    const c = text[j];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') depth--;
  }

  if (localDepth !== 2 && localDepth !== 1) {
    const line = text.slice(0, end).split('\n').length;
    console.log(`Unusual depth ${localDepth} at pos ${start}-${end} (line ${line})`);
  }
}
console.log('Final depth:', depth);
