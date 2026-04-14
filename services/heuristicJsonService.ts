
import { Medicine, MedicineCategory, MealTiming } from '../types';

/**
 * Service capable of extracting medication data from any JSON structure
 * by recursively searching for relevant patterns.
 */
class HeuristicJsonService {
    /**
     * Deep-scans an object to find arrays that looks like medication lists.
     */
    extractMedicines(data: any): Medicine[] {
        const medicines: Medicine[] = [];
        const seenNames = new Set<string>();

        const traverse = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            if (Array.isArray(obj)) {
                // Evaluate if this array contains medications
                const potentialMeds = obj.filter(item => this.isMedicationLike(item));
                if (potentialMeds.length > 0) {
                    potentialMeds.forEach(item => {
                        const med = this.mapToMedicine(item);
                        if (med && !seenNames.has(med.name.toLowerCase())) {
                            medicines.push(med);
                            seenNames.add(med.name.toLowerCase());
                        }
                    });
                }

                // Even if the array itself isn't a med list, its elements might contain arrays
                obj.forEach(traverse);
            } else {
                // Recursive search in object keys
                Object.values(obj).forEach(traverse);
            }
        };

        traverse(data);
        return medicines;
    }

    /**
     * Heuristic to determine if an object represents a medication.
     */
    private isMedicationLike(obj: any): boolean {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;

        // Keys commonly associated with medications
        const medKeys = [
            'name', 'brand', 'brand_name', 'label', 'raw_label', 'display_name',
            'dosage', 'strength', 'active_ingredient', 'posologie'
        ];

        // Check if at least one identifying key exists and has a non-empty string value
        const identifyingKeys = ['name', 'brand', 'brand_name', 'label', 'display_name', 'id_med', 'raw_label'];
        const hasIdentifier = identifyingKeys.some(k => typeof obj[k] === 'string' && obj[k].trim().length > 2);

        // Check for "Medicine-like" density
        const keys = Object.keys(obj).map(k => k.toLowerCase());
        const matchCount = medKeys.filter(mk => keys.some(k => k.includes(mk))).length;

        return hasIdentifier && (matchCount >= 1);
    }

    /**
     * Maps a generic object to the internal Medicine type.
     */
    private mapToMedicine(med: any): Medicine | null {
        if (typeof med === 'string') {
            return {
                id: Math.random().toString(36).substr(2, 9),
                name: med,
                category: 'Autre',
                defaultDosage: '',
                defaultTiming: 'Indifférent'
            };
        }

        const name = med.name || med.brand || med.brand_name || med.display_name || med.nom || med.label || med.raw_label;
        if (!name) return null;

        const formInfo = med.form || med.pharmaceutical_form || med.forme || '';
        const dosageRaw = (med.dosage || med.strength || med.posologie || med.doseText || '').toString().trim();
        const finalDosage = [dosageRaw, formInfo].filter(Boolean).join(' ').trim();

        // Interaction context construction
        const interactionGroupCtx = [
            Array.isArray(med.major_interactions || med.interaction_risk || med.interactions || med.alerts)
                ? (med.major_interactions || med.interaction_risk || med.interactions || med.alerts).map((a: any) =>
                    typeof a === 'object' ? (a.message || a.name || a.with || a.risk || a.warning) : a
                ).join(', ')
                : (med.interaction_risk || med.interactions || med.interactionGroup)?.toString(),
            med.drug_class || (Array.isArray(med.atc_class) ? med.atc_class.join(', ') : med.atc_class),
            Array.isArray(med.indications) ? med.indications.join(', ') : med.indications,
            med.active_ingredient || (Array.isArray(med.active_ingredients) ? med.active_ingredients.join(', ') : med.active_ingredients)
        ].filter(Boolean).join(' | ');

        return {
            id: String(med.id || Math.random().toString(36).substr(2, 9)),
            name: String(name).trim(),
            category: (med.category as MedicineCategory) || 'Autre',
            defaultDosage: finalDosage,
            defaultTiming: 'Indifférent' as MealTiming,
            isAdultOnly: med.isAdultOnly || med.adult_only || false,
            interactionGroup: interactionGroupCtx || undefined,
            incompatibleWith: med.incompatibleWith || med.contraindications || [],
            restriction: med.restriction || (med.min_age ? { status: 'attention', minAge: med.min_age } : undefined)
        } as Medicine;
    }
}

export const heuristicJsonService = new HeuristicJsonService();
