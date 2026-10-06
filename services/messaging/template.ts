import { ALLOWED_VARIABLES, MessageLang } from './types';

/**
 * Contexte de rendu : volontairement limité aux champs de la liste blanche. Le motif de
 * consultation, le type de consultation et le nom du médecin n'ont AUCUN champ ici : ils ne
 * peuvent donc pas être fournis au module, même par erreur.
 */
export interface MessageContext {
    firstName: string;
    cabinetName: string;
    /** YYYY-MM-DD */
    date: string;
    /** HH:mm — ignoré en mode « ordre d'arrivée ». */
    time?: string;
    queueNumber?: number;
    cabinetPhone: string;
    address: string;
    mode: 'time' | 'order';
}

const TOKEN_RE = /\{([^{}]*)\}/g;
const allowed = new Set<string>(ALLOWED_VARIABLES);

export interface TemplateValidation { ok: boolean; unknown: string[]; message?: string }

/** À appeler à l'enregistrement d'un modèle : toute variable hors liste blanche est refusée. */
export function validateTemplate(text: string): TemplateValidation {
    const unknown: string[] = [];
    for (const m of text.matchAll(TOKEN_RE)) if (!allowed.has(m[1])) unknown.push(m[1]);
    const stray = text.replace(TOKEN_RE, '').match(/[{}]/);
    if (unknown.length > 0) {
        const names = [...new Set(unknown)].map(u => `{${u}}`).join(', ');
        return { ok: false, unknown, message: `Variable non autorisée : ${names}. Variables possibles : ${ALLOWED_VARIABLES.map(v => `{${v}}`).join(' ')}.` };
    }
    if (stray) return { ok: false, unknown, message: "Accolade isolée : une variable s'écrit {nom}." };
    return { ok: true, unknown };
}

const parseDay = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12);
};

export function formatMessageDate(date: string, lang: MessageLang): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const locale = lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDay(date));
}

const formatTime = (time: string, lang: MessageLang) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m) return '';
    return lang === 'fr' ? `${m[1].padStart(2, '0')}h${m[2]}` : `${m[1].padStart(2, '0')}:${m[2]}`;
};

const arrival = (n: number | undefined, lang: MessageLang) => (n ? (lang === 'ar' ? `رقم الوصول ${n}` : `numéro d'arrivée ${n}`) : '');

export function renderMessage(template: string, ctx: MessageContext, lang: MessageLang): string {
    const values: Record<string, string> = {
        prenom: ctx.firstName,
        cabinet: ctx.cabinetName,
        date: formatMessageDate(ctx.date, lang),
        heure: ctx.mode === 'order' ? arrival(ctx.queueNumber, lang) : formatTime(ctx.time ?? '', lang),
        numero_ordre: ctx.queueNumber ? String(ctx.queueNumber) : '',
        telephone_cabinet: ctx.cabinetPhone,
        adresse: ctx.address,
    };
    // Variable hors liste blanche : rendue vide (jamais laissée telle quelle ni interprétée).
    return template.replace(TOKEN_RE, (_, name: string) => (allowed.has(name) ? values[name] ?? '' : '')).replace(/[ \t]+/g, ' ').trim();
}

/** Prénom d'affichage : `firstName`, sinon le nom privé de son nom de famille (« NOM Prénom »). */
export function firstNameOf(p: { name?: string; firstName?: string; lastName?: string }): string {
    if (p.firstName?.trim()) return p.firstName.trim();
    const name = (p.name ?? '').trim();
    if (p.lastName && name.toLowerCase().startsWith(p.lastName.toLowerCase())) return name.slice(p.lastName.length).trim() || name;
    const parts = name.split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : name;
}
