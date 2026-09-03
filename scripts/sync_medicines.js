const fs = require('fs');
const path = require('path');

// Configuration
const MASTER_FILE = 'c:\\Users\\hp\\Downloads\\medicament_A_1_300_master.json';
const TARGET_DIR = path.join(__dirname, '..', 'public', 'medicaments');
const APP_MEDICINES_FILE = path.join(__dirname, '..', 'src-tauri', 'meddoc_medicines.json');

/**
 * Wipe and Reload medications from a master file.
 * This script removes existing entries for medications found in the master file
 * and replaces them with the new "standard" data.
 */
async function syncMedicines() {
    console.log('--- Medicine Sync: Wipe & Reload ---');

    if (!fs.existsSync(MASTER_FILE)) {
        console.error(`Error: Master file not found at ${MASTER_FILE}`);
        console.log('Please ensure the file exists or update the MASTER_FILE path in this script.');
        process.exit(1);
    }

    try {
        const masterData = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
        console.log(`Loaded ${masterData.length} entries from master file.`);

        // 1. Identify which classes/files need updating
        const updatesByLetter = {};
        masterData.forEach(med => {
            const letter = med.brand_name ? med.brand_name[0].toUpperCase() : (med.name ? med.name[0].toUpperCase() : null);
            if (!letter) return;

            if (!updatesByLetter[letter]) updatesByLetter[letter] = [];
            updatesByLetter[letter].push(med);
        });

        // 2. Process each letter file
        for (const [letter, newMeds] of Object.entries(updatesByLetter)) {
            const fileName = `medicament_${letter}.json`;
            const filePath = path.join(TARGET_DIR, fileName);

            if (!fs.existsSync(filePath)) {
                console.log(`Skipping ${letter}: File ${fileName} not found in ${TARGET_DIR}`);
                continue;
            }

            console.log(`Updating ${fileName}...`);
            let currentMeds = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const initialCount = currentMeds.length;

            // Wipe: Remove medications that are in the master file
            const newNames = new Set(newMeds.map(m => (m.brand_name || m.name || '').toUpperCase()));
            currentMeds = currentMeds.filter(m => !newNames.has((m.brand_name || m.name || '').toUpperCase()));

            // Reload: Add the new medications
            const mappedMeds = newMeds.map(m => ({
                ...m,
                last_sync: new Date().toISOString(),
                source: 'master_import'
            }));

            currentMeds.push(...mappedMeds);

            // Save back
            fs.writeFileSync(filePath, JSON.stringify(currentMeds, null, 2));
            console.log(`  Done. ${initialCount} -> ${currentMeds.length} (Wiped ${initialCount - (currentMeds.length - newMeds.length)} existing, Added ${newMeds.length} new)`);
        }

        // 3. Optional: Update global index or summary if needed
        console.log('Sync completed successfully.');

    } catch (err) {
        console.error('Error during sync:', err);
        process.exit(1);
    }
}

syncMedicines();
