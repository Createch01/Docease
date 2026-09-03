const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../public/medicaments_par_classe_v2.json');
const outputDir = path.join(__dirname, '../public/medicaments/classes');

const TARGET_CLASSES_MAP = {
    'Antibiotiques': ['Antibactérien', 'Antibiotique'],
    'Antihypertenseurs': ['Antihypertenseur'],
    'Antidiabétiques': ['Antidiabétique'],
    'Analgésiques': ['Analgésique', 'Antalgique'],
    'Anti-inflammatoires': ['Anti-inflammatoire', 'AINS'],
    'Anticoagulants': ['Anticoagulant', 'Antithrombotique'],
    'Gastroprotecteurs': ['Antiulcéreux', 'Gastro', 'Anti-acide'],
    'Antihistaminiques': ['Antihistaminique']
};

async function processData() {
    console.log('Loading dataset...');
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const aggregated = {
        'Antibiotiques': [],
        'Antihypertenseurs': [],
        'Antidiabétiques': [],
        'Analgésiques': [],
        'Anti-inflammatoires': [],
        'Anticoagulants': [],
        'Gastroprotecteurs': [],
        'Antihistaminiques': []
    };

    let totalMedsProcess = 0;
    let totalAlertsProcess = 0;

    // The JSON is structured as { "Therapeutic Group": { "Drug Class": [medicines...] } }
    let medCount = 0;

    for (const [theraGroup, classes] of Object.entries(data)) {
        for (const [className, medicines] of Object.entries(classes)) {
            const medArray = Array.isArray(medicines) ? medicines : [];

            medArray.forEach(med => {
                medCount++;

                // Identify target class
                let matchedClass = null;
                const searchString = `${theraGroup} ${className}`.toLowerCase();

                for (const [targetName, keywords] of Object.entries(TARGET_CLASSES_MAP)) {
                    if (keywords.some(kw => searchString.includes(kw.toLowerCase()))) {
                        matchedClass = targetName;
                        break;
                    }
                }

                if (matchedClass) {
                    aggregated[matchedClass].push(med);
                } else {
                    // Fallback search in indications if not found in groups
                    const indString = (med.indications || []).join(' ').toLowerCase();
                    for (const [targetName, keywords] of Object.entries(TARGET_CLASSES_MAP)) {
                        if (keywords.some(kw => indString.includes(kw.toLowerCase()))) {
                            matchedClass = targetName;
                            break;
                        }
                    }
                    if (matchedClass) {
                        aggregated[matchedClass].push(med);
                    }
                }

                if (med.smart_flags && med.smart_flags.length > 0) {
                    totalAlertsProcess += med.smart_flags.length;
                }
            });
        }
    }

    console.log(`Pocessed ${medCount} total medicines.`);

    const summary = {
        totalMedicines: medCount,
        totalClasses: 8,
        totalAlerts: totalAlertsProcess,
        classesCount: {}
    };

    for (const targetName of Object.keys(TARGET_CLASSES_MAP)) {
        const meds = aggregated[targetName];

        // Deduplicate by ID
        const uniqueMeds = [];
        const seen = new Set();
        for (const m of meds) {
            if (!seen.has(m.id)) {
                seen.add(m.id);
                uniqueMeds.push(m);
            }
        }

        console.log(`Writing ${targetName}: ${uniqueMeds.length} medicines`);

        const fileName = `class_${targetName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
        fs.writeFileSync(
            path.join(outputDir, fileName),
            JSON.stringify(uniqueMeds, null, 2) // pretty print minified would be better but this is fine
        );

        summary.classesCount[targetName] = {
            count: uniqueMeds.length,
            file: fileName
        };
    }

    fs.writeFileSync(
        path.join(outputDir, 'classes_summary.json'),
        JSON.stringify(summary, null, 2)
    );

    console.log('✅ Extraction complete!');
    console.log(summary);
}

processData().catch(console.error);
