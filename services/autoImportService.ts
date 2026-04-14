
import { invoke } from '@tauri-apps/api/core';
import { heuristicJsonService } from './heuristicJsonService';
import { dataService } from './dataService';

/**
 * Service to automatically discover and import medications from JSON files
 * in the application directory.
 */
export const autoImportService = {
    async runAutoImport() {
        try {
            console.log('🚀 Starting automatic JSON import scan...');

            // Call the custom Rust command to scan the directory
            const files: [string, string][] = await invoke('scan_json_files');

            if (!files || files.length === 0) {
                console.log('📂 No external JSON files found to import.');
                return;
            }

            let totalImported = 0;
            const allDiscoveredMeds = [];

            for (const [filename, content] of files) {
                try {
                    const jsonData = JSON.parse(content);
                    const meds = heuristicJsonService.extractMedicines(jsonData);

                    if (meds.length > 0) {
                        console.log(`✅ Found ${meds.length} medications in ${filename}`);
                        allDiscoveredMeds.push(...meds);
                    }
                } catch (e) {
                    console.error(`❌ Failed to parse ${filename}:`, e);
                }
            }

            if (allDiscoveredMeds.length > 0) {
                dataService.importMedicines(allDiscoveredMeds);
                console.log(`✨ Auto-import complete! Total medications found: ${allDiscoveredMeds.length}`);
            }

        } catch (error) {
            console.error('❌ Auto-import service failed:', error);
        }
    }
};
