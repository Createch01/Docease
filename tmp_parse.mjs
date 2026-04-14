import fs from 'fs';

const data = JSON.parse(fs.readFileSync('C:/Users/hp/Downloads/DOCEASE/medicaments/medicament 1.json', 'utf8'));

let combined = '';
for (const item of data) {
    combined += item.content;
}

try {
    const parsed = JSON.parse(combined);
    fs.writeFileSync('C:/Users/hp/Downloads/DOCEASE/medicaments/medicament 1.json', JSON.stringify(parsed, null, 2));
    console.log('Successfully formatted JSON');
} catch (e) {
    console.error('Failed to parse combined JSON:', e.message);
}
