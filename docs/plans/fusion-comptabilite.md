# Fusion de `feature/comptabilite` dans `main` — préparation

État au 18/10/2026. **Rien n'a été fusionné.** À exécuter par le médecin après la recette (`docs/RECETTE.md`).

## 1. Constat

- `main` (`68e4340`, « Merge branch 'feature/recu' ») est **ancêtre** de `feature/comptabilite` : 0 commit sur `main` absent de la branche, **38 commits** de la branche absents de `main`. La fusion ne peut donc pas produire de conflit.
- `feature/numerotation-notes` (9 commits absents de `main`, de `68b09c8` à `db46d86`) est **entièrement contenue** dans `feature/comptabilite` (`git merge-base --is-ancestor` : oui, 0 commit de numérotation manquant).
- Fusion à blanc (`git merge --no-commit --no-ff feature/comptabilite` sur une branche temporaire issue de `main`, puis abandon, branche supprimée) : **0 conflit**. Sur ce résultat : `tsc` sans erreur, `vitest` 350/350, `cargo test --lib` (`DOCEASE_TEST_MANIFEST=1`) 245 réussis / 1 ignoré, `npm run build` réussi.

## 2. Fonctionnalités incluses

**Numérotation des notes (`feature/numerotation-notes`)** — compteur Rust `AAAA-NNNN`, année = jour d'émission ; numéro et date imposés par Rust ; note numérotée jamais supprimée mais **annulée** (médecin, motif) ; contrôle de cohérence ; statut de paiement calculé par Rust ; « Facture rapide » en fenêtre ; restauration sans retour du compteur.

**Comptabilité**
- C0 : résultat = encaissé − dépenses, facturé à part.
- C1 : registre d'encaissements en ajout seul (date, montant, mode dont chèque, auteur) ; remboursement = écriture négative avec motif.
- C2 : journal des recettes et tableau de bord calculés par Rust (date du paiement, centimes).
- C3 : dépenses chiffrées en registre chaîné `DEP-AAAA-NNNNN`, catégories, justificatifs, annulation/correction ; clôture de mois (médecin) ; l'assistante saisit ses dépenses du jour.
- Sélecteur de période partagé (jour, semaine, mois, année, personnalisée).
- T1 : grille tarifaire, notes multi-lignes, remises avec motif et plafond assistante, gratuités, identité professionnelle validée (ICE, INPE, IF, TP), cachet, rappel sur le reçu.

**Sauvegarde et reçus (ce lot)**
- Sauvegarde obligatoire : assistant de configuration, bandeaux rouge / orange / informatif (assistante), `backup_health`.
- Test T7 : numéros jamais réutilisés après restauration.
- Motifs d'annulation en liste fermée, validés par Rust.
- Un reçu n'efface jamais un encaissement ; « Réémettre » (ancien reçu « remplacé »).
- « Rembourser puis annuler » : une action tout-ou-rien (remboursement du net, annulation de tous les reçus valides, annulation de la note).
- Nom en arabe dans l'identité professionnelle (figé dans la note) ; avertissement d'en-tête différent.
- `scripts/dev-snapshot.ps1` (outil de développement, hors application).

## 3. Migrations au premier lancement (session médecin, application de bureau)

Exécutées par `dataService.initialize()` dans cet ordre, chacune relançable sans effet :

| # | Commande | Effet | Copie préalable | Réversibilité |
|---|---|---|---|---|
| 1 | `invoice_numbering_migrate` | numérote les notes sans numéro (ordre chronologique, année de leur date) ; ne touche ni dates ni montants | non | **non automatique** : les numéros attribués ne se retirent pas |
| 2 | `payments_migrate` | une écriture « migrée » au registre pour chaque note déjà payée/partielle (aucune pour une note annulée) ; ne modifie aucune note | non | ajout seul ; le registre est la source du montant payé |
| 3 | `tariffs_migrate` | enveloppe chaque ancienne note dans une ligne « Honoraires » au même montant ; si une somme ou un statut change, **rien n'est écrit** | **oui** : `migration_backups/pre-migration-<date>/` | restauration manuelle depuis ce dossier (fermer DocEase, recopier les fichiers) |
| 4 | `expenses_migrate` | reprend les anciennes dépenses dans le registre chaîné (mode inconnu → espèces, marquées « migré »), justificatifs en pièces jointes chiffrées | l'original est conservé (`meddoc_expenses.legacy.json`) | original intact, registre supprimable à la main |

Sur les données de développement actuelles, les migrations 1 à 4 ont déjà eu lieu (journal du 14/10 : `tariffs_migrate`, 13 notes). Elles ne feront rien de plus.
Sur **une autre installation** (cabinet réel), les migrations 1 et 2 n'ont **pas** de copie préalable propre : faire un `dev-snapshot` ou copier le dossier `%LOCALAPPDATA%\com.docease.desktop` avant la première ouverture de la nouvelle version.

## 4. Risques connus

1. **Migration 1 irréversible** (numéros attribués). Copie manuelle avant la première ouverture sur un poste réel.
2. **Compteurs et réinstallation** : si le dossier de données est perdu avec ses compteurs puis restauré, un numéro attribué après la dernière sauvegarde peut être réattribué (documenté dans `SECURITY.md`).
3. **Sauvegarde non configurée sur ces données** : tant que le médecin ne l'a pas faite, bandeau rouge permanent.
4. **Annuler une note encaissée** : l'ordre rembourser → annuler les reçus → annuler la note reste possible en actions séparées, mais l'action unique « Rembourser puis annuler » est le chemin normal.
5. **Registres à chaînage d'empreintes** : détectent les erreurs et altérations simples, pas de valeur de scellé légal.
6. **Recette manuelle** : les listes d'origine D1–D14 et C1–C3 ne figuraient pas dans le dépôt ; `docs/RECETTE.md` les regroupe par fonctionnalité (voir la remarque du rapport).
7. Le test sur l'application Tauri réelle d'une session assistante n'a pas été refait dans ce lot (couvert par le test d'accès automatique).

## 5. Commandes de fusion (à exécuter par le médecin, après la recette)

Dans `C:\src\DOCEASE`, dossier de données copié au préalable (`scripts\dev-snapshot.ps1 avant-fusion`) :

```bash
git fetch origin
git checkout feature/comptabilite
git status                       # doit être propre
git checkout main
git pull --ff-only origin main
git merge --no-ff feature/comptabilite -m "Merge branch 'feature/comptabilite'"
npx tsc --noEmit -p .
npx vitest run
cd src-tauri && DOCEASE_TEST_MANIFEST=1 cargo test --lib && cd ..
npm run build
git push origin main
```

En cas de problème avant le `push` : `git reset --hard origin/main` (annule la fusion locale ; aucune donnée de l'application n'est concernée).
Les branches `feature/numerotation-notes` et `feature/comptabilite` peuvent être conservées ou supprimées après la fusion (`git branch -d …`) : leurs commits sont dans `main`.
