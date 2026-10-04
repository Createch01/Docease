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

## Sauvegardes

Réservées au rôle Médecin (commandes `backup_*`, `Rule::Medecin`, contrôle Rust). Code : `src-tauri/src/backup.rs`.

- **Format v2** : Argon2id (64 Mio, 3 passes) + AES-256-GCM, en-tête authentifié, empreinte du texte chiffré pour distinguer « fichier corrompu » de « mauvaise phrase de passe ». L'ancien export v1 (PBKDF2 + AES-GCM) reste lisible.
- **Contenu** : toutes les données (`meddoc_*.json`) et les surcharges du catalogue. **Jamais** : comptes (`users_meta.json`), métadonnées de sécurité, journal d'accès, réglages de verrouillage, clé API IA, `backup_meta.json`. La liste est unique (`is_backup_data_file`) et testée (`tests/backupCoverage.test.ts`). Sur un nouveau poste : créer son compte, puis restaurer.
- **Phrase de passe** : définie une fois (12 caractères minimum), conservée dans `backup_meta.json` chiffrée par la clé de données, jamais en clair. Sans elle, les sauvegardes sont irrécupérables : à noter hors du cabinet. Elle ne peut pas être affichée. Elle peut être changée (médecin, en saisissant l'ancienne ; `backup_change_passphrase`) : seules les sauvegardes suivantes utilisent la nouvelle, les fichiers existants restent lisibles avec l'ancienne, qu'il faut donc conserver. Après définition ou changement, l'interface propose une **fiche de secours** imprimable (date, cabinet, phrase, consignes) : la phrase n'est gardée qu'en mémoire de l'interface le temps de l'affichage, jamais enregistrée par DocEase.
- **Quand** : au déverrouillage et toutes les 24 h pendant la session si la dernière date de plus de 24 h, au verrouillage et à la fermeture de la fenêtre. La clé de données n'existe qu'en session ouverte : **aucune sauvegarde application fermée ou verrouillée**.
- **Écriture** : fichier temporaire + `fsync` + renommage, relecture octet par octet puis déchiffrement de contrôle. Rotation 7 quotidiennes, 4 hebdomadaires, 12 mensuelles (dates en UTC, seuls les fichiers `docease-*.dcb` sont touchés). Destination principale et second emplacement optionnel, dans un sous-dossier `DocEase-Sauvegardes`.
- **Alerte** : rouge si la dernière sauvegarde a plus de 48 h, si un emplacement est inaccessible ou si la sauvegarde n'est pas configurée (tableau de bord et Paramètres › Base de données).
- **Restauration** : aperçu du contenu, confirmation saisie, copie brute de l'état actuel dans `restore_backups/avant-restauration-*` (3 dernières conservées, chiffrées par la clé de données ; à supprimer quand elles ne servent plus), écriture par préparation puis renommage avec retour arrière en cas d'échec.
- **Sélecteur de dossier** : plugin `dialog`, permission `dialog:allow-open` seulement.
- **Limites** : le dossier choisi doit être protégé par l'utilisateur ; une clé USB perdue contient des fichiers chiffrés mais attaquables hors ligne si la phrase est faible. Une modification des données pendant une restauration n'est pas bloquée (l'interface est modale et se recharge ensuite).

## Journal d'accès

`audit_log.jsonl` (dossier de données) : une ligne par événement — qui, quoi, quand, réussi ou non. Il
consigne connexions et échecs, verrouillages, **tout refus d'accès** (commande ou fichier hors liste blanche),
gestion des comptes, changements de mot de passe, écritures de l'assistante (patients, salle d'attente,
encaissement) et usages de l'IA. Jamais de contenu patient ni de mot de passe. Le médecin le consulte dans
Paramètres › Sécurité (`audit_log_list`, réservé au médecin) ; rotation au-delà de 1 Mo.

Il n'est **ni chiffré** (il doit enregistrer les échecs de connexion, donc sans clé de données) **ni
infalsifiable** : quelqu'un qui a accès aux fichiers du poste peut le modifier ou le supprimer. Les simples
lectures de données par le médecin ne sont pas journalisées.

## Verrouillage automatique

Après 10 minutes d'inactivité par défaut (réglable par le médecin dans Paramètres › Sécurité, de 5 min à
« jamais »), la session est fermée : la clé de données et le rôle sont effacés de la mémoire et l'écran de
verrouillage réapparaît. Le délai est **appliqué par Rust** (`access::gate` ferme une session inactive à
l'appel de commande suivant) ; l'interface signale seulement l'activité réelle (`session_touch`) et affiche
l'écran de verrouillage. Désactivé dans les builds de développement. Suspendu pendant l'écran salle d'attente.

## Tests

- `cargo test` (depuis `src-tauri`) : règles de rôle, filtres de champs, migration, journal, verrouillage.
- `src/access_integration.rs` : sessions Assistant, verrouillée et Médecin (témoin) sur une application
  Tauri simulée ; appelle **chaque** commande enregistrée avec des arguments valides et vérifie les refus.
  Sous Windows, ce test a besoin du manifeste Common-Controls :
  `$env:DOCEASE_TEST_MANIFEST = "1"; cargo test` (sans cette variable le binaire de test ne démarre pas ;
  elle ne doit pas être définie pour construire l'application).
- Test de migration sur une copie des vraies données, mot de passe saisi au clavier : voir `migration_on_real_data_copy`.

## Limites connues

- **Supprimer un compte ne révoque pas une clé déjà copiée.** La clé de données ne change
  jamais ; supprimer ou réinitialiser un compte retire seulement sa copie enveloppée. Si un
  poste, une copie de `users_meta.json` ou un mot de passe ont fuité, supprimer le compte ne
  suffit pas : seule une **rotation de la clé de données** (rechiffrer tous les fichiers)
  protégerait, et elle est **hors périmètre** de cette version.
- **Dossier de sauvegarde de migration** : `migration_backups/pre-migration-<date>/` (dans
  le dossier de données de l'application) contient l'ancien `security_meta.json`, donc
  l'ancien mot de passe maître enveloppé. Après vérification que tout fonctionne, supprimez-le.
  - **Installation du cabinet** : `pre-migration-20261003-195136` (migration réelle du 03/10/2026)
    contient l'ancien mot de passe maître enveloppé. **À supprimer après une semaine de
    fonctionnement sans problème, vers le 10/10/2026.** Tant qu'il existe, quelqu'un qui obtiendrait
    ce dossier et l'ancien mot de passe pourrait déverrouiller les données.
  - **Rappel — à supprimer le 10/10/2026** : `pre-migration-20261003-195136` et la sauvegarde
    volontaire `docease_backup_2026-10-03` (copie des données de l'application, hors dépôt,
    `C:\src\docease_backup_2026-10-03`). Elles contiennent des données de santé et l'ancien mot de
    passe maître enveloppé ; ne pas les conserver au-delà de cette date.
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
