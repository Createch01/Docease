export type MessageKind = 'confirmation' | 'reminder' | 'change';
export type MessageLang = 'fr' | 'ar';

export interface LocalizedTemplate { fr: string; ar: string }
export interface MessageTemplates {
    confirmation: LocalizedTemplate;
    reminder: LocalizedTemplate;
    change: LocalizedTemplate;
    defaultLang: MessageLang;
}

/** Variables autorisées dans les modèles (liste blanche). */
export const ALLOWED_VARIABLES = ['prenom', 'cabinet', 'date', 'heure', 'numero_ordre', 'telephone_cabinet', 'adresse'] as const;
export type MessageVariable = typeof ALLOWED_VARIABLES[number];
