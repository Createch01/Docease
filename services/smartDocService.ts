import { GoogleGenAI, Type } from "@google/genai";
import { SmartDocAnalysis } from "../types";

// Configuration de l'IA
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const genAI = new GoogleGenAI({ apiKey, apiVersion: "v1" });

/**
 * Service pour l'analyse intelligente de documents médicaux via Gemini
 */
export const smartDocService = {
    /**
     * Analyse une image ou un PDF (converti en image/texte) pour en extraire les informations clés
     */
    async analyzeDocument(file: File): Promise<SmartDocAnalysis> {
        if (!apiKey) {
            throw new Error("Clé API Gemini manquante. Configurez VITE_GEMINI_API_KEY.");
        }

        // 1. Convert File to Base64
        const base64Data = await this.fileToBase64(file);
        const mimeType = file.type;

        console.log(`🧠 SmartDoc: Analyzing ${file.name} (${mimeType})...`);

        // 2. Prepare Prompt
        const prompt = `
      Tu es un assistant médical expert en analyse de documents cliniques (comptes-rendus, bibilans, lettres de sortie).
      
      ANALYSE CE DOCUMENT ET EXTRAIS :
      1. Un résumé concis de la situation (2-3 phrases).
      2. Le nom du patient et la date du document (si visibles).
      3. Une liste de points clés :
         - OBSERVATION : Faits cliniques, symptômes, diagnostics.
         - ALERT : Résultats anormaux, allergies, risques.
         - ACTION : Traitements, examens à faire, suivi nécessaire.
      4. Des actions suggérées pour le médecin (ex: "Programmer un RDV", "Ajouter au dossier").

      FORMAT DE RÉPONSE ATTENDU (JSON):
      {
        "summary": "...",
        "patientName": "...",
        "date": "YYYY-MM-DD",
        "items": [
          { "type": "OBSERVATION", "content": "...", "confidence": "HIGH" },
          { "type": "ALERT", "content": "...", "confidence": "HIGH" },
          { "type": "ACTION", "content": "...", "confidence": "MEDIUM" }
        ],
        "suggestedActions": ["..."]
      }
      
      Si le document est illisible ou non médical, indique-le dans le résumé avec un item TYPE: ALERT.
    `;

        try {
            // 3. Call Gemini
            const response = await genAI.models.generateContent({
                model: "gemini-2.0-flash", // Use Flash for speed with documents
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: base64Data
                                }
                            }
                        ]
                    }
                ],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            patientName: { type: Type.STRING },
                            date: { type: Type.STRING },
                            items: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        type: { type: Type.STRING, enum: ["OBSERVATION", "ACTION", "ALERT"] },
                                        content: { type: Type.STRING },
                                        confidence: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] }
                                    },
                                    required: ["type", "content", "confidence"]
                                }
                            },
                            suggestedActions: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["summary", "items"]
                    }
                }
            });

            console.log('✅ SmartDoc: Analysis complete');

            const textResponse = response.text || "{}";
            const result = JSON.parse(textResponse) as SmartDocAnalysis;

            return result;

        } catch (error: any) {
            console.error("❌ SmartDoc Error:", error);
            throw new Error(error.message || "Échec de l'analyse du document.");
        }
    },

    /**
     * Helper: Convert File to Base64 stripped of prefix
     */
    fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove "data:image/png;base64," prefix
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    },

    /**
     * Analyse une consultation en temps réel pour suggérer des diagnostics et traitements
     */
    async analyzeConsultation(symptoms: string, clinicalExam: string): Promise<any> {
        if (!apiKey) throw new Error("Clé API Gemini manquante.");

        const prompt = `
      Tu es un assistant médical senior aidant un médecin généraliste en pleine consultation.
      
      CONTEXTE CLINIQUE :
      - SYMPTÔMES : "${symptoms}"
      - EXAMEN CLINIQUE : "${clinicalExam}"
      
      TA MISSION :
      Analyse ces données et fournis une aide à la décision structurée.
      Sois précis, professionnel et concis.
      
      FORMAT DE RÉPONSE ATTENDU (JSON) :
      {
        "differentialDiagnosis": [
          { "condition": "Nom de la maladie", "probability": "High/Medium/Low", "reasoning": "Pourquoi ce diagnostic ?" }
        ],
        "recommendedExams": [
          { "name": "Nom de l'examen (Bio/Radio)", "justification": "Pourquoi ?" }
        ],
        "treatmentPlan": [
          { "category": "Médicament/Conseil", "detail": "Molécule ou conseil précis" }
        ],
        "redFlags": ["Signes de gravité à surveiller (si présents)"]
      }
    `;

        try {
            const response = await genAI.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json"
                }
            });

            const textResponse = response.text || "{}";
            return JSON.parse(textResponse);

        } catch (error: any) {
            console.error("❌ SmartDoc Consultation Error:", error);
            throw new Error("Impossible d'analyser la consultation.");
        }
    }
};
