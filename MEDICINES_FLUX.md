# DocEase Medicines Management - Flux Complet

## 📋 Structure JSON utilisée

```json
{
  "id": "1",
  "name": "Doliprane",
  "dosage": "1000mg",
  "category": "Antalgique",
  "interaction_risk": ["Warfarine", "Méthotrexate"],
  "description": "Paracétamol utilisé pour la douleur et la fièvre."
}
```

## 🔄 Flux de données

### 1️⃣ **Télécharger Template**
- **Bouton** : "Template" (cyan-500)
- **Action** : Génère `template_meds.json` avec 5 exemples
- **Fichier** : Contient la structure exacte à remplir
- **Format** : `{ medications: [...] }` ou tableau direct

### 2️⃣ **Importer le JSON**
- **Bouton** : "JSON" (teal-500)
- **Action** : Ouvre un sélecteur de fichier
- **Conversion** : Format JSON → Format interne `Medicine`
  - `dosage` → `defaultDosage`
  - `interaction_risk` (array) → `interactionGroup` (string comma-separated)
- **Sync localStorage** : Clé `docease_meds_memory`
- **DB Sync** : Immédiat via `dataService.importMedicines()`

### 3️⃣ **Rechercher & Utiliser**
- **Barre de recherche** : Filtre les médicaments en temps réel
- **Catégories** : Filtre secondaire par type
- **Affichage** : Tableau avec nom, catégorie, dosage, moment de prise
- **Motor IA** : Médicaments disponibles immédiatement pour recherche

### 4️⃣ **Exporter**
- **Bouton** : "Export" (emerald-600)
- **Action** : Télécharge `docease_meds_YYYY-MM-DD.json`
- **Format** : Reconvertit au format standard (interaction_risk en array)
- **Contenu** : Tous les médicaments actuels

## 💾 LocalStorage

- **Clé** : `docease_meds_memory`
- **Contenu** : 
  ```json
  {
    "exportDate": "2026-01-27T...",
    "count": 50,
    "medications": [...]
  }
  ```
- **Persistance** : Auto-sync à chaque ajout/import/modification

## 🎨 Design Vert Médical

- **Header** : Glassmorphism + gradient emerald-light
- **Boutons** :
  - Template : **Cyan-500** (Download icon)
  - Import : **Teal-500** (Upload icon)
  - Export : **Emerald-600** (Save icon)
  - IA-Scan : **Indigo-600** (FileUp icon)
  - Ajouter : **Emerald-600** (Plus icon)
- **Tableau** : Bordures emerald, shadows douces
- **Formulaire d'ajout** : Champs avec gradient-emerald-light

## ✅ Checklist d'Utilisation

1. Cliquez sur **"Template"** pour télécharger la structure
2. Remplissez le fichier avec vos médicaments via l'IA
3. Cliquez sur **"JSON"** pour importer le fichier
4. Les médicaments s'affichent immédiatement dans la table
5. Utilisez la **barre de recherche** pour filtrer
6. Cliquez sur **"Export"** pour sauvegarder votre base actuelle

## 🔍 Exemple de fichier d'import

```json
{
  "medications": [
    {
      "id": "1",
      "name": "Doliprane",
      "dosage": "1000mg",
      "category": "Antalgique",
      "interaction_risk": ["Warfarine"],
      "description": "Paracétamol"
    }
  ]
}
```

---

**Generated**: 2026-01-27 | **DocEase Pro Edition**
