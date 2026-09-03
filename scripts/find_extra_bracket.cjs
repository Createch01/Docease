const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// Track where each [ is opened and if it gets closed before the expected next sibling
// Strategy: find all positions where depth = 2 (inside an array element)
// and track which ones never come back to depth=1

let depth = 0;
let inString = false;
let escape = false;
let stack = []; // stack of {pos, depth}

// Find position where depth first goes from 2 to stay >= 2 longer than expected
// Better: find all [ that are opened at depth>=2 and check their closing depth
let prevDepth = 0;
let suspectPositions = [];

for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (escape) { escape = false; continue; }
  if (c === '\\' && inString) { escape = true; continue; }
  if (c === '"') { inString = !inString; continue; }
  if (inString) continue;

  if (c === '[') {
    stack.push({ pos: i, depth: depth });
    depth++;
  } else if (c === ']') {
    depth--;
    stack.pop();
  }
}

console.log('Final stack size:', stack.length);
console.log('Final depth:', depth);

// Now let's try a different approach: scan in chunks and find where depth
// at the start of each "top-level object" (depth=1) changes unexpectedly
const CHUNK_SIZE = 10000;
depth = 0; inString = false; escape = false;
let chunkDepthHistory = [];

for (let start = 0; start < Math.min(text.length, 1000000); start += CHUNK_SIZE) {
  const chunkStart = start;
  for (let i = start; i < Math.min(start + CHUNK_SIZE, text.length); i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') depth--;
  }
  if (depth > 2) {
    const line = text.slice(0, Math.min(start + CHUNK_SIZE, text.length)).split('\n').length;
    chunkDepthHistory.push({ chunk: start / CHUNK_SIZE, pos: start + CHUNK_SIZE, depth, line });
  }
}

console.log('\nChunks where depth > 2:');
chunkDepthHistory.slice(0, 20).forEach(h => console.log(h));
