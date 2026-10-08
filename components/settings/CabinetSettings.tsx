import React from 'react';
import { AlertTriangle, Building2, Syringe, Clock, CreditCard, Globe, Image as ImageIcon, Info, Mail, MapPin, Phone, Printer, Smartphone } from 'lucide-react';
import { settingsService } from '../../services/settingsService';
import { isCalendarVerified, CALENDAR_UNVERIFIED_MESSAGE } from '../../services/vaccinationService';
import { normalizeRoute } from './settingsRoutes';
import { SettingsPageFrame, SettingsCard, TextField, TextAreaField, ImageField, SettingsLink, Toggle } from './SettingsUI';
import { useDoctorDraft } from './useDoctorDraft';
import ReceiptsRegistryCard from './ReceiptsRegistryCard';
import { sessionService } from '../../services/sessionService';
import { resolveCabinetLogo } from '../../utils/cabinetLogo';
import { SettingsPageProps } from './ProfileSettings';

// Identité de la structure. Les trois onglets éditent le même brouillon
// (DoctorInfo) et partagent un seul bouton Enregistrer.
const CABINET_FIELDS = [
  'cabinetName', 'phone', 'gsm', 'email', 'fax', 'website', 'addressFr', 'addressAr',
  'ice', 'patente', 'taxId', 'rc', 'vatExemptionNote',
  'logoUrl',
  'hours',
  'vaccinationEnabled',
] as const;

const CabinetSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const tab = normalizeRoute(route).tab;
  const { draft, update, dirty, save } = useDoctorDraft('cabinet', CABINET_FIELDS, info => {
    const appearance = settingsService.getAppearance();
    return {
      website: info.website ?? appearance.website ?? '',
      logoUrl: resolveCabinetLogo(info, appearance),
    };
  });

  // DoctorInfo.logoUrl est la seule source du logo pour tous les documents.
  // Le brouillon a été initialisé avec la lecture de secours (ancienne copie de
  // l'apparence) : l'enregistrement la réécrit ici ('' si aucun logo), puis
  // l'ancienne copie est supprimée.
  const handleSave = () => save(() => {
    const { logoUrl: _legacy, ...appearance } = settingsService.getAppearance();
    if (_legacy !== undefined) settingsService.saveAppearance(appearance);
  });

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={handleSave}>
      {tab === 'coordonnees' && (
        <div className="space-y-5 max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SettingsCard title="Contact" icon={<Phone size={16} />}>
              <div className="space-y-3.5">
                <TextField label="Nom du cabinet (utilisé dans les messages)" icon={<Building2 size={16} />} value={draft.cabinetName} onChange={v => update({ cabinetName: v })} placeholder="Cabinet du Dr ..." />
                <TextField label="Téléphone" icon={<Phone size={16} />} value={draft.phone} onChange={v => update({ phone: v })} placeholder="05..." />
                <TextField label="GSM" icon={<Smartphone size={16} />} value={draft.gsm} onChange={v => update({ gsm: v })} placeholder="06..." />
                <TextField label="E-mail" type="email" icon={<Mail size={16} />} value={draft.email} onChange={v => update({ email: v })} placeholder="docteur@exemple.com" />
                <TextField label="Fax" icon={<Printer size={16} />} value={draft.fax} onChange={v => update({ fax: v })} placeholder="05..." />
                <TextField label="Site web" icon={<Globe size={16} />} value={draft.website} onChange={v => update({ website: v })} placeholder="www.exemple.ma" />
              </div>
            </SettingsCard>

            <SettingsCard title="Adresse" icon={<MapPin size={16} />}>
              <div className="space-y-3.5">
                <TextAreaField label="Adresse (FR)" rows={3} value={draft.addressFr} onChange={v => update({ addressFr: v })} placeholder="123 Avenue..." />
                <div dir="rtl">
                  <TextAreaField rtl label="العنوان" rows={3} value={draft.addressAr} onChange={v => update({ addressAr: v })} placeholder="شارع..." />
                </div>
              </div>
            </SettingsCard>
          </div>

          <SettingsCard
            title="Identifiants fiscaux"
            icon={<CreditCard size={16} />}
            actions={<SettingsLink onClick={() => onNavigate({ section: 'profile' })}>N° d'ordre et INPE dans Mon profil</SettingsLink>}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField mono label="ICE" value={draft.ice} onChange={v => update({ ice: v })} placeholder="Numéro ICE" />
              <TextField mono label="Patente" value={draft.patente} onChange={v => update({ patente: v })} placeholder="N° Patente" />
              <TextField mono label="Identifiant fiscal" value={draft.taxId} onChange={v => update({ taxId: v })} placeholder="N° IF" />
              <TextField mono label="RC (optionnel)" value={draft.rc} onChange={v => update({ rc: v })} placeholder="Registre Commerce" />
            </div>
            <TextField
              label="Mention d'exonération de TVA (optionnel)"
              value={draft.vatExemptionNote}
              onChange={v => update({ vatExemptionNote: v })}
              placeholder="Texte exact à faire figurer sur les reçus"
              hint="Rien n'est ajouté par défaut. Reprise telle quelle en pied de reçu, avec les identifiants ci-dessus (INPE, IF, ICE, patente, n° d'ordre) : seuls les champs renseignés apparaissent."
            />
            <div className="p-3.5 rounded-md flex gap-2.5" style={{ background: 'var(--color-primary-50)' }}>
              <Info size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-primary)' }}>
                Ces informations apparaissent sur le pied de page de vos ordonnances et factures pour assurer leur conformité légale.
              </p>
            </div>
          </SettingsCard>

          {sessionService.isMedecin() && <ReceiptsRegistryCard />}
        </div>
      )}

      {tab === 'logo' && (
        <div className="max-w-4xl">
          <SettingsCard
            title="Logo du cabinet"
            icon={<ImageIcon size={16} />}
            description="Repris sur l'ordonnance, les certificats et les autres documents. PNG ou JPG, fond transparent de préférence."
          >
            <div className="flex flex-wrap items-start gap-8">
              <ImageField label="Logo" value={draft.logoUrl} onChange={v => update({ logoUrl: v || '' })} size={176} />
              <div className="space-y-2 max-w-sm pt-6">
                <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                  La taille, l'opacité et l'alignement du logo se règlent par document.
                </p>
                <div className="flex flex-col items-start gap-1.5">
                  <SettingsLink onClick={() => onNavigate({ section: 'documents', tab: 'impression' })}>Réglages d'affichage (Impression)</SettingsLink>
                  <SettingsLink onClick={() => onNavigate({ section: 'documents', tab: 'design' })}>Position sur l'ordonnance (Mon design)</SettingsLink>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>
      )}

      {tab === 'horaires' && (
        <div className="max-w-2xl">
          <SettingsCard
            title="Horaires d'ouverture"
            icon={<Clock size={16} />}
            description="Texte libre, une ligne par plage. Non affiché sur l'ordonnance pour l'instant."
          >
            <TextAreaField label="Horaires" rows={6} value={draft.hours} onChange={v => update({ hours: v })}
                           placeholder={'Lun–Ven 9h–13h / 15h–19h\nSam 9h–13h'} />
          </SettingsCard>
        </div>
      )}

      {tab === 'modules' && (
        <div className="max-w-2xl">
          <SettingsCard
            title="Suivi vaccinal"
            icon={<Syringe size={16} />}
            description="Calendrier vaccinal, alertes de vaccins en retard et suivi par patient. Désactivé par défaut."
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>Suivre la vaccination de mes patients</p>
              <Toggle checked={draft.vaccinationEnabled === true} onChange={v => update({ vaccinationEnabled: v })} label="Suivre la vaccination de mes patients" />
            </div>
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              Les alertes ne concernent que les patients dont le suivi est activé sur le dossier et dont la date de naissance est renseignée.
            </p>
            {!isCalendarVerified() && (
              <div role="note" className="p-3.5 rounded-md flex gap-2.5" style={{ background: 'var(--color-warning-50)' }}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-warning-800)' }} />
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-warning-800)' }}>{CALENDAR_UNVERIFIED_MESSAGE}</p>
              </div>
            )}
          </SettingsCard>
        </div>
      )}
    </SettingsPageFrame>
  );
};

export default CabinetSettings;
