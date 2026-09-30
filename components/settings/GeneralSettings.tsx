/** Apparence, Facturation & Tarifs, et sections masquées (Rendez-vous, Conformité légale). */
import React from 'react';
import { Languages, Receipt } from 'lucide-react';
import { useI18n, Language } from '../../i18n';
import { SettingsPageFrame, SettingsCard, TextField, Segmented } from './SettingsUI';
import { useDoctorDraft } from './useDoctorDraft';
import { SettingsPageProps } from './ProfileSettings';

// La langue s'applique immédiatement (comme avant, dans Mon profil) : pas de
// brouillon ni de bouton Enregistrer. Aucun thème (clair/sombre) n'existe encore.
export const AppearanceSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const { lang, changeLanguage } = useI18n();
  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate}>
      <div className="max-w-2xl">
        <SettingsCard title="Langue de l'interface" icon={<Languages size={16} />} description="Appliquée immédiatement à toute l'application.">
          <div className="max-w-xs">
            <Segmented<Language> value={lang} onChange={changeLanguage}
                                 options={[{ id: 'fr', label: 'Français' }, { id: 'ar', label: 'العربية' }]} />
          </div>
        </SettingsCard>
      </div>
    </SettingsPageFrame>
  );
};

const BILLING_FIELDS = ['currency', 'standardConsultationFee'] as const;

export const BillingSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const { draft, update, dirty, save } = useDoctorDraft('billing', BILLING_FIELDS);
  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={() => save()}>
      <div className="max-w-2xl">
        <SettingsCard title="Tarification par défaut" icon={<Receipt size={16} />}
                      description="Proposés à l'enregistrement d'une consultation et sur les notes d'honoraires ; modifiables au cas par cas.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label="Devise" value={draft.currency} onChange={v => update({ currency: v })} placeholder="DH" />
            <TextField
              label="Tarif de consultation standard" type="number" mono
              value={draft.standardConsultationFee == null ? '' : String(draft.standardConsultationFee)}
              onChange={v => update({ standardConsultationFee: v === '' ? undefined : Math.max(0, Number(v)) })}
              placeholder="0"
            />
          </div>
        </SettingsCard>
      </div>
    </SettingsPageFrame>
  );
};

// Sections masquées tant que SETTINGS_FEATURES les désactive : page vide
// conservée pour garder la route et l'emplacement prêts à être remplis.
export const PendingSectionSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => (
  <SettingsPageFrame route={route} onNavigate={onNavigate}>
    <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Aucun réglage pour l'instant.</p>
  </SettingsPageFrame>
);
