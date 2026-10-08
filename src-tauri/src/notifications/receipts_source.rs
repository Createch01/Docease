//! Source : intégrité du registre des reçus. Médecin seulement. Alerte rouge jusqu'à résolution.

use super::Item;
use crate::receipts::VerifyReport;

/// Un élément par rupture détectée (chaîne, suite, compteur). Numéros de reçus seulement : ni nom,
/// ni montant, ni motif.
pub fn items(r: &VerifyReport) -> Vec<Item> {
    if r.ok {
        return Vec::new();
    }
    vec![Item {
        id: "receipts:integrity".into(),
        kind: "receipts".into(),
        severity: "critical".into(),
        patient_id: None,
        patient_name: None,
        title: "Registre des reçus : anomalie détectée".into(),
        lines: r.problems.iter().take(5).cloned().collect(),
        count: r.problems.len(),
        action: "open_receipts_settings".into(),
        fingerprint: format!("{}:{}", r.count, r.problems.join("|")),
        dismissible: false,
    }]
}
