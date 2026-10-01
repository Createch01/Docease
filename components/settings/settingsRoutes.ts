/**
 * Paramètres — source unique de la navigation.
 *
 * Niveau 1 = sections (sidebar d'App.tsx), niveau 2 = onglets horizontaux en
 * haut de page, uniquement pour les sections qui ont des sous-parties. Chaque
 * section/onglet a sa route hash : #/settings/<section>[/<onglet>].
 */
import {
  User, Building2, FileText, Palette, CalendarClock, Receipt, Scale,
  Shield, Users, Database,
} from 'lucide-react';

// Sections sans contenu pour l'instant : routes et composants conservés, mais
// masqués de la sidebar et inaccessibles tant que le flag est à false.
export const SETTINGS_FEATURES = {
  agendaSettings: true,
  legalSettings: false,
};

export type SettingsSectionId =
  | 'profile' | 'cabinet' | 'documents' | 'appearance'
  | 'agenda' | 'billing' | 'legal'
  | 'security' | 'users' | 'database';

export interface SettingsTabDef { id: string; label: string }

export interface SettingsSectionDef {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: any;
  tabs?: SettingsTabDef[];
  // Tous les onglets éditent le même brouillon : passer d'un onglet à l'autre
  // ne perd rien, donc pas d'alerte « modifications non enregistrées ».
  sharedDraft?: boolean;
  // Section sensible (réservée au médecin, comme tous les Paramètres).
  sensitive?: boolean;
  enabled?: boolean;
}

export interface SettingsGroupDef { title: string; sections: SettingsSectionDef[] }

export const SETTINGS_GROUPS: SettingsGroupDef[] = [
  {
    title: 'Identité & présentation',
    sections: [
      { id: 'profile', label: 'Mon profil', icon: User,
        description: 'Votre identité de médecin, vos identifiants professionnels, votre cachet et votre signature.' },
      { id: 'cabinet', label: 'Cabinet', icon: Building2, sharedDraft: true,
        description: 'Coordonnées, logo et horaires du cabinet, repris sur tous vos documents.',
        tabs: [
          { id: 'coordonnees', label: 'Coordonnées' },
          { id: 'logo', label: 'Logo' },
          { id: 'horaires', label: 'Horaires' },
        ] },
      { id: 'documents', label: 'Documents', icon: FileText,
        description: 'Modèle, design et réglages d\'impression de vos ordonnances et documents.',
        tabs: [
          { id: 'modeles', label: 'Modèles' },
          { id: 'design', label: 'Mon design' },
          { id: 'impression', label: 'Impression' },
        ] },
      { id: 'appearance', label: 'Apparence', icon: Palette,
        description: 'Langue de l\'interface.' },
    ],
  },
  {
    title: 'Exercice & organisation',
    sections: [
      { id: 'agenda', label: 'Rendez-vous', icon: CalendarClock, sharedDraft: true, enabled: SETTINGS_FEATURES.agendaSettings,
        description: 'Horaires, mode de fonctionnement, capacité, types de consultation et fermetures.',
        tabs: [
          { id: 'horaires', label: 'Horaires' },
          { id: 'capacite', label: 'Mode et capacité' },
          { id: 'types', label: 'Types de consultation' },
          { id: 'fermetures', label: 'Fermetures' },
        ] },
      { id: 'billing', label: 'Facturation & Tarifs', icon: Receipt,
        description: 'Devise et tarif de consultation appliqués par défaut.' },
      { id: 'legal', label: 'Conformité légale', icon: Scale, enabled: SETTINGS_FEATURES.legalSettings,
        description: 'Mentions et obligations légales.' },
    ],
  },
  {
    title: 'Sécurité & données',
    sections: [
      { id: 'security', label: 'Sécurité', icon: Shield, sensitive: true,
        description: 'Mot de passe de votre compte, fonctions IA et journal d\'accès.' },
      { id: 'users', label: 'Collaborateurs', icon: Users, sensitive: true,
        description: 'Comptes des personnes qui utilisent DocEase au cabinet.' },
      { id: 'database', label: 'Base de données', icon: Database, sensitive: true,
        description: 'Statistiques, sauvegardes et mises à jour de l\'application.' },
    ],
  },
];

export const isSectionEnabled = (s: SettingsSectionDef) => s.enabled !== false;

/** Groupes visibles dans la sidebar (sections désactivées retirées). */
export const visibleSettingsGroups = (): SettingsGroupDef[] =>
  SETTINGS_GROUPS
    .map(g => ({ ...g, sections: g.sections.filter(isSectionEnabled) }))
    .filter(g => g.sections.length > 0);

export const getSection = (id: SettingsSectionId): SettingsSectionDef =>
  SETTINGS_GROUPS.flatMap(g => g.sections).find(s => s.id === id)!;

export interface SettingsRoute { section: SettingsSectionId; tab?: string }

export const DEFAULT_SETTINGS_ROUTE: SettingsRoute = { section: 'profile' };

const HASH_PREFIX = '#/settings';

export const isSettingsHash = (hash: string) =>
  hash === HASH_PREFIX || hash.startsWith(HASH_PREFIX + '/');

/** Complète l'onglet par défaut d'une section à onglets. */
export const normalizeRoute = (route: SettingsRoute): SettingsRoute => {
  const def = getSection(route.section);
  if (!def.tabs) return { section: route.section };
  return { section: route.section, tab: route.tab || def.tabs[0].id };
};

/**
 * #/settings/<section>[/<onglet>] → route, ou null si la section ou l'onglet
 * n'existe pas (ou est désactivé). Section à onglets sans onglet = 1er onglet.
 */
export const parseSettingsHash = (hash: string): SettingsRoute | null => {
  if (!isSettingsHash(hash)) return null;
  const [sectionId, tabId, ...rest] = hash.slice(HASH_PREFIX.length).split('/').filter(Boolean);
  if (!sectionId || rest.length) return null;
  const def = SETTINGS_GROUPS.flatMap(g => g.sections).find(s => s.id === sectionId);
  if (!def || !isSectionEnabled(def)) return null;
  if (!tabId) return normalizeRoute({ section: def.id });
  if (!def.tabs?.some(t => t.id === tabId)) return null;
  return { section: def.id, tab: tabId };
};

export const settingsHash = (route: SettingsRoute): string => {
  const r = normalizeRoute(route);
  return `${HASH_PREFIX}/${r.section}${r.tab ? '/' + r.tab : ''}`;
};

export const sameRoute = (a: SettingsRoute, b: SettingsRoute) =>
  settingsHash(a) === settingsHash(b);
