# Idées à reprendre plus tard

- **Bibliothèque de documents de référence** (ancienne `MedicalDirectory`, protocoles PDF/Word/texte). Les données `meddoc_medical_resources` sont conservées ; l'interface a été retirée lors du nettoyage (voir l'historique git, commit `53e6d51`).
- **Numérotation des notes d'honoraires** : remplacer `count + 1` (`HonoraryNoteEditor`, `billingService`, `scoped::apply_payment`) par un compteur Rust séquentiel non réutilisable, comme les reçus (`receipts.rs`). Étape suivante après le reçu ; la migration ne renumérote jamais une note déjà émise.
