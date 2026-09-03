const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

let depth = 0;
let inString = false;
let escape = false;
let firstZeroAfterStart = -1;

for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (escape) { escape = false; continue; }
  if (c === '\\' && inString) { escape = true; continue; }
  if (c === '"') { inString = !inString; continue; }
  if (inString) continue;

  if (c === '[') {
    depth++;
  } else if (c === ']') {
    depth--;
    if (depth === 0 && firstZeroAfterStart === -1) {
      firstZeroAfterStart = i;
      const line = text.slice(0, i).split('\n').length;
      console.log('Outer array closes at pos:', i, 'line:', line);
      console.log('Remaining chars after close:', text.length - i - 1);
      console.log('Content after close:', JSON.stringify(text.slice(i + 1, i + 100)));
    }
  }
}

if (firstZeroAfterStart === -1) {
  console.log('Outer array NEVER closes — searching for deepest unmatched [');
  // Find the last [ that has no matching ]
  // Re-scan tracking the stack
  let stack = [];
  inString = false; escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '[') stack.push(i);
    else if (c === ']') stack.pop();
  }
  console.log('Unmatched [ count:', stack.length);
  // Show last few
  stack.slice(-3).forEach(pos => {
    const line = text.slice(0, pos).split('\n').length;
    console.log('Unmatched [ at pos:', pos, 'line:', line);
    console.log('Context:', JSON.stringify(text.slice(Math.max(0, pos - 50), pos + 150)));
  });
}

console.log('Final depth:', depth);
