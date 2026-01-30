# Guide de Validation de Sécurité - PrescriptionEditor

## 📋 Vue d'ensemble

Le système de validation amélioré du `PrescriptionEditor.tsx` détecte et gère les risques de sécurité médicale en temps réel. Il comprend quatre couches de protection:

1. **Détection d'Interdiction Enfant** - Alerte si le patient < 15 ans et le médicament est interdit
2. **Bannière Clignotante** - Alerte visuelle critique pour restrictions graves
3. **Détection d'Incompatibilité** - Alerte si deux médicaments ne doivent pas être mélangés
4. **Validation Médicin** - Permet le dépassement avec responsabilité enregistrée

---

## 🔴 1. Interdiction Enfant

### Condition
- Âge du patient: **< 15 ans**
- Propriété du médicament: `restriction.status === 'interdit'`

### Affichage
- **Type**: Bannière clignotante rouge
- **Message**: `"⚠️ INTERDIT POUR ENFANT - [Nom du médicament] est INTERDIT pour les enfants de moins de 15 ans. Patient: [âge] ans. Raison: [raison]"`
- **Boutons**: 
  - "Dépasser (Médecin)" → Ouvre modal de dépassement
  - "✕ Masquer" → Ferme l'alerte

### Structure de données
```json
{
  "id": "medicine-001",
  "name": "Aspirine Adulte 500mg",
  "category": "Antalgique",
  "defaultDosage": "500mg",
  "defaultTiming": "Pendant repas",
  "restriction": {
    "status": "interdit",
    "minAge": 15,
    "reason": "Risque de syndrome de Reye chez l'enfant"
  }
}
```

---

## 🚨 2. Incompatibilité Dangereuse

### Condition
- Deux ou plusieurs médicaments sont présents dans la même prescription
- Au moins un a `incompatibleWith` qui contient le nom/groupe de l'autre

### Affichage
- **Type**: Bannière clignotante rouge avec pulsation douce
- **Message**: `"🚨 INCOMPATIBILITÉ DANGEREUSE - [Méd A] et [Méd B] NE DOIVENT PAS ÊTRE MÉLANGÉS. Risque grave d'interaction dangereuse."`
- **Icône**: AlertOctagon clignotante rouge
- **Animation**: `animate-pulse` + `animate-incomp-pulse`

### Structure de données
```json
{
  "id": "medicine-002",
  "name": "Warfarine",
  "category": "Anticoagulant",
  "defaultDosage": "5mg",
  "defaultTiming": "Indifférent",
  "incompatibleWith": [
    "Aspirine",
    "AINS",
    "Ibuprofène",
    "Naproxène"
  ]
}
```

### Exemple Complet
Si le médecin prescrit:
- **Warfarine** (anticoagulant)
- **Ibuprofène** (AINS)

→ Alerte critique: "INCOMPATIBILITÉ DANGEREUSE"

---

## 👨‍⚕️ 3. Modal de Dépassement (Responsabilité Médecin)

### Déclenchement
En cliquant sur "Dépasser (Médecin)" dans une alerte critique

### Contenu du Modal
```
[MODAL] Dépassement de Restriction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Vous êtes sur le point de dépasser une restriction de sécurité.
Cette action sera enregistrée aux fins d'audit et reste de votre
entière responsabilité médicale."

[Champ Texte] Raison du dépassement
 Placeholder: "Expliquez votre décision clinique..."

[Banneau Jaune]
⚠️ CETTE ACTION EST ENREGISTRÉE ET AUDITÉE

[Bouton Annuler]  [Bouton Continuer (rouge)]
```

### Enregistrement
- **Propriétés ajoutées à l'item**:
  - `overriddenByDoctor: true`
  - `overrideReason: "<raison entrée>"`
- **Audit**: Logs dans console avec timestamp
- **Format Audit**:
  ```
  [AUDIT] Médecin a ignoré l'alerte [notificationId] avec raison: [raison]
  ```

---

## 🔄 Workflow Complet

### Exemple Scénario
**Patient**: Enfant 10 ans avec allergie aux antibiotiques
**Prescription envisagée**: Amoxicilline Adulte 1000mg

### Étapes
1. **Détection** → `runLocalSafetyCheck()` détecte:
   - Patient < 15 ans
   - Restriction.status = 'interdit'
   
2. **Alerte Affichée** → Bannière rouge clignotante:
   ```
   ⚠️ INTERDIT POUR ENFANT
   Amoxicilline Adulte est INTERDIT pour les enfants de moins de 15 ans.
   Patient: 10 ans. Raison: Posologie inadaptée pour enfants.
   [Dépasser (Médecin)] [✕ Masquer]
   ```

3. **Médecin décide** de continuer:
   - Clique "Dépasser (Médecin)"
   - Modal s'ouvre avec champ raison
   - Entre: "Alternative Amoxicilline enfant non disponible, urgence clinique"
   - Clique "Continuer"

4. **Enregistrement** → Item mis à jour:
   ```typescript
   {
     ...item,
     overriddenByDoctor: true,
     overrideReason: "Alternative Amoxicilline enfant non disponible, urgence clinique"
   }
   ```

5. **Audit** → Log console:
   ```
   [AUDIT] Médecin a ignoré l'alerte enfant-item123 avec raison: Alternative Amoxicilline enfant non disponible, urgence clinique
   ```

---

## 📊 Animations CSS

### 1. danger-blink (Bannière Clignotante)
- Alternation rapide entre fond rouge et blanc
- **Durée**: 1 seconde
- **Utilisé pour**: Bannières ENFANT_INTERDIT et INCOMPATIBILITE

### 2. incomp-pulse (Pulsation Douce)
- Ombre rouge pulsante autour de l'alerte
- **Durée**: 2 secondes
- **Utilisé pour**: Alerte INCOMPATIBILITE

### 3. animate-pulse (Standard Tailwind)
- Pulsation d'opacité douce
- **Utilisé pour**: Icône AlertOctagon dans bannières critiques

---

## 🔧 Configuration Exemple - medications.json

```json
{
  "medications": [
    {
      "id": 1,
      "name": "Doliprane",
      "dosage": "1000mg",
      "category": "Analgésique",
      "interaction_risk": ["Warfarine"],
      "restriction": {
        "status": "autorise",
        "minAge": 3,
        "reason": ""
      }
    },
    {
      "id": 2,
      "name": "Advil",
      "dosage": "400mg",
      "category": "Analgésique",
      "interaction_risk": ["Warfarine", "Lithium"],
      "restriction": {
        "status": "attention",
        "minAge": 12,
        "reason": "Déconseillé avant 12 ans"
      },
      "incompatibleWith": ["Warfarine", "Héparine", "AINS"]
    },
    {
      "id": 3,
      "name": "Aspirine Adulte",
      "dosage": "500mg",
      "category": "Antalgique",
      "restriction": {
        "status": "interdit",
        "minAge": 15,
        "reason": "Risque de syndrome de Reye"
      },
      "incompatibleWith": ["Warfarine", "Héparine"]
    }
  ]
}
```

---

## 📝 Intégration dans les Types TypeScript

```typescript
export interface MedicineRestriction {
  status: 'interdit' | 'attention' | 'autorise';
  minAge?: number;
  maxAge?: number;
  reason?: string;
}

export interface Medicine {
  id: string;
  name: string;
  category: MedicineCategory;
  defaultDosage: string;
  defaultTiming: MealTiming;
  isAdultOnly?: boolean;
  interactionGroup?: string;
  restriction?: MedicineRestriction;
  incompatibleWith?: string[]; // Noms ou groupes incompatibles
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  dosage: string;
  timing: MealTiming;
  warning?: string;
  interactionGroup?: string;
  overriddenByDoctor?: boolean; // Dépassement de restriction
  overrideReason?: string; // Raison du dépassement
}
```

---

## ✅ Checklist Implémentation

- [x] Types TypeScript mis à jour avec `MedicineRestriction` et `incompatibleWith`
- [x] Fonction `runLocalSafetyCheck()` améliorée avec 4 niveaux de détection
- [x] Bannière clignotante rouge pour "INTERDIT POUR ENFANT"
- [x] Bannière clignotante pour "INCOMPATIBILITÉ DANGEREUSE"
- [x] Modal de dépassement avec champ raison
- [x] Enregistrement de l'action (propriétés `overriddenByDoctor` et `overrideReason`)
- [x] Audit logging dans console
- [x] Animations CSS (`danger-blink`, `incomp-pulse`)
- [x] Boutons d'action ("Dépasser", "Masquer")

---

## 🧪 Test Recommandés

1. **Test Enfant Interdit**
   - Créer patient age = 10 ans
   - Prescrire "Aspirine Adulte"
   - Vérifier: Bannière clignotante rouge "INTERDIT POUR ENFANT"

2. **Test Incompatibilité**
   - Prescrire "Warfarine" + "Ibuprofène"
   - Vérifier: Bannière clignotante "INCOMPATIBILITÉ DANGEREUSE"

3. **Test Dépassement**
   - Cliquer "Dépasser (Médecin)"
   - Entrer raison
   - Cliquer "Continuer"
   - Vérifier: `overriddenByDoctor: true` dans prescription

4. **Test Audit**
   - Ouvrir Console Dev (F12)
   - Effectuer dépassement
   - Vérifier: Log `[AUDIT]` visible

---

## 🚀 Notes Importantes

1. **Responsabilité Médicale**: Le système alertera toujours, mais permet au médecin de prendre la responsabilité de dépasser si cliniquement justifié
2. **Audit Trail**: Tous les dépassements sont enregistrés pour traçabilité légale
3. **Age Limite**: Les vérifications enfant utilisent le seuil de **15 ans** (configurable via `restriction.minAge`)
4. **Données Requises**: Les données JSON des médicaments DOIVENT être mises à jour avec les propriétés `restriction` et `incompatibleWith`

