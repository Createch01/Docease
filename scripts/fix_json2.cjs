const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// Find the position of the extra [ by locating "EAU" brand_name and
// then finding the [ that precedes it in the outer array structure

const eauPos = text.indexOf('"eau_p.p.i"');
console.log('First EAU entry id at pos:', eauPos, 'line:', text.slice(0, eauPos).split('\n').length);

// Find the [ that opens the array containing EAU
// Search backwards from eauPos for the first [ that's at the right depth
// The extra [ should be in the vicinity of eauPos - look for it

// Find the pattern: },\n  [\n    {
// which would indicate the extra array bracket
const region = text.slice(Math.max(0, eauPos - 500), eauPos + 100);
console.log('Region around EAU:');
console.log(region);
