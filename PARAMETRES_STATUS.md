# État des Paramètres — DocEase

Document de référence unique et vivant. Il est mis à jour après **chaque**
modification touchant Paramètres ou le design de l'ordonnance, dans le même
commit que le changement. Ne pas le laisser devenir obsolète.

---

## 1. Structure actuelle de Paramètres

**Une seule navigation.** Niveau 1 = sous-menu « Paramètres » de la sidebar
d'[App.tsx](App.tsx) ; niveau 2 = onglets horizontaux en haut de page, seulement
pour les sections qui en ont. Tout est déclaré dans
[components/settings/settingsRoutes.ts](components/settings/settingsRoutes.ts)
(groupes, sections, onglets, flags) ; `SettingsPanel.tsx` n'est plus qu'un
routeur vers les pages de `components/settings/`.

| Bandeau | Section | Route | Onglets | Enregistre dans |
|---|---|---|---|---|
| **Identité & présentation** | Mon profil | `#/settings/profile` | — | DoctorInfo : nom/spécialité/diplômes FR+AR, N° d'ordre, INPE, cachet, signature |
| | Cabinet | `#/settings/cabinet/{coordonnees,logo,horaires}` | Coordonnées · Logo · Horaires | DoctorInfo : téléphone, GSM, e-mail, fax, site web, adresses FR/AR, ICE, patente, IF, RC, logo, horaires (+ copie du logo dans l'apparence s'il change) |
| | Documents | `#/settings/documents/{modeles,design,impression}` | Modèles · Mon design · Impression | Apparence (`docease_prescription_appearance`) : modèle choisi · design personnalisé + format · format/type de papier, rendu des certificats et ordonnances combinées, QR |
| | Apparence | `#/settings/appearance` | — | Langue de l'interface (immédiat). Pas de thème à ce jour. |
| **Exercice & organisation** | Rendez-vous | `#/settings/agenda` | — | **Masquée** (`SETTINGS_FEATURES.agendaSettings = false`) |
| | Facturation & Tarifs | `#/settings/billing` | — | DoctorInfo : devise, tarif de consultation standard |
| | Conformité légale | `#/settings/legal` | — | **Masquée** (`SETTINGS_FEATURES.legalSettings = false`) |
| **Sécurité & données** | Sécurité 🔒 | `#/settings/security` | — | DoctorInfo : PIN, verrouillage (immédiat) |
| | Collaborateurs 🔒 | `#/settings/users` | — | DoctorInfo.users (immédiat) |
| | Base de données 🔒 | `#/settings/database` | — | Sauvegardes, statistiques, « Vérifier les mises à jour » |

🔒 = demande le PIN administrateur quand le verrouillage est actif.

**Règles communes** (cadre `SettingsPageFrame` de
[SettingsUI.tsx](components/settings/SettingsUI.tsx)) : fil d'Ariane, titre,
description, onglets, badge « Modifications non enregistrées », bouton
Enregistrer (désactivé sans modification), en-tête collant.

- Chaque page n'enregistre que **ses** champs, fusionnés dans le DoctorInfo
  stocké au moment du clic (`useDoctorDraft`) — elle n'écrase plus les
  collaborateurs ni le PIN avec un instantané pris à l'ouverture.
- Garde de sortie ([unsavedChanges.ts](components/settings/unsavedChanges.ts)) :
  confirmation avant de changer de section, de vue, ou d'onglet dont le
  brouillon serait perdu (Documents), et au rechargement de la page. Les
  onglets de Cabinet partagent un brouillon : pas d'alerte entre eux.
- Route invalide ou section masquée → `#/settings/profile`. Section à onglets
  sans onglet (`#/settings/documents`) → premier onglet.
- Site web : `DoctorInfo.website` ; lu en secours dans `appearance.website`
  tant que Cabinet n'a pas été enregistré.
- Mon design occupe toute la largeur de la zone de contenu ; le bouton
  Enregistrer est dans l'en-tête de la page (et dans la barre de l'éditeur en
  plein écran).

---

## 2. Ancien éditeur « Mon design » ([CustomTemplateEditor.tsx](components/CustomTemplateEditor.tsx))

> ⚠️ Section historique : Documents › Mon design utilise désormais
> [OrdonnanceEditorApp](components/ordonnance-editor/OrdonnanceEditorApp.tsx)
> (config dans `customTemplateConfig.ordonnance`). `CustomTemplateEditor` n'est
> plus importé nulle part ; le rendu `CustomTemplate` reste utilisé par
> `TemplateRenderer` pour les anciens designs sans `ordonnance`.

C'est l'éditeur visuel qui personnalise l'ordonnance principale. Il a un
panneau de contrôle à gauche (accordéon à 4 sections) et un aperçu A4 en
temps réel à droite.

### En-tête (section accordéon `header`)
| Contrôle | Valeur par défaut |
|---|---|
| Logo (upload) | aucun |
| Position du logo | `left` (Gauche) |
| Taille du logo | `64px` |
| Fond derrière le logo | `#ffffff`, opacité `0%` |
| Afficher le nom du médecin | `true` |
| Position du nom | `left` |
| Taille du texte du nom | `18px` |
| Couleur du nom | `#ffffff` |
| Afficher la spécialité | `true` |
| Nom en arabe | `false` (taille par défaut si activé : `13px`) |
| Spécialité en arabe | `false` (taille par défaut si activé : `9px`) |
| Couleur de l'en-tête | `#0d9488` (sarcelle) |
| Style d'en-tête | `bande` (Bande colorée) — options : Minimaliste / Bande colorée / Encadré |

### Informations affichées (section accordéon `infos`)
| Contrôle | Valeur par défaut |
|---|---|
| Téléphone | `true` |
| Email | `true` |
| Adresse | `true` |
| N° Ordre National des Médecins | `true` |
| Site web | `false` (champ texte vide) |

### Corps de l'ordonnance (section accordéon `corps`)
| Contrôle | Valeur par défaut |
|---|---|
| Texte du badge | `ORDONNANCE` |
| Couleur badge (fond) | `#0d9488` |
| Couleur badge (texte) | `#ffffff` |
| Taille texte badge | `11pt` |
| Forme du badge (radius) | `999` (pilule) |
| Style ligne patient | `dotted` (Pointillé) — options : Pointillé / Tirets / Continu |
| Style liste médicaments | `barre` (Numéroté avec barre colorée) — options : barre / simple / puces |
| Couleur accent médicaments | `#0d9488` |
| Police | `sans` (Sans-Sérif) — options : serif / sans / mono |
| Deuxième logo dans le corps | `false` (si activé : taille `130px`, opacité `8%`) |

### Pied de page (section accordéon `footer`)
| Contrôle | Valeur par défaut |
|---|---|
| Style pied de page | `vague` (Vague SVG) — options : Simple / Bande colorée / Vague SVG |
| Couleur de fond | `#E53E3E` (rouge) |
| Couleur du texte | `#ffffff` |
| Téléphone affiché | `true` |
| Email affiché | `true` |
| Adresse affichée | `true` |
| Adresse en arabe | `false` |
| Fax affiché | `false` |
| Cachet & signature | `true` (cachet et signature tous deux affichés, position `right`) |
| QR Code | `false` (position par défaut si activé : `right`, contenu vide) |
| Filigrane | `none` — options : Aucun / Initiales / Croix (opacité par défaut si activé : `4%`) |

### Aperçu (colonne de droite)
Pas de contrôles — rendu A4 en temps réel (`TemplateRenderer` avec
`templateId="custom"`), mis à l'échelle automatiquement selon l'espace
disponible. Se met à jour instantanément à chaque changement ci-dessus.

### Stockage & réinitialisation
- Clé localStorage principale : **`docease_prescription_appearance`**
  (objet `PrescriptionAppearance`, contient `customTemplateConfig` pour "Mon
  design").
- Clé localStorage secondaire (mise en page libre, si utilisée) :
  **`docease_rx_layout`**.
- Les deux sont gérées par [services/settingsService.ts](services/settingsService.ts).
- **Bouton "Réinitialiser ce design"** : maintenant visible en haut de
  l'onglet "Mon design", à côté du titre (avant : uniquement en bas du
  panneau, moins visible). Un clic demande confirmation puis :
  1. efface `docease_rx_layout`,
  2. retire `customTemplateConfig` de `docease_prescription_appearance`,
  3. recharge immédiatement les valeurs par défaut du code actuel dans
     l'éditeur (`DEFAULT_CUSTOM_TEMPLATE_CONFIG`), sans rechargement de page
     et sans console développeur.

---

## 3. Dernière modification

**2026-09-30** — Navigation unique : suppression de la liste interne
« Paramètres / Configuration générale », onglets horizontaux (Cabinet,
Documents), routes `#/settings/...`, garde « modifications non enregistrées »,
INPE / N° d'ordre / cachet / signature déplacés dans Mon profil, langue dans
Apparence, fax / site web / horaires éditables dans Cabinet, devise et tarif
dans Facturation & Tarifs, « Vérifier les mises à jour » dans Base de données.
