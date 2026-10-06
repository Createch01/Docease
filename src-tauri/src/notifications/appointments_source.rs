//! Source : rendez-vous annulés aujourd'hui. Visible par l'assistante : jamais de motif de
//! consultation (champ `note`), seulement nom et heure. (Les RDV « déplacés » ne sont pas
//! historisés par l'application : non couverts.)

use std::collections::BTreeMap;

use serde_json::Value;

use super::Item;

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

pub fn items(appointments: &[Value], today: &str) -> Vec<Item> {
    let mut groups: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    for a in appointments.iter().filter(|a| s(a, "status") == "REJECTED" && s(a, "date") == today) {
        let key = if !s(a, "patientId").is_empty() { s(a, "patientId") } else { s(a, "patientName") };
        groups.entry(key.to_string()).or_default().push(a);
    }
    groups
        .into_iter()
        .map(|(key, apps)| {
            let name = s(apps[0], "patientName").to_string();
            let mut times: Vec<String> = apps.iter().map(|a| if s(a, "time").is_empty() { "sans heure".to_string() } else { s(a, "time").to_string() }).collect();
            times.sort();
            let mut ids: Vec<&str> = apps.iter().map(|a| s(a, "id")).collect();
            ids.sort();
            let what = if apps.len() == 1 { "RDV annulé aujourd'hui".to_string() } else { format!("{} RDV annulés aujourd'hui", apps.len()) };
            Item {
                id: format!("appointments_changed:{key}"),
                kind: "appointments_changed".into(),
                severity: "todo".into(),
                title: format!("{name} — {what}"),
                lines: times,
                count: apps.len(),
                patient_id: if s(apps[0], "patientId").is_empty() { None } else { Some(s(apps[0], "patientId").to_string()) },
                patient_name: Some(name),
                action: "open_appointments".into(),
                fingerprint: format!("{today}:{}", ids.join(",")),
                dismissible: true,
            }
        })
        .collect()
}
