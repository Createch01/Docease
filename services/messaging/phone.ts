/** Normalisation des numéros pour wa.me. Même logique que `notifications/reminders_source.rs` (jeu de cas partagé). */

export type PhoneRejection = 'empty' | 'landline' | 'invalid';
export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: PhoneRejection };

export const E164_RE = /^\+[1-9]\d{7,14}$/;

/** Mobiles marocains : 06 / 07 + 8 chiffres. Les fixes (05) et numéros spéciaux (08) sont refusés. */
const fromMoroccanNational = (nine: string): PhoneResult => {
    if (nine.length !== 9) return { ok: false, reason: 'invalid' };
    if (nine[0] === '6' || nine[0] === '7') return { ok: true, e164: `+212${nine}` };
    if (nine[0] === '5' || nine[0] === '8') return { ok: false, reason: 'landline' };
    return { ok: false, reason: 'invalid' };
};

export function normalizeWhatsAppNumber(raw: string | null | undefined): PhoneResult {
    const cleaned = String(raw ?? '').replace(/[\s.\-() ]/g, '');
    if (!cleaned) return { ok: false, reason: 'empty' };
    if (!/^\+?\d+$/.test(cleaned)) return { ok: false, reason: 'invalid' };

    let intl: string | null = null; // chiffres en notation internationale, sans « + »
    if (cleaned.startsWith('+')) intl = cleaned.slice(1);
    else if (cleaned.startsWith('00')) intl = cleaned.slice(2);
    else if (cleaned.startsWith('212')) intl = cleaned;

    if (intl !== null) {
        if (intl.startsWith('212')) return fromMoroccanNational(intl.slice(3));
        const e164 = `+${intl}`;
        return E164_RE.test(e164) ? { ok: true, e164 } : { ok: false, reason: 'invalid' };
    }
    if (cleaned.startsWith('0') && cleaned.length === 10) return fromMoroccanNational(cleaned.slice(1));
    return { ok: false, reason: 'invalid' };
}

export const PHONE_REJECTION_MESSAGE: Record<PhoneRejection, string> = {
    empty: 'Aucun numéro renseigné.',
    landline: 'Numéro fixe : WhatsApp exige un mobile (06 / 07).',
    invalid: 'Numéro invalide.',
};
