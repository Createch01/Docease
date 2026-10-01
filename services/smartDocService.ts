import { SmartDocAnalysis } from "../types";
import { aiService } from "./aiService";

/**
 * Analyse IA de documents et de consultations. Les appels Gemini sont faits par le
 * backend Rust (clé chiffrée, minimisation des données) — voir aiService.
 */
export const smartDocService = {
    async analyzeDocument(file: File): Promise<SmartDocAnalysis> {
        const base64Data = await this.fileToBase64(file);
        return aiService.analyzeDocument(base64Data, file.type);
    },

    fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = error => reject(error);
        });
    },

    async analyzeConsultation(symptoms: string, clinicalExam: string, patient?: any): Promise<any> {
        return aiService.analyzeConsultation(symptoms, clinicalExam, patient);
    }
};
