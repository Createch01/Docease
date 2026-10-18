<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1wBWbvsU6mmFePlj1Rc6UdEcWh1aNIuwx

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Développement : copie des données de test

Avant une séance de recette ou un essai risqué, copier les données de développement
(`%LOCALAPPDATA%\com.docease.desktop`) :

```powershell
powershell -File scripts\dev-snapshot.ps1 avant-recette
```

La copie va dans `C:\src\docease_snapshots\AAAA-MM-JJ_HHMM_<libellé>`. Le script refuse de
s'exécuter si DocEase est ouvert, affiche le chemin et la taille, et ne supprime jamais rien.
Pour revenir en arrière : fermer DocEase, puis recopier à la main le contenu d'une copie
dans le dossier de données.
