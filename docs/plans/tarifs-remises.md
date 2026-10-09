# T1 — Tarifs, remises, identité professionnelle (plan)

Branche : `feature/comptabilite`. Lot posé sur C0–C3 (registres Rust, centimes `i64`, droits dans
`access::COMMAND_RULES`). Toute la logique de montants et de validation est en Rust ; l'interface
n'additionne rien et n'invente aucun prix.

## 0. Décisions de conception

| # | Décision | Raison |
|---|---|---|
| T1-D1 | Grille dans un fichier réservé `meddoc_tariffs.json` (chiffré, sauvegardé, ni `load_json` ni `save_json`), écrit seulement par `tariff.rs`. | Même modèle que les catégories de dépenses. |
| T1-D2 | Une note garde `totalAmount` (dirhams, net) et `services` (copie dérivée) : tout le code existant (reçus, notifications, encaissement, registre) continue de fonctionner. Les nouveaux champs sont **ajoutés** (`lines`, remises, instantané). | Aucun montant ne change ; pas de réécriture de consommateurs. |
| T1-D3 | Les lignes d'une note sont **calculées et figées par Rust** à l'émission (hook de `save_json` pour le médecin, `apply_payment` pour l'assistante). Une note qui a déjà `lines` voit ses champs figés réimposés à chaque écriture. | « Note numérotée = lignes immuables ». |
| T1-D4 | Note sans `lines` envoyée par une interface (ancien chemin) : enveloppée par Rust en **une ligne libre « Honoraires »** au montant reçu. C'est exactement la fonction de migration. | Compatibilité, un seul code de reprise. |
| T1-D5 | Remise : une par ligne + une sur la note (appliquée après les remises de ligne). Type `PERCENT` (entier 1–100) · `AMOUNT` (centimes) · `FREE` (100 % de la base). Arrondi : demi vers le haut, en centimes. | Simple, vérifiable. |
| T1-D6 | Statut `FREE` (« Gratuit ») : total net = 0. Ni Réglé ni Impayé, exclu du « Reste à encaisser » (dû = 0 : déjà exclu par la règle `dû > 0`). | Demande. |
| T1-D7 | Identité professionnelle : champs **dans la fiche cabinet existante** (`meddoc_doctor_info.json`), validés par un crochet Rust de `save_json` (champs modifiés seulement, pour ne pas bloquer une page sans rapport). Nouveaux champs : `cnssEmployer`, `rib`, `stampAttachmentId`. Correspondances : IF = `taxId`, TP = `patente`. | Une seule source ; documents existants inchangés. |
| T1-D8 | Cachet/signature : pièce jointe chiffrée propriétaire `__cabinet__`, EXIF supprimé par `media_clean` (comme les justificatifs). Lecture par `identity_stamp` (toute session) : l'assistante imprime le reçu avec le cachet sans accès aux pièces jointes. | Demande ; pas d'élargissement de `attachment_read`. |
| T1-D9 | Reçu : champs optionnels ajoutés à l'entrée (`noteNumber`, `grossCents`, `discountCents`, `noteTotalCents`), `skip_serializing_if` → les empreintes des reçus existants restent valides. | Le chaînage ne casse pas. |

## 1. Modèle de données

### 1.1 Grille (`meddoc_tariffs.json`)

```
{ "version": 1,
  "settings": { "assistantDiscountCapPct": 0, "freeControlDays": 0 },
  "acts": [ Act ] }
Act = { id: "act-xxxxxxxx", code, label, category,           // CONSULTATION | EXPLORATION | CONTROLE | CERTIFICAT | AUTRE
        priceCents: i64|null, ngapLetter: str|null, ngapCoefficient: str|null,
        active: bool, order: u32,
        priceHistory: [ { priceCents, from: "AAAA-MM-JJ", by, at } ],
        createdAt, createdBy }
```

- Liste préchargée (libellés seulement, **prix vides**, ids fixes) : Consultation (`CS`), Consultation de contrôle
  (`CTRL`), ECG, Échocardiographie (`ECHO`), Holter ECG 24 h (`HOLT`), MAPA, Épreuve d'effort (`EFF`),
  Certificat médical (`CERT`). Lettre clé NGAP et coefficient : vides, informatifs, jamais inventés.
- Un acte sans prix n'est pas utilisable (refus Rust à la sélection) ; bandeau « Complétez vos tarifs » tant
  qu'aucun acte n'a de prix.
- Aucun acte ne se supprime (aucune commande de suppression) : il se désactive. Un acte désactivé n'est plus
  sélectionnable, reste lisible sur les anciennes notes.
- Changer un prix : ajoute une entrée à `priceHistory` ; les notes déjà émises gardent leur instantané.

### 1.2 Note (champs ajoutés)

```
lines: [ { actId?, code?, label, category?, ngapLetter?, ngapCoefficient?,
           quantity, unitPriceCents, tariffUnitCents?,       // absent pour une ligne libre
           grossCents, discount?: Discount, discountCents, netCents } ]
noteDiscount?: Discount
grossCents, lineDiscountsCents, noteDiscountCents, discountCents, netCents
totalAmount (= netCents/100), totalInWords (Rust), services (copie dérivée)
issuer: { name, specialty, ordreNumber, inpe, ifNumber, tp, ice, cnss, address, phone, email, rib, hasStamp }
Discount = { kind: PERCENT|AMOUNT|FREE, percent?, amountCents?, reason, reasonText?, cents, by, at }
```

Motifs : `CONFRERE` · `FAMILLE` · `SOCIAL` · `CONTROLE_GRATUIT` · `GESTE` · `AUTRE` (texte 3–120 car. obligatoire).
`by` et `at` sont posés par Rust (jamais reçus). `unitPriceCents`, `tariffUnitCents`, libellés, code, lettre clé :
**ignorés à la réception pour une ligne de grille** (pris dans la grille) ; une valeur reçue différente du tarif est
refusée (« prix inférieur au tarif = remise obligatoirement »).

### 1.3 Droits

| Action | Médecin | Assistante |
|---|---|---|
| Lire la grille et les réglages | oui | oui (lecture + utilisation) |
| Créer / modifier / (dés)activer un acte, régler plafond et délai | oui | refus Rust |
| Ligne de grille | oui | oui |
| Ligne libre | oui | refus (« Ligne libre réservée au médecin ») |
| Remise (% ou montant) | oui | si remises cumulées ≤ plafond × brut, sinon « Remise réservée au médecin » (défaut 0 %) |
| Gratuité totale | oui | refus, sauf motif `CONTROLE_GRATUIT` **et** consultation payée dans le délai (vérifié par Rust) |
| Identité professionnelle (écriture) | oui | refus (`save_json` interdit) ; lecture via `clinic_public_info` |
| Cachet : écriture / lecture pour impression | oui / oui | refus / oui (`identity_stamp`) |

Nouvelles commandes (`access::COMMAND_RULES`) : `tariff_grid` (AnySession), `tariff_act_save` (Medecin),
`tariff_act_set_active` (Medecin), `tariff_settings_save` (Medecin), `tariff_free_control_offer` (AnySession),
`tariffs_migrate` (Medecin), `identity_stamp_set` (Medecin), `identity_stamp` (AnySession),
`expense_receipt_add` (AnySession, correctif C3).

## 2. Correctif C3 — justificatif de l'assistante

L'assistante n'a toujours **pas** `attachment_add` (pièces jointes de patients). Nouvelle commande
`expense_receipt_add(data_base64, title)` (AnySession) : crée une pièce jointe chiffrée propriétaire `__cabinet__`
(type reconnu par le contenu, EXIF supprimé, 20 Mo) et renvoie son identifiant. `expense_add` accepte alors, pour
l'assistante, des `receiptIds` qui sont **ses** pièces du jour, pas encore rattachées à une dépense (vérifié par
Rust : `created_by` = sa session, `created_at` = aujourd'hui, absente de tout registre de dépenses). Le médecin
garde la règle actuelle. Elle ne peut ni lire ni supprimer un justificatif.

## 3. Migration

`tariffs_migrate` (médecin, à l'ouverture de session, après `payments_migrate`) : sous le verrou de
numérotation, toute note stockée sans `lines` reçoit une ligne libre « Honoraires » = son `totalAmount`
(`grossCents = netCents`, aucune remise ; `services` d'origine conservé). Avant d'écrire : sauvegarde
`migration_backups/pre-migration-…` (`users::backup_data_dir`), puis **contrôle** `Σ avant == Σ après` (centimes)
et `status`/`amountPaid` inchangés ; sinon rien n'est écrit. Idempotente. Les notes annulées sont migrées
de la même façon (champs ajoutés seulement).

## 4. Agrégats (`accounting_summary`)

Nouveaux champs : `grossInvoicedCents` (au tarif), `discountsCents`, `discountsByReason[{reason,cents,count}]`,
`freeCount` (notes de la période à net 0 avec remise), `invoicedCents` existant = **facturé net**. Notes annulées
exclues. Note sans `lines` : brut = net, remise 0. Le journal des recettes n'est pas concerné.
Interface : carte « Remises & gratuités » avec détail par motif.

## 5. Identité professionnelle

- Validation Rust (`identity.rs`), champs modifiés seulement : ICE = 15 chiffres exactement ; INPE, IF, TP =
  chiffres uniquement (pas de longueur imposée). Espaces, points et tirets sont retirés avant contrôle.
  Les autres champs sont facultatifs. Refus = message clair, rien n'est écrit.
- Bandeau « Identité professionnelle incomplète » (médecin) si INPE ou IF manquent.
- `scoped.rs` : `CLINIC_PUBLIC_FIELDS` gagne `ordreNumber`, `inpe`, `taxId`, `patente`, `ice` (lecture seule
  pour l'assistante, déjà imprimés sur tous les documents) ; ni RIB ni CNSS ; `IDENTITY_FIELDS` (patients)
  inchangé.
- Instantané `issuer` figé dans la note à l'émission ; une note ancienne ne change pas si l'adresse change.

## 6. Impression

Note d'honoraires (A4, `DocumentShell` conservé) : en-tête cabinet ; tableau (libellé, qté, P.U., remise, total) ;
sous-total brut, remises avec motif, net à payer, déjà payé, reste ; « Arrêtée la présente note à la somme de :
… » (Rust, `receipts::amount_in_words`) ; pied IF / TP / ICE / INPE ; cachet. Ligne gratuite : « Gratuit – motif ».
Reçu : mêmes mentions de pied, cachet, rappel brut/remises/net/payé/reste. Aucun accent doublement encodé (test d'encodage existant).

## 7. Tests

Rust (`tariff_tests.rs`, `identity.rs`, `accounting_tests.rs`, `expenses_tests.rs`) :

1. prix figé après changement de tarif ; 2. acte désactivé non sélectionnable ; 3. acte sans prix refusé ;
4. remise sans motif refusée ; motif « Autre » sans texte refusé ; 5. assistante au-delà du plafond refusée,
au plafond acceptée ; 6. gratuité assistante refusée sauf « Contrôle gratuit » (éligible) ; refusée si non
éligible ; 7. note à 0 DH : numérotée, statut `FREE`, hors « Reste à encaisser » ; 8. migration sans changement
de montant (somme avant = somme après) + sauvegarde + idempotence ; 9. agrégats brut / remises / net / par motif /
gratuités ; 10. montant en lettres (0, 1, 21, 71, 80, 81, 100, 200, 1 000, 1 100,50, 999 999,99) ; 11. ICE invalide
refusé, INPE/IF/TP non numériques refusés ; 12. assistante : ligne libre refusée, écriture de la fiche cabinet
refusée ; 13. justificatif assistante : ajouté, rattaché à sa dépense du jour, refus pour la pièce d'un autre / du
médecin / déjà rattachée ; `access_integration.rs` vert (commandes ajoutées).
Vitest : bandeaux, libellés, encodage. Puis `tsc`, `vitest`, `cargo test --lib` (`DOCEASE_TEST_MANIFEST=1`),
`npm run build`.

## 8. Ordre des commits

1. Plan. 2. Correctif C3. 3. `tariff.rs` (grille, lignes, remises, migration, statut Gratuit). 4. Identité
professionnelle. 5. Agrégats + reçu. 6. Interface (grille, note multi-lignes, facture rapide, caisse,
identité, carte remises). 7. Impression + vérification visuelle. 8. SECURITY.md + liste de tests manuels.

## 9. Tests manuels (à faire par l'utilisateur)

Jeu d'essai : Consultation 300 DH, ECG 200 DH, Contrôle 150 DH ; plafond assistante 10 % ; contrôle gratuit 14 jours.

| # | Scénario | Résultat attendu |
|---|---|---|
| R1 | Première ouverture, Paramètres › Cabinet › Tarifs des actes | 8 actes préchargés, **tous sans prix**, bandeau « Complétez vos tarifs » ; assistante : « Créer la note » inactif avec le message de compléter les tarifs. |
| R2 | Saisir 300 / 200 / 150 ; puis passer Consultation à 350 | Bandeau disparu ; ancienne note toujours **300,00 DH** ; nouvelle note **350,00 DH** ; historique des prix : 2 entrées. |
| R3 | Migration : noter le « Facturé » de la période avant la mise à jour | Après : **même montant au centime** ; chaque ancienne note = 1 ligne « Honoraires » ; un dossier `migration_backups/pre-migration-…` ; un second lancement n'en crée pas. |
| R4 | Note : Consultation + ECG, sans remise | Sous-total **500,00**, net **500,00**, « Cinq cents dirhams » ; 2 lignes à l'impression. |
| R5 | Remise 10 % « Confrère » sur Consultation | Remise **30,00**, net **470,00** ; sans motif : refus ; « Autre » sans texte : refus. |
| R6 | Assistante, plafond 0 % puis 10 % | 0 % : aucune remise proposée ; 10 % : remise 10 % acceptée (net **270,00**) ; 11 % : « Remise réservée au médecin ». |
| R7 | Médecin : ECG gratuit, motif « Famille / proche » | Ligne « Gratuit – Famille / proche », net **0,00**, statut **Gratuit**, numéro attribué, **absente du Reste à encaisser**. Assistante : gratuité non acceptée. |
| R8 | Contrôle gratuit : consultation payée il y a 7 j / non payée / payée il y a 15 j | 7 j : proposition avec la date, appliquée → **0,00** Gratuit ; non payée : aucune proposition ; 15 j : aucune proposition. |
| R9 | Comptabilité après R5 + R7 (Consultation 300 − 10 % ; ECG 200 gratuit) | Brut **500,00** ; remises **230,00** (Confrère 30,00 ; Famille 200,00) ; net **270,00** ; gratuités **1**. |
| R10 | Identité : ICE de 14 chiffres, INPE « 12AB » | Refus (« ICE : 15 chiffres exactement (14 saisis) », « INPE : chiffres uniquement ») ; ICE à 15 chiffres accepté ; sans INPE ou IF : bandeau « Identité professionnelle incomplète ». |
| R11 | Émettre une note (adresse A) ; changer l'adresse en B ; réimprimer | Ancienne note : adresse **A** ; nouvelle note : adresse **B**. |
| R12 | Impression de la note | En-tête, tableau (libellé, qté, P.U., remise, total), remises avec motif, net, déjà payé, reste, « Arrêtée la présente note à la somme de : … », pied IF / TP / ICE / INPE, cachet. |
| R13 | Reçu d'un paiement partiel de 100 DH sur la note de R5 | Rappel : note, brut **300,00**, remise **30,00**, net **270,00**, reste dû **170,00**, pied IF / TP / ICE / INPE, cachet. |
| R14 | Cachet : JPG avec GPS ; l'assistante imprime un reçu | Cachet imprimé sur la note et le reçu ; fichier chiffré sur le disque (aucun octet JPEG en clair) ; GPS absent. |
| R15 | Assistante : dépense 80,00 DH avec photo du ticket | Dépense enregistrée avec justificatif ; le médecin l'ouvre ; l'assistante ne peut pas supprimer le justificatif. |
| R16 | Assistante : Paramètres, ligne libre | Paramètres inaccessibles ; pas de bouton « Ligne libre » ; aucune édition de l'identité. |
| R17 | Sauvegarde puis restauration | Grille, prix, notes (lignes, remises) identiques ; compteur de notes non reculé. |
