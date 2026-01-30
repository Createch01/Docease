import React from 'react';
import PrescriptionEditor from '../components/PrescriptionEditor';
import { Patient, Medicine } from '../types';

/**
 * GUIDE DE TEST - Système de Validation de Sécurité
 * ================================================
 * 
 * Ce fichier contient des cas de test pour vérifier le fonctionnement
 * de tous les systèmes de validation améliorés du PrescriptionEditor.
 */

// ==========================================
// TEST 1: ENFANT INTERDIT
// ==========================================
export const TEST_ENFANT_INTERDIT = {
  patient: {
    id: 'test-001',
    name: 'Jean Dupont',
    age: 10, // < 15 ans
    sex: 'M',
    type: 'Child',
    phone: '0612345678',
    weight: '35kg',
    allergies: '',
    pathologies: ''
  } as Patient,
  
  prescriptionSetup: [
    {
      medicineName: 'Aspirine Adulte 500mg',
      dosage: '500mg',
      timing: 'Pendant repas' as const,
      // Le médicament doit avoir: restriction: { status: 'interdit', minAge: 15, reason: 'Syndrome de Reye' }
    }
  ],
  
  expectedResult: {
    alertType: 'ENFANT_INTERDIT',
    severity: 'CRITIQUE',
    message: '⚠️ INTERDIT POUR ENFANT - Aspirine Adulte 500mg est INTERDIT pour les enfants de moins de 15 ans. Patient: 10 ans.',
    visualEffect: 'Bannière rouge clignotante (animate-danger-blink)',
    allowOverride: true,
    buttons: ['Dépasser (Médecin)', '✕ Masquer']
  },
  
  instructions: `
    1. Créer un patient enfant (age 10)
    2. Rechercher et ajouter "Aspirine Adulte 500mg"
    3. Vérifier: Alerte rouge clignotante "INTERDIT POUR ENFANT"
    4. Cliquer "Dépasser (Médecin)"
    5. Entrer raison et confirmer
    6. Vérifier: item.overriddenByDoctor = true
  `
};

// ==========================================
// TEST 2: INCOMPATIBILITÉ DANGEREUSE
// ==========================================
export const TEST_INCOMPATIBILITE = {
  patient: {
    id: 'test-002',
    name: 'Marie Martin',
    age: 45,
    sex: 'F',
    type: 'Woman',
    phone: '0633445566',
    weight: '65kg',
    allergies: 'Pénicilline',
    pathologies: 'Fibrillation auriculaire'
  } as Patient,
  
  prescriptionSetup: [
    {
      medicineName: 'Warfarine',
      dosage: '5mg',
      timing: 'Indifférent' as const,
      // Warfarine.incompatibleWith: ['Aspirine', 'AINS', 'Ibuprofène', 'Naproxène']
    },
    {
      medicineName: 'Ibuprofène',
      dosage: '400mg',
      timing: 'Pendant repas' as const,
      // Ibuprofène est dans incompatibleWith de Warfarine
    }
  ],
  
  expectedResult: {
    alertType: 'INCOMPATIBILITE',
    severity: 'CRITIQUE',
    message: '🚨 INCOMPATIBILITÉ DANGEREUSE - Warfarine et Ibuprofène NE DOIVENT PAS ÊTRE MÉLANGÉS. Risque grave d\'interaction dangereuse.',
    visualEffect: 'Bannière clignotante rouge + pulsation (animate-pulse + animate-incomp-pulse)',
    icon: 'AlertOctagon clignotante',
    allowOverride: true,
    buttons: ['Dépasser (Médecin)', '✕ Masquer']
  },
  
  instructions: `
    1. Créer patient adulte (age 45)
    2. Ajouter "Warfarine 5mg"
    3. Ajouter "Ibuprofène 400mg"
    4. Vérifier: Alerte "INCOMPATIBILITÉ DANGEREUSE"
    5. Vérifier: Deux bannières rouges clignotantes
    6. Cliquer "Dépasser (Médecin)" sur l'une d'elles
    7. Entrer justification clinique
    8. Vérifier: overriddenByDoctor enregistré
  `
};

// ==========================================
// TEST 3: INTERACTION GROUP
// ==========================================
export const TEST_INTERACTION_GROUP = {
  patient: {
    id: 'test-003',
    name: 'Pierre Leblanc',
    age: 8,
    sex: 'M',
    type: 'Child',
    phone: '0645678901',
    weight: '28kg',
    allergies: '',
    pathologies: 'Asthme'
  } as Patient,
  
  prescriptionSetup: [
    {
      medicineName: 'Amoxicilline Pédiatrique',
      dosage: '250mg/5ml',
      timing: 'Pendant repas' as const,
      interactionGroup: 'Pénicilline'
    },
    {
      medicineName: 'Méthotrexate',
      dosage: '10mg/ml',
      timing: 'Indifférent' as const,
      interactionGroup: 'Méthotrexate'
      // Méthotrexate.interaction_risk inclut les Pénicillines
    }
  ],
  
  expectedResult: {
    alertType: 'INTERACTION',
    severity: 'CRITIQUE',
    message: 'Risque d\'interaction détecté entre Amoxicilline Pédiatrique et Méthotrexate.',
    visualEffect: 'Alerte rouge standard'
  },
  
  instructions: `
    1. Créer patient enfant (age 8)
    2. Ajouter "Amoxicilline Pédiatrique 250mg/5ml"
    3. Ajouter "Méthotrexate 10mg/ml"
    4. Vérifier: Alerte d'interaction
    5. Le système devrait détecter le risque via interactionGroup
  `
};

// ==========================================
// TEST 4: DÉPASSEMENT ET AUDIT
// ==========================================
export const TEST_OVERRIDE_AND_AUDIT = {
  patient: {
    id: 'test-004',
    name: 'Sophie Durand',
    age: 12,
    sex: 'F',
    type: 'Child',
    phone: '0656789012',
    weight: '42kg',
    allergies: 'Céphalosporines',
    pathologies: 'Pneumonie bactérienne'
  } as Patient,
  
  prescriptionSetup: [
    {
      medicineName: 'Fluconazole Adulte 200mg',
      dosage: '200mg',
      timing: 'Indifférent' as const,
      // restriction: { status: 'interdit', minAge: 15 }
    }
  ],
  
  testSteps: [
    {
      step: 1,
      action: 'Ajouter médicament interdit enfant',
      expected: 'Alerte rouge "INTERDIT POUR ENFANT"'
    },
    {
      step: 2,
      action: 'Cliquer "Dépasser (Médecin)"',
      expected: 'Modal s\'ouvre avec champ raison'
    },
    {
      step: 3,
      action: 'Entrer raison: "Seule alternative disponible, urgence septicémie"',
      expected: 'Bouton "Continuer" devient actif'
    },
    {
      step: 4,
      action: 'Cliquer "Continuer"',
      expected: 'Modal ferme, alerte disparaît'
    },
    {
      step: 5,
      action: 'Ouvrir Console Dev (F12)',
      expected: '[AUDIT] Médecin a ignoré l\'alerte enfant-[itemId] avec raison: Seule alternative disponible...'
    },
    {
      step: 6,
      action: 'Sauvegarder prescription',
      expected: 'item contient: overriddenByDoctor: true, overrideReason: "Seule alternative disponible..."'
    }
  ],
  
  instructions: `
    1. Suivre exactement les étapes de testSteps ci-dessus
    2. Vérifier la console navigateur pour audit log
    3. Exporter prescription et vérifier JSON
    4. Vérifier que overriddenByDoctor et overrideReason sont présents
  `
};

// ==========================================
// TEST 5: CAS NORMAL (SANS ALERTE)
// ==========================================
export const TEST_NO_ALERTS = {
  patient: {
    id: 'test-005',
    name: 'Thomas Roux',
    age: 35,
    sex: 'M',
    type: 'Adult',
    phone: '0667890123',
    weight: '80kg',
    allergies: '',
    pathologies: 'Hypertension'
  } as Patient,
  
  prescriptionSetup: [
    {
      medicineName: 'Doliprane',
      dosage: '1000mg',
      timing: 'Pendant repas' as const
    },
    {
      medicineName: 'Amoxicilline Adulte 500mg',
      dosage: '500mg',
      timing: 'Pendant repas' as const
    }
  ],
  
  expectedResult: {
    alerts: [],
    sidebarMessage: '✓ Prescription Sûre (avec checkmark vert)'
  },
  
  instructions: `
    1. Créer patient adulte (age 35)
    2. Ajouter "Doliprane 1000mg"
    3. Ajouter "Amoxicilline Adulte 500mg"
    4. Vérifier: Aucune alerte affichée
    5. Vérifier: Message "Prescription Sûre" avec checkmark vert
  `
};

// ==========================================
// TEST 6: MODAL VALIDATION
// ==========================================
export const TEST_MODAL_VALIDATION = {
  testCase: 'Modal refuse Continuer si raison vide',
  
  steps: [
    {
      action: 'Déclencher alerte ENFANT_INTERDIT',
      result: 'Alerte affichée'
    },
    {
      action: 'Cliquer "Dépasser (Médecin)"',
      result: 'Modal s\'ouvre'
    },
    {
      action: 'Laisser champ raison VIDE',
      result: 'Bouton "Continuer" DÉSACTIVÉ (grisé)'
    },
    {
      action: 'Commencer à taper raison',
      result: 'Bouton "Continuer" s\'ACTIVE (rouge)'
    },
    {
      action: 'Supprimer tout le texte',
      result: 'Bouton "Continuer" se DÉSACTIVE à nouveau'
    },
    {
      action: 'Cliquer "Annuler"',
      result: 'Modal ferme, alerte reste visible'
    }
  ],
  
  instructions: `
    Valider que la logique de désactivation fonctionne:
    - Bouton disabled={!overrideModal.reason.trim()}
    - Classe CSS: disabled:bg-gray-300
  `
};

// ==========================================
// CHECKLIST DE TEST COMPLET
// ==========================================
export const FULL_TEST_CHECKLIST = [
  {
    category: 'Détection Enfant Interdit',
    tests: [
      '✓ Age < 15 + restriction.status === "interdit" déclenche alerte',
      '✓ Message affiche nom médicament et raison',
      '✓ Bannière clignote (animate-danger-blink)',
      '✓ Boutons "Dépasser" et "Masquer" fonctionnels',
      '✓ Alerte disparaît en cliquant "Masquer"'
    ]
  },
  {
    category: 'Détection Incompatibilité',
    tests: [
      '✓ Deux médicaments incompatibles déclenchent alerte',
      '✓ Message affiche les deux noms',
      '✓ Bannière clignotante avec pulsation',
      '✓ AlertOctagon clignotante rouge',
      '✓ Alerte détectée dans les deux sens (A incompatible B, B incompatible A)'
    ]
  },
  {
    category: 'Modal de Dépassement',
    tests: [
      '✓ Modal s\'ouvre au clic "Dépasser (Médecin)"',
      '✓ Champ raison est vide au départ',
      '✓ Bouton "Continuer" désactivé si raison vide',
      '✓ Bouton "Continuer" activé si raison remplie',
      '✓ Cliquer "Annuler" ferme modal sans action',
      '✓ Cliquer "Continuer" sauvegarde raison et ferme'
    ]
  },
  {
    category: 'Enregistrement et Audit',
    tests: [
      '✓ item.overriddenByDoctor = true après dépassement',
      '✓ item.overrideReason contient la raison entrée',
      '✓ Log [AUDIT] visible dans console',
      '✓ Log contient notificationId et raison',
      '✓ Prescription sauvegardée avec ces propriétés'
    ]
  },
  {
    category: 'Changement Âge',
    tests: [
      '✓ Modifier age du patient retrigger les vérifications',
      '✓ Alerte enfant disparaît si age >= 15',
      '✓ Alerte réapparaît si age revient < 15'
    ]
  },
  {
    category: 'Suppression Médicament',
    tests: [
      '✓ Supprimer médicament déclenche re-check',
      '✓ Alerte incompatibilité disparaît si un médicament supprimé',
      '✓ Prescription Sûre réapparaît si aucune alerte'
    ]
  },
  {
    category: 'Animations CSS',
    tests: [
      '✓ danger-blink: alternation 1s rouge/blanc',
      '✓ incomp-pulse: ombre pulsante 2s',
      '✓ animate-pulse: icône AlertOctagon clignotante'
    ]
  }
];

/**
 * EXEMPLE D'EXÉCUTION MANUELLE
 * ============================
 * 
 * 1. Importer ce fichier dans votre application test
 * 2. Utiliser les données TEST_* pour peupler les champs
 * 3. Suivre les instructions et étapes
 * 4. Vérifier chaque élément de FULL_TEST_CHECKLIST
 * 5. Ouvrir console Dev pour voir audit logs
 * 
 * EXEMPLE CODE:
 * ```tsx
 * const { TEST_ENFANT_INTERDIT } = require('./TestScenarios');
 * 
 * // Remplir formulaire patient
 * setPatient(TEST_ENFANT_INTERDIT.patient);
 * 
 * // Ajouter médicament
 * const medicine = { name: 'Aspirine Adulte 500mg', ... };
 * addItem(medicine);
 * 
 * // Vérifier alerte
 * expect(aiWarnings[0].type).toBe('ENFANT_INTERDIT');
 * ```
 */
