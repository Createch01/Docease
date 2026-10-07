# Reçu de paiement — plan détaillé (à valider)

Branche : `feature/recu` (depuis `main`, après fusion de `feature/pieces-jointes`). Spécification :
numérotation séquentielle annuelle **attribuée par Rust**, montant **en chiffres et en lettres**,
**jamais de diagnostic** sur le document, **duplicata**, **annulation par reçu d'annulation**.

## 0. Constats dans le code (ils déterminent le plan)

1. **La numérotation actuelle n'est pas fiable.** Trois endroits calculent `invoiceNumber` par
   comptage : `HonoraryNoteEditor.handleSave` (JS, `notesThisYear.length + 1`),
   `billingService.generateInvoiceNumber` (JS) et `scoped::apply_payment` (Rust,
   `count + 1`). Si une note est supprimée, le numéro suivant réutilise un numéro déjà émis ; si
   deux chemins écrivent le même jour, deux notes peuvent porter le même numéro. **Un reçu ne
   peut pas reposer sur ce mécanisme** : il lui faut un compteur propre, jamais décrémenté.
   (Les notes d'honoraires gardent leur numérotation actuelle dans cette branche : voir §10.)
2. **Les notes sont modifiables et supprimables** (`meddoc_honorary_notes.json` passe par
   `save_json` pour le médecin). Un reçu est une pièce comptable : il doit être **immuable** et
   survivre à la suppression de la note qui l'a produit.
3. **Les montants sont des `f64`** (`totalAmount`, `amountPaid`) et `utils/numberToWords.ts`
   contient des erreurs d'orthographe des nombres (vérifiées en lisant le code) :
   `200 000` → « deux cents mille » (doit être « deux cent mille »), `80 000` → « quatre-vingts
   mille » (« quatre-vingt mille »), `91` → « quatre-vingt-et-onze » (« quatre-vingt-onze »).
   **Le montant en lettres d'un reçu sera donc produit par Rust, avec des tests**, pas par cette
   fonction. Monnaie : dirham (DH / MAD), centimes.
4. **L'assistante encaisse déjà** (`billing_today_save`, règle `AnySession`) : elle a besoin de
   remettre un reçu au patient, sans accéder à aucune donnée médicale.
5. Un encaissement partiel (`PARTIAL`) n'est aujourd'hui qu'un montant cumulé sur la note : il n'y
   a **pas d'événement de versement**. Un reçu atteste un versement précis, donc le montant d'un
   reçu = ce qui a été encaissé sur la note et pas encore couvert par un reçu valide (§2).
6. `meddoc_*.json` est inclus dans la sauvegarde (`backupCoverage.test.ts` le vérifie) : le registre
   des reçus sera sauvegardé sans travail supplémentaire. La restauration est le seul point
   dangereux pour un compteur (§5).

## 1. Décisions proposées (à confirmer)

| # | Décision | Valeur proposée | Pourquoi |
|---|---|---|---|
| D1 | Format du numéro | `REC-AAAA-NNNN` (compteur par année, 4 chiffres, au-delà : 5) | Lisible, distinct du numéro de note (`AAAA-NNNN`). |
| D2 | Une seule suite pour reçus et reçus d'annulation | **Oui** | La suite reste continue et ordonnée dans le temps ; un trou ne peut venir que d'un défaut, donc se détecte. |
| D3 | Qui émet / réimprime | Médecin **et** assistante, pour les paiements du **jour** (assistante) ; tout paiement (médecin) | Constat 4. Le reçu ne contient aucune donnée médicale. |
| D4 | Qui annule | **Médecin seulement**, motif obligatoire | Acte comptable sensible. |
| D5 | Libellé de la prestation | « Consultation médicale » par défaut ; option Paramètres « Détailler les actes » (désactivée) reprend les **noms de prestations de la note** | Le médecin décide ; aucun texte venant d'une consultation, d'une ordonnance ou d'un résultat n'entre jamais. |
| D6 | Intégrité du registre | Chaînage d'empreintes SHA-256 (chaque entrée contient l'empreinte de la précédente) + commande de vérification | Détecte une entrée modifiée, retirée ou insérée dans le fichier. Ne remplace pas une valeur légale (l'utilisateur d'un poste local peut tout reconstruire) : à écrire dans `SECURITY.md`. |
| D7 | Annulation et paiement de la note | L'annulation **ne modifie pas** la note ; elle libère le montant, qui peut être ré-émis (erreur de saisie) | Évite un couplage dangereux ; un remboursement se saisit comme aujourd'hui sur le paiement. |
| D8 | Mentions légales du cabinet (ICE, identifiant fiscal, n° d'ordre…) | Champ optionnel « Mentions légales » dans Cabinet, imprimé en pied de reçu | Je ne connais pas les mentions exigées pour votre cabinet : **à fournir**, rien d'inventé. |
| D9 | Format d'impression | A5 portrait (demi-feuille), PDF via le mécanisme actuel (`html2canvas` + `jsPDF`) | Un reçu tient sur une demi-page ; réutilise `DocumentShell`, cachet et signature du médecin. |

## 2. Registre (Rust, `src-tauri/src/receipts.rs`)

- Fichier `meddoc_receipts.json` (chiffré comme les autres, **inclus dans la sauvegarde**), liste
  **append-only** d'entrées. Ajouté aux `RESERVED_STEMS` de `access.rs` : ni `load_json` ni
  `save_json`, pour aucun rôle. Seules les commandes typées l'écrivent.
- Compteur `meddoc_receipt_counter.json` : `{ year, last }`. **Prochain numéro = max(compteur,
  plus grand numéro de l'année dans le registre) + 1**, sous un verrou (`Mutex`) : deux émissions
  simultanées n'obtiennent jamais le même numéro. Nouvelle année (horloge locale de Rust,
  `util::today_local`) → repart à 1. L'interface ne fournit **ni année, ni numéro, ni montant en
  lettres, ni date**.
- **Ordre d'écriture** : 1) registre (avec la nouvelle entrée), 2) compteur. Un plantage entre les
  deux laisse un compteur en retard, corrigé par la règle du `max`. Jamais un numéro attribué sans
  entrée, jamais deux entrées de même numéro.
- Horloge : une émission datée **avant** la dernière entrée du registre est refusée avec un
  message clair (« date système antérieure au dernier reçu émis »).
- Entrée `receipt` : `{ kind, number, seq, year, issuedAt, issuedBy, noteId, patientId,
  patientName, amountCents, amountInWords, paymentMode, label, balanceDueCents, prevHash,
  hash }`.
  - `amountCents` : entier (aucun `f64` dans le registre). Conversion depuis la note avec contrôle :
    montant > 0, ≤ 10 000 000, au plus 2 décimales.
  - `patientName` : copie figée à l'émission (le reçu reste identique si le patient est renommé).
  - `label` : D5. `balanceDueCents` : reste dû sur la note après ce versement (0 si soldé).
  - **Liste blanche stricte** : la structure n'a aucun champ libre, aucun `prescriptionId`, aucune
    consultation, aucun diagnostic. Rust refuse d'émettre pour une note sans patient existant.
- **Montant d'un reçu** = `amountPaid` de la note − somme des reçus valides (non annulés) de cette
  note. Doit être > 0, sinon « rien à reçuer ». Un paiement partiel puis un solde donnent donc
  deux reçus, chacun pour son versement.
- Entrée `cancellation` : même suite de numéros ; `{ cancelsNumber, reason, amountCents (négatif),
  amountInWords ("moins …"), … }`. Règles : reçu existant, **valide** (pas déjà annulé, pas lui-même
  un reçu d'annulation), motif obligatoire (3 à 200 caractères), médecin seulement. Le reçu
  d'origine n'est **jamais modifié** : son statut « annulé » est déduit du registre.
- Entrée `duplicate` : `{ number: <reçu>, n: <rang du duplicata>, printedAt, printedBy }`, chaînée
  aussi. N'attribue **aucun nouveau numéro**.

### Montant en lettres (Rust)

Fonction pure `amount_in_words(cents)` : orthographe rectifiée avec traits d'union
(« vingt-et-un », « quatre-vingt-onze », « deux cent mille », « quatre-vingts dirhams » mais
« quatre-vingt mille dirhams »), « un dirham » / « deux dirhams », « et cinquante centimes »,
zéro dirham (« zéro dirham et cinquante centimes ») et négatif (« moins … »). Jusqu'à
10 000 000,00. Tableau de tests exhaustif (0 à 100, 101…, 1 000, 1 001, 71, 80, 81, 91, 99, 200,
201, 1 000 000, bornes).

## 3. Commandes Tauri

| Commande | Règle | Rôle |
|---|---|---|
| `receipt_issue(noteId)` | AnySession | Émet le reçu du versement non couvert. Renvoie l'entrée. Assistante : note du jour seulement. |
| `receipt_list(patientId?)` | Medecin | Registre (reçus, annulations, état « valide / annulé »). |
| `receipt_list_today` | AnySession | Reçus du jour (vue assistante : numéro, patient, montant, état). |
| `receipt_get(number)` | AnySession (jour pour l'assistante) | Entrée figée, pour la visualisation. |
| `receipt_duplicate(number)` | AnySession (jour pour l'assistante) | Enregistre un duplicata (rang n) et renvoie l'entrée pour impression. |
| `receipt_cancel(number, reason)` | Medecin | Émet le reçu d'annulation. |
| `receipts_verify` | Medecin | Contrôle : chaîne d'empreintes, suite continue sans trou ni doublon, compteur ≥ dernier numéro. |

Test d'accès existant (parcours de `generate_handler!`) étendu. Journal d'accès :
`receipt_issue`, `receipt_duplicate`, `receipt_cancel` avec le **numéro** seulement (jamais le
nom, le montant ni le motif).

## 4. Impression (interface)

- `components/ReceiptTemplate.tsx` (sur `DocumentShell`) : en-tête du cabinet, « REÇU DE PAIEMENT
  n° REC-2026-0042 », date, patient, **« Reçu la somme de 250,00 DH (deux cent cinquante
  dirhams) »**, mode de paiement, libellé (D5), reste dû si > 0, mentions légales (D8), cachet et
  signature. Aucune autre donnée de santé ; le gabarit ne reçoit que l'entrée figée du registre
  (il ne lit ni patient, ni consultation).
- **Duplicata** : même contenu, bandeau « DUPLICATA n° 2 — imprimé le … » ; jamais présenté comme
  un original.
- **Reçu annulé** (réimpression) : filigrane « ANNULÉ — voir REC-… ». **Reçu d'annulation** :
  « REÇU D'ANNULATION n° … — annule le reçu n° … du … », montant négatif en chiffres et en lettres,
  motif.
- Nom du fichier : `Recu_REC-2026-0042.pdf` (sans nom de patient).

## 5. Sauvegarde, restauration

- Registre et compteur sont des `meddoc_*.json` : sauvegardés. Un test vérifie leur présence dans la
  couverture (`backupCoverage.test.ts`).
- **Risque propre au compteur** : restaurer une sauvegarde plus ancienne ferait repartir le
  compteur en arrière et **réutiliser des numéros déjà remis à des patients**. Mesure : à la
  restauration, Rust conserve `max(compteur restauré, compteur du poste avant restauration)` et
  l'ancien registre reste dans la copie de sécurité. Le rapport de restauration affiche « Dernier
  reçu restauré : REC-… » et, si le poste en avait émis de plus récents, « N reçus émis après cette
  sauvegarde ne sont plus dans le registre (copie de sécurité conservée) ».

## 6. Interface

- **Caisse (assistante) et fiche d'encaissement** : après enregistrement d'un paiement, bouton
  « Reçu » (émet puis ouvre l'aperçu / impression) ; un second clic sur un paiement déjà reçu
  propose « Duplicata », jamais un nouveau numéro.
- **Dossier patient › Finances (médecin)** : colonne « Reçu » (numéro, état), actions Duplicata et
  Annuler (fenêtre : motif obligatoire, rappel « un reçu d'annulation sera émis, le reçu d'origine
  est conservé »).
- **Paramètres › Cabinet** : mentions légales (D8) ; option « Détailler les actes sur le reçu »
  (D5).
- **Paramètres › Registre des reçus (médecin)** : bouton « Vérifier le registre » (`receipts_verify`)
  avec résultat clair.
- Alerte rouge dans « À faire » (source reçus, médecin seulement) si `receipts_verify` détecte
  une rupture (numéro manquant, doublon, empreinte invalide), jusqu'à résolution.

## 7. Tests

- **Rust** : suite continue sous 200 émissions ; deux threads simultanés sans doublon ;
  remise à 1 au changement d'année ; reprise après plantage simulé (registre écrit, compteur non) ;
  numéro jamais réutilisé après annulation ; date antérieure refusée ; montant d'un reçu = payé −
  reçus valides (paiement partiel puis solde = deux reçus) ; « rien à reçuer » ; annulation :
  une seule fois, pas sur un reçu d'annulation, motif obligatoire, médecin seulement, reçu
  d'origine intact ; duplicata sans nouveau numéro, rang croissant ; **aucun diagnostic** :
  note portant des champs médicaux et ordonnance liée → l'entrée sérialisée ne contient exactement
  que les champs de la liste blanche ; libellé D5 ; `amount_in_words` (tableau exhaustif, §2) ;
  conversion en centimes (0,1 + 0,2, 12,345 refusé) ; chaîne d'empreintes : entrée modifiée,
  retirée ou insérée détectée par `receipts_verify` ; registre refusé à `load_json` / `save_json`
  (médecin et assistante) ; assistante refusée sur annulation / liste complète / vérification, et
  limitée au jour ; journal sans nom ni montant ; restauration : compteur jamais en arrière.
- **vitest** : le gabarit n'affiche que les champs de l'entrée figée (aucun champ médical dans les
  props) ; mentions DUPLICATA / ANNULÉ ; montant négatif ; garde-fou « aucun numéro ou montant en
  lettres calculé côté interface » ; couverture de sauvegarde.
- Chaque commit : `tsc`, `vitest`, `cargo test --lib` (`DOCEASE_TEST_MANIFEST=1`), build.

## 8. Commits (une branche, vérification de la branche avant chacun)

1. `receipts.rs` : registre, compteur, montant en lettres, émission, chaînage, tests Rust.
2. Annulation, duplicata, vérification, règles d'accès, journal, tests.
3. Restauration (compteur jamais en arrière), couverture de sauvegarde, alerte « À faire ».
4. Service interface + `ReceiptTemplate` (reçu, duplicata, annulé, annulation).
5. Boutons Caisse / Finances, réglages (mentions légales, détail des actes, vérification),
   `SECURITY.md`.

## 9. Questions ouvertes (réponses nécessaires avant le premier commit)

1. D3 : l'assistante peut-elle émettre et réimprimer un reçu (jour seulement) ?
2. D8 : quelles mentions légales doivent figurer (ICE, identifiant fiscal, n° d'inscription à
   l'Ordre…) ?
3. D5 : détail des actes sur le reçu : désactivé par défaut vous convient-il ?
4. D1 : le préfixe `REC-` vous convient-il, ou souhaitez-vous le numéro nu `AAAA-NNNN` ?

## 10. Hors périmètre (étapes suivantes)

Correction de la numérotation par comptage des **notes d'honoraires** (constat 1 : même allocateur
Rust à réutiliser, avec une migration qui ne renumérote jamais une note déjà émise) ; envoi du reçu
par WhatsApp ; reçus pour les remboursements automatiques ; export comptable du registre.
