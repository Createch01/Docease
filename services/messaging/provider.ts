import { ConsentAppointment, ConsentPatient, SendCheck, canSendWhatsApp } from './consent';
import { MessageKind } from './types';

export interface SendRequest {
    appointmentId: string;
    /** E.164, choisi par l'utilisateur. Jamais journalisé. */
    phoneE164: string;
    text: string;
}

/**
 * Canal d'envoi. Seule implémentation : `waLink` (lien wa.me ouvert par Rust, gratuit, sans API).
 * Emplacement réservé à `whatsappCloudApi` (même interface, envoi côté Rust avec jeton chiffré) :
 * voir docs/WHATSAPP_API.md — non implémenté en phase A.
 */
export interface MessagingProvider {
    id: string;
    canSend(patient: ConsentPatient | undefined | null, appointment: ConsentAppointment): SendCheck;
    sendConfirmation(req: SendRequest): Promise<void>;
    sendReminder(req: SendRequest): Promise<void>;
    sendChangeNotice(req: SendRequest): Promise<void>;
}

export type OpenWhatsApp = (args: { phoneE164: string; text: string; appointmentId: string; kind: MessageKind }) => Promise<void>;

/** Seul accès à l'ouverture de WhatsApp : la commande Rust `whatsapp_open` (aucune ouverture d'URL côté JavaScript). */
const invokeOpen: OpenWhatsApp = async ({ phoneE164, text, appointmentId, kind }) => {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('whatsapp_open', { phoneE164, text, appointmentId, kind });
};

export function createWaLinkProvider(open: OpenWhatsApp = invokeOpen): MessagingProvider {
    const send = (kind: MessageKind) => (r: SendRequest) => open({ ...r, kind });
    return {
        id: 'waLink',
        canSend: canSendWhatsApp,
        sendConfirmation: send('confirmation'),
        sendReminder: send('reminder'),
        sendChangeNotice: send('change'),
    };
}

export const waLinkProvider = createWaLinkProvider();
