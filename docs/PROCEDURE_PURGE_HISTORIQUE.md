# Purge de l'historique : exécutée le 2026-10-04

## Ce qui a été fait
1. Dépôt GitHub passé en **privé** (par le propriétaire). Les 2 patients des fichiers purgés étaient des **données de test** ; pas de déclaration CNDP nécessaire.
2. Copie miroir de sécurité : `C:\src\docease_mirror_backup.git` (sans remote, jamais poussée, **à garder**). Elle contient encore l'ancien historique non purgé : à chiffrer ou détruire quand elle ne sert plus.
3. `git filter-repo` sur un clone miroir : suppression de `src-tauri/meddoc_*.json` de tout l'historique, et `--replace-text` (fichier hors dépôt, supprimé ensuite) pour les coordonnées du cabinet : nom, spécialité, diplômes, adresse, téléphones, e-mail, en français **et en arabe**, y compris les anciennes maquettes `DESIGN ORDONNANCE/`.
4. Avant la purge, commits sur `main` (cherry-pick) : retrait des données du suivi + `.gitignore`, et identité du cabinet vide par défaut avec assistant de premier lancement.
5. Force-push de `main` seul (`2889d2d` → `90e2e25`), sans tags. Un premier push avait échoué : **HTTP 408 (timeout)** sur l'envoi du paquet de 54 Mo, résolu en augmentant `http.postBuffer`.
6. Dépôt de travail réaligné : `main`, `feature/contexte-patient`, branches `archive/*` et tags remis sur l'historique réécrit ; anciens objets supprimés (`reflog expire` + `gc --prune=now`). Remote `origin` : `https://github.com/Createch01/Docease.git`.
7. Branches supprimées : 12 `claude/*` fusionnées (dont `awesome-einstein`, `eager-ride`, `nervous-buck` après archivage de leur travail non commité dans `archive/*`), `feature/rendez-vous`, `feature/roles`, `nouveau-design`, `standardize_prescription_display`, `unify_prescription_rendering`. Conservée : `archive/clever-swirles` (non intégrée).

## Vérifications (dépôt de travail, après alignement)
- `git log --all -- 'src-tauri/meddoc_*.json'` : vide ; aucun objet `meddoc_` dans `git rev-list --all --objects`.
- 25 formes purgées (`git log --all -S`) : **0 occurrence**. « belghiti » (insensible à la casse) dans tous les fichiers de toutes les révisions : 0.
- Avant la purge, 12 des 16 formes principales et 8 des 9 complémentaires étaient présentes.

## Points restants
- `origin/feature/contexte-patient` contenait, au dernier contrôle, **l'ancien historique non purgé** (`8b4ced0`). À remplacer (force-push de la version réécrite) ou à supprimer sur GitHub.
- Le dossier `C:\src\docease_backup_2026-10-03` (hors dépôt) peut contenir les anciennes données : à vérifier.
- Les forks, clones et caches éventuels d'avant la mise en privé ne sont pas couverts.

---

# Procédure : purger les données patients de l'historique git

À valider avant exécution. Rien de ce qui suit n'a été lancé.

## Constat
- 7 fichiers `src-tauri/meddoc_*.json`, ajoutés dans le commit `7902362` (14/04/2026), **présents sur `origin/main`** donc déjà publics.
- Seule branche distante : `main`. Dépôt : https://github.com/Createch01/Docease
- Fichiers à purger (chemins exacts) :
  `src-tauri/meddoc_{doctor_info,honorary_notes,lab_requests,medicines,patients,prescriptions,today_queue}.json`
- Les branches locales `claude/*`, `feature/*`, `nouveau-design`… contiennent aussi ces fichiers : elles doivent être traitées (réécrites ou supprimées) sinon elles les réintroduisent.

## Limite importante
Réécrire l'historique n'efface pas ce qui a déjà été copié : forks, clones, caches de moteurs de recherche, archives. Considérer les données comme **déjà divulguées** (patients concernés, obligations légales marocaines : loi 09-08 / CNDP). La purge limite l'exposition future, elle ne l'annule pas.

## Étapes
1. **Mettre le dépôt en privé** (GitHub → Settings → Danger Zone → Change visibility). À faire en premier.
2. **Sauvegarde** : `git clone --mirror https://github.com/Createch01/Docease.git Docease-backup.git` (copie de sécurité hors du dossier de travail ; elle contient encore les données : à chiffrer ou détruire ensuite).
3. **Clone neuf pour la réécriture** (jamais dans le dossier de travail actuel) :
   ```bash
   git clone --mirror https://github.com/Createch01/Docease.git Docease-clean.git
   cd Docease-clean.git
   ```
4. **Purge avec git-filter-repo** (`pip install git-filter-repo`) :
   ```bash
   git filter-repo --invert-paths --path-glob "src-tauri/meddoc_*.json"
   ```
   Alternative BFG : `java -jar bfg.jar --delete-files "meddoc_*.json" Docease-clean.git` puis
   `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
5. **Vérifier** : `git log --all --oneline -- "src-tauri/meddoc_*.json"` doit être vide ; `git rev-list --all --objects | grep meddoc_` aussi.
6. **Force-push** (après `git remote add origin ...` si filter-repo a retiré le remote) :
   ```bash
   git push --force --mirror origin
   ```
   Nécessite que la protection de `main` autorise le force-push (la désactiver temporairement).
7. **Purger côté GitHub** : les anciens commits restent accessibles par SHA tant que GitHub ne les a pas ramassés. Ouvrir un ticket au support GitHub (« Remove cached views and references to sensitive data », en indiquant le dépôt et les SHA) et supprimer d'éventuelles Pull Requests / forks qui les référencent.
8. **Invalider les clones** : prévenir tout collaborateur ; chacun doit supprimer son clone et re-cloner (pas de `git pull`, qui réintroduirait les anciens objets). Supprimer aussi les anciens worktrees `.claude/worktrees/` et les branches locales basées sur l'ancien historique, puis re-cloner le travail en cours.
9. **Réaligner le dépôt de travail** : après le force-push, dans `C:\src\DOCEASE`, ne pas merger : cloner à neuf et reporter les commits locaux non poussés par `git cherry-pick` (ou `git rebase --onto`), puis supprimer l'ancien dossier.
10. **Hygiène** : le commit `5e47591` (retrait + `.gitignore`) devient inutile dans l'historique réécrit mais reste nécessaire pour la protection future ; le conserver.

## Décision à prendre
Les 2 patients et le cabinet sont-ils réels ? Si oui : informer les personnes concernées selon la loi 09-08 et envisager une déclaration à la CNDP.
