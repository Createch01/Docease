import { GoogleGenAI, Type } from "@google/genai";
import { Patient, PrescriptionItem, MealTiming } from "../types";

// Configuration de l'IA (Utilisation de la clé API avec fallback)
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '');

// Log API key status (without revealing the key)
console.log('🔑 Gemini API Key Status:', apiKey ? `Configured (${apiKey.substring(0, 10)}...)` : '❌ NOT CONFIGURED');

const genAI = new GoogleGenAI({ apiKey, apiVersion: "v1" });

export interface ParseResult {
    items: Partial<PrescriptionItem>[];
    analysis: string;
    pediatricWarnings: string[];
}

/**
 * Analyse une prescription textuelle et extrait les médicaments de manière structurée.
 * Effectue également une analyse de sécurité pédiatrique si nécessaire.
 */
export const parsePrescription = async (text: string, patient: Patient): Promise<ParseResult> => {
    console.log('🤖 Starting AI prescription parsing...');
    console.log('📝 Input text:', text.substring(0, 100) + '...');
    console.log('👤 Patient:', { age: patient.age, sex: patient.sex, weight: patient.weight });

    // Validate API key
    if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
        console.error('❌ API Key is missing or invalid');
        throw new Error("Clé API Gemini manquante. Vérifiez votre fichier .env.local");
    }

    try {
        const prompt = `
      TON RÔLE : 
      Tu es un expert en pharmacologie pédiatrique et clinique. Ton but est de transformer une prescription manuscrite ou tapée en données structurées JSON.

      CONTEXTE PATIENT :
      - Âge : ${patient.age} ans
      - Poids : ${patient.weight || 'Non spécifié'} kg
      - Sexe : ${patient.sex === 'M' ? 'Masculin' : 'Féminin'}

      TEXTE DE L'ORDONNANCE :
      """
      ${text}
      """

      INSTRUCTIONS D'EXTRACTION :
      1. Extrais chaque médicament. Si plusieurs sont listés, crée un objet pour chacun.
      2. Pour chaque médicament, identifie :
         - medicineName : Le nom commercial complet.
         - dosage : La force ou la dose par prise (ex: 500mg, 1 sachet, 10ml).
         - frequency : Combien de fois par jour (ex: 3 fois par jour, matin et soir).
         - duration : La durée du traitement (ex: 7 jours).
         - instructions : Conseil de prise (ex: avant repas).
         - timing : Choisis parmi : "Avant repas", "Pendant repas", "Après repas", "Indifférent".

      ANALYSE DE SÉCURITÉ PÉDIATRIQUE (CRITIQUE) :
      - Si le patient est un enfant (< 15 ans), vérifie la cohérence de chaque dose par rapport à l'âge et au poids.
      - Si la dose semble élevée ou dangereuse (ex: aspirine chez un enfant, surdosage de paracétamol), génère une alerte courte et précise dans "pediatricWarnings".
      - Si des informations manquent pour valider la dose (ex: poids absent), mentionne-le.

      RETOURNE EXCLUSIVEMENT UN OBJET JSON VALIDE AVEC LA STRUCTURE SUIVANTE :
      {
        "items": [
          { "medicineName": "...", "dosage": "...", "frequency": "...", "duration": "...", "instructions": "...", "timing": "..." }
        ],
        "analysis": "Bref résumé de la prescription (optionnel)",
        "pediatricWarnings": ["Alerte 1", "Alerte 2"]
      }

      LANGUE : Réponds en français. Supporte l'arabe si le texte source est en arabe.
    `;

        console.log('📡 Sending request to Gemini API...');

        const response = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    medicineName: { type: Type.STRING },
                                    dosage: { type: Type.STRING },
                                    frequency: { type: Type.STRING },
                                    duration: { type: Type.STRING },
                                    instructions: { type: Type.STRING },
                                    timing: {
                                        type: Type.STRING,
                                        enum: ["Avant repas", "Pendant repas", "Après repas", "Indifférent"]
                                    }
                                },
                                required: ["medicineName", "dosage", "frequency", "timing"]
                            }
                        },
                        analysis: { type: Type.STRING },
                        pediatricWarnings: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["items", "analysis", "pediatricWarnings"]
                }
            }
        });

        console.log('✅ Received response from Gemini API');
        console.log('📄 Raw response:', response.text?.substring(0, 200) + '...');

        const cleanText = response.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
        const result = JSON.parse(cleanText);

        console.log('✅ Successfully parsed prescription:', result);

        return {
            items: result.items || [],
            analysis: result.analysis || "Analyse terminée.",
            pediatricWarnings: result.pediatricWarnings || []
        };
    } catch (error: any) {
        console.error("❌ AI Prescription Parsing Error:", error);
        console.error("Error details:", {
            name: error?.name,
            message: error?.message,
            status: error?.status,
            statusText: error?.statusText
        });

        // Provide more specific error messages
        if (error?.message?.includes('API key')) {
            throw new Error("Clé API Gemini invalide. Vérifiez votre configuration.");
        } else if (error?.status === 401 || error?.status === 403) {
            throw new Error("Authentification échouée. Clé API invalide ou expirée.");
        } else if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
            throw new Error("Erreur de connexion. Vérifiez votre connexion internet.");
        } else if (error?.message?.includes('quota')) {
            throw new Error("Quota API dépassé. Réessayez plus tard.");
        } else {
            throw new Error(`Échec de l'analyse IA: ${error?.message || 'Erreur inconnue'}`);
        }
    }
};
