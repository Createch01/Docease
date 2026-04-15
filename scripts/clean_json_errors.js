import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDICAMENTS_DIR = path.join(__dirname, '..', 'medicaments');
const PLACEHOLDERS = ['N/A', 'NaN', 'undefined', 'null', 'None', 'NULL'];

function isCorrupted(val) {
    if (typeof val !== 'string') return false;
    // Check for mojibake characters like ├á, ├®, etc.
    if (val.includes('├')) return true;
    // Check for exact placeholders
    if (PLACEHOLDERS.includes(val)) return true;
    // Check for common error strings
    const low = val.toLowerCase();
    if (low === 'error' || low === 'unknown' || low === 'inconnu') return true;
    return false;
}

function cleanObject(obj) {
    if (Array.isArray(obj)) {
        const cleanedArr = obj.map(item => cleanObject(item)).filter(item => {
            if (item === null || item === undefined) return false;
            if (typeof item === 'object' && Object.keys(item).length === 0) return false;
            return true;
        });
        return cleanedArr.length > 0 ? cleanedArr : null;
    } else if (typeof obj === 'object' && obj !== null) {
        const cleaned = {};
        let hasData = false;
        for (const [key, val] of Object.entries(obj)) {
            if (isCorrupted(val)) continue;

            const cleanedVal = cleanObject(val);
            if (cleanedVal !== null && cleanedVal !== undefined) {
                if (Array.isArray(cleanedVal) && cleanedVal.length === 0) continue;
                if (typeof cleanedVal === 'object' && !Array.isArray(cleanedVal) && Object.keys(cleanedVal).length === 0) continue;

                cleaned[key] = cleanedVal;
                hasData = true;
            }
        }
        return hasData ? cleaned : null;
    }
    return obj;
}

function processFiles() {
    if (!fs.existsSync(MEDICAMENTS_DIR)) {
        console.error(`Directory not found: ${MEDICAMENTS_DIR}`);
        return;
    }

    const files = fs.readdirSync(MEDICAMENTS_DIR).filter(f => f.endsWith('.json'));

    files.forEach(file => {
        const filePath = path.join(MEDICAMENTS_DIR, file);
        console.log(`Processing ${file}...`);

        try {
            const rawData = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(rawData);

            // For the top-level array of medications
            let cleanedData;
            if (Array.isArray(data)) {
                cleanedData = data.map(item => cleanObject(item)).filter(item => item !== null);
            } else {
                cleanedData = cleanObject(data);
            }

            if (cleanedData !== null) {
                fs.writeFileSync(filePath, JSON.stringify(cleanedData, null, 2), 'utf8');
                console.log(`Successfully cleaned ${file}`);
            } else {
                console.warn(`File ${file} would be empty after cleaning, skipping write.`);
            }
        } catch (err) {
            console.error(`Error processing ${file}:`, err);
        }
    });
}

processFiles();
