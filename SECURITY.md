# Sécurité de DocEase

## Modèle

- **Chiffrement au repos** : tous les fichiers de données sont chiffrés en AES-256-GCM
  avec une **clé de données unique**, tirée au hasard à l'installation. Elle n'existe
  en clair qu'en mémoire, dans le processus Rust, après un déverrouillage.
- **Un mot de passe par utilisateur** : la clé de données est *enveloppée* une fois par
  compte, avec une clé dérivée du mot de passe de ce compte (Argon2). `users_meta.json`
  ne contient que des éléments dérivés (hash Argon2, sel, clé enveloppée). L'assistante
  déverrouille avec son mot de passe, sans connaître celui du médecin.
- **Phrase de récupération** (24 mots) : enveloppe aussi la clé de données ; elle ne
  rétablit que l'accès du **médecin**. Une assistante qui oublie son mot de passe passe
  par une réinitialisation faite par le médecin.
- **Mots de passe** : 12 caractères minimum (médecin), 8 (assistante), exigés pour les
  nouveaux comptes et les changements ; un mot de passe existant plus court n'est pas
  bloqué au déverrouillage. Après 3 échecs, délai croissant (5 s, 10 s… plafonné à 5 min).

## Rôles

| | Médecin | Assistante |
|---|---|---|
| Tableau de bord | complet | rendez-vous du jour et salle d'attente, **sans chiffres financiers** |
| Rendez-vous, salle d'attente | oui | oui |
| Patients | dossier complet | **identité et contact uniquement** : nom, prénom, téléphone, date de naissance, sexe (+ champs techniques : identifiant, âge calculé, catégorie, date d'inscription) |
| Encaissement | oui | **visites du jour seulement** : montant dû, montant payé, mode, statut |
| Dossier médical, consultations, ordonnances, certificats, analyses, documents, SmartDoc/IA, statistiques, Paramètres, sauvegardes, Collaborateurs | oui | **refusé** |
| Créer/supprimer des comptes, changer les rôles, réinitialiser un mot de passe | oui | **refusé** |

### Où c'est appliqué

Le contrôle est fait **côté Rust** (`src-tauri/src/access.rs`), pas seulement dans
l'interface :

1. Chaque commande Tauri commence par `gate(&app, &state, "<nom>")`, qui lit le rôle de
   la **session Rust** (posée au déverrouillage depuis `users_meta.json`). Le frontend ne
   peut pas choisir son rôle.
2. **Liste blanche, refus par défaut** : une commande absente de `COMMAND_RULES` est
   refusée. Un test vérifie que toute commande enregistrée dans `generate_handler!` a une
   règle explicite et appelle `gate`.
3. `load_json` / `save_json` : l'assistante n'accède qu'à `meddoc_appointments`
   (lecture/écriture) et `meddoc_appointment_settings` (lecture). Les chemins avec `..`,
   absolus ou pointant vers les fichiers internes (`users_meta`, `security_meta`…) sont
   refusés pour tous les rôles.
4. Patients, file d'attente, encaissement, fiche cabinet et kiosque passent par des
   **commandes typées** (`src-tauri/src/scoped.rs`) qui filtrent les champs en lecture et
   *fusionnent* seulement les champs autorisés en écriture (les champs médicaux existants
   ne sont jamais touchés). Le montant dû d'une visite existante et les tarifs ne sont pas
   modifiables par l'assistante.

L'interface (menus masqués, routes redirigées, `#/settings/…` effacé) n'est qu'un reflet :
masquer un bouton ne protège rien, c'est Rust qui refuse.

## Limites connues

- **Supprimer un compte ne révoque pas une clé déjà copiée.** La clé de données ne change
  jamais ; supprimer ou réinitialiser un compte retire seulement sa copie enveloppée. Si un
  poste, une copie de `users_meta.json` ou un mot de passe ont fuité, supprimer le compte ne
  suffit pas : seule une **rotation de la clé de données** (rechiffrer tous les fichiers)
  protégerait, et elle est **hors périmètre** de cette version.
- **Dossier de sauvegarde de migration** : `migration_backups/pre-migration-<date>/` (dans
  le dossier de données de l'application) contient l'ancien `security_meta.json`, donc
  l'ancien mot de passe maître enveloppé. Après vérification que tout fonctionne, supprimez-le.
- **Anciens collaborateurs** : leur ancien PIN (en clair, court) devient leur mot de passe
  provisoire, avec changement imposé à la première connexion, jusqu'à ce moment-là il reste
  faible.
- **Données en mémoire de l'interface** : une session assistante ne charge dans la webview
  que l'identité des patients ; au verrouillage le cache est vidé. Rust ne peut pas
  effacer la mémoire de la webview de façon garantie.
- **Anti-force-brute en mémoire** : le compteur d'échecs est remis à zéro à chaque
  redémarrage ; il ralentit une saisie manuelle, pas une attaque hors ligne sur
  `users_meta.json` (le coût Argon2 est alors la seule protection).
- **Mode salle d'attente** : le verrouillage automatique est suspendu pendant l'affichage ;
  en sortir demande le mot de passe de la session. L'écran ne reçoit que « numéro — Prénom I. ».
- **Développement** : le déverrouillage automatique (`VITE_DEV_AUTO_UNLOCK_PASSWORD`) n'existe
  pas dans les builds de production et ouvre en rôle Médecin ; l'aperçu navigateur (`npm run dev`
  sans Tauri) n'a pas de Rust, donc aucune sécurité réelle.
