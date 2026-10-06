import { MessageTemplates } from './types';

const FR_END = " En cas d'empêchement, merci de nous prévenir au {telephone_cabinet}.";
const AR_END = ' في حالة وجود مانع، المرجو إخبارنا على الرقم {telephone_cabinet}.';

/** Arabe simple (pas de darija écrite), chiffres latins. */
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
    confirmation: {
        fr: 'Bonjour {prenom}, votre rendez-vous au {cabinet} est confirmé le {date}, {heure}.' + FR_END,
        ar: 'السلام عليكم {prenom}، تم تأكيد موعدكم في {cabinet} يوم {date}، {heure}.' + AR_END,
    },
    reminder: {
        fr: 'Bonjour {prenom}, nous vous rappelons votre rendez-vous demain au {cabinet}, le {date}, {heure}.' + FR_END,
        ar: 'السلام عليكم {prenom}، نذكركم بموعدكم غدا في {cabinet}، يوم {date}، {heure}.' + AR_END,
    },
    change: {
        fr: 'Bonjour {prenom}, votre rendez-vous au {cabinet} a été modifié. Nouveau rendez-vous : le {date}, {heure}.' + FR_END,
        ar: 'السلام عليكم {prenom}، تم تغيير موعدكم في {cabinet}. الموعد الجديد: يوم {date}، {heure}.' + AR_END,
    },
    defaultLang: 'fr',
};

export const defaultMessageTemplates = (): MessageTemplates => JSON.parse(JSON.stringify(DEFAULT_MESSAGE_TEMPLATES));
