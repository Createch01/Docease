const fs = require('fs');
const text = fs.readFileSync('c:/Users/hp/Downloads/DOCEASE/medicaments/medicament_A.json', 'utf8');

// Try: append ] and see if it parses
const fixed = text.trimEnd() + '\n]\n';
try {
  const data = JSON.parse(fixed);
  console.log('Parsed successfully with appended ]');
  console.log('Type of top level:', typeof data, Array.isArray(data));
  console.log('Length:', Array.isArray(data) ? data.length : 'N/A');
  if (Array.isArray(data)) {
    console.log('First element type:', typeof data[0], Array.isArray(data[0]));
    console.log('Last element type:', typeof data[data.length-1], Array.isArray(data[data.length-1]));
    // Check if any top-level element is an array (shouldn't be)
    const arrayElements = data.filter(el => Array.isArray(el));
    console.log('Top-level array elements:', arrayElements.length);
    if (arrayElements.length > 0) {
      console.log('First array element:', JSON.stringify(arrayElements[0]).slice(0, 200));
    }
  }
} catch(e) {
  console.log('Still invalid:', e.message.slice(0, 200));
}
