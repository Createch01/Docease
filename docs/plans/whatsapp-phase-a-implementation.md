# WhatsApp phase A — plan d'implémentation (VALIDÉ)

Complète `whatsapp-phase-a.md`. Constats : pas de plugin opener (à ajouter, sans permission
`opener:*` côté capacité) ; `save_json` écrit aveuglément ; le panneau « À faire » est construit
par Rust (`ASSISTANT_KINDS`) ; `clinic_public_info` filtre par `CLINIC_PUBLIC_FIELDS`.

## Décisions validées
1. Reprogrammation détectée par Rust dans `save_json` (date ou time change → remise à zéro de
   confirmationSentAt / reminderSentAt et …By).
2. Filtre sur `meddoc_patients.json` : Rust pose whatsappConsentBy (et whatsappConsentAt) quand le
   consentement change, quelle que soit la session.
3. Source Rust `notifications/reminders_source.rs` + jeu de cas partagé
   `tests/fixtures/phone-cases.json` (vitest et cargo).
4. Numéro : celui du patient lié en priorité, `phone` du RDV en repli. Si les deux existent et
   sont DIFFÉRENTS (ex. enfant, RDV pris par un parent), l'aperçu affiche les deux et
   l'utilisateur choisit avant l'envoi. Le numéro choisi n'est pas écrit dans le journal.
5. « Prévu / Confirmé » = PENDING / CONFIRMED.
6. Retrait du consentement : « Non » bloque immédiatement tout envoi, y compris les rappels déjà
   listés dans « À faire » (le recalcul Rust les retire). Test Rust correspondant.

## Commits
1. Services purs + tests (`services/messaging/` : phone, template, consent, provider, defaults,
   sélection des rappels ; `tests/messaging.test.ts`, `tests/fixtures/phone-cases.json`).
2. Types et réglages (types.ts, normalizeAppointmentSettings, Paramètres › Rendez-vous › Messages,
   cabinetName, clinic_public_info).
3. Rust : plugin opener, whatsapp_open, appointment_mark_sent, filtres save_json (RDV et patients),
   IDENTITY_FIELDS, access.rs + access_integration + tests.
4. Consentement dans les écrans.
5. Envoi (détail RDV avec choix du numéro + après création).
6. Source « Rappels de demain » dans « À faire » (Rust).
7. docs/WHATSAPP_API.md.
Chaque commit : tsc, vitest, cargo test --lib (DOCEASE_TEST_MANIFEST=1), build.
