# Comptabilité — audit et plan (à valider)

Branche : `feature/comptabilite`, créée depuis `feature/numerotation-notes` (dépend de la numérotation,
de l'annulation des notes et du statut payé calculé par Rust). Rien n'est fusionné : les tests T5 à T7
de la numérotation restent à faire côté utilisateur.

Date de l'audit : 08/10/2026. Aucun code applicatif modifié à ce stade.

## 0. Vérification des chiffres affichés (CA 1 400 · encaissé 1 300 · attente 100 · bénéfice 1 400)

### 0.1 Détail note par note : non produit, et pourquoi

Les notes sont dans `meddoc_honorary_notes.json`, **chiffré** (AES, clé dérivée du mot de passe /
phrase de récupération). Sans session déverrouillée, je ne peux pas les lire, et je ne contourne pas le
chiffrement ni ne lis `.env.local` pour me déverrouiller. Je n'invente donc aucune ligne.
Ce que le code permet d'affirmer avec certitude : la formule exacte qui produit les trois chiffres
(§0.2) ; le détail n° / patient / montant / payé / statut / annulée sera fourni :

- par le **Journal des recettes** (point 2, étape C2), qui affichera exactement ces lignes ;
- ou tout de suite, par un outil de diagnostic **lecture seule** (commande Rust `accounting_debug_notes`,
  médecin seulement, patients anonymisés « Patient A, B… », non livré en production) si vous le
  souhaitez : à confirmer, car cela ajoute du code.

### 0.2 Formule actuelle (`components/Analytics.tsx:213-233`)

Période « Jour » (onglet par défaut) = aujourd'hui. Notes retenues = `dataService.getHonoraryNotes()`
(= toutes les notes **sans** `cancelledAt`) dont `date` est dans la période.

- CA facturé = Σ `totalAmount` → **1 400**.
- Encaissé = Σ (`PAID` → `totalAmount` ; `PARTIAL` → `amountPaid` ; `UNPAID` → 0) → **1 300**.
- En attente = CA − encaissé → **100**.
- Bénéfice net = **CA facturé** − dépenses (`Analytics.tsx:232`) → 1 400 − 0 = **1 400**.

Cohérence : 1 400 / 1 300 / 100 sont arithmétiquement cohérents (0 dépense sur la période). Le chiffre
**faux dans l'intention** est le bénéfice : il compte 100 DH jamais reçus. Résultat correct pour ces
données : 1 300 − 0 = **1 300**.

### 0.3 Exclusion des notes annulées — contrôle

| Endroit | Source | Annulées exclues ? |
|---|---|---|
| Analytics : CA, encaissé, attente, bénéfice, taux de recouvrement, patients | `getHonoraryNotes()` | Oui |
| Analytics : graphique d'évolution + « Récapitulatif de période » | `getHonoraryNotes()` | Oui |
| Analytics : export CSV (totaux) | `getHonoraryNotes()` | Oui ; les n° annulés sont listés à part, hors totaux (`:361-366`) |
| Analytics : export PDF (`#fiscal-report-export`) | mêmes variables que l'écran | Oui, mais **ne mentionne pas** les annulées (CSV oui) |
| Tableau de bord médecin : CA du jour, mois, impayés, sparkline | `getHonoraryNotes()` | Oui |
| Dossier patient : onglet Finances (totaux) | `getAllHonoraryNotes` puis `!cancelledAt` | Oui (les lignes annulées restent visibles en gris) |
| Frise du patient (`timelineService`) | `getHonoraryNotes()` | Oui |
| Encaissement assistante (Rust `payments_today`, `apply_payment`) | `scoped.rs:143,176` | Oui, et modification refusée |
| Notifications d'impayés (Rust `unpaid_source.rs:10`) | `is_cancelled` | Oui |
| Émission de reçu (Rust `receipts.rs:371`) | `is_cancelled` | Refusée |
| Aperçu navigateur (`paymentService.listToday` hors Tauri) | `getHonoraryNotes()` | Oui |

Conclusion : l'exclusion est **correcte partout aujourd'hui**, mais elle repose sur un filtre côté
interface (`getHonoraryNotes`). Pour la comptabilité, les agrégats passeront par Rust (§3) avec le même
`numbering::is_cancelled`, pour ne plus dépendre de chaque écran.

### 0.4 Écarts constatés pendant la vérification (hors chiffres affichés)

1. **Bénéfice sur le facturé** au lieu de l'encaissé (à corriger, demande explicite).
2. **Le graphique « Recettes » trace le facturé**, pas l'encaissé.
3. **« Encaissé » est rattaché à la date de la note, pas à la date du paiement.** Une note du 02/10
   réglée le 08/10 compte dans la période du 02/10 et pas dans celle du 08/10. Pour une trésorerie, c'est
   faux. La note ne garde qu'un seul `amountPaid`, un seul `paymentMode`, aucune date de paiement
   (voir §2, décision D1).
4. Une note `PAID` compte `totalAmount` sans regarder `amountPaid` ; sans conséquence depuis que Rust
   calcule le statut, mais un reliquat de données anciennes `PAID` avec `amountPaid` inférieur serait
   surévalué. Le calcul Rust se fera sur `amountPaid` seul, plafonné au dû.
5. Les bornes de période comparent `new Date('AAAA-MM-JJ')` (UTC) à des bornes locales : fragile hors
   UTC+0/+1. Les comparaisons se feront sur des chaînes `AAAA-MM-JJ` côté Rust.

## 1. Audit de l'existant

Légende : Fait / Partiel / Absent. Fichier principal : `components/Analytics.tsx` (905 lignes, tout en
interface, calcul en JavaScript). Données : `meddoc_honorary_notes.json`, `meddoc_expenses.json`
(1 enregistrement, 185 octets en clair avant chiffrement : quasi vide), `meddoc_receipts.json` (registre
des reçus), `meddoc_invoice_counter.json`.

| # | Point | État | Constat, fichiers, données |
|---|---|---|---|
| 1 | Tableau de bord comptable | **Partiel** | `Analytics.tsx` : facturé, encaissé, attente, dépenses, « bénéfice » (sur le facturé, à corriger). Absents : comparaison période précédente (existe seulement sur le CA mensuel de `Dashboard.tsx:196`), nombre de consultations (le compteur « factures émises » existe dans le récapitulatif), montant moyen par consultation (existe « panier moyen » par **patient**, pas par consultation). Calcul côté interface. |
| 2 | Journal des recettes | **Absent** | Aucun tableau de recettes. `FinancesSection.tsx` liste les notes d'**un** patient. Mode de paiement : un seul champ par note (`CASH`/`CARD`/`TRANSFER`), **pas de chèque**. Pas de « prestation » unitaire (la note a `services[]`). Pas de totaux par mode. |
| 3 | Clôture de caisse | **Absent** | Aucune occurrence de « clôture / fonds de caisse » dans le code. `CashierView.tsx` (assistante) encaisse la journée, sans total ni clôture. |
| 4 | Dépenses par catégories | **Partiel** | `Expense` = `{id, date, category, categoryDetail, label, amount, receiptDataUrl, noReceiptConfirmed}`. 12 catégories de `EXPENSE_CATEGORIES` (`types.ts`), dont « Électricité/eau/téléphone/internet » regroupés ; manquent : CNSS, salaires, loyer, consommables, entretien, cotisations Ordre, déplacements selon votre liste. Absents : fournisseur, mode de paiement, statut payé / date de paiement. **Justificatif = image en base64 dans le JSON** (`receiptDataUrl`), pas via les pièces jointes chiffrées ; alourdit le fichier et la sauvegarde. **Suppression définitive** (`deleteExpense`), sans trace. Aucun contrôle côté Rust (écriture via `save_json` générique). |
| 5 | Dépenses récurrentes | **Absent** | |
| 6 | Impayés par ancienneté | **Partiel** | Tableau de bord : carte « factures à régulariser » (total + nombre). Notifications d'impayés Rust (`unpaid_source.rs`). Pas de tranches < 30 / 30–60 / > 60 j ni liste par patient. |
| 7 | Rapports mensuel / annuel | **Partiel** | PDF « Récapitulatif fiscal » (html2pdf.js, **image** de la page, non sélectionnable, sans dépenses détaillées par mois) et CSV `;` (pas de `.xlsx`). Contient recettes, dépenses par catégorie, n° des notes annulées (CSV seulement). Absent : contrôle de la numérotation (existe dans Paramètres : `NumberingCard`, `invoice_numbering_check` Rust, à réutiliser). Aucune lib `.xlsx` dans `package.json` ni `Cargo.toml`. |
| 8 | Grille tarifaire par acte | **Partiel** | `HonoraryMasterService` (`dataService.getHonoraryMasterServices`) : 7 actes par défaut, utilisés dans l'éditeur de note. À compléter (ECG, écho, Holter, contrôle) et à proposer partout. |
| 9 | Gratuités et réductions | **Absent** | Pas de champ remise / motif ; une gratuité est aujourd'hui une note à 0 ou un montant modifié, invisible dans les statistiques. |
| 10 | Immobilisations / amortissements | **Absent** | |
| 11 | Dépôts d'espèces en banque | **Absent** | |
| — | Tiers payant | **Absent** (plus tard) | |
| — | Rôles | **Partiel** | Menu Comptabilité = permission `VIEW_FINANCES` (médecin) : filtré par l'**interface**. Côté Rust, l'assistante ne lit ni notes ni dépenses (`ASSISTANT_FILES`) : bon. Mais aucune commande Rust de comptabilité n'existe : tout le calcul et les écritures d'argent se font en JS puis `save_json`. |
| — | Journal d'audit | **Fait** | `audit.rs` (journal append-only) à réutiliser pour clôtures, dépenses annulées. |
| — | Sauvegarde | **Fait** | Tout fichier `meddoc_*.json` est sauvegardé (`backup.rs:173`) : les nouveaux fichiers sont couverts, à tester. |
| — | Design | **À corriger** | `Analytics.tsx` : 64 occurrences de `font-black` / `uppercase` / `tracking-widest` (titres, onglets, boutons, libellés, en-têtes de tableau), couleurs `emerald` en dur et rayons 3rem, contraires à la charte v3 (tokens `variables.css`, Inter). Même problème ailleurs (471 occurrences dans 48 fichiers) : on ne traite ici que la Comptabilité. |

## 2. Décisions à confirmer

| # | Décision | Proposition | Pourquoi |
|---|---|---|---|
| D1 | **Date des encaissements** | Nouveau **registre d'encaissements en ajout seul** (`meddoc_payments.json`, chaîné par empreintes comme les reçus), écrit par Rust à chaque variation de `amountPaid` : date, heure, note, montant (centimes), mode (espèces / chèque / virement / carte), auteur. Migration : une ligne d'ouverture par note déjà payée (date de la note, mode de la note), signalée « reprise ». | Seul moyen d'avoir un encaissé **par date de paiement et par mode** fiable (paiements partiels en deux modes, règlement tardif). Le registre des reçus ne peut pas servir : un reçu n'est pas obligatoire à chaque encaissement. |
| D2 | Résultat | **Encaissé − dépenses payées** (date de paiement). Le CA facturé est affiché à part, jamais dans le résultat. | Votre demande. |
| D3 | Espèces théoriques de la clôture | fonds de caisse + encaissements **espèces** du jour − dépenses payées **en espèces** du jour − dépôts en banque du jour (étape 11). | Sans les dépenses en espèces, l'écart serait systématique. |
| D4 | Fonds de caisse | Proposé = espèces comptées de la dernière clôture, modifiable ; une modification demande un commentaire. | Évite de ressaisir, garde une trace. |
| D5 | Dépenses | Plus de suppression : **annulation avec motif** (comme les notes), montants en centimes entiers, validation de la catégorie par Rust. | Cohérent avec la numérotation ; une comptabilité ne s'efface pas. |
| D6 | Justificatifs | Via les **pièces jointes chiffrées** (`attachments.rs`) avec un propriétaire « dépense » au lieu d'un `patientId` ; reprise des `receiptDataUrl` existants. | Demandé ; sort le base64 du JSON. |
| D7 | `.xlsx` | Génération **côté Rust** (crate `rust_xlsxwriter`) et enregistrement via boîte de dialogue ; PDF **texte** (pas image) sans nouvelle dépendance si possible (à vérifier : `jspdf` n'est pas dans le projet, `html2pdf.js` oui). | Données chiffrées : le fichier n'est créé qu'à la demande du médecin. À valider avant d'ajouter une crate. |

## 3. Architecture

- **Rust propriétaire des chiffres** : nouveau module `src-tauri/src/accounting.rs` (médecin seulement)
  avec agrégats `accounting_summary(period)`, `accounting_journal(filters)`, `accounting_aging()`.
  Mêmes filtres (`is_cancelled`), comparaison de dates en chaînes `AAAA-MM-JJ`, montants en centimes
  entiers (pas de virgule flottante). L'interface n'affiche que ce qui est renvoyé.
- **Fichiers réservés** dans `access.rs` (`RESERVED_STEMS`, ni `load_json` ni `save_json`, aucun rôle) :
  `meddoc_payments`, `meddoc_expenses` (une fois migré), `meddoc_cash_closings`,
  `meddoc_recurring_expenses`. Tous `meddoc_*.json` donc inclus dans la sauvegarde.
- **Rôles** : commandes `accounting_*`, `expense_*` : médecin seulement (ajoutées à la liste
  `MEDECIN_ONLY` du test de `access.rs`). Assistante : `cash_day_summary` (caisse **du jour** seulement,
  montants du jour, sans historique ni CA) et `cash_close` (clôture du jour, refus pour une autre date).
  Médecin : `cash_history` (clôtures, écarts).
- **Clôture** : registre en ajout seul, chaîné par empreintes (`receipts.rs` comme modèle) ; champs :
  date, fonds de caisse, théorique **calculé par Rust**, compté, écart (calculé par Rust), commentaire
  (obligatoire si écart ≠ 0, refusé sinon vide), clôturé par, à. Une seule clôture par jour ; la
  correction est une **nouvelle écriture** de type `correction` qui référence la première.
  Après clôture, une dépense ou un encaissement daté du jour est refusé par Rust (« caisse clôturée »)
  sauf écriture de correction du médecin.
- **Audit** : chaque clôture, annulation de dépense, confirmation de récurrente est journalisée.
- **Interface** : `Analytics.tsx` éclaté en `components/accounting/` (Tableau de bord, Recettes, Dépenses,
  Caisse, Impayés, Rapports) ; sans calcul d'argent, sans majuscules forcées ni `font-black`/`extrabold`
  (poids 400/500/600, casse normale, tokens `variables.css`). L'ancien onglet « Patients » devient
  une section des statistiques.
- **Tests** : Rust (`accounting_tests.rs`) pour chaque règle : annulées exclues, encaissé par date de
  paiement, partiel en deux modes, écart, clôture non modifiable, assistante refusée, dates hors jour ;
  Vitest pour les composants (aucun calcul, libellés en casse normale).

## 4. Ordre d'implémentation proposé

Chaque étape : commit séparé, tests Rust + Vitest verts, avant la suivante.

| Étape | Contenu | Points |
|---|---|---|
| C0 | Correction immédiate : résultat = encaissé − dépenses, CA affiché à part ; annulées mentionnées dans le PDF ; titres/onglets sans extra-bold ni majuscules. Petit correctif, livrable seul. | 1 (partie), design |
| C1 | Registre d'encaissements (D1) : mode `CHEQUE`, écriture Rust à chaque variation de `amountPaid`, migration des notes existantes, intégration au chemin assistante (`apply_payment`) et à la facture rapide. | base de 2, 3 |
| C2 | `accounting_summary` / `accounting_journal` (Rust) ; tableau de bord (facturé, encaissé, à percevoir, dépenses, résultat, période précédente, nombre et moyenne par consultation) ; **Journal des recettes** avec filtres et totaux par mode. | 1, 2 |
| C3 | Dépenses côté Rust : catégories de votre liste, fournisseur, mode, date de paiement, annulation avec motif, justificatifs en pièces jointes chiffrées, migration de `meddoc_expenses.json`. | 4 |
| C4 | Clôture de caisse (D3, D4), vue assistante et historique médecin. | 3 |
| C5 | Impayés par ancienneté. | 6 |
| C6 | Dépenses récurrentes à confirmer (jamais enregistrées sans clic). | 5 |
| C7 | Rapports mensuel / annuel PDF + `.xlsx` (recettes, dépenses par catégorie, annulées, contrôle de numérotation). | 7 |
| C8+ | Grille tarifaire proposée dans les notes ; gratuités / réductions avec motif ; immobilisations ; dépôts en banque (réinjectés dans D3) ; tiers payant en dernier. | 8 à 11 |

Raison de l'ordre : C1 avant tout (sans date de paiement, le journal, la clôture et les rapports
seraient faux) ; C3 avant C4 (les dépenses en espèces entrent dans l'espèce théorique) ; C7 après les
données qu'il restitue.

## 5. Hors périmètre / risques

- Les 471 usages de `font-black` / `uppercase` du reste de l'application ne sont pas traités ici.
- Migration C1 : les notes déjà payées n'ont pas de date de paiement réelle ; la ligne d'ouverture
  prend la date de la note (inexactitude connue, étiquetée « reprise » dans le journal).
- Données de test : `meddoc_expenses.json` est quasi vide, donc la migration C3 est peu risquée ici,
  mais sera testée avec des justificatifs base64 réels.
- T5 à T7 de la numérotation (à faire par vous) restent un prérequis avant toute fusion.

## 6. Décisions validées (08/10/2026)

- Pas d'outil de diagnostic : le Journal des recettes (C2) donnera le détail des notes.
- **D1 validée** : registre d'encaissements en ajout seul (date du paiement, montant, mode, auteur, note
  liée). Migration : chaque note déjà payée ou partielle → un encaissement daté de la date de la note,
  avec le mode existant, marqué « migré ». Remboursement à un patient = écriture **négative**, motif
  obligatoire, jamais une modification. Le statut payé / partiel d'une note est **calculé par Rust depuis
  ce registre**.
- **D3 validée, étendue à tous les mouvements d'espèces** :
  théorique = fonds de caisse + encaissements espèces − dépenses payées en espèces − dépôts en banque
  − prélèvements du médecin − remboursements espèces + apports.
  Chaque mouvement : type, montant, date, auteur, motif ; ajout seul. Prélèvement : médecin seulement.
- **D7 validée** : `rust_xlsxwriter` pour le `.xlsx`.
- Ordre C0 → C7 validé ; C1 avant le reste.
- **C0** : Résultat = encaissé − dépenses payées, libellé « Résultat (encaissé − dépenses) », facturé
  affiché à part ; notes annulées listées à part dans le PDF comme dans le CSV ; bornes de période en
  heure locale (`utils/localDate`) ; graphique encaissé + dépenses (facturé en option) ; design : seul
  `Analytics.tsx` (titres, onglets) ; la correction globale (471 occurrences, 48 fichiers) sera une
  étape séparée plus tard.
- Arrêt après C1 pour les tests de l'utilisateur. Aucune fusion avant les tests T5–T7 de la numérotation.
