import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Image, Building2, User } from 'lucide-react';
import { dataService } from '../services/dataService';
import { sessionService } from '../services/sessionService';
import { cabinetSetupState } from '../services/cabinetSetup';
import type { SettingsRoute } from './settings/settingsRoutes';

interface Props {
  onOpenSettings: (to: SettingsRoute) => boolean;
  children: React.ReactNode;
}

/**
 * Assistant de premier lancement : tant que le nom ou l'INPE du médecin est vide,
 * l'accès aux ordonnances est remplacé par ce guide (Mon profil → Cabinet → Logo).
 */
const CabinetSetupGate: React.FC<Props> = ({ onOpenSettings, children }) => {
  const [state, setState] = useState(() => cabinetSetupState(dataService.getDoctorInfo()));

  useEffect(() => {
    const refresh = () => setState(cabinetSetupState(dataService.getDoctorInfo()));
    window.addEventListener('meddoc_data_update', refresh);
    refresh();
    return () => window.removeEventListener('meddoc_data_update', refresh);
  }, []);

  // L'assistante ne reçoit pas l'INPE : le contrôle ne s'applique qu'au médecin.
  if (state.complete || !sessionService.isMedecin()) return <>{children}</>;

  const steps = [
    { n: 1, icon: <User size={16} />, title: 'Mon profil', done: state.hasName && state.hasInpe, required: true,
      text: 'Votre nom et votre INPE figurent sur chaque ordonnance.',
      go: () => onOpenSettings({ section: 'profile' }) },
    { n: 2, icon: <Building2 size={16} />, title: 'Cabinet', done: state.hasContact, required: false,
      text: 'Adresse et téléphone du cabinet.',
      go: () => onOpenSettings({ section: 'cabinet', tab: 'coordonnees' }) },
    { n: 3, icon: <Image size={16} />, title: 'Logo', done: state.hasLogo, required: false,
      text: 'Votre logo, repris sur vos documents (facultatif).',
      go: () => onOpenSettings({ section: 'cabinet', tab: 'logo' }) },
  ];

  return (
    <div className="max-w-2xl mx-auto py-10" role="region" aria-label="Configuration du cabinet">
      <h1 className="text-[22px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Configurons votre cabinet</h1>
      <p className="text-[13px] mb-6" style={{ color: 'var(--color-text-muted)' }}>
        Avant de rédiger une ordonnance, renseignez votre identité. L'impression reste bloquée tant que le nom et l'INPE sont vides.
      </p>
      <ol className="space-y-3">
        {steps.map(s => (
          <li key={s.n} className="flex items-center gap-4 bg-white rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <span aria-hidden="true" style={{ color: s.done ? 'var(--color-success-700, #15803d)' : 'var(--color-text-subtle)' }}>
              {s.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </span>
            <div className="flex-1">
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                {s.icon} {s.n}. {s.title}
                {s.required && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary-100)', color: 'var(--color-primary)' }}>Requis</span>}
              </p>
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{s.text}</p>
            </div>
            <button type="button" onClick={s.go}
                    className="h-10 px-4 rounded-lg text-[13px] font-medium border bg-white"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              {s.done ? 'Modifier' : 'Configurer'}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default CabinetSetupGate;
