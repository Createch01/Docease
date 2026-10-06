//! Source : résultats d'analyses reçus, sans interprétation du médecin. Médecin seulement.

use std::collections::BTreeMap;

use serde_json::Value;

use super::Item;

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

pub fn items(results: &[Value], patients: &[Value]) -> Vec<Item> {
    let mut by_patient: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    for r in results.iter().filter(|r| s(r, "interpretation").trim().is_empty() && !s(r, "patientId").is_empty()) {
        by_patient.entry(s(r, "patientId").to_string()).or_default().push(r);
    }
    by_patient
        .into_iter()
        .map(|(pid, rs)| {
            let name = patients.iter().find(|p| s(p, "id") == pid).map(|p| s(p, "name").to_string()).unwrap_or_else(|| "Patient".into());
            let mut ids: Vec<&str> = rs.iter().map(|r| s(r, "id")).collect();
            ids.sort();
            let what = if rs.len() == 1 { "1 résultat".to_string() } else { format!("{} résultats", rs.len()) };
            Item {
                id: format!("results:{pid}"),
                kind: "results".into(),
                severity: "todo".into(),
                title: format!("{name} — {what} à interpréter"),
                lines: rs.iter().map(|r| s(r, "title").to_string()).collect(),
                count: rs.len(),
                patient_id: Some(pid),
                patient_name: Some(name),
                action: "open_dossier".into(),
                fingerprint: ids.join(","),
                dismissible: true,
            }
        })
        .collect()
}
