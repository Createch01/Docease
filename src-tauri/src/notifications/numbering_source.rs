//! Source : cohérence de la numérotation des notes d'honoraires (anomalies HÉRITÉES, jamais corrigées).
//! Médecin seulement. Orange et ignorable : elle réapparaît si le constat change.

use serde_json::Value;

use super::Item;
use crate::numbering::check;

pub fn items(notes: &[Value]) -> Vec<Item> {
    let r = check(notes);
    if r.clean {
        return Vec::new();
    }
    let mut lines = Vec::new();
    if !r.duplicates.is_empty() {
        lines.push(format!("Numéros en double : {}", r.duplicates.join(", ")));
    }
    if r.gaps_total > 0 {
        lines.push(format!("{} numéro{} manquant{} dans la suite", r.gaps_total, if r.gaps_total > 1 { "s" } else { "" }, if r.gaps_total > 1 { "s" } else { "" }));
    }
    if !r.malformed.is_empty() {
        lines.push(format!("Numéros mal formés : {}", r.malformed.join(", ")));
    }
    let count = r.duplicates.len() + r.malformed.len() + r.gaps_total;
    vec![Item {
        id: "numbering:check".into(),
        kind: "numbering".into(),
        severity: "todo".into(),
        patient_id: None,
        patient_name: None,
        title: "Numérotation des notes d'honoraires : anomalies héritées".into(),
        lines,
        count,
        action: "open_numbering_settings".into(),
        fingerprint: format!("{}|{}|{}", r.duplicates.join(","), r.gaps_total, r.malformed.join(",")),
        dismissible: true,
    }]
}
