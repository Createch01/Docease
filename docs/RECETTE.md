# Cahier de recette DocEase — branche `feature/comptabilite`

**Avant de commencer : lancer `scripts/dev-snapshot.ps1 avant-recette`** (DocEase fermé). Cela copie vos données de test ; rien n'est supprimé.

```powershell
powershell -File scripts\dev-snapshot.ps1 avant-recette
```

Durée : **2 séances d'environ 1 h**. Cocher `[x]` la case choisie. Une remarque, même courte, aide à corriger.

- **[AUTO]** = déjà vérifié par un test automatique. Un coup d'œil suffit (≈ 1 min), ne pas refaire tout le scénario.
- « Médecin » / « Assistante » = le compte à utiliser. Sans précision : médecin.
- Les montants sont en dirhams (DH). Dites « le jour » = aujourd'hui.

**Jeu d'essai** (à créer au fil des tests) : tarifs Consultation **300**, ECG **200**, Contrôle **150** (Paramètres › Cabinet › Tarifs des actes). Deux patients : *Patient A* et *Patient B*.

| Note | Contenu | Paiements prévus |
|---|---|---|
| N1 | Consultation 300 | 300 espèces |
| N2 | Consultation + ECG = 500 | 200 espèces, puis 300 par chèque |
| N3 | Contrôle 150 | 150 espèces |
| N4 | Consultation 300 | 100 espèces, puis 200 espèces |

---

# SÉANCE 1 — Sauvegarde, recettes, paiements, reçus (≈ 1 h)

## Partie A — Sauvegarde obligatoire (≈ 15 min)

### A1 — Premier lancement sans sauvegarde
*Préalable : sauvegarde jamais configurée (c'est le cas de ces données). Compte médecin.*
1. Ouvrir DocEase et déverrouiller.
2. Cliquer **Plus tard** dans la fenêtre « Protégez vos données ».
3. Aller sur Tableau de bord, Patients, Comptabilité, Paramètres.
4. Verrouiller puis rouvrir la session.

**Attendu :** (1) la fenêtre « Protégez vos données — Étape 1 sur 3 » s'ouvre, avec un bandeau rouge derrière. (2) Elle se ferme. (3) Le bandeau rouge « Vos données ne sont pas sauvegardées… » reste en haut de **chaque** écran. (4) La fenêtre revient.

[ ] OK  [ ] KO   Remarque : ______________________

### A2 — Carte rouge dans les Paramètres
1. Paramètres › Base de données.
2. Regarder « Sauvegarder maintenant ».
3. Cliquer **Configurer maintenant** dans la carte rouge.

**Attendu :** « Sauvegarder maintenant » est grisé avec une explication en rouge. La page défile jusqu'à « Phrase de passe de sauvegarde », entourée d'un cadre rouge pendant ~2 secondes.

[ ] OK  [ ] KO   Remarque : ______________________

### A3 — Configuration complète
1. Phrase de passe de 12 caractères ou plus, confirmation, cocher la case, **Définir**. Fermer la fiche de secours (ou l'imprimer).
2. Choisir un dossier principal **hors** du dossier de données (ex. `D:\Sauvegardes`).
3. Ajouter un second emplacement sur un autre disque / une clé.
4. **Lancer la première sauvegarde** (ou « Sauvegarder maintenant »).

**Attendu :** bandeau rouge disparu ; carte verte « Dernière sauvegarde : à l'instant ✓ ». Dans chaque emplacement, un dossier `DocEase-Sauvegardes` contient un fichier `docease-AAAAMMJJ-HHMMSS.dcb`. Avec un seul emplacement, une alerte orange demande d'en ajouter un second.

[ ] OK  [ ] KO   Remarque : ______________________

### A4 — [AUTO] Bandeaux selon l'état et le rôle
*Couvert par le test `health_reports_unconfigured_fresh_and_stale…` et vu à l'écran.* Coup d'œil seulement : session **assistante** sans sauvegarde configurée = bandeau rouge d'information « Prévenez le médecin », sans bouton. Plus de 3 jours sans sauvegarde = bandeau orange.

[ ] OK  [ ] KO   Remarque : ______________________

### A5 — Restauration : les numéros ne reculent jamais (reprise de T7)
*À faire **après** la partie B (il faut des notes). Revenir ici ensuite.*
1. Noter le numéro de la dernière note (ex. N1) et du dernier reçu.
2. Paramètres › Base de données › **Sauvegarder maintenant**.
3. Créer une note de plus (N5, 100 DH, payée) et émettre son reçu. Noter les deux numéros.
4. Restaurer la sauvegarde de l'étape 2 (choisir la date, phrase de passe, taper RESTAURER). Recharger.
5. Créer une nouvelle note, un nouveau reçu et une dépense.

**Attendu :** la note N5 a disparu de la liste. Les **nouveaux** numéros sont plus grands que ceux de l'étape 3 (jamais réutilisés ; un trou dans la suite est normal). Les tarifs, les prix et les remises sont identiques à avant. Paramètres › Cabinet › contrôle des encaissements et des reçus : aucune anomalie.

[ ] OK  [ ] KO   Remarque : ______________________

## Partie B — Encaissements, journal, période (≈ 20 min)

### B1 — Paiement complet (N1)
*Patient A, consultation 300 → créer la note → encaisser 300 espèces.*

**Attendu :** statut **Réglé**. Comptabilité › Journal des recettes : une ligne du jour, **300,00**, Espèces, votre nom.

[ ] OK  [ ] KO   Remarque : ______________________

### B2 — Paiement en deux fois, avec reçus (N2)
1. Patient B, Consultation + ECG : **500,00**. Encaisser **200** espèces. Émettre le reçu.
2. Encaisser le complément **300** par **Chèque**. Émettre le reçu.

**Attendu :** après l'étape 1 : statut **Partiel**, reste **300,00**, reçu de **200,00** « reste dû 300,00 ». Après l'étape 2 : **Réglé**, reçu de **300,00** « reste dû 0,00 ». Deux reçus numérotés à la suite (REC-AAAA-NNNNN). Journal : deux lignes (200 Espèces, 300 Chèque).

[ ] OK  [ ] KO   Remarque : ______________________

### B3 — Remboursement partiel
Sur N1 : **Rembourser** 50 DH, espèces, motif « Erreur de montant ».

**Attendu :** ligne **négative** −50,00 dans le journal (rouge), avec le motif. N1 passe à **Partiel**, reste à payer **50,00**. Les paiements d'origine ne bougent pas.

[ ] OK  [ ] KO   Remarque : ______________________

### B4 — Journal des recettes : chiffres
Période « Jour ». Comptabilité › Journal des recettes.

**Attendu :** encaissé brut **800,00** (3 paiements), remboursements **50,00**, net **750,00** ; par mode : Espèces **450,00**, Chèque **300,00**. Sous-total du jour = net. Les filtres (mode, type) réduisent la liste.

[ ] OK  [ ] KO   Remarque : ______________________

### B5 — Tableau de bord comptable
**Attendu :** « Encaissé » = **750,00** ; « Reste à encaisser » = **50,00** (N1) ; « Résultat » = encaissé − dépenses (sans dépense pour l'instant : 750,00). Le « Facturé » (800,00 : N1 300 + N2 500) est affiché à part.

[ ] OK  [ ] KO   Remarque : ______________________

### B6 — Sélecteur de période
1. Cliquer Jour, Semaine, Mois, Année, Personnalisée (deux dates).
2. Utiliser ‹ et › puis **Aujourd'hui**.
3. Changer d'écran de Comptabilité puis revenir.

**Attendu :** les chiffres suivent la période choisie. ‹ › avancent d'un jour / d'une semaine (lundi à dimanche) / d'un mois / d'une année. « Aujourd'hui » revient au jour courant. Le choix est gardé pendant la session. Rien ne déborde du cadre.

[ ] OK  [ ] KO   Remarque : ______________________

## Partie C — Reçus, motifs, annulations (≈ 25 min)

### C1 — Motifs d'annulation en liste
Ouvrir successivement : Rembourser (B3 déjà fait), Annuler une note, Annuler une dépense *(partie D)*, Corriger un reçu.

**Attendu :** liste « Choisir un motif… » avec exactement : Doublon, Erreur de montant, Erreur de patient, Erreur de mode de paiement, Demande du patient, Autre. Pour « Autre » : le bouton reste grisé tant que la précision fait moins de **10 caractères** (compteur « Encore N caractère(s) »). Le motif « Erreur de montant » de B3 est resté tel quel dans le journal.

[ ] OK  [ ] KO   Remarque : ______________________

### C2 — Annuler un reçu ne supprime jamais l'argent
*Créer N3 (Contrôle 150, espèces 150) et émettre son reçu.*
1. Dossier du patient › Reçus de paiement › **Annuler** sur ce reçu › **Annuler (patient remboursé)**, motif « Doublon ».

**Attendu :** refus avec un message qui parle de « Réémettre » et « Rembourser » ; rien n'est créé ; l'encaissement de 150,00 est toujours au journal.

[ ] OK  [ ] KO   Remarque : ______________________

### C3 — Réémettre un reçu
Même reçu : **Réémettre le reçu**, motif « Erreur de montant — libellé à corriger ».

**Attendu :** un nouveau reçu de **150,00**, numéro suivant ; l'ancien indique **Remplacé par REC-…** ; à l'impression de l'ancien : tampon **REMPLACÉ**. Le journal des recettes est inchangé (toujours 150,00 encaissé une seule fois).

[ ] OK  [ ] KO   Remarque : ______________________

### C4 — Rembourser puis annuler, une note, un reçu (N3)
1. Dossier du patient › note N3 › **Annuler**.
2. Lire le récapitulatif **sans valider** : montant, reçus, note.
3. Choisir le mode (Espèces), un motif, valider.

**Attendu :** une seule fenêtre : « Remboursement du net encaissé : **150,00 DH** », « Reçu annulé : le reçu valide (celui de C3) », « Note … annulée ». Après validation : note **Annulée** (numéro conservé), reçu **annulé** (un reçu d'annulation à la suite), ligne de remboursement **−150,00** au journal ; même motif, même jour, même auteur partout. Un second essai sur la même note est refusé (« déjà annulée »).

[ ] OK  [ ] KO   Remarque : ______________________

### C5 — Rembourser puis annuler, deux paiements, deux reçus (N4)
*N4 : Consultation 300, paiement 100 espèces + reçu, puis 200 espèces + reçu.*
1. Annuler N4. Lire le récapitulatif.
2. Valider.

**Attendu :** récapitulatif « **300,00 DH** » et **deux reçus** listés. Après : deux reçus d'annulation, un remboursement de −300,00, note Annulée. Le net de N4 est 0,00.

[ ] OK  [ ] KO   Remarque : ______________________

### C6 — Note partiellement remboursée puis annulée
*Note N6 : 300 payée, puis remboursement de 100, puis annulation.*

**Attendu :** le récapitulatif annonce **200,00 DH** (et non 300). Journal : deux remboursements (−100 puis −200). Net 0.

[ ] OK  [ ] KO   Remarque : ______________________

### C7 — [AUTO] Intégrité après toutes ces opérations
*Couvert par les tests Rust (succès, échec au milieu, refus mois clôturé, assistante refusée).* Coup d'œil : Paramètres › Cabinet › contrôle des **reçus**, des **encaissements** et de la **numérotation des notes** : tous « Aucune anomalie » (un trou de numéro lié à A5 est normal).

[ ] OK  [ ] KO   Remarque : ______________________

---

# SÉANCE 2 — Dépenses, clôture, tarifs, impression, assistante (≈ 1 h)

## Partie D — Dépenses (≈ 15 min)

### D1 — Saisir une dépense
Comptabilité › Dépenses › Nouvelle dépense : date du jour, catégorie **Loyer & charges locatives**, fournisseur « Immo Plus », libellé « Loyer octobre », **TTC 450,00**, TVA **75,00**, mode **Espèces**.

**Attendu :** ligne **DEP-AAAA-00001** (ou la suite) avec la date du jour, 450,00, votre nom. Date dans le futur : refusée.

[ ] OK  [ ] KO   Remarque : ______________________

### D2 — Achat de matériel « à amortir »
Dépense **Achat de matériel**, 1 200,00 DH, carte.

**Attendu :** elle est listée mais **exclue du résultat** (mention « à amortir »).

[ ] OK  [ ] KO   Remarque : ______________________

### D3 — Résultat
**Attendu :** Résultat = Encaissé net − dépenses **hors matériel** = (encaissé net affiché) − **450,00**, au centime. Les 1 200,00 de matériel n'y figurent pas.

[ ] OK  [ ] KO   Remarque : ______________________

### D4 — Annuler et corriger une dépense
1. Annuler la dépense D1 : motif « Erreur de montant ».
2. Sur la dépense de matériel : **Corriger**, nouveau montant 1 100,00, motif « Erreur de montant ».

**Attendu :** D1 reste dans la liste, **barrée**, avec motif, date, auteur, et ne compte plus. La correction crée une nouvelle ligne (numéro suivant) et barre l'ancienne ; aucune dépense n'est supprimée.

[ ] OK  [ ] KO   Remarque : ______________________

### D5 — Justificatif et catégories
1. Joindre une photo / un PDF à une dépense, puis l'ouvrir.
2. Réglages › Catégories de dépenses : ajouter « Formation », désactiver une catégorie utilisée.

**Attendu :** le justificatif s'ouvre dans DocEase. La nouvelle catégorie est proposée ; la catégorie utilisée se désactive mais **ne disparaît pas** des anciennes dépenses.

[ ] OK  [ ] KO   Remarque : ______________________

## Partie E — Clôture de mois (≈ 10 min)

### E1 — Clôturer un mois terminé
Comptabilité › Clôtures : clôturer le **mois précédent** (ex. septembre). Essayer ensuite de clôturer le mois en cours.

**Attendu :** le mois précédent est clôturé (badge **Mois clôturé** quand on le sélectionne dans le sélecteur de période). Le mois en cours **ne peut pas** être clôturé (« Seul un mois déjà terminé… »).

[ ] OK  [ ] KO   Remarque : ______________________

### E2 — Écritures refusées dans un mois clôturé
1. Saisir une dépense datée du mois clôturé.
2. Annuler (« Rembourser puis annuler ») une note **datée** du mois clôturé.
3. Encaisser aujourd'hui un paiement sur une ancienne note de ce mois.

**Attendu :** (1) refus clair « Le mois de … est clôturé… ». (2) La fenêtre affiche le même message en rouge ; le bouton est grisé ; rien n'est modifié. (3) **Permis** : le paiement est daté d'aujourd'hui.

[ ] OK  [ ] KO   Remarque : ______________________

### E3 — Rouvrir
Rouvrir le mois avec le motif « Demande du patient » (ou texte libre : la réouverture garde un motif libre), puis refaire E2 (1) et (2).

**Attendu :** accepté et tracé (date, auteur, motif) ; les écritures redeviennent possibles.

[ ] OK  [ ] KO   Remarque : ______________________

## Partie F — Tarifs, remises, identité (≈ 20 min)

### F1 — Grille tarifaire (R1, R2)
Paramètres › Cabinet › Tarifs des actes.

**Attendu :** 8 actes préchargés sans prix ; bandeau « Complétez vos tarifs » ; l'assistante ne peut pas créer de note tant que les prix manquent. Saisir 300 / 200 / 150 : bandeau disparu. Passer Consultation à **350** : une ancienne note reste à **300,00**, une nouvelle note est à **350,00** ; l'historique des prix montre 2 entrées. Remettre 300.

[ ] OK  [ ] KO   Remarque : ______________________

### F2 — Note multi-lignes sans remise (R4)
Consultation + ECG, sans remise.

**Attendu :** sous-total **500,00**, net **500,00**, en lettres « Cinq cents dirhams » ; 2 lignes à l'impression.

[ ] OK  [ ] KO   Remarque : ______________________

### F3 — Remise avec motif (R5)
Remise **10 %** « Confrère » sur Consultation.

**Attendu :** remise **30,00**, net **470,00**. Sans motif : refus. « Autre » sans texte : refus.

[ ] OK  [ ] KO   Remarque : ______________________

### F4 — Gratuité (R7)
Médecin : ECG gratuit, motif « Famille / proche ».

**Attendu :** ligne « Gratuit – Famille / proche », net **0,00**, statut **Gratuit**, numéro attribué, absente du « Reste à encaisser ».

[ ] OK  [ ] KO   Remarque : ______________________

### F5 — Contrôle gratuit (R8)
Consultation payée il y a 7 jours / non payée / payée il y a 15 jours (délai : 14 jours).

**Attendu :** 7 j : proposition avec la date, appliquée → **0,00** Gratuit. Non payée : aucune proposition. 15 j : aucune proposition.

[ ] OK  [ ] KO   Remarque : ______________________

### F6 — Chiffres de remises (R9)
Après F3 + F4 (Consultation 300 − 10 % ; ECG 200 gratuit).

**Attendu :** brut **500,00** ; remises **230,00** (Confrère 30,00 ; Famille / proche 200,00) ; net **270,00** ; gratuités **1**.

[ ] OK  [ ] KO   Remarque : ______________________

### F7 — Identité professionnelle (R10, R11, nom arabe)
1. Paramètres › Cabinet › Identité professionnelle : ICE de 14 chiffres ; INPE « 12AB ».
2. ICE de 15 chiffres. Remplir **Nom en arabe** (ex. د. سلمى بناني).
3. Émettre une note (adresse A), changer l'adresse en B, réimprimer l'ancienne et émettre une nouvelle note.

**Attendu :** (1) refus « ICE : 15 chiffres exactement (14 saisis) » et « INPE : chiffres uniquement ». (2) accepté. Sans INPE ou IF : bandeau « Identité professionnelle incomplète ». (3) ancienne note : adresse **A** ; nouvelle : adresse **B** ; le nom arabe d'une note déjà émise ne change pas si on le modifie ensuite.

[ ] OK  [ ] KO   Remarque : ______________________

### F8 — Avertissement d'en-tête (ordonnance)
*Seulement si votre « Mon design » contient un texte libre avec un nom (« Dr … » ou « د. … »).* Paramètres › Documents › Mon design › En-tête.

**Attendu :** si ce nom diffère de l'identité : encadré orange « Nom différent de l'Identité professionnelle ». Sinon : aucun encadré.

[ ] OK  [ ] KO   Remarque : ______________________

## Partie G — Impression (≈ 10 min)

### G1 — Note d'honoraires imprimée (R12)
Imprimer la note de F3/F4.

**Attendu :** en-tête (avec nom arabe), tableau (libellé, quantité, prix unitaire, remise, total), remises avec motif, net, déjà payé, reste, « Arrêtée la présente note à la somme de : … », pied IF / TP / ICE / INPE, cachet.

[ ] OK  [ ] KO   Remarque : ______________________

### G2 — Reçu imprimé (R13)
Paiement partiel de **100,00** sur la note à 270,00 (F6).

**Attendu :** rappel de la note : brut **300,00**, remise **30,00**, net **270,00**, reste dû **170,00**, pied IF / TP / ICE / INPE, cachet.

[ ] OK  [ ] KO   Remarque : ______________________

### G3 — Cachet (R14)
Importer un cachet en JPG (avec position GPS si vous en avez un). Imprimer note et reçu.

**Attendu :** cachet imprimé sur la note et le reçu ; l'assistante l'imprime aussi sur ses reçus.

[ ] OK  [ ] KO   Remarque : ______________________

### G4 — Reçus annulés / remplacés imprimés
Imprimer un duplicata d'un reçu annulé (C4) et du reçu remplacé (C3).

**Attendu :** tampon **ANNULÉ** (voir REC-…) / **REMPLACÉ** (par REC-…) ; bandeau DUPLICATA n° 1.

[ ] OK  [ ] KO   Remarque : ______________________

## Partie H — Assistante (≈ 10 min)

*Se connecter avec le compte assistante.*

### H1 — Remises et gratuités (R6)
Plafond de remise à 0 % puis 10 % (réglé par le médecin).

**Attendu :** 0 % : aucune remise proposée. 10 % : remise 10 % acceptée (net **270,00** sur 300). 11 % : « Remise réservée au médecin ». Gratuité : refusée.

[ ] OK  [ ] KO   Remarque : ______________________

### H2 — Dépense avec justificatif (R15)
Dépense **80,00 DH** avec photo du ticket.

**Attendu :** enregistrée avec justificatif ; le médecin l'ouvre ; l'assistante ne peut pas supprimer le justificatif.

[ ] OK  [ ] KO   Remarque : ______________________

### H3 — Ce que l'assistante ne voit pas (R16)
**Attendu :** pas d'accès aux Paramètres ; pas de bouton « Ligne libre » ; pas de « Rembourser », « Annuler » ni « Rembourser puis annuler » ; journal limité **au jour**, sans résultat ni clôtures ; ses reçus : ceux du jour seulement.

[ ] OK  [ ] KO   Remarque : ______________________

### H4 — [AUTO] Refus côté sécurité
*Tous les refus à l'assistante sont vérifiés par le test d'accès automatique (chaque commande, y compris « Rembourser puis annuler » et « Réémettre »).* Coup d'œil : H3 suffit.

[ ] OK  [ ] KO   Remarque : ______________________

### H5 — [AUTO] Migration des anciennes notes (R3)
*Déjà faite le 14/10 sur ces données (journal : `tariffs_migrate`).* Coup d'œil : le dossier `migration_backups\pre-migration-20261014-…` existe ; chaque ancienne note a une ligne « Honoraires » et le même montant qu'avant.

[ ] OK  [ ] KO   Remarque : ______________________

---

## Bilan

| Séance | Tests OK | Tests KO | Date | Durée |
|---|---|---|---|---|
| 1 | ___ / 18 | ___ | | |
| 2 | ___ / 25 | ___ | | |

**Décision :** [ ] prêt à fusionner   [ ] corrections nécessaires (voir remarques)
