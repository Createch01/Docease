//! Source : notes d'honoraires impayées (résumé unique, médecin seulement).

use serde_json::Value;

use super::Item;

pub fn items(notes: &[Value]) -> Vec<Item> {
    let mut count = 0usize;
    let mut due = 0f64;
    for n in notes {
        let status = n.get("status").and_then(|x| x.as_str()).unwrap_or("UNPAID");
        if status == "PAID" {
            continue;
        }
        let total = n.get("totalAmount").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let paid = if status == "PARTIAL" { n.get("amountPaid").and_then(|x| x.as_f64()).unwrap_or(0.0) } else { 0.0 };
        if total - paid > 0.0 {
            count += 1;
            due += total - paid;
        }
    }
    if count == 0 {
        return Vec::new();
    }
    let amount = due.round() as i64;
    let title = if count == 1 {
        format!("1 note d'honoraires impayée — {amount} à encaisser")
    } else {
        format!("{count} notes d'honoraires impayées — {amount} à encaisser")
    };
    vec![Item {
        id: "unpaid:summary".into(),
        kind: "unpaid".into(),
        severity: "info".into(),
        patient_id: None,
        patient_name: None,
        title,
        lines: vec![],
        count,
        action: "open_billing".into(),
        fingerprint: format!("{count}:{amount}"),
        dismissible: true,
    }]
}
