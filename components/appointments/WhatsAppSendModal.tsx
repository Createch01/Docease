/**
 * Envoi d'un message WhatsApp (confirmation, rappel, changement) par lien wa.me.
 * Aperçu en LECTURE SEULE (FR/AR) ; l'ouverture de WhatsApp passe par la commande Rust
 * `whatsapp_open`. « Marquer comme envoyé » est une confirmation de l'utilisateur : Rust pose
 * l'heure et l'auteur. Le numéro choisi n'est jamais journalisé.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Appointment, AppointmentSettings, Patient } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import { REFUSAL_MESSAGE, canSendWhatsApp, refusalOf } from '../../services/messaging/consent';
import { waLinkProvider } from '../../services/messaging/provider';
import { buildMessageContext, renderMessage } from '../../services/messaging/template';
import { KIND_LABEL, SENT_FIELDS, markMessageSent, suggestedKind } from '../../services/messaging/send';
import { MessageKind, MessageLang } from '../../services/messaging/types';
import WhatsAppConsentField from '../WhatsAppConsentField';

interface Props {
  appointment: Appointment;
  settings: AppointmentSettings;
  initialKind?: MessageKind;
  onClose: () => void;
}

const KINDS: MessageKind[] = ['confirmation', 'reminder', 'change'];
const LANGS: { id: MessageLang; label: string }[] = [{ id: 'fr', label: 'Français' }, { id: 'ar', label: 'العربية' }];

const fmtDateTime = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};

const pretty = (e164: string) => e164.replace(/^(\+212)(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5 $6');

const WhatsAppSendModal: React.FC<Props> = ({ appointment, settings, initialKind, onClose }) => {
  // Le RDV et le dossier sont relus à chaque rendu : un retrait de consentement bloque aussitôt.
  const [tick, setTick] = useState(0);
  const appt = dataService.getAppointments().find(x => x.id === appointment.id) || appointment;
  const patient: Patient | null = useMemo(() => (appt.patientId ? dataService.getPatientProfile(appt.patientId) : null), [appt.patientId, tick]);
  const doctor = dataService.getDoctorInfo();

  const [kind, setKind] = useState<MessageKind>(initialKind || suggestedKind(appt));
  const [lang, setLang] = useState<MessageLang>(settings.messages.defaultLang);
  const [chosen, setChosen] = useState(0);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const check = canSendWhatsApp(patient, appt);
  const refusal = refusalOf(check);
  const recipient = check.ok ? check.candidates[Math.min(chosen, check.candidates.length - 1)] : undefined;
  const ctx = patient ? buildMessageContext(appt, patient, doctor, settings.mode, lang) : undefined;
  const text = ctx ? renderMessage(settings.messages[kind][lang], ctx, lang) : '';
  const missingCabinet = !!ctx && !ctx.cabinetName;

  const setConsent = async (v: 'yes' | 'no' | undefined) => {
    if (patient) await dataService.setWhatsAppConsent(patient.id, v);
    setTick(t => t + 1);
  };

  const open = async () => {
    if (!recipient || !text || busy) return;
    setBusy(true);
    try {
      const send = kind === 'confirmation' ? waLinkProvider.sendConfirmation : kind === 'reminder' ? waLinkProvider.sendReminder : waLinkProvider.sendChangeNotice;
      await send({ appointmentId: appt.id, phoneE164: recipient.e164, text });
      setOpened(true);
    } catch (e) {
      toastService.error(typeof e === 'string' ? e : "WhatsApp n'a pas pu être ouvert.");
    } finally {
      setBusy(false);
    }
  };

  const markSent = async () => {
    setBusy(true);
    try {
      await markMessageSent(appt.id, kind);
      toastService.success(`${KIND_LABEL[kind]} marquée comme envoyée`);
      onClose();
    } catch (e) {
      toastService.error(typeof e === 'string' ? e : "L'envoi n'a pas pu être enregistré.");
      setBusy(false);
    }
  };

  const alreadySent = (k: MessageKind) => !!appt[SENT_FIELDS[k].at];
  const sentAt = appt[SENT_FIELDS[kind].at] as string | undefined;
  const sentBy = appt[SENT_FIELDS[kind].by] as string | undefined;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}
         onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Envoyer sur WhatsApp" className="w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-xl border"
           style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}><MessageCircle size={18} /> Envoyer sur WhatsApp</h3>
            <p className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{appt.patientName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-md hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-subtle)' }}><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {refusal && (
            <div className="space-y-3">
              <p role="alert" className="text-[13px] p-3 rounded-md" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}>{REFUSAL_MESSAGE[refusal]}</p>
              {patient && refusal === 'consent_unset' && <WhatsAppConsentField value={patient.whatsappConsent} at={patient.whatsappConsentAt} onChange={v => void setConsent(v)} />}
              {patient && refusal === 'consent_refused' && <WhatsAppConsentField value={patient.whatsappConsent} at={patient.whatsappConsentAt} onChange={v => void setConsent(v)} />}
            </div>
          )}

          {check.ok && (
            <>
              <div className="flex rounded-md p-1" role="radiogroup" aria-label="Type de message" style={{ background: 'var(--color-border)' }}>
                {KINDS.map(k => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setOpened(false); }}
                          className="flex-1 py-1.5 rounded text-[12px] font-semibold"
                          style={kind === k ? { background: 'white', color: 'var(--color-primary)' } : { color: 'var(--color-text-subtle)' }}>
                    {KIND_LABEL[k]}{alreadySent(k) ? ' ✓' : ''}
                  </button>
                ))}
              </div>

              {sentAt && <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Déjà envoyé(e) le {fmtDateTime(sentAt)}{sentBy ? ` par ${sentBy}` : ''}.</p>}

              {check.needsChoice && (
                <fieldset className="space-y-1.5">
                  <legend className="text-[12px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Deux numéros sont connus : choisissez avant l'envoi</legend>
                  {check.candidates.map((c, i) => (
                    <label key={c.e164} className="flex items-center gap-2 text-[13px] p-2 rounded-md border cursor-pointer" style={{ borderColor: chosen === i ? 'var(--color-primary)' : 'var(--color-border)' }}>
                      <input type="radio" name="wa-number" checked={chosen === i} onChange={() => { setChosen(i); setOpened(false); }} />
                      <span className="tabular-nums font-medium" style={{ color: 'var(--color-text)' }}>{pretty(c.e164)}</span>
                      <span style={{ color: 'var(--color-text-subtle)' }}>{c.source === 'patient' ? 'numéro du dossier patient' : 'numéro saisi sur le rendez-vous'}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {!check.needsChoice && recipient && <p className="text-[13px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>Destinataire : <strong>{pretty(recipient.e164)}</strong></p>}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Aperçu (lecture seule)</span>
                  <div className="flex gap-1" role="radiogroup" aria-label="Langue du message">
                    {LANGS.map(l => (
                      <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} onClick={() => { setLang(l.id); setOpened(false); }}
                              className="px-2.5 h-7 rounded text-[12px] font-semibold border"
                              style={lang === l.id ? { background: 'var(--color-primary-50)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-subtle)' }}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-lg text-[13px] whitespace-pre-wrap select-text" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-readonly="true"
                     style={{ background: 'white', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>{text}</div>
              </div>

              {missingCabinet && (
                <p role="alert" className="text-[12px] p-2.5 rounded-md" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}>
                  Le nom du cabinet n'est pas renseigné (Paramètres › Cabinet, réservé au médecin) : envoi impossible pour le moment.
                </p>
              )}

              <div className="space-y-2">
                <button type="button" disabled={busy || !text || missingCabinet} onClick={() => void open()}
                        className="w-full h-10 rounded-lg text-[14px] font-medium text-white disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>
                  {opened ? 'Rouvrir WhatsApp' : 'Envoyer sur WhatsApp'}
                </button>
                {opened && (
                  <div className="p-3 rounded-md text-[12px] space-y-2" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}>
                    <p>WhatsApp s'est ouvert avec le message prêt. Appuyez sur « Envoyer » dans WhatsApp, puis confirmez ici.</p>
                    <button type="button" disabled={busy} onClick={() => void markSent()}
                            className="w-full h-9 rounded-lg border text-[13px] font-medium bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                      Marquer comme envoyé
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WhatsAppSendModal;
