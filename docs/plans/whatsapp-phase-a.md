# Plan WhatsApp phase A — VALIDÉ (enregistré tel quel)

CONTEXTE : envoi par lien wa.me (gratuit, sans API). Bibliothèques non
officielles (whatsapp-web.js, Baileys…) INTERDITES.

1. DONNÉES (types.ts)
- Patient.whatsappConsent?: 'yes'|'no' (absent = non renseigné),
  whatsappConsentAt, whatsappConsentBy.
- Appointment : confirmationSentAt, reminderSentAt, changeNoticeSentAt
  + …SentBy pour chacun.
- AppointmentSettings.messages : { confirmation, reminder, change },
  chacun en fr et ar + langue par défaut ; normalizeAppointmentSettings
  complète les anciens enregistrements sans perte.
- DoctorInfo.cabinetName (champ neutre, Paramètres › Cabinet :
  "Nom du cabinet (utilisé dans les messages)"), transmis à
  l'assistante via clinic_public_info.

2. LOGIQUE PURE (services/messaging/)
- phone.ts normalizeWhatsAppNumber : 06/07 + 8 chiffres → +2126/+2127 ;
  accepte 0612…, +212 6…, 00212…, 2126… ; refuse 05 (fixe) et 08 ;
  accepte tout E.164 étranger (+ ou 00, 8 à 15 chiffres) ; nettoie
  espaces, points, tirets, parenthèses ; refuse les longueurs invalides.
- template.ts renderMessage : liste blanche {prenom} {cabinet} {date}
  {heure} {numero_ordre} {telephone_cabinet} {adresse}. Toute autre
  variable refusée à l'enregistrement du modèle (message clair), rendue
  vide à l'affichage. {numero_ordre} = numéro d'arrivée (queueNumber).
  En mode "ordre d'arrivée", {heure} remplacé par le numéro d'arrivée.
  Dates via Intl (fr-FR ; ar avec chiffres latins). Le motif, le type
  de consultation et le nom du médecin ne sont JAMAIS fournis au module.
- consent.ts canSendWhatsApp : vrai seulement si consentement "yes",
  numéro mobile valide et RDV lié à un dossier (patientId).
- MessagingProvider { id, canSend, sendConfirmation, sendReminder,
  sendChangeNotice } ; une implémentation waLink ; place documentée
  pour whatsappCloudApi (même interface, envoi côté Rust), sans code.

3. PARAMÈTRES › Rendez-vous › Messages
- Édition des 3 modèles FR/AR, liste des variables autorisées, aperçu
  avec RDV fictif, "Rétablir les modèles par défaut". Médecin seulement.
- Modèles par défaut terminés par : "En cas d'empêchement, merci de
  nous prévenir au {telephone_cabinet}." Arabe simple et clair (pas de
  darija écrite), chiffres latins.
- Encadré : "Conseil : utilisez un numéro dédié au cabinet avec
  WhatsApp Business sur ce poste, pas votre numéro personnel."

4. RUST (règles access.rs + test access_integration)
- patients_save_identity : whatsappConsent et whatsappConsentAt dans
  IDENTITY_FIELDS ; whatsappConsentBy fixé par Rust depuis la session.
- appointment_mark_sent(id, kind) : Rust pose …SentAt (heure serveur)
  et …SentBy (session), audit::log sans contenu.
- save_json des RDV en session assistante : champs de traçabilité reçus
  ignorés, valeurs existantes conservées.
- whatsapp_open(phone_e164, text) : Rust valide ^\+[1-9]\d{7,14}$ et
  texte ≤ 1000 caractères, construit https://wa.me/<chiffres>?text=…,
  ouvre via tauri-plugin-opener appelé depuis Rust uniquement. AUCUNE
  capacité d'ouverture d'URL côté JavaScript. Journal : id du RDV et
  type de message seulement. Session requise.

5. INTERFACE
- Consentement "Oui / Non / Non renseigné" + date : QuickBookingModal,
  fiche patient (assistante : PatientDirectory ; médecin : dossier),
  détail du RDV. Libellé : "Le patient a accepté d'être contacté par
  WhatsApp".
- Détail du RDV : bouton "Envoyer sur WhatsApp" (confirmation, rappel
  ou changement selon l'état), aperçu en LECTURE SEULE avec bascule
  FR/AR, puis "Marquer comme envoyé" (appointment_mark_sent).
- Après création d'un RDV : si nouveau patient, il est d'abord créé et
  lié (patientId) ; puis proposition d'envoyer la confirmation si
  consentement "yes" et mobile valide, sinon un clic pour saisir le
  consentement.
- Reprogrammation : remise à zéro de confirmationSentAt et
  reminderSentAt.
- RAPPELS DE DEMAIN : nouvelle source dans le panneau "À faire"
  (cloche), pas un panneau séparé : RDV de demain, statut Prévu ou
  Confirmé, consentement "yes", numéro valide, pas encore rappelés ;
  envoi un par un. Visible par le médecin ET l'assistante (aucune
  donnée médicale). Se vide grâce à reminderSentAt.

6. PHASE B (préparation seulement) : docs/WHATSAPP_API.md — prérequis
   Meta (compte Business vérifié, numéro dédié, modèles "utility" à
   faire approuver, webhooks), coût par message selon le pays (grille
   officielle developers.facebook.com, avec date de consultation, aucun
   tarif de mémoire), jeton chiffré côté Rust, limites (app ouverte,
   internet), transfert hors Maroc (loi 09-08, CNDP, factuel, sans avis
   juridique).

7. TESTS : vitest (normalisation des numéros, rendu FR/AR mode heure et
   ordre, variable interdite refusée, refus sans consentement / sans
   dossier / numéro fixe, sélection des rappels de demain, remise à zéro
   à la reprogrammation) ; Rust (consentement par l'assistante sans
   …By, modèles non modifiables par l'assistante, traçabilité
   infalsifiable, whatsapp_open refuse numéro invalide / texte trop long
   / sans session, nouvelles commandes dans le test d'accès).

8. COMMITS séparés : services purs + tests ; types et réglages ; Rust ;
   consentement dans les écrans ; envoi (détail RDV + après création) ;
   source "Rappels" dans "À faire" ; docs/WHATSAPP_API.md.
   Chaque commit : tsc, vitest, cargo test --lib, build.

Règle : chaque plan validé est enregistré dans docs/plans/ avant implémentation.
