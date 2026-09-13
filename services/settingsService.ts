import { PrescriptionAppearance, FontSizeOption, RxLayoutConfig, CustomTemplateConfig } from '../types';

const APPEARANCE_STORAGE_KEY = 'docease_prescription_appearance';
const RX_LAYOUT_STORAGE_KEY = 'docease_rx_layout';

const DEFAULT_APPEARANCE: PrescriptionAppearance = {
  primaryColor: '#10b981', // Emerald-600
  fontSize: 'medium',
  logoUrl: undefined,
  logoScale: 1,
  fontFamily: 'serif',
  headerLayout: 'classic',
  watermarkOpacity: 0.04,
  showBorder: true,
  footerColor: '#ef4444', // Red-500
  footerVerticalOffset: 0,
  contentVerticalPadding: 40,
  enableQrCode: false,
  qrCodeSize: 120,
  paperSize: 'A4',
  paperMode: 'blank',
  selectedTemplate: 'letterhead_simple',
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
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  },

  getLanguage(): string {
    return localStorage.getItem('docease_language') || 'fr';
  },

  saveLanguage(lang: string): void {
    localStorage.setItem('docease_language', lang);
  },

  // Récupère la mise en page sur mesure de l'ordonnance
  getRxLayout(): RxLayoutConfig | null {
    try {
      const stored = localStorage.getItem(RX_LAYOUT_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      const appearance = this.getAppearance();
      if (appearance.customTemplateConfig?.layoutConfig) {
        return appearance.customTemplateConfig.layoutConfig;
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la mise en page ordonnance:', error);
    }
    return null;
  },

  // Sauvegarde la mise en page sur mesure de l'ordonnance
  saveRxLayout(layout: RxLayoutConfig): void {
    try {
      localStorage.setItem(RX_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
      const appearance = this.getAppearance();
      const customConfig: CustomTemplateConfig = {
        ...(appearance.customTemplateConfig || ({} as CustomTemplateConfig)),
        layoutConfig: layout,
      };
      this.saveAppearance({
        ...appearance,
        selectedTemplate: 'custom',
        customTemplateConfig: customConfig,
      });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la mise en page ordonnance:', error);
    }
  },
};
