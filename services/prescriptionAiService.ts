import { Patient, PrescriptionItem } from "../types";
import { aiService } from "./aiService";

export interface ParseResult {
    items: Partial<PrescriptionItem>[];
    analysis: string;
    pediatricWarnings: string[];
}

/**
 * Extrait les médicaments d'une prescription textuelle (et signale les doses
 * pédiatriques douteuses) via le backend Rust. Rien n'est journalisé ici : le
 * texte et le patient ne doivent jamais apparaître dans la console.
 */
export const parsePrescription = async (text: string, patient: Patient): Promise<ParseResult> => {
    const result = await aiService.parsePrescription(text, patient);
    return {
        items: result.items || [],
        analysis: result.analysis || "Analyse terminée.",
        pediatricWarnings: result.pediatricWarnings || []
    };
};
