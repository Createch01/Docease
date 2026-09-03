const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

let depth = 0;
let inString = false;
let escape = false;
let openStack = [];

for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (escape) { escape = false; continue; }
  if (c === '\\' && inString) { escape = true; continue; }
  if (c === '"') { inString = !inString; continue; }
  if (inString) continue;

  if (c === '[') {
    openStack.push(i);
    depth++;
  } else if (c === ']') {
    depth--;
    openStack.pop();
  }
}

console.log('Unclosed brackets:', openStack.length);
if (openStack.length > 0) {
  openStack.forEach(pos => {
    const line = text.slice(0, pos).split('\n').length;
    console.log('Unclosed [ at position:', pos, 'line:', line);
    console.log('Context:', JSON.stringify(text.slice(Math.max(0, pos - 100), pos + 200)));
    console.log('---');
  });
}
