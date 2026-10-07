# Pièces jointes au dossier patient — plan détaillé (à valider)

Branche : `feature/pieces-jointes` (depuis `main`). Spécification : PDF / JPG / PNG, chiffrés par
Rust avec la clé de données, écriture atomique, inclus dans la sauvegarde, métadonnées (titre,
catégorie, date de l'examen, lien optionnel), visionneuse sans fichier temporaire en clair,
médecin uniquement, suppression confirmée + journal d'accès.

## 0. Constats dans le code (ils déterminent le plan)

1. **La sauvegarde ne peut pas contenir de fichiers volumineux telle qu'elle est faite.**
   `backup.rs` charge tous les `meddoc_*.json` en mémoire, les sérialise en UN seul JSON, le
   chiffre en une fois (AES-GCM + Argon2id), puis l'enveloppe en base64 dans un second JSON. Un
   fichier de 10 Mo y coûte environ 10 × 1,33 (base64) × 1,33 (base64 de l'enveloppe), plus les
   copies en mémoire (chiffrement, relecture de contrôle) : plusieurs centaines de Mo de RAM dès
   quelques centaines de Mo de pièces jointes, et chaque sauvegarde (jusqu'à 23 conservées par
   emplacement : 7 jours + 4 semaines + 12 mois) recopierait tout. `MAX_BACKUP_BYTES` (512 Mo)
   borne aussi la restauration. **Les pièces jointes ne seront donc pas incorporées au `.dcb`.**
2. **Une pièce jointe existe déjà, dans les résultats d'examens** : `MedicalResult.attachments`
   (`{ name, type, url }` avec `url` = `data:` base64 stocké DANS `meddoc_medical_results.json`).
   Chaque fichier ajouté gonfle déjà ce JSON (et chaque sauvegarde). Il faut les migrer vers le
   nouveau stockage, sans perte (section 7).
3. **Rien n'existe pour lire un PDF** (pas de pdf.js dans `package.json`) ; `tauri.conf.json`
   n'impose pas de CSP.
4. **Restauration sur un poste neuf** : la clé de données est différente (compte créé de zéro,
   puis restauration avec la phrase de passe). Les copies de pièces jointes dans les dossiers de
   sauvegarde ne peuvent donc PAS être chiffrées avec la clé de données locale.
5. Il n'y a pas de suppression de patient ni de consultation dans `dataService` aujourd'hui :
   pas de cascade à écrire maintenant (un balayage d'orphelins la prépare, section 4).

## 1. Décisions proposées (à confirmer)

| # | Décision | Valeur proposée | Pourquoi |
|---|---|---|---|
| D1 | Taille maximale par fichier | **20 Mo** | Photo de téléphone 3–10 Mo, scan PDF 1–15 Mo. Au-delà : refus avec message clair. |
| D2 | Seuil d'alerte « lourd pour la sauvegarde » | **1 Go** au total (alerte orange) ; aucun plafond dur | Les copies de sauvegarde sont incrémentales (section 5) ; le vrai risque est l'espace disque / clé USB, d'où aussi un contrôle d'espace libre avant chaque sauvegarde. |
| D3 | Sauvegarde | **Blobs à côté du `.dcb`** (section 5), pas dans le `.dcb` | Constat 1. |
| D4 | Visionneuse PDF | **pdf.js chargé à la demande**, rendu sur canvas depuis la mémoire | Constat 3 : aucun `blob:`, aucun fichier temporaire, pas de bouton « enregistrer » intégré. Coût : une dépendance (~1 Mo, chargée seulement à l'ouverture d'un PDF). |
| D5 | Import | `<input type="file">` → octets envoyés à Rust par IPC binaire | Le JavaScript ne donne jamais un chemin de fichier à lire à Rust (sinon une page compromise pourrait lire n'importe quel fichier du poste). |
| D6 | Journal d'accès | Ajout, modification, **ouverture**, suppression (id de la pièce, jamais le titre ni le contenu) | Un document médical ouvert est un accès à tracer. |
| D7 | Photos | Conservées telles quelles (EXIF inclus) | Fidélité médicale ; aucune recompression silencieuse. |

## 2. Stockage local (Rust, `src-tauri/src/attachments.rs`)

- Dossier `<données>/pieces_jointes/`, un fichier `pj-<16 hex aléatoires>.dcp` par pièce
  (identifiant attribué par Rust).
- Contenu : AES-256-GCM avec la clé de données, nonce aléatoire, **AAD = identifiant** (un fichier
  renommé ou échangé est détecté). Jamais d'octet en clair sur disque, ni fichier temporaire :
  Rust déchiffre en mémoire et renvoie les octets à l'interface.
- Écriture atomique (`users::write_atomic` : fichier temporaire + `fsync` + renommage).
  **Ordre** : 1) fichier chiffré, 2) index. Un plantage laisse au pire un fichier orphelin
  (balayé), jamais une entrée d'index sans fichier. Suppression : index d'abord, fichier ensuite.
- **Index** `meddoc_attachments.json` (chiffré comme les autres, donc inclus dans le `.dcb`) :
  `{ id, patientId, title, category, examDate, linkedType?, linkedId?, mime, size, sha256,
  thumb?, createdAt, createdBy, updatedAt? }`.
  - `category` ∈ ECG · biologie · imagerie · courrier · autre.
  - `linkedType` ∈ consultation · result ; `linkedId` doit exister pour ce patient (vérifié par
    Rust dans `meddoc_consultations.json` / `meddoc_medical_results.json`).
  - `sha256` du contenu en clair (contrôle d'intégrité à l'ouverture et à la restauration).
  - `thumb` : vignette générée par l'interface (≤ 24 Ko, `data:image/jpeg;base64,…`, validée par
    Rust : préfixe, base64, taille). Elle est stockée dans l'index (petite) pour lister sans
    déchiffrer chaque fichier.
- Rust valide **le contenu**, pas l'extension ni le type annoncé : signature `%PDF-`, JPEG
  `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A` ; taille ≤ D1 ; patient existant ; titre non vide
  (≤ 120 caractères) ; catégorie dans la liste ; date `AAAA-MM-JJ` valide non future.
- L'index n'est écrit que par les commandes typées : le fichier est ajouté aux
  `RESERVED_STEMS` de `access.rs` (ni `load_json` ni `save_json`, pour aucun rôle). Il reste
  inclus dans la sauvegarde (`collect` lit le dossier directement).

## 3. Commandes Tauri (toutes `Rule::Medecin`, `gate(...)`, test d'accès)

| Commande | Rôle |
|---|---|
| `attachment_add` | Requête binaire : corps = octets, en-tête = métadonnées JSON. Renvoie l'entrée d'index. |
| `attachment_list(patientId)` | Entrées d'index (avec vignettes) d'un patient ; marque `missing: true` si le fichier manque. |
| `attachment_update(id, patch)` | Titre, catégorie, date, lien. Ni le contenu ni `sha256`/`size`. |
| `attachment_read(id)` | Octets déchiffrés (réponse binaire), `sha256` vérifié ; journal `attachment_open`. |
| `attachment_delete(id)` | Retire l'index puis le fichier ; journal `attachment_delete`. |
| `attachments_status` | Nombre, octets, niveau (`ok` / `heavy`), manquants, orphelins. Sert aux alertes. |

L'assistante est refusée sur toutes (règle `Medecin`, vérifiée par le test d'intégration
existant qui parcourt `generate_handler!`). Journal d'accès : id de la pièce uniquement.

## 4. Intégrité et balayage

- À l'ouverture, `sha256` du clair recalculé : écart → erreur explicite, jamais d'affichage.
- `attachments_status` signale : entrées sans fichier (« fichier manquant »), fichiers sans
  entrée (orphelins, supprimés au balayage après un délai de grâce d'une heure pour ne pas
  toucher à un envoi en cours), entrées dont le patient n'existe plus.

## 5. Sauvegarde (le point délicat)

Principe : le `.dcb` reste comme aujourd'hui (JSON, phrase de passe, Argon2id) ; les pièces sont
copiées **une seule fois** à côté, dans `DocEase-Sauvegardes/pieces-jointes/`.

1. **Clé de sauvegarde des pièces** (`att_key`, 32 octets aléatoires) créée à la première
   sauvegarde avec pièces, conservée dans `backup_meta.json` enveloppée par la clé de données
   (comme la phrase de passe). Indépendante de la phrase : changer la phrase ne réécrit aucun
   fichier.
2. Le contenu du `.dcb` gagne un champ `attachments` : `{ key: <att_key en base64>, items: [{ id,
   size, cipher_sha256 }] }`, **à l'intérieur** du texte chiffré par la phrase de passe. Format
   inchangé (v2) : une ancienne version ignore le champ et restaure simplement sans pièces.
3. Pour chaque emplacement, avant d'écrire le `.dcb` : copier chaque pièce absente (ou de
   taille/empreinte différente) en `pieces-jointes/<id>.dcp`, rechiffrée avec `att_key`
   (AES-GCM, AAD = id), écriture atomique, relecture de contrôle. **Une pièce déjà copiée n'est
   jamais recopiée** : la durée et l'espace d'une sauvegarde quotidienne ne dépendent que des
   nouvelles pièces. Un seul fichier en mémoire à la fois.
4. À côté de chaque `docease-<horodatage>.dcb`, un petit `docease-<horodatage>.pj` (liste des ids,
   sans donnée personnelle). La rotation (7 jours / 4 semaines / 12 mois) supprime le `.pj` avec
   son `.dcb`, puis **supprime les pièces que plus aucun `.pj` conservé ne référence**. Une pièce
   supprimée du dossier reste donc dans les anciennes sauvegardes tant qu'elles sont conservées
   (comportement déjà valable pour toutes les autres données ; à écrire dans `SECURITY.md`).
5. Contrôle d'espace libre avant écriture (nouvelles pièces + `.dcb` × 1,2) : sinon erreur claire
   « espace insuffisant sur <emplacement> », sans sauvegarde partielle.
6. **Restauration** : après ouverture du `.dcb` (phrase de passe), lecture de `att_key`, puis pour
   chaque pièce : déchiffrement depuis `pieces-jointes/` **du même dossier que le `.dcb`**,
   vérification, rechiffrement avec la clé de données du poste, dans un dossier temporaire ; échange
   avec `pieces_jointes/` seulement si tout est prêt (l'ancien dossier est déplacé, pas copié, dans
   `restore_backups/avant-restauration-…`). Pièce introuvable ou altérée : restauration du reste,
   rapport « N pièce(s) manquante(s) », entrées marquées « fichier manquant » (jamais supprimées).
   Fonctionne sur un poste neuf (clé de données différente).
7. L'aperçu (`backup_inspect`) indique le nombre et la taille des pièces.
8. **Alertes de taille** : `Status` gagne `attachments_bytes` et `attachments_level`. Au-delà de
   1 Go (D2) : ligne orange dans Paramètres › Base de données et dans la carte du tableau de bord
   (« Pièces jointes : X Go — vérifiez l'espace de vos disques de sauvegarde »). La taille cumulée
   des sauvegardes est affichée.
9. `tests/backupCoverage.test.ts` : le fichier géré par Rust `meddoc_attachments.json` est vérifié
   comme sauvegardé ; ajout d'un test qui vérifie que le dossier de pièces et le champ
   `attachments` du `.dcb` existent dans le code et dans `SECURITY.md`.

## 6. Interface

- **Dossier patient (médecin)** : nouvel onglet **« Pièces jointes »** : grille de vignettes
  (titre, catégorie, date de l'examen, taille), filtre par catégorie, tri par date d'examen, badge
  « fichier manquant ».
- **Ajout** : bouton + glisser-déposer ; formulaire titre (prérempli avec le nom du fichier sans
  extension), catégorie, date de l'examen (aujourd'hui par défaut), lien optionnel vers une
  consultation ou un résultat du patient. Plusieurs fichiers : un formulaire par fichier. Refus
  immédiat (type, taille) avant tout envoi à Rust. Vignette générée côté interface (canvas pour
  les images ; pdf.js, première page, pour les PDF).
- **Visionneuse** (fenêtre plein écran) : image affichée depuis une URL `data:` en mémoire (pas de
  `blob:`), PDF rendu sur canvas par pdf.js depuis les octets ; zoom (boutons, molette, Ctrl +/−,
  ajustement largeur / page), déplacement, pages suivante / précédente, Échap pour fermer. À la
  fermeture, références libérées (octets remis à zéro quand c'est possible). Aucun bouton
  « enregistrer / imprimer » dans cette première version.
  Garantie à écrire dans `SECURITY.md` : l'application n'écrit aucun fichier en clair ; les
  `data:` ne passent pas par le cache disque du navigateur. Limite : la mémoire de la webview ne
  peut pas être effacée de façon garantie (déjà consigné pour les autres données).
- **Modification** : titre, catégorie, date, lien (`attachment_update`).
- **Suppression** : confirmation explicite (« Supprimer définitivement ? Les anciennes sauvegardes
  conservent une copie jusqu'à leur rotation. ») ; journal côté Rust.
- **Liens** : dans Consultations et Résultats, une pastille « 📎 n » ouvre les pièces liées.
- **Résultats d'examens** : le champ d'ajout de fichiers existant utilise le nouveau stockage
  (la pièce est automatiquement liée au résultat).
- L'IA « Documents » (`ai_analyze_document`) n'est pas modifiée.

## 7. Migration des pièces déjà présentes dans les résultats

Même méthode que les carnets de vaccination (non destructive, idempotente) :
lecture des `attachments` à `url: data:` de chaque résultat → décodage → `attachment_add` (lié au
résultat, titre = nom du fichier, catégorie déduite du type du résultat) → **relecture de contrôle**
(`sha256` du clair identique) → seulement ensuite, dans le résultat, remplacement de
`{ name, type, url }` par `{ name, type, attachmentId }`. Type inconnu ou fichier invalide : laissé
tel quel (rien perdu), listé dans un rapport. Relançable à tout moment. L'affichage lit les deux
formes tant qu'une ancienne subsiste.

## 8. Tests

- **Rust** : aller-retour chiffré ; fichier sur disque sans signature `%PDF-` / JPEG / PNG en clair ;
  AAD (échange de deux fichiers détecté) ; signature invalide, taille > D1, catégorie / date / lien
  invalides refusés ; index jamais sans fichier après interruption simulée ; suppression ; balayage ;
  assistante refusée sur chaque commande (test d'accès) ; `load_json` / `save_json` refusés sur
  l'index ; journal sans titre ni contenu ; **sauvegarde** : copie unique et incrémentale, rotation
  et suppression des pièces non référencées, espace insuffisant, altération détectée ;
  **restauration sur un poste neuf avec une autre clé de données** ; pièce manquante signalée sans
  perte du reste.
- **vitest** : validation (types, tailles, formats de date), migration des résultats (idempotence,
  relecture de contrôle, échec laissant l'ancien contenu), règles d'alerte de taille, mise en
  forme des tailles, garde-fou « aucun `blob:` ni `createObjectURL` dans la visionneuse ».
- Chaque commit : `tsc`, `vitest`, `cargo test --lib` (`DOCEASE_TEST_MANIFEST=1`), build.

## 9. Commits (une branche, vérification de la branche avant chacun)

1. `attachments.rs` : stockage chiffré, index, commandes, règles d'accès, journal, tests.
2. Sauvegarde : copie incrémentale des pièces, `att_key`, champ `attachments`, `.pj`, rotation,
   contrôle d'espace, restauration, état et alertes, tests.
3. Service interface + migration des pièces des résultats + tests.
4. Onglet « Pièces jointes » : liste, ajout, modification, suppression, visionneuse (pdf.js).
5. Liens avec consultations et résultats, alerte de taille dans les écrans de sauvegarde,
   `SECURITY.md`.

## 10. Hors périmètre (étapes suivantes)

Export / impression d'une pièce, annexes dans l'export PDF du dossier (étape 4 : réutilisera
`attachment_read`), OCR, recompression des photos, partage par WhatsApp.
