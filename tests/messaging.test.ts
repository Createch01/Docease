import { describe, it, expect, vi } from 'vitest';
import cases from './fixtures/phone-cases.json';
import {
    normalizeWhatsAppNumber, validateTemplate, renderMessage, canSendWhatsApp, selectTomorrowReminders,
    resetSentOnReschedule, createWaLinkProvider, defaultMessageTemplates, firstNameOf, MessageContext,
} from '../services/messaging';

const ctx = (over: Partial<MessageContext> = {}): MessageContext => ({
    firstName: 'Sara', cabinetName: 'Cabinet Alami', date: '2026-10-06', time: '10:30', queueNumber: 3,
    cabinetPhone: '0522000000', address: '12 rue X', mode: 'time', ...over,
});

describe('normalizeWhatsAppNumber', () => {
    it.each(cases.cases)('« $input » → $expected', ({ input, expected }) => {
        const r = normalizeWhatsAppNumber(input);
        expect(r.ok ? r.e164 : null).toBe(expected);
    });
    it('distingue fixe et invalide', () => {
        expect(normalizeWhatsAppNumber('0522123456')).toEqual({ ok: false, reason: 'landline' });
        expect(normalizeWhatsAppNumber('')).toEqual({ ok: false, reason: 'empty' });
        expect(normalizeWhatsAppNumber('061')).toEqual({ ok: false, reason: 'invalid' });
    });
});

describe('modèles', () => {
    it('refuse une variable hors liste blanche avec un message clair', () => {
        const v = validateTemplate('Bonjour {prenom}, motif : {motif} par {medecin}');
        expect(v.ok).toBe(false);
        expect(v.unknown).toEqual(['motif', 'medecin']);
        expect(v.message).toContain('{motif}');
    });
    it('accepte toutes les variables autorisées', () => {
        expect(validateTemplate('{prenom} {cabinet} {date} {heure} {numero_ordre} {telephone_cabinet} {adresse}').ok).toBe(true);
    });
    it('les modèles par défaut sont valides et finissent par la phrase d\'empêchement', () => {
        const t = defaultMessageTemplates();
        for (const k of ['confirmation', 'reminder', 'change'] as const) for (const l of ['fr', 'ar'] as const) expect(validateTemplate(t[k][l]).ok).toBe(true);
        expect(t.confirmation.fr.endsWith("En cas d'empêchement, merci de nous prévenir au {telephone_cabinet}.")).toBe(true);
    });
    it('rend le français en mode heure', () => {
        const out = renderMessage(defaultMessageTemplates().confirmation.fr, ctx(), 'fr');
        expect(out).toContain('Bonjour Sara');
        expect(out).toContain('mardi 6 octobre');
        expect(out).toContain('10h30');
        expect(out).toContain('au 0522000000.');
    });
    it("rend l'arabe avec des chiffres latins", () => {
        const out = renderMessage(defaultMessageTemplates().confirmation.ar, ctx(), 'ar');
        expect(out).toContain('10:30');
        expect(out).toContain('0522000000');
        expect(out).toMatch(/6/);
        expect(out).not.toMatch(/[٠-٩]/);
    });
    it("en mode ordre d'arrivée, {heure} devient le numéro d'arrivée", () => {
        const out = renderMessage('{date}, {heure} (n° {numero_ordre})', ctx({ mode: 'order' }), 'fr');
        expect(out).toContain("numéro d'arrivée 3");
        expect(out).not.toContain('10h30');
        expect(renderMessage('{heure}', ctx({ mode: 'order' }), 'ar')).toContain('3');
    });
    it('une variable interdite est rendue vide, jamais laissée', () => {
        expect(renderMessage('A {motif} B {prenom}', ctx(), 'fr')).toBe('A B Sara');
    });
    it('le contexte ne porte ni motif, ni type de consultation, ni médecin', () => {
        const keys = Object.keys(ctx());
        for (const forbidden of ['note', 'reason', 'motif', 'consultationType', 'doctor', 'doctorName']) expect(keys).not.toContain(forbidden);
    });
    it('prénom d\'affichage', () => {
        expect(firstNameOf({ name: 'ALAMI Sara', lastName: 'ALAMI' })).toBe('Sara');
        expect(firstNameOf({ name: 'ALAMI Sara', firstName: 'Sara' })).toBe('Sara');
    });
});

describe('consentement et destinataire', () => {
    const patient = (over: any = {}) => ({ id: 'p1', phone: '0612345678', whatsappConsent: 'yes' as const, ...over });
    const appt = (over: any = {}) => ({ patientId: 'p1', phone: '', ...over });

    it('autorise avec consentement, mobile valide et dossier lié', () => {
        const r = canSendWhatsApp(patient(), appt());
        expect(r.ok && r.candidates[0].e164).toBe('+212612345678');
    });
    it('refuse sans consentement (non renseigné ou refusé, y compris après retrait)', () => {
        expect(canSendWhatsApp(patient({ whatsappConsent: undefined }), appt())).toEqual({ ok: false, reason: 'consent_unset' });
        expect(canSendWhatsApp(patient({ whatsappConsent: 'no' }), appt())).toEqual({ ok: false, reason: 'consent_refused' });
    });
    it('refuse sans dossier lié', () => {
        expect(canSendWhatsApp(patient(), appt({ patientId: undefined }))).toEqual({ ok: false, reason: 'no_record' });
        expect(canSendWhatsApp(undefined, appt())).toEqual({ ok: false, reason: 'no_record' });
        expect(canSendWhatsApp(patient({ id: 'autre' }), appt())).toEqual({ ok: false, reason: 'no_record' });
    });
    it('refuse un numéro fixe', () => {
        expect(canSendWhatsApp(patient({ phone: '0522123456' }), appt())).toEqual({ ok: false, reason: 'no_valid_number' });
    });
    it('repli sur le numéro du RDV si celui du patient est absent ou invalide', () => {
        const r = canSendWhatsApp(patient({ phone: '' }), appt({ phone: '0712345678' }));
        expect(r.ok && r.candidates).toEqual([{ e164: '+212712345678', source: 'appointment' }]);
        expect(r.ok && r.needsChoice).toBe(false);
    });
    it('deux numéros différents : le patient est proposé en premier et l\'utilisateur choisit', () => {
        const r = canSendWhatsApp(patient(), appt({ phone: '0712345678' }));
        expect(r.ok && r.needsChoice).toBe(true);
        expect(r.ok && r.candidates.map(c => c.source)).toEqual(['patient', 'appointment']);
    });
    it('deux écritures du même numéro ne demandent pas de choix', () => {
        const r = canSendWhatsApp(patient(), appt({ phone: '06 12 34 56 78' }));
        expect(r.ok && r.needsChoice).toBe(false);
    });
});

describe('rappels de demain', () => {
    const patients = [
        { id: 'ok', phone: '0612345678', whatsappConsent: 'yes' as const },
        { id: 'no', phone: '0612345678', whatsappConsent: 'no' as const },
        { id: 'fixe', phone: '0522123456', whatsappConsent: 'yes' as const },
    ];
    const a = (id: string, over: any = {}) => ({ id: 'a-' + id, patientId: id, phone: '', date: '2026-10-07', status: 'CONFIRMED', ...over });
    const ids = (list: any[]) => list.map(x => x.id);

    it('sélectionne seulement les RDV de demain éligibles', () => {
        const apps = [
            a('ok'), a('ok', { id: 'prevu', status: 'PENDING' }),
            a('no'), a('fixe'), a('inconnu'),
            a('ok', { id: 'auj', date: '2026-10-06' }),
            a('ok', { id: 'apres', date: '2026-10-08' }),
            a('ok', { id: 'annule', status: 'REJECTED' }),
            a('ok', { id: 'arrive', status: 'ARRIVED' }),
            a('ok', { id: 'deja', reminderSentAt: '2026-10-06T08:00:00Z' }),
        ];
        expect(ids(selectTomorrowReminders(apps, patients, '2026-10-06'))).toEqual(['a-ok', 'prevu']);
    });
    it('passe le mois et l\'année', () => {
        expect(ids(selectTomorrowReminders([a('ok', { date: '2027-01-01' })], patients, '2026-12-31'))).toEqual(['a-ok']);
    });
    it('le retrait du consentement retire immédiatement le rappel', () => {
        const apps = [a('ok')];
        expect(selectTomorrowReminders(apps, patients, '2026-10-06')).toHaveLength(1);
        expect(selectTomorrowReminders(apps, [{ ...patients[0], whatsappConsent: 'no' }], '2026-10-06')).toHaveLength(0);
    });
});

describe('reprogrammation', () => {
    const before = { date: '2026-10-07', time: '10:00', confirmationSentAt: 'x', confirmationSentBy: 'u', reminderSentAt: 'y', reminderSentBy: 'u' };
    it('remet à zéro confirmation et rappel quand la date ou l\'heure change', () => {
        for (const after of [{ ...before, date: '2026-10-08' }, { ...before, time: '11:00' }]) {
            const r = resetSentOnReschedule(before, after);
            expect(r.confirmationSentAt).toBeUndefined();
            expect(r.reminderSentAt).toBeUndefined();
            expect(r.reminderSentBy).toBeUndefined();
        }
    });
    it('conserve la trace sans changement de date ni d\'heure', () => {
        expect(resetSentOnReschedule(before, { ...before }).confirmationSentAt).toBe('x');
    });
});

describe('provider waLink', () => {
    it('délègue à l\'ouverture Rust avec le bon type', async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const p = createWaLinkProvider(open);
        await p.sendReminder({ appointmentId: 'a1', phoneE164: '+212612345678', text: 'salut' });
        expect(open).toHaveBeenCalledWith({ appointmentId: 'a1', phoneE164: '+212612345678', text: 'salut', kind: 'reminder' });
        expect(p.id).toBe('waLink');
    });
});
