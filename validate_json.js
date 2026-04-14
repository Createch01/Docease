const fs = require('fs');
const path = require('path');

const filepath = 'c:\\Users\\hp\\Downloads\\DOCEASE\\medicament 1.json';

try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    const fullContent = data.map(p => p.content).join('');

    fs.writeFileSync('temp_full.json', fullContent);

    try {
        const parsed = JSON.parse(fullContent);
        console.log("SUCCESS: Full content is valid JSON.");
    } catch (e) {
        console.error(`ERROR: ${e.message}`);
        const pos = parseInt(e.message.match(/position (\d+)/)?.[1] || 0);
        if (pos) {
            const start = Math.max(0, pos - 50);
            const end = Math.min(fullContent.length, pos + 50);
            console.log(`Context: ...${fullContent.substring(start, pos)} >>>HERE<<< ${fullContent.substring(pos, end)}...`);
        }
    }
} catch (e) {
    console.error(`Error reading file: ${e.message}`);
}
