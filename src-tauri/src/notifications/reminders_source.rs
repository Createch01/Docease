//! Source : rappels WhatsApp de demain. Visible par le médecin ET l'assistante : aucune donnée
//! médicale (jamais de motif ni de type de consultation), seulement nom et heure / numéro d'arrivée.
//!
//! Éligible : RDV de demain, statut PENDING ou CONFIRMED, lié à un dossier dont le consentement
//! WhatsApp vaut « yes » (relu à chaque calcul : un retrait le retire aussitôt), numéro mobile
//! valide (celui du dossier ou, à défaut, celui du RDV) et `reminderSentAt` vide. L'élément se vide
//! tout seul quand Rust pose `reminderSentAt` (`appointment_mark_sent`).

use serde_json::Value;

use super::Item;
use crate::messaging::normalize_whatsapp_number;
use crate::util;
use crate::util::next_day;

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

/// Rendez-vous de demain à rappeler (références dans `appointments`).
pub fn eligible<'a>(appointments: &'a [Value], patients: &[Value], today: &str) -> Vec<&'a Value> {
    let Some(tomorrow) = next_day(today) else { return Vec::new() };
    appointments
        .iter()
        .filter(|a| s(a, "date") == tomorrow)
        .filter(|a| matches!(s(a, "status"), "PENDING" | "CONFIRMED"))
        .filter(|a| s(a, "reminderSentAt").is_empty())
        .filter(|a| {
            let pid = s(a, "patientId");
            if pid.is_empty() {
                return false;
            }
            let Some(p) = patients.iter().find(|p| s(p, "id") == pid) else { return false };
            s(p, "whatsappConsent") == "yes"
                && (normalize_whatsapp_number(s(p, "phone")).is_some() || normalize_whatsapp_number(s(a, "phone")).is_some())
        })
        .collect()
}

pub fn items(appointments: &[Value], patients: &[Value], today: &str) -> Vec<Item> {
    let Some(tomorrow) = next_day(today) else { return Vec::new() };
    let mut list = eligible(appointments, patients, today);
    if list.is_empty() {
        return Vec::new();
    }
    list.sort_by(|a, b| {
        let ka = (s(a, "time").to_string(), a.get("queueNumber").and_then(|n| n.as_u64()).unwrap_or(0));
        let kb = (s(b, "time").to_string(), b.get("queueNumber").and_then(|n| n.as_u64()).unwrap_or(0));
        ka.cmp(&kb)
    });
    let lines: Vec<String> = list
        .iter()
        .map(|a| {
            let when = if !s(a, "time").is_empty() {
                s(a, "time").to_string()
            } else if let Some(n) = a.get("queueNumber").and_then(|n| n.as_u64()) {
                format!("n° {n}")
            } else {
                "sans heure".to_string()
            };
            format!("{when} — {}", s(a, "patientName"))
        })
        .collect();
    let mut ids: Vec<&str> = list.iter().map(|a| s(a, "id")).collect();
    ids.sort();
    let title = if list.len() == 1 { "1 rappel WhatsApp à envoyer pour demain".to_string() } else { format!("{} rappels WhatsApp à envoyer pour demain", list.len()) };
    vec![Item {
        id: format!("reminders_tomorrow:{tomorrow}"),
        kind: "reminders_tomorrow".into(),
        severity: "todo".into(),
        patient_id: None,
        patient_name: None,
        title,
        lines,
        count: list.len(),
        action: "open_reminders".into(),
        fingerprint: format!("{tomorrow}:{}", ids.join(",")),
        dismissible: true,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const TODAY: &str = "2026-10-06";

    fn patient(id: &str, consent: Option<&str>, phone: &str) -> Value {
        let mut p = json!({"id": id, "name": "X", "phone": phone, "pathologies": "Diabète"});
        if let Some(c) = consent {
            p["whatsappConsent"] = json!(c);
        }
        p
    }

    fn appt(id: &str, patient_id: Option<&str>, over: Value) -> Value {
        let mut a = json!({"id": id, "patientName": format!("NOM {id}"), "date": "2026-10-07", "time": "10:00", "status": "CONFIRMED", "phone": "", "note": "douleur thoracique", "consultationType": "ECG"});
        if let Some(p) = patient_id {
            a["patientId"] = json!(p);
        }
        for (k, v) in over.as_object().unwrap() {
            a[k] = v.clone();
        }
        a
    }

    fn ids(list: Vec<&Value>) -> Vec<String> {
        list.iter().map(|a| s(a, "id").to_string()).collect()
    }

    #[test]
    fn tomorrow_across_month_and_year() {
        assert_eq!(next_day("2026-10-06").as_deref(), Some("2026-10-07"));
        assert_eq!(next_day("2026-10-31").as_deref(), Some("2026-11-01"));
        assert_eq!(next_day("2026-12-31").as_deref(), Some("2027-01-01"));
        assert_eq!(next_day("2028-02-28").as_deref(), Some("2028-02-29"));
        assert_eq!(next_day("n'importe quoi"), None);
    }


    #[test]
    fn reminders_follow_the_local_day_around_local_midnight() {
        // 23:30 UTC le 06/10 = 00:30 le 07/10 à Casablanca : « aujourd'hui » est le 07, « demain » le 08.
        let secs = util::days_from_civil(2026, 10, 6) as u64 * 86_400 + 23 * 3_600 + 1_800;
        let today_local = util::date_local_at(secs, 3_600);
        let today_utc = util::date_utc(secs);
        assert_eq!((today_local.as_str(), today_utc.as_str()), ("2026-10-07", "2026-10-06"));
        let patients = vec![patient("p1", Some("yes"), "0612345678")];
        let apps = vec![
            appt("rdv-du-08", Some("p1"), json!({"date": "2026-10-08"})),
            appt("rdv-du-07", Some("p1"), json!({"date": "2026-10-07"})),
        ];
        assert_eq!(ids(eligible(&apps, &patients, &today_local)), vec!["rdv-du-08"], "rappel du lendemain LOCAL");
        assert_eq!(ids(eligible(&apps, &patients, &today_utc)), vec!["rdv-du-07"], "(le calcul UTC se trompait de jour)");
    }


    #[test]
    fn selects_only_eligible_appointments() {
        let patients = vec![
            patient("ok", Some("yes"), "0612345678"),
            patient("no", Some("no"), "0612345678"),
            patient("unset", None, "0612345678"),
            patient("fixe", Some("yes"), "0522123456"),
            patient("fixe2", Some("yes"), "0522123456"),
        ];
        let apps = vec![
            appt("a-ok", Some("ok"), json!({})),
            appt("a-prevu", Some("ok"), json!({"status": "PENDING"})),
            appt("a-no", Some("no"), json!({})),
            appt("a-unset", Some("unset"), json!({})),
            appt("a-fixe", Some("fixe"), json!({})),
            appt("a-fixe-repli", Some("fixe2"), json!({"phone": "0712345678"})),
            appt("a-sans-dossier", None, json!({})),
            appt("a-dossier-inconnu", Some("zz"), json!({})),
            appt("a-auj", Some("ok"), json!({"date": TODAY})),
            appt("a-apres", Some("ok"), json!({"date": "2026-10-08"})),
            appt("a-annule", Some("ok"), json!({"status": "REJECTED"})),
            appt("a-arrive", Some("ok"), json!({"status": "ARRIVED"})),
            appt("a-deja", Some("ok"), json!({"reminderSentAt": "2026-10-06T08:00:00Z"})),
        ];
        assert_eq!(ids(eligible(&apps, &patients, TODAY)), vec!["a-ok", "a-prevu", "a-fixe-repli"]);
    }

    #[test]
    fn withdrawing_consent_removes_the_listed_reminder_on_recalculation() {
        let apps = vec![appt("a1", Some("p1"), json!({}))];
        let yes = vec![patient("p1", Some("yes"), "0612345678")];
        let no = vec![patient("p1", Some("no"), "0612345678")];
        assert_eq!(items(&apps, &yes, TODAY).len(), 1);
        assert!(items(&apps, &no, TODAY).is_empty(), "le retrait du consentement retire le rappel déjà listé");
        // Marqué comme envoyé : l'élément se vide.
        let mut sent = apps.clone();
        sent[0]["reminderSentAt"] = json!("2026-10-06T09:00:00Z");
        assert!(items(&sent, &yes, TODAY).is_empty());
    }

    #[test]
    fn item_is_grouped_sorted_and_carries_no_medical_content() {
        let patients = vec![patient("p1", Some("yes"), "0612345678"), patient("p2", Some("yes"), "0712345678")];
        let apps = vec![appt("b", Some("p2"), json!({"time": "11:30"})), appt("a", Some("p1"), json!({"time": "09:00"})), appt("c", Some("p1"), json!({"time": "", "queueNumber": 4}))];
        let it = items(&apps, &patients, TODAY);
        assert_eq!(it.len(), 1);
        let it = &it[0];
        assert_eq!(it.kind, "reminders_tomorrow");
        assert_eq!(it.count, 3);
        assert_eq!(it.lines, vec!["n° 4 — NOM c", "09:00 — NOM a", "11:30 — NOM b"]);
        assert_eq!(it.action, "open_reminders");
        let json = serde_json::to_string(it).unwrap();
        for forbidden in ["douleur", "ECG", "Diabète", "pathologies", "0612345678"] {
            assert!(!json.contains(forbidden), "{forbidden}");
        }
        assert!(super::super::ASSISTANT_KINDS.contains(&it.kind.as_str()), "visible par l'assistante");
    }
}
