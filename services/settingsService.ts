import { PrescriptionAppearance, FontSizeOption } from '../types';

const APPEARANCE_STORAGE_KEY = 'docease_prescription_appearance';

const DEFAULT_APPEARANCE: PrescriptionAppearance = {
  primaryColor: '#10b981', // Emerald-600
  fontSize: 'medium',
  logoUrl: undefined,
  logoScale: 1,
};

export const settingsService = {
  // Récupère les paramètres d'apparence depuis localStorage
  getAppearance(): PrescriptionAppearance {
    try {
      const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_APPEARANCE, ...parsed };
      }
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    }
    return DEFAULT_APPEARANCE;
  },

  // Sauvegarde les paramètres d'apparence dans localStorage
  saveAppearance(appearance: PrescriptionAppearance): void {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des paramètres:', error);
    }
  },

  // Met à jour un paramètre spécifique
  updateAppearanceProperty(
    key: keyof PrescriptionAppearance,
    value: any
  ): PrescriptionAppearance {
    const current = this.getAppearance();
    const updated = { ...current, [key]: value };
    this.saveAppearance(updated);
    return updated;
  },

  // Réinitialise les paramètres par défaut
  resetAppearance(): PrescriptionAppearance {
    this.saveAppearance(DEFAULT_APPEARANCE);
    return DEFAULT_APPEARANCE;
  },

  // Convertit la taille en multiplicateur pour les calculs CSS
  getFontSizeMultiplier(fontSize: FontSizeOption): number {
    const multipliers = {
      small: 0.85,
      medium: 1,
      large: 1.2,
    };
    return multipliers[fontSize] || 1;
  },

  // Exporte les paramètres en JSON
  exportAppearance(): string {
    const appearance = this.getAppearance();
    return JSON.stringify(appearance, null, 2);
  },

  // Importe les paramètres depuis JSON
  importAppearance(jsonString: string): PrescriptionAppearance {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.primaryColor && parsed.fontSize) {
        this.saveAppearance(parsed);
        return parsed;
      }
    } catch (error) {
      console.error('Erreur lors de l\'import des paramètres:', error);
    }
    return this.getAppearance();
  },

  // Convertit une image en base64 pour stockage
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};
