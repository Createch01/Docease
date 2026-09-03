const fs = require('fs');
let text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// Find the extra [ before "eau_p.p.i"
const eauPos = text.indexOf('"eau_p.p.i"');
const region = text.slice(Math.max(0, eauPos - 500), eauPos);

// Find },\n  [\n  { pattern - the [ is the extra one
const match = /\},\s*\[\s*\{/.exec(region);
if (!match) {
  console.log('Pattern not found in region');
  process.exit(1);
}

// Calculate absolute position of the [
const relativeMatchStart = match.index;
const absoluteSearchStart = Math.max(0, eauPos - 500);
const absoluteMatchStart = absoluteSearchStart + relativeMatchStart;

// Find the [ within the match
const bracketRelPos = match[0].indexOf('[');
const extraBracketPos = absoluteMatchStart + bracketRelPos;

console.log('Extra [ at position:', extraBracketPos);
console.log('Char at that pos:', JSON.stringify(text[extraBracketPos]));
console.log('Context:', JSON.stringify(text.slice(extraBracketPos - 10, extraBracketPos + 20)));

// Remove the [ and the following newline/whitespace before {
// Pattern is: },\n  [\n  { -> },\n  {
// Find the [ and the whitespace after it up to (but not including) the next {
const beforeBracket = text.slice(0, extraBracketPos);
const afterBracket = text.slice(extraBracketPos + 1); // skip the [

// Remove leading newline/spaces before the next {
const trimmedAfter = afterBracket.replace(/^\s*/, '\n  ');

const fixed = beforeBracket + trimmedAfter;

// Verify fix
try {
  const data = JSON.parse(fixed);
  console.log('\nFixed JSON parses OK!');
  console.log('Entries:', data.length);
  const arrayElements = data.filter(el => Array.isArray(el));
  console.log('Array elements (should be 0):', arrayElements.length);

  // Write fixed file
  fs.writeFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', fixed, 'utf8');
  console.log('File saved.');
} catch(e) {
  console.log('Still invalid:', e.message.slice(0, 300));
}
