use super::*;
use crate::backup::{DestStatus, Status};
use serde_json::json;

const TODAY: &str = "2026-10-04";

fn data() -> (Vec<Value>, Vec<Value>, Vec<Value>, Vec<Value>) {
    let patients = vec![json!({"id": "p1", "name": "HAYAT Salma", "pathologies": "Diabète"})];
    let results = vec![
        json!({"id": "r1", "patientId": "p1", "title": "NFS", "interpretation": ""}),
        json!({"id": "r2", "patientId": "p1", "title": "Glycémie", "interpretation": "   "}),
        json!({"id": "r3", "patientId": "p1", "title": "CRP", "interpretation": "Normale"}),
    ];
    let appointments = vec![
        json!({"id": "a1", "patientId": "p1", "patientName": "HAYAT Salma", "date": TODAY, "time": "09:30", "status": "REJECTED", "note": "douleur thoracique"}),
        json!({"id": "a2", "patientName": "DUPONT Jean", "date": TODAY, "status": "CONFIRMED", "note": "x"}),
        json!({"id": "a3", "patientName": "OLD", "date": "2026-10-01", "status": "REJECTED"}),
    ];
    let notes = vec![
        json!({"id": "n1", "status": "UNPAID", "totalAmount": 300}),
        json!({"id": "n2", "status": "PARTIAL", "totalAmount": 500, "amountPaid": 200}),
        json!({"id": "n3", "status": "PAID", "totalAmount": 400}),
    ];
    (patients, results, appointments, notes)
}

fn status(level: &'static str, reason: Option<&str>, redundancy: Option<&'static str>, accessible: bool) -> Status {
    Status {
        has_passphrase: true,
        configured: true,
        last_success_at: Some(1),
        age_secs: Some(1),
        last_error: None,
        attachments_count: 0,
        attachments_bytes: 0,
        attachments_level: "ok",
        altered_attachments: Vec::new(),
        destinations: vec![DestStatus { role: "principal", path: "D:\\sauvegardes".into(), accessible, error: None }],
        level,
        reason: reason.map(String::from),
        redundancy,
    }
}

fn run(role: Role, backup: Option<&Status>) -> Vec<Item> {
    let (patients, results, appointments, notes) = data();
    build(&Inputs { role, today: TODAY, appointments: &appointments, patients: &patients, results: &results, notes: &notes, backup, receipts: None })
}

#[test]
fn medecin_gets_every_source_grouped_per_patient() {
    let b = status("ok", None, None, true);
    let items = run(Role::Medecin, Some(&b));
    let kinds: Vec<&str> = items.iter().map(|i| i.kind.as_str()).collect();
    assert!(kinds.contains(&"results") && kinds.contains(&"appointments_changed") && kinds.contains(&"unpaid"));
    let res = items.iter().find(|i| i.kind == "results").unwrap();
    assert_eq!(res.count, 2, "une seule carte par patient, deux résultats sans interprétation");
    assert_eq!(res.title, "HAYAT Salma — 2 résultats à interpréter");
    let unpaid = items.iter().find(|i| i.kind == "unpaid").unwrap();
    assert_eq!((unpaid.count, unpaid.severity.as_str()), (2, "info"));
    assert!(unpaid.title.contains("600"), "{}", unpaid.title);
}

#[test]
fn assistant_sees_only_appointments_and_no_medical_text() {
    let b = status("alert", Some("Dernière sauvegarde de plus de 48 h."), Some("no_secondary"), true);
    let items = run(Role::Assistant, Some(&b));
    assert!(!items.is_empty());
    assert!(items.iter().all(|i| ASSISTANT_KINDS.contains(&i.kind.as_str())));
    let json = serde_json::to_string(&items).unwrap().to_lowercase();
    for forbidden in ["nfs", "glycémie", "diabète", "thoracique", "vaccin", "résultat", "impayée", "sauvegarde", "interpr"] {
        assert!(!json.contains(forbidden), "l'assistante ne doit pas recevoir « {forbidden} » : {json}");
    }
}

#[test]
fn assistant_cannot_inject_items_nor_act_on_medical_ids() {
    let extra = vec![Item { id: "vaccines:p1".into(), kind: "vaccines".into(), severity: "critical".into(), patient_id: None, patient_name: None, title: "BCG".into(), lines: vec![], count: 1, action: "x".into(), fingerprint: "f".into(), dismissible: false }];
    assert!(sanitize_extra(Role::Assistant, extra.clone()).is_empty());
    let kept = sanitize_extra(Role::Medecin, extra);
    assert_eq!((kept[0].severity.as_str(), kept[0].dismissible), ("todo", true), "un vaccin n'est jamais critique");
    let other = Item { kind: "backup".into(), ..kept[0].clone() };
    assert!(sanitize_extra(Role::Medecin, vec![other]).is_empty(), "type non autorisé refusé");
    assert!(!id_allowed(Role::Assistant, "results:p1"));
    assert!(!id_allowed(Role::Assistant, "vaccines:p1"));
    assert!(id_allowed(Role::Assistant, "appointments_changed:p1"));
    assert!(id_allowed(Role::Medecin, "vaccines:p1"));
    assert!(!id_allowed(Role::Medecin, "../x") && !id_allowed(Role::Medecin, ""));
}

#[test]
fn only_backup_failures_are_critical() {
    let late = status("alert", Some("Dernière sauvegarde de plus de 48 h."), None, true);
    let items = run(Role::Medecin, Some(&late));
    let crit: Vec<_> = items.iter().filter(|i| i.severity == "critical").collect();
    assert_eq!(crit.len(), 1);
    assert_eq!((crit[0].kind.as_str(), crit[0].dismissible, crit[0].action.as_str()), ("backup", false, "backup_now"));
    // Emplacement inaccessible : critique, action = réglages.
    let down = status("alert", Some("Emplacement principal inaccessible"), None, false);
    assert_eq!(run(Role::Medecin, Some(&down)).iter().find(|i| i.kind == "backup").unwrap().action, "open_backup_settings");
    // 24-48 h : orange, pas critique.
    let warn = status("warning", Some("Dernière sauvegarde de plus de 24 h."), None, true);
    assert!(run(Role::Medecin, Some(&warn)).iter().filter(|i| i.kind == "backup").all(|i| i.severity == "todo"));
    // Tout le reste n'est jamais critique.
    assert!(run(Role::Medecin, None).iter().all(|i| i.severity != "critical"));
}

#[test]
fn snooze_and_dismiss_keep_state_until_the_content_changes() {
    let items = run(Role::Medecin, None);
    let res = items.iter().find(|i| i.kind == "results").unwrap().clone();
    let mut st = BTreeMap::new();
    st.insert(res.id.clone(), Entry { fp: res.fingerprint.clone(), mode: "dismissed".into(), until: String::new() });
    assert!(!apply_state(items.clone(), &st, TODAY).iter().any(|i| i.kind == "results"), "ignoré : masqué");
    // Nouveau résultat : l'empreinte change, la carte réapparaît.
    st.insert(res.id.clone(), Entry { fp: "autre".into(), mode: "dismissed".into(), until: String::new() });
    assert!(apply_state(items.clone(), &st, TODAY).iter().any(|i| i.kind == "results"));
    // Reporté à demain : masqué aujourd'hui, visible demain.
    st.insert(res.id.clone(), Entry { fp: res.fingerprint.clone(), mode: "snoozed".into(), until: "2026-10-05".into() });
    assert!(!apply_state(items.clone(), &st, TODAY).iter().any(|i| i.kind == "results"));
    assert!(apply_state(items.clone(), &st, "2026-10-05").iter().any(|i| i.kind == "results"));
    // Un élément critique ne peut pas être masqué.
    let late = status("alert", Some("x"), None, true);
    let crit = run(Role::Medecin, Some(&late));
    let c = crit.iter().find(|i| i.severity == "critical").unwrap();
    st.insert(c.id.clone(), Entry { fp: c.fingerprint.clone(), mode: "dismissed".into(), until: String::new() });
    assert!(apply_state(crit, &st, TODAY).iter().any(|i| i.severity == "critical"));
}

#[test]
fn sorted_critical_then_todo_then_info() {
    let late = status("alert", Some("x"), None, true);
    let sorted = apply_state(run(Role::Medecin, Some(&late)), &BTreeMap::new(), TODAY);
    let ranks: Vec<u8> = sorted.iter().map(|i| rank(&i.severity)).collect();
    assert!(ranks.windows(2).all(|w| w[0] <= w[1]), "{ranks:?}");
}

#[test]
fn altered_attachment_is_a_critical_doctor_only_backup_alert_without_content() {
    use crate::backup_pj::Altered;
    let mut b = status("ok", None, None, true);
    b.altered_attachments = vec![Altered { id: "a1b2".into(), patient_id: "p1".into(), patient_name: Some("HAYAT Salma".into()) }];
    let items = run(Role::Medecin, Some(&b));
    let it = items.iter().find(|i| i.id == "backup:altered:a1b2").expect("alerte");
    assert_eq!((it.severity.as_str(), it.kind.as_str(), it.dismissible), ("critical", "backup", false));
    assert!(it.title.contains("HAYAT Salma") && it.lines.iter().any(|l| l.contains("a1b2")));
    assert!(run(Role::Assistant, Some(&b)).iter().all(|i| i.kind != "backup"), "jamais pour l'assistante");
}

#[test]
fn receipts_integrity_alert_is_critical_doctor_only_and_content_free() {
    use crate::receipts::VerifyReport;
    let bad = VerifyReport { ok: false, count: 3, last_number: Some("REC-2026-00003".into()), problems: vec!["Suite interrompue en 2026 : attendu REC-2026-00002, trouvé REC-2026-00003.".into()] };
    let (patients, results, appointments, notes) = data();
    let run_with = |role| build(&Inputs { role, today: TODAY, appointments: &appointments, patients: &patients, results: &results, notes: &notes, backup: None, receipts: Some(&bad) });
    let it = run_with(Role::Medecin).into_iter().find(|i| i.kind == "receipts").expect("alerte");
    assert_eq!((it.severity.as_str(), it.dismissible, it.action.as_str()), ("critical", false, "open_receipts_settings"));
    assert!(run_with(Role::Assistant).iter().all(|i| i.kind != "receipts"));
    let ok = VerifyReport { ok: true, count: 3, last_number: None, problems: vec![] };
    let none = build(&Inputs { role: Role::Medecin, today: TODAY, appointments: &appointments, patients: &patients, results: &results, notes: &notes, backup: None, receipts: Some(&ok) });
    assert!(none.iter().all(|i| i.kind != "receipts"));
}
