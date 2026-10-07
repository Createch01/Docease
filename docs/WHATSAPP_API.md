# WhatsApp — phase B (API officielle) : préparation

> Préparation uniquement : **aucun code d'envoi par API n'existe**. La phase A envoie par lien
> `wa.me` (gratuit, ouvert par Rust, validation par l'utilisateur dans WhatsApp). Ce document
> liste ce qu'il faudrait pour passer à l'envoi automatique. Il ne contient pas d'avis juridique.

## 1. Où brancher l'API

`services/messaging/provider.ts` définit l'interface `MessagingProvider`
(`canSend`, `sendConfirmation`, `sendReminder`, `sendChangeNotice`). Seule implémentation :
`waLink`. Une implémentation `whatsappCloudApi` aurait la même interface, mais l'appel HTTP et
le jeton resteraient **côté Rust** (nouvelle commande, règle `access.rs`, test d'accès) ; le
frontend ne verrait jamais le jeton. Les règles de consentement, de numéro et de traçabilité
(`messaging.rs`) s'appliqueraient inchangées.

## 2. Prérequis côté Meta

- Compte **Meta Business** (gestionnaire d'entreprise) avec **vérification de l'entreprise**
  (documents du cabinet).
- Une application Meta avec le produit **WhatsApp** et un **compte WhatsApp Business (WABA)**.
- Un **numéro dédié** au cabinet, enregistré sur l'API Cloud : il ne peut pas rester utilisé
  simultanément dans l'application WhatsApp ordinaire du téléphone (à confirmer dans la
  documentation Meta au moment de la mise en œuvre).
- Des **modèles de messages** de catégorie **« utility »** (confirmation, rappel, changement),
  soumis à **approbation** par Meta avant tout envoi hors fenêtre de conversation. Les variables
  d'un modèle approuvé sont figées par Meta : les modèles libres de la phase A
  (Paramètres › Rendez-vous › Messages) devraient être alignés sur les modèles approuvés.
- Des **webhooks** (URL HTTPS publique) pour recevoir les statuts de livraison et les réponses.
  Une application de bureau n'a pas d'URL publique : il faudrait un petit service intermédiaire
  ou renoncer aux statuts de livraison.

## 3. Coût

- Depuis le 1er juillet 2025, Meta facture **par message modèle délivré** (et non plus par
  conversation). Catégories : marketing, utility, authentication, service. Les messages
  « utility » envoyés **dans une fenêtre de service client ouverte** sont gratuits ; hors
  fenêtre, ils sont facturés. Les messages de service sont gratuits.
- Le Maroc figure comme **marché distinct** dans la grille officielle (indicatif 212).
- **Tarif : non relevé.** La page officielle (https://developers.facebook.com/docs/whatsapp/pricing,
  consultée le **2026-10-06**) renvoie la grille par pays à un téléchargement CSV / PDF par
  devise et à un outil interactif ; les montants pour le Maroc n'y étaient pas affichés dans le
  texte consulté. La grille consultée était « en vigueur au 1er juillet 2026 », avec une mise à
  jour annoncée au **1er octobre 2026**. **À faire avant toute décision** : télécharger la grille
  en vigueur depuis cette page et relever le tarif « utility » du Maroc, avec la date.
  Aucun montant n'est repris de mémoire ici.

## 4. Jeton et secrets

- Le jeton d'accès (idéalement un jeton d'utilisateur système de longue durée) serait stocké
  **chiffré côté Rust**, comme la clé de l'IA (`ai_save_key`) : jamais en clair sur disque, jamais
  renvoyé à l'interface, jamais dans les sauvegardes (à ajouter à la liste d'exclusion de
  `is_backup_data_file` et à `tests/backupCoverage.test.ts`).
- Réservé au médecin (`Rule::Medecin`) pour la configuration ; l'assistante déclenche seulement
  l'envoi.

## 5. Limites à connaître

- **Application ouverte et connectée** : l'envoi part du poste ; poste éteint ou sans internet,
  rien ne part. Pas de rappel automatique « en tâche de fond » tant que l'application est fermée.
- Dépendance à un service tiers (disponibilité, changements de tarifs et de règles, suspension
  du compte en cas de signalements).
- Les modèles « utility » ne peuvent pas contenir de promotion ; le contenu reste sans donnée
  médicale (la règle de la phase A est conservée : jamais de motif, de type de consultation ni de
  nom du médecin).
- Les réponses des patients arriveraient sur le numéro dédié : prévoir qui les lit.

## 6. Transfert de données hors du Maroc (loi 09-08, CNDP) — éléments factuels

- Envoyer un message par l'API fait transiter le **numéro de téléphone**, le **prénom** et la
  **date / heure du rendez-vous** vers les serveurs de Meta, situés hors du Maroc. (En phase A,
  ces données passent aussi par WhatsApp, mais c'est l'utilisateur qui envoie depuis son
  application WhatsApp.)
- La loi 09-08 relative à la protection des personnes physiques à l'égard du traitement des
  données à caractère personnel encadre le traitement et le **transfert vers l'étranger**, et
  prévoit des formalités auprès de la **CNDP** (déclaration ou autorisation selon le cas, y
  compris pour les données de santé).
- Un rendez-vous chez un médecin peut révéler une information de santé. Le consentement
  enregistré dans DocEase (`whatsappConsent`, avec date et auteur posés par Rust) documente
  l'accord du patient d'être contacté ; il ne remplace pas les formalités éventuelles auprès de la
  CNDP.
- **À vérifier avec la CNDP ou un conseil juridique** avant le passage à l'API : nécessité d'une
  déclaration / autorisation, mention d'information des patients, durée de conservation des
  traces.
