/**
 * Verification script to test drugCatalogService mapping with new fields.
 */
const { mapMedicamentToMedicine } = require('../services/drugCatalogService');

const testMed = {
    brand_name: 'ACUPAN',
    generic_name: 'NEFOPAM',
    form: 'Ampoule',
    strength: '20mg/2ml',
    atc_code: 'N02BG06',
    nature: 'Sth nature',
    clinical_flags: ['FLAG_A', 'FLAG_B']
};

console.log('--- Testing Data Mapping ---');
try {
    const result = mapMedicamentToMedicine(testMed);
    console.log('Mapped Medicine Object:', JSON.stringify(result, null, 2));

    let errors = 0;
    if (result.atcCode !== 'N02BG06') { console.error('Error: atcCode mapping failed'); errors++; }
    if (result.nature !== 'Sth nature') { console.error('Error: nature mapping failed'); errors++; }
    if (!result.clinicalFlags || result.clinicalFlags[0] !== 'FLAG_A') { console.error('Error: clinicalFlags mapping failed'); errors++; }

    if (errors === 0) {
        console.log('SUCCESS: All fields mapped correctly!');
    } else {
        console.error(`FAILED: ${errors} errors found in mapping.`);
    }
} catch (err) {
    console.error('Mapping test failed with error:', err);
}
