/**
 * SettingsPanel.tsx — Paramètres.
 *
 * Plus de navigation propre : la section (niveau 1) vient de la sidebar
 * d'App.tsx, les onglets (niveau 2) sont en haut de chaque page. Toute la
 * structure est décrite dans settings/settingsRoutes.ts ; chaque page vit dans
 * settings/ et enregistre elle-même ses champs (DoctorInfo reste la source
 * unique de l'identité du médecin et du cabinet).
 */

import React from 'react';
import { sessionService } from '../services/sessionService';
import { SettingsRoute, getSection, normalizeRoute } from './settings/settingsRoutes';
import { SettingsPageFrame } from './settings/SettingsUI';
import ProfileSettings from './settings/ProfileSettings';
import CabinetSettings from './settings/CabinetSettings';
import DocumentsSettings from './settings/DocumentsSettings';
import { AppearanceSettings, BillingSettings, PendingSectionSettings } from './settings/GeneralSettings';
import AppointmentSettingsPage from './settings/AppointmentSettingsPage';
import { SecuritySettings, UsersSettings, DatabaseSettings } from './settings/AdminSettings';

interface SettingsPanelProps {
  route: SettingsRoute;
  onNavigate: (route: SettingsRoute) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ route: rawRoute, onNavigate }) => {
  // Garde de sécurité : les Paramètres (sauvegardes, comptes, IA…) sont réservés au médecin.
  // Même règle côté Rust ; ici c'est le dernier filet si l'écran était atteint par erreur.
  if (!sessionService.can('MANAGE_SETTINGS')) return null;
  const route = normalizeRoute(rawRoute);
  const section = getSection(route.section);
  const page = { route, onNavigate };

  // Mon design occupe toute la hauteur de la zone de contenu.
  const fill = route.section === 'documents' && route.tab === 'design';

  const content = (() => {
    switch (route.section) {
      case 'profile': return <ProfileSettings {...page} />;
      case 'cabinet': return <CabinetSettings {...page} />;
      case 'documents': return <DocumentsSettings {...page} />;
      case 'appearance': return <AppearanceSettings {...page} />;
      case 'billing': return <BillingSettings {...page} />;
      case 'security': return <SecuritySettings {...page} />;
      case 'users': return <UsersSettings {...page} />;
      case 'database': return <DatabaseSettings {...page} />;
      case 'agenda': return <AppointmentSettingsPage {...page} />;
      case 'legal':
        return <PendingSectionSettings {...page} />;
    }
  })();

  return (
    <div key={route.section} style={fill ? { height: 'calc(100vh - var(--topbar-height) - 48px)', minHeight: 720 } : undefined}>
      {content}
    </div>
  );
};

export default SettingsPanel;
