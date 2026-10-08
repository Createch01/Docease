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
- **Fermeture de la fenêtre** : si une sauvegarde est due (session médecin ouverte), la fermeture est suspendue, l'interface affiche « Sauvegarde en cours… », la sauvegarde tourne en arrière-plan (30 s au plus) puis la fenêtre se ferme. Si le délai est dépassé, la fenêtre se ferme quand même et le journal d'accès (`backup_auto`) l'indique. Pas de sauvegarde due : fermeture immédiate.
- **Écriture** : fichier temporaire + `fsync` + renommage, relecture octet par octet puis déchiffrement de contrôle. Rotation 7 quotidiennes, 4 hebdomadaires, 12 mensuelles (dates en UTC, seuls les fichiers `docease-*.dcb` sont touchés). Destination principale et second emplacement optionnel, dans un sous-dossier `DocEase-Sauvegardes`. Une **alerte orange permanente** (Paramètres et tableau de bord) reste affichée tant qu'aucun second emplacement n'est configuré ou que le second est sur le même volume que le premier (lettre de lecteur sous Windows, numéro de périphérique ailleurs : deux partitions d'un même disque physique ne sont pas distinguées).
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

## Messages WhatsApp (lien wa.me)

Code : `src-tauri/src/messaging.rs`. Aucune bibliothèque non officielle ; pas d'API en phase A.
- **Ouverture** : uniquement par la commande Rust `whatsapp_open` (session requise). Rust valide le numéro (`^\+[1-9]\d{7,14}$`) et le texte (1000 caractères au plus), relit le consentement dans les fichiers chiffrés à chaque envoi (un retrait bloque aussitôt), construit `https://wa.me/…` et l'ouvre via `tauri-plugin-opener`. Le frontend n'a **aucune** permission `opener:*` (`capabilities/default.json`) : il ne peut ouvrir aucune URL.
- **Traçabilité** : `…SentAt` / `…SentBy` des RDV et `whatsappConsentAt` / `whatsappConsentBy` sont posés par Rust (heure serveur, session). `save_json` ignore toute valeur reçue pour ces champs, quelle que soit la session ; une reprogrammation (date ou heure) remet à zéro confirmation et rappel.
- **Journal** : id du RDV et type de message seulement — jamais de numéro, de texte ni de motif.

## Pièces jointes du dossier patient (PDF / JPG / PNG)

Code : `src-tauri/src/attachments.rs` (stockage), `media_clean.rs` (nettoyage des images), `backup_pj.rs` (sauvegarde). Réservé au médecin (`Rule::Medecin` sur les six commandes `attachment_*` ; l'index `meddoc_attachments.json` est réservé : ni `load_json` ni `save_json`, pour aucun rôle).
- **Stockage** : `pieces_jointes/pj-<id>.dcp`, AES-256-GCM avec la clé de données, identifiant en données authentifiées (un fichier renommé ou échangé est refusé), empreinte `sha256` du contenu vérifiée à chaque ouverture. Jamais d'octet en clair sur disque ni de fichier temporaire : Rust déchiffre en mémoire et l'interface affiche depuis la mémoire (image : URL `data:` ; PDF : canvas pdf.js ; aucune URL `blob:`, aucun bouton « enregistrer », vérifié par `tests/attachmentsHardening.test.ts`). Limite connue : la mémoire de la webview ne peut pas être effacée de façon garantie.
- **Écriture atomique** (fichier temporaire + `fsync` + renommage) : fichier chiffré d'abord, index ensuite ; un plantage laisse au pire un fichier orphelin balayé après une heure, jamais une entrée sans fichier.
- **Import** : le JavaScript envoie des octets, jamais un chemin de fichier. Rust reconnaît le type par le CONTENU (signature `%PDF-`, JPEG, PNG), refuse tout autre type et plus de 20 Mo. **Métadonnées retirées** : JPEG (EXIF dont GPS / appareil / date, XMP, IPTC, commentaires, vignette JFIF, données après la fin de l'image) et PNG (`tEXt`, `zTXt`, `iTXt`, `eXIf`, `tIME`, blocs inconnus), après avoir appliqué l'orientation EXIF (sans recompression quand l'orientation est 1). L'empreinte est calculée après nettoyage. Les PDF ne sont pas modifiés ; ils peuvent contenir leurs propres métadonnées.
- **pdf.js** : paquet officiel `pdfjs-dist`, version figée (≥ 4.2.67, correctif CVE-2024-4367), `isEvalSupported: false`, ni scripts, ni formulaires, ni annotations (`AnnotationMode.DISABLE`), rendu canvas seul, chargé à la demande ; worker, polices, cmaps et décodeurs embarqués dans `public/pdfjs/` (`npm run pdfjs:assets`), aucune requête réseau. Le moteur de scripts n'est pas embarqué.
- **Journal d'accès** : `attachment_add`, `attachment_update`, `attachment_open`, `attachment_delete` avec l'identifiant de la pièce seulement (jamais le titre, le patient ni le contenu).
- **Sauvegarde** : les pièces ne sont PAS dans le `.dcb`. Elles sont copiées une seule fois dans `DocEase-Sauvegardes/pieces-jointes/`, chiffrées avec une clé de sauvegarde propre (`att_key`, enveloppée par la clé de données dans `backup_meta.json` et reprise dans le texte chiffré du `.dcb`), ce qui permet la restauration sur un poste neuf avec la seule phrase de passe. Un petit fichier `.pj` (liste d'identifiants) accompagne chaque `.dcb` ; la rotation supprime les pièces qu'aucun `.pj` conservé ne référence. **Une pièce supprimée du dossier reste donc dans les anciennes sauvegardes tant qu'elles sont conservées** (7 quotidiennes, 4 hebdomadaires, 12 mensuelles), comme toute autre donnée supprimée. Un lot de copies est revérifié à chaque sauvegarde (copie altérée → recopiée depuis le poste) ; l'espace libre est contrôlé avant l'écriture ; alerte orange au-delà de 1 Go de pièces. **Pièce locale altérée** (un lot tournant d'originaux est aussi revérifié à chaque sauvegarde) : la sauvegarde n'échoue pas ; les données et les autres pièces sont sauvegardées, la pièce altérée est écartée, sa dernière bonne copie est conservée (le `.pj` la référence encore, la rotation ne la supprime pas) et une alerte rouge (« À faire » et réglages, médecin seulement, identifiant de la pièce + patient, aucun contenu) reste affichée jusqu'à suppression ou restauration de la pièce. Pour copier une sauvegarde à la main, il faut copier le dossier entier (`.dcb` + `pieces-jointes`).
- **Restauration** : pièces déchiffrées avec `att_key`, vérifiées, rechiffrées avec la clé de données du poste dans un dossier de préparation, puis échange (l'ancien dossier rejoint la copie de sécurité). Pièce introuvable ou altérée : le reste est restauré, l'entrée est conservée et affichée « fichier manquant ». Aperçu : « N pièces jointes introuvables ».

## Reçus de paiement

- **Registre immuable** : `meddoc_receipts.json` (chiffré, inclus dans la sauvegarde) est une liste en ajout seul, écrite uniquement par les commandes de `receipts.rs`. Le fichier et son compteur (`meddoc_receipt_counter.json`) sont réservés dans `access.rs` : ni `load_json` ni `save_json`, pour aucun rôle. Aucune commande ne modifie ni ne supprime un reçu.
- **Numéro `REC-AAAA-NNNNN`** attribué par Rust (horloge locale du poste, compteur remis à 1 chaque année ; au-delà de 99999 le nombre s'allonge). Prochain numéro = max(compteur, registre) + 1 sous verrou : pas de doublon en cas d'émissions simultanées, et un plantage entre l'écriture du registre et celle du compteur est rattrapé. Une date système antérieure au dernier reçu est refusée. Année, numéro, date, montant en centimes et montant en lettres ne viennent jamais de l'interface.
- **Contenu** : liste blanche stricte (structure `Entry`) : cabinet (mentions légales figées), nom du patient figé, montant, mode, libellé, reste dû. Jamais de diagnostic, de consultation, d'ordonnance ni de résultat ; le libellé est « Consultation », ou, sur demande du **médecin** pour un reçu donné, les noms des prestations cochées de la note.
- **Mentions légales** (INPE, IF, ICE, patente, n° d'ordre, mention d'exonération de TVA) : celles de la fiche cabinet, figées à l'émission, affichées seulement si renseignées. Rien n'est ajouté par défaut.
- **Droits** : l'assistante émet et réimprime (duplicata) les reçus **du jour** uniquement ; le médecin consulte tout ; l'**annulation** est réservée au médecin (motif obligatoire) ; la liste complète et la vérification aussi. Contrôles dans Rust, couverts par le test d'accès.
- **Annulation** : un reçu d'annulation (montant négatif, même suite de numéros) référence le reçu d'origine, qui n'est jamais modifié ; son état « annulé » est déduit du registre. Un reçu ne s'annule qu'une fois, un reçu d'annulation ne s'annule pas. **Duplicata** : enregistré (rang, heure, auteur), n'attribue aucun numéro, bandeau « DUPLICATA n° N ».
- **Intégrité** : chaque entrée contient l'empreinte SHA-256 de la précédente ; `receipts_verify` détecte une entrée modifiée, retirée ou insérée, une suite de numéros interrompue, et un compteur incohérent. Une anomalie déclenche une alerte rouge dans « À faire » (médecin). **Limite** : un utilisateur qui maîtrise le poste et la clé de données pourrait reconstruire un registre cohérent ; la chaîne détecte les erreurs et altérations simples, elle n'a pas valeur de scellé légal.
- **Restauration** : le registre et le compteur ne reculent jamais. Si le registre du poste prolonge celui de la sauvegarde, il est conservé (les reçus émis après la sauvegarde ne sont pas perdus) ; compteur = le plus grand des deux. Sur un poste neuf, le registre de la sauvegarde est repris tel quel. Si les deux registres divergent, celui de la sauvegarde est restauré (l'ancien reste dans la copie de sécurité), le compteur ne recule pas et `receipts_verify` signale l'écart.
- **Journal d'accès** : numéro du reçu seulement (jamais nom, montant ni motif).
