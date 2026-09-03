import fs from 'fs';
import path from 'path';

const medicamentsDir = path.join(process.cwd(), 'medicaments');
const outputPath = path.join(medicamentsDir, 'medicaments_par_classe_v2.json');

const catalogue = {};

const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

letters.forEach(letter => {
    const filename = `medicament_${letter}.json`;
    const filepath = path.join(medicamentsDir, filename);

    if (fs.existsSync(filepath)) {
        try {
            const fileContent = fs.readFileSync(filepath, 'utf8');
            const data = JSON.parse(fileContent);

            if (Array.isArray(data)) {
                data.forEach(med => {
                    const group = med.therapeutic_group || 'Médicament Général';
                    const drugClass = med.drug_class || 'Classe Générale';

                    if (!catalogue[group]) {
                        catalogue[group] = {};
                    }
                    if (!catalogue[group][drugClass]) {
                        catalogue[group][drugClass] = [];
                    }
                    catalogue[group][drugClass].push(med);
                });
            }
        } catch (e) {
            console.error(`Error processing ${filename}:`, e.message);
        }
    }
});

fs.writeFileSync(outputPath, JSON.stringify(catalogue, null, 2));
console.log('Successfully generated medicaments_par_classe_v2.json');
