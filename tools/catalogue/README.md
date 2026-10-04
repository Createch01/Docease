# Outils du catalogue de médicaments

Scripts Node (CommonJS, extension `.cjs`) à lancer à la main depuis la racine du projet. Ils ne font pas partie de l'application.

Le catalogue vivant est `public/medicaments/medicament_<A-Z>_final.json` (lu par `services/drugCatalogService.ts`). Toute donnée absente doit rester « non renseignée » : ne jamais remplir un champ sans source explicite (medicament.ma en priorité, puis sahha.ma, dwa.ma, saydalia.ma, med.ma ; jamais Wikipédia).

## `scrape_medicaments.cjs`
- **Rôle** : aspire le listing A-Z de https://medicament.ma (nom, dosage, forme, conditionnement, PPV, laboratoire) avec une pause de 800 ms entre requêtes.
- **Entrée** : aucune (accès réseau à medicament.ma).
- **Sortie** : un JSON `{ scraped_at, source, total_count, items }`. Chemin donné en 1er argument, sinon `./medicaments_raw_az.json` dans le dossier courant.
- **Usage** : `node tools/catalogue/scrape_medicaments.cjs [sortie.json]`
- Ne modifie pas `public/medicaments` : le résultat sert de matière première à relire avant import.

## `sync_medicines.cjs`
- **Rôle** : remplace, dans `public/medicaments/medicament_<lettre>_final.json`, les fiches de même nom commercial par celles d'un fichier « master » (puis ajoute les nouvelles, avec `last_sync` et `source: "master_import"`).
- **Entrée** : un fichier JSON (tableau de fiches) donné en 1er argument. **Chemin à adapter** : il n'y a plus de chemin par défaut.
- **Sortie** : écrit les fichiers `_final.json` de `public/medicaments`, **seulement avec `--apply`**. Sans cette option, simulation : le script affiche ce qu'il ferait sans rien écrire.
- **Usage** : `node tools/catalogue/sync_medicines.cjs <master.json>` puis, après relecture, `node tools/catalogue/sync_medicines.cjs <master.json> --apply`
- Les fichiers `_final.json` doivent être des tableaux. Faire une copie (ou un commit) avant `--apply`.
