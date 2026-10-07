/**
 * Paramètres › Rendez-vous › Messages — modèles WhatsApp (confirmation, rappel, changement),
 * en français et en arabe. Réservé au médecin (tous les Paramètres le sont).
 */
import React, { useState } from 'react';
import { Info, MessageCircle, RotateCcw } from 'lucide-react';
import { AppointmentSettings } from '../../types';
import { dataService } from '../../services/dataService';
import { ALLOWED_VARIABLES, MessageKind, MessageLang, MessageTemplates } from '../../services/messaging/types';
import { defaultMessageTemplates } from '../../services/messaging/defaults';
import { renderMessage, validateTemplate } from '../../services/messaging/template';
import { SettingsCard, Field, Segmented, textareaBase, inputStyle } from './SettingsUI';

const KINDS: { id: MessageKind; label: string }[] = [
  { id: 'confirmation', label: 'Confirmation de rendez-vous' },
  { id: 'reminder', label: 'Rappel (la veille)' },
  { id: 'change', label: 'Changement de rendez-vous' },
];

/** Premier problème des modèles (variable interdite…), ou null. Utilisé aussi à l'enregistrement. */
export const validateMessages = (m: MessageTemplates): string | null => {
  for (const k of KINDS) for (const lang of ['fr', 'ar'] as MessageLang[]) {
    const v = validateTemplate(m[k.id][lang]);
    if (!v.ok) return `Message « ${k.label} » (${lang === 'fr' ? 'français' : 'arabe'}) : ${v.message}`;
    if (!m[k.id][lang].trim()) return `Message « ${k.label} » (${lang === 'fr' ? 'français' : 'arabe'}) : le texte est vide.`;
  }
  return null;
};

const sampleDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MessagesSettings: React.FC<{ draft: AppointmentSettings; patch: (p: Partial<AppointmentSettings>) => void }> = ({ draft, patch }) => {
  const [previewLang, setPreviewLang] = useState<MessageLang>(draft.messages.defaultLang);
  const doctor = dataService.getDoctorInfo();
  const messages = draft.messages;
  const setText = (kind: MessageKind, lang: MessageLang, text: string) =>
    patch({ messages: { ...messages, [kind]: { ...messages[kind], [lang]: text } } });

  // RDV fictif : aucune donnée réelle, aucun motif.
  const sample = {
    firstName: previewLang === 'ar' ? 'سارة' : 'Sara', cabinetName: doctor.cabinetName || 'Cabinet', date: sampleDate(), time: '10:30', queueNumber: 3,
    cabinetPhone: doctor.phone || '05 00 00 00 00', address: doctor.addressFr || '', mode: draft.mode,
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-2 p-3 rounded-lg border text-[13px]" style={{ background: 'var(--color-info-50, var(--color-surface-alt))', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
        <Info size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
        <span>Conseil : utilisez un numéro dédié au cabinet avec WhatsApp Business sur ce poste, pas votre numéro personnel.</span>
      </div>

      <SettingsCard
        title="Modèles de messages" icon={<MessageCircle size={16} />}
        description={<>Variables autorisées : {ALLOWED_VARIABLES.map(v => <code key={v} className="mr-1.5">{`{${v}}`}</code>)}. {'{numero_ordre}'} est le numéro d'arrivée ; en mode « ordre d'arrivée », {'{heure}'} est remplacé par ce numéro. Le motif de consultation n'est jamais utilisé.</>}
        actions={
          <button type="button" className="h-8 px-3 rounded-md border text-[12px] font-medium flex items-center gap-1.5" style={inputStyle}
                  onClick={() => patch({ messages: { ...defaultMessageTemplates(), defaultLang: messages.defaultLang } })}>
            <RotateCcw size={13} /> Rétablir les modèles par défaut
          </button>
        }
      >
        <Field label="Langue par défaut">
          <div className="max-w-[220px]">
            <Segmented<MessageLang> options={[{ id: 'fr', label: 'Français' }, { id: 'ar', label: 'العربية' }]} value={messages.defaultLang}
                                    onChange={v => { patch({ messages: { ...messages, defaultLang: v } }); setPreviewLang(v); }} />
          </div>
        </Field>

        {KINDS.map(k => (
          <div key={k.id} className="space-y-2 pt-2">
            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>{k.label}</h4>
            {(['fr', 'ar'] as MessageLang[]).map(lang => {
              const v = validateTemplate(messages[k.id][lang]);
              return (
                <div key={lang}>
                  <label className="block text-[11px] font-medium uppercase mb-1" style={{ color: 'var(--color-text-subtle)' }}>{lang === 'fr' ? 'Français' : 'العربية'}</label>
                  <textarea rows={3} dir={lang === 'ar' ? 'rtl' : 'ltr'} className={textareaBase} style={{ ...inputStyle, ...(v.ok ? {} : { borderColor: 'var(--color-danger)' }) }}
                            value={messages[k.id][lang]} onChange={e => setText(k.id, lang, e.target.value)} aria-label={`${k.label} (${lang})`} />
                  {!v.ok && <p className="text-[12px] mt-1" style={{ color: 'var(--color-danger)' }}>{v.message}</p>}
                </div>
              );
            })}
          </div>
        ))}
      </SettingsCard>

      <SettingsCard title="Aperçu" description="Avec un rendez-vous fictif (demain, 10h30, numéro d'arrivée 3).">
        <div className="max-w-[220px]"><Segmented<MessageLang> options={[{ id: 'fr', label: 'Français' }, { id: 'ar', label: 'العربية' }]} value={previewLang} onChange={setPreviewLang} size="sm" /></div>
        {KINDS.map(k => (
          <div key={k.id}>
            <div className="text-[11px] font-medium uppercase mb-1" style={{ color: 'var(--color-text-subtle)' }}>{k.label}</div>
            <p className="p-3 rounded-lg text-[13px] whitespace-pre-wrap" dir={previewLang === 'ar' ? 'rtl' : 'ltr'} style={{ background: 'white', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {renderMessage(messages[k.id][previewLang], sample, previewLang)}
            </p>
          </div>
        ))}
      </SettingsCard>
    </div>
  );
};

export default MessagesSettings;
