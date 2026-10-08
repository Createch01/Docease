# Numérotation des notes d'honoraires — plan détaillé (à valider)

Branche : `feature/numerotation-notes` (depuis `main`, après fusion de `feature/recu`). Objectif :
remplacer le calcul `count + 1` par un **compteur Rust séquentiel, jamais réutilisé**, comme pour les
reçus (`receipts.rs`), sans jamais renuméroter une note déjà émise.

## 0. Constats dans le code

1. **Quatre endroits fabriquent un numéro, aucun n'est fiable.**
   - `HonoraryNoteEditor.handleSave` : `AAAA-` + (nombre de notes de l'année du jour + 1), 4 chiffres.
   - `billingService.generateInvoiceNumber` (facture rapide, ordonnance) : même calcul.
   - `scoped::apply_payment` (Rust, encaissement de l'assistante) : même calcul avec l'année du jour.
   - `paymentService` (aperçu navigateur seulement) : numéro vide `''`.
   Conséquences : une note supprimée fait **réutiliser** un numéro déjà remis ; une note datée d'une
   autre année décale le comptage ; les trois chemins ne se voient pas entre eux (collision possible).
2. **Les notes sont écrites en liste complète** par `save_json` (médecin) : `dataService.saveHonoraryNote`
   remplace/ajoute dans le cache puis réécrit tout le fichier ; `cycleStatus`, la suppression, etc.
   passent par le même chemin. Le numéro doit donc être imposé **au niveau de l'écriture**, pas seulement
   à la création.
3. **Précédent dans le code** : `save_json` appelle déjà `messaging::filter_on_save` pour les champs que
   « Rust pose, jamais le frontend » (traçabilité WhatsApp). Même mécanisme ici.
4. **Les numéros existants ont le format `AAAA-NNNN`** (4 chiffres), déjà imprimés sur des notes remises
   aux patients, et peuvent contenir des **doublons ou des trous** (suppressions, collisions). On ne les
   touche pas.
5. L'éditeur utilise le numéro **immédiatement** (nom du PDF, aperçu) : il doit le récupérer de Rust
   après l'enregistrement.
6. Le registre des reçus (`REC-…`) est une suite distincte : aucun lien ni changement.

## 1. Décisions proposées (à confirmer)

| # | Décision | Valeur proposée | Pourquoi |
|---|---|---|---|
| D1 | Année du numéro | **Année de la date de la note** (celle imprimée sur le document) | Le préfixe `AAAA` et la date affichée ne se contredisent jamais ; une note datée de décembre saisie en janvier prend la suite de l'année de sa date. Inconvénient : l'ordre chronologique d'émission n'est pas garanti (uniquement unicité et continuité par année). Alternative : année du jour d'émission. |
| D2 | Format | **Inchangé : `AAAA-NNNN`**, 4 chiffres minimum, le nombre s'allonge au-delà de 9999 | Continuité avec les notes déjà émises. |
| D3 | Numéro fixé à la première écriture | Une fois attribué, **jamais modifié**, même si la date de la note change ou si le frontend renvoie un autre numéro | C'est le sens de « non réutilisable ». |
| D4 | Notes existantes sans numéro (`''`, aperçu navigateur) | Reçoivent un numéro **à leur prochaine écriture** | Elles n'en ont pas : rien n'est renuméroté. |
| D5 | Doublons et trous hérités | **Signalés, jamais corrigés** (contrôle dans Paramètres, niveau information) | Renuméroter changerait des documents déjà remis. |
| D6 | Suppression d'une note | Inchangée (le médecin peut supprimer) ; son numéro **reste consommé** (trou visible au contrôle) | Restreindre la suppression est un autre sujet (hors périmètre, §8). |

## 2. Compteur (Rust, `src-tauri/src/numbering.rs`)

- Fichier `meddoc_invoice_counter.json` : `{ "years": { "2026": 41, … } }` (dernier numéro attribué par
  année). Chiffré comme les autres, **inclus dans la sauvegarde**, réservé dans `access.rs` (ni
  `load_json` ni `save_json`, pour aucun rôle).
- **Prochain numéro de l'année Y = max(compteur[Y], plus grand NNNN de l'année Y dans les notes) + 1**,
  sous un verrou (`Mutex`) partagé par tous les chemins d'écriture. Le `max` rattrape un compteur en
  retard (plantage, restauration, premier lancement après mise à jour) : **première utilisation = migration
  automatique et non destructive** (le compteur démarre au plus grand numéro existant, aucune note
  modifiée).
- Seuls les numéros bien formés (`^\d{4}-\d{4,}$`, année = préfixe) comptent pour le `max` ; un numéro
  libre ou mal formé est ignoré par le compteur et listé au contrôle.
- **Ordre d'écriture** : 1) fichier des notes, 2) compteur. Un plantage entre les deux laisse un compteur
  en retard, rattrapé par le `max` ; jamais deux notes de même numéro. Avant toute écriture, si
  compteur < plus grand numéro des notes stockées, le compteur est d'abord remonté (réparation).

## 3. Où le numéro est imposé

1. **`save_json` du fichier des notes** (médecin) : crochet `numbering::filter_on_save(stored, incoming)`
   comme `messaging::filter_on_save` :
   - note déjà stockée (même `id`) → son `invoiceNumber` stocké est **réimposé** (D3) ;
   - note nouvelle, ou stockée sans numéro (D4) → le numéro envoyé est **ignoré**, Rust attribue le
     suivant (année de la date de la note, D1) ;
   - note absente de la liste envoyée = suppression : acceptée, numéro consommé (D6) ;
   - plusieurs notes nouvelles dans la même écriture : numéros consécutifs, dans l'ordre de la liste.
2. **`scoped::apply_payment`** (assistante) : `count + 1` remplacé par la même fonction d'attribution,
   sous le même verrou ; l'assistante ne peut toujours pas choisir ni modifier un numéro.
3. **Retour à l'interface** : `dataService.saveHonoraryNote` relit le fichier après l'écriture (déjà
   lisible par le médecin) et renvoie la note **telle que stockée**, avec son numéro. L'éditeur et la
   facture rapide utilisent ce retour pour l'aperçu et le nom du PDF.

## 4. Contrôle de cohérence (médecin)

Commande `invoice_numbering_check` (`Rule::Medecin`) : renvoie les doublons, les numéros mal formés, les
notes sans numéro, les trous par année et le dernier numéro de chaque année. Affiché dans Paramètres, à
côté du registre des reçus (« Numérotation des notes »), **en information** : rien n'est corrigé, aucune
alerte rouge (ces écarts sont historiques). Le journal d'accès ne reçoit rien de nouveau.

## 5. Sauvegarde et restauration

- Le compteur est un `meddoc_*.json` : sauvegardé (test de couverture).
- **Restauration** : le compteur ne recule jamais. Comme pour `receipts::merge_for_restore` : compteur
  restauré = maximum, **par année**, du compteur du poste et de celui de la sauvegarde (le `max` avec les
  notes restaurées s'applique en plus à la première attribution). Une note émise après la sauvegarde et
  perdue par la restauration garde donc son numéro « brûlé » : il ne sera jamais attribué à une autre.

## 6. Interface

- `HonoraryNoteEditor` et `billingService.buildQuickInvoice` n'envoient plus de numéro (`''`) ;
  `generateInvoiceNumber` et le calcul de l'éditeur sont supprimés. Après enregistrement, le numéro
  affiché est celui renvoyé par Rust.
- Aucun changement visuel des notes (`#2026-0042` reste `2026-0042`). Un libellé « numéro attribué à
  l'enregistrement » remplace toute saisie éventuelle.
- Aperçu navigateur (hors Tauri) : conservé tel quel, marqué « aperçu uniquement » comme dans
  `paymentService`.

## 7. Tests

- **Rust** : suite continue sur 100 attributions ; deux threads simultanés sans doublon (médecin et
  assistante en même temps) ; numéro stocké **réimposé** quand le frontend en envoie un autre ; numéro
  d'une note supprimée **jamais réattribué** ; année de la date de la note (note de décembre saisie en
  janvier) ; note sans numéro numérotée à l'écriture suivante, notes existantes **inchangées octet pour
  octet** ; migration : compteur absent → démarre au maximum des notes ; compteur en retard (plantage
  simulé) rattrapé ; passage à 5 chiffres ; format mal formé ignoré pour le `max` ; contrôle : doublon,
  trou, mal formé, sans numéro détectés et rien modifié ; assistante : `apply_payment` utilise le
  compteur et l'assistante ne peut pas imposer de numéro ; fichier du compteur refusé à `load_json` /
  `save_json` ; restauration : compteur jamais en arrière (par année).
- **vitest** : l'interface ne calcule plus de numéro (plus de `generateInvoiceNumber`, plus de
  `padStart(4`/`getFullYear` dans les chemins de création de note) ; `saveHonoraryNote` renvoie la note
  relue ; couverture de sauvegarde du compteur ; `SECURITY.md`.
- Chaque commit : `tsc`, `vitest`, `cargo test --lib` (`DOCEASE_TEST_MANIFEST=1`), build.

## 8. Commits (une branche, vérification de la branche avant chacun)

1. `numbering.rs` : compteur, attribution, `filter_on_save` dans `save_json`, réservation dans
   `access.rs`, tests Rust.
2. Chemin assistante (`apply_payment`), contrôle de cohérence (`invoice_numbering_check`, règle d'accès,
   test d'intégration), restauration (compteur par année jamais en arrière), couverture de sauvegarde.
3. Interface : suppression des calculs côté JS, `saveHonoraryNote` renvoyant la note relue, éditeur et
   facture rapide, carte « Numérotation des notes » dans Paramètres, `SECURITY.md`.

## 9. Questions ouvertes

1. D1 : année de **la date de la note** (proposé) ou année du **jour d'émission** ?
2. D5 : les doublons hérités sont seulement signalés (proposé) ; souhaitez-vous au contraire une
   procédure manuelle pour les traiter plus tard ?
3. D6 : la suppression d'une note numérotée reste-t-elle permise telle quelle ?

## 10. Hors périmètre

Interdire ou encadrer la suppression d'une note déjà remise ; notes d'avoir ; renumérotation d'archives ;
numéro de facture légal avec mentions obligatoires (à définir avec vos obligations comptables).
