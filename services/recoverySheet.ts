// Fiche de secours de la phrase de passe de sauvegarde. Pure mise en forme : la phrase vit
// seulement dans l'état de l'interface le temps de l'affichage, rien n'est écrit sur disque.

export interface RecoverySheetModel {
    title: string;
    cabinet: string;
    dateLabel: string;
    phrase: string;
    instructions: string[];
}

export const RECOVERY_INSTRUCTIONS = [
    "Conservez cette feuille HORS du cabinet (domicile, coffre, notaire…), jamais à côté de l'ordinateur ni des sauvegardes.",
    'Sans cette phrase, les sauvegardes DocEase sont irrécupérables : personne ne peut la retrouver à votre place.',
    "Ne la photographiez pas et ne l'envoyez pas par e-mail ou messagerie.",
    "Si vous changez de phrase, gardez aussi celle-ci : les anciennes sauvegardes ne s'ouvrent qu'avec elle.",
    'Pour restaurer : DocEase › Paramètres › Base de données › Restaurer une sauvegarde.',
];

export function buildRecoverySheet(phrase: string, cabinetName: string | undefined, now: Date = new Date()): RecoverySheetModel {
    return {
        title: 'Fiche de secours — phrase de passe de sauvegarde',
        cabinet: cabinetName?.trim() || 'Cabinet (nom non renseigné)',
        dateLabel: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        phrase,
        instructions: RECOVERY_INSTRUCTIONS,
    };
}
