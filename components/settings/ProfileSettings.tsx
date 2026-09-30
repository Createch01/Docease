import React from 'react';
import { CreditCard, ShieldCheck, User } from 'lucide-react';
import { SettingsRoute } from './settingsRoutes';
import { SettingsPageFrame, SettingsCard, TextField, TextAreaField, ImageField } from './SettingsUI';
import { useDoctorDraft } from './useDoctorDraft';

export interface SettingsPageProps {
  route: SettingsRoute;
  onNavigate: (route: SettingsRoute) => void;
}

// Identité du médecin — propre à chaque praticien (un cabinet peut en réunir
// plusieurs), d'où N° d'ordre, INPE, cachet et signature ici et non dans Cabinet.
const PROFILE_FIELDS = [
  'nameFr', 'specialtyFr', 'diplomasFr',
  'nameAr', 'specialtyAr', 'diplomasAr',
  'ordreNumber', 'inpe',
  'stampUrl', 'signatureUrl',
] as const;

const ProfileSettings: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const { draft, update, dirty, save } = useDoctorDraft('profile', PROFILE_FIELDS);

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={() => save()}>
      <div className="space-y-5 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SettingsCard title="Identité — version française" icon={<User size={16} />}>
            <div className="space-y-3.5">
              <TextField label="Nom & prénom" value={draft.nameFr} onChange={v => update({ nameFr: v })} placeholder="Dr. Nom Prénom" />
              <TextField label="Spécialité" value={draft.specialtyFr} onChange={v => update({ specialtyFr: v })} placeholder="Médecine Générale" />
              <TextAreaField label="Diplômes & mentions" value={draft.diplomasFr} onChange={v => update({ diplomasFr: v })} placeholder="Liste des diplômes..." />
            </div>
          </SettingsCard>

          <SettingsCard title="الهوية — النسخة العربية" icon={<User size={16} />} dir="rtl">
            <div className="space-y-3.5">
              <TextField rtl label="الاسم الكامل" value={draft.nameAr} onChange={v => update({ nameAr: v })} placeholder="د. الاسم الكامل" />
              <TextField rtl label="الاختصاص" value={draft.specialtyAr} onChange={v => update({ specialtyAr: v })} placeholder="طب عام" />
              <TextAreaField rtl label="الديبلومات" value={draft.diplomasAr} onChange={v => update({ diplomasAr: v })} placeholder="لائحة الديبلومات..." />
            </div>
          </SettingsCard>
        </div>

        <SettingsCard
          title="Identifiants professionnels"
          icon={<CreditCard size={16} />}
          description="Affichés sur vos ordonnances et documents. L'INPE est obligatoire sur l'ordonnance."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField mono label="Numéro d'ordre" value={draft.ordreNumber} onChange={v => update({ ordreNumber: v })} placeholder="N° d'inscription à l'Ordre" />
            <TextField mono label="INPE" value={draft.inpe} onChange={v => update({ inpe: v })} placeholder="Code National"
                       hint={<span className="text-[10px] font-medium px-1.5 py-0.5 rounded mb-1.5" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary)' }}>Requis</span>} />
          </div>
        </SettingsCard>

        <SettingsCard
          title="Cachet & signature"
          icon={<ShieldCheck size={16} />}
          description="Utilisés automatiquement sur vos ordonnances, certificats et factures."
        >
          <div className="flex flex-wrap gap-6">
            <ImageField label="Cachet" value={draft.stampUrl} onChange={v => update({ stampUrl: v })} />
            <ImageField label="Signature" value={draft.signatureUrl} onChange={v => update({ signatureUrl: v })} />
          </div>
        </SettingsCard>
      </div>
    </SettingsPageFrame>
  );
};

export default ProfileSettings;
