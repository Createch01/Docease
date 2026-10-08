use super::*;
use serde_json::json;
use std::fs;

const KEY: [u8; KEY_LEN] = [6u8; KEY_LEN];
const TODAY: &str = "2026-10-08";

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-num-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn note(id: &str, number: &str, date: &str) -> Value {
    json!({"id": id, "patientId": "p1", "date": date, "invoiceNumber": number, "totalAmount": 300, "status": "PAID", "paymentMode": "CASH"})
}

/// Équivalent de `save_json` pour le fichier des notes : crochet, écriture, puis compteur.
fn save(d: &Path, list: Vec<Value>, today: &str) -> Result<Vec<Value>, String> {
    let (data, pending) = on_save(d, &KEY, Value::Array(list), today, "test")?;
    write_enc_json_in(d, &KEY, NOTES_FILE, &data)?;
    pending.commit()?;
    Ok(read_notes(d, &KEY))
}

fn numbers(list: &[Value]) -> Vec<String> {
    list.iter().map(|n| number_of(n).to_string()).collect()
}

#[test]
fn parsing_and_formatting() {
    assert_eq!(parse_number("2026-0042"), Some((2026, 42)));
    assert_eq!(parse_number("2026-12345"), Some((2026, 12345)));
    for bad in ["", "2026-42", "26-0042", "2026-00a2", "2026/0042", "REC-2026-00001", " 2026-0042"] {
        assert_eq!(parse_number(bad), None, "{bad:?}");
    }
    assert_eq!(format_number(2026, 7), "2026-0007");
    assert_eq!(format_number(2026, 10_000), "2026-10000");
}

#[test]
fn new_notes_get_consecutive_numbers_and_the_emission_date() {
    let d = tmp("new");
    // Le frontend propose un numéro et une date : ignorés.
    let out = save(&d, vec![note("a", "2026-0099", "2020-01-01"), note("b", "", "1999-12-31")], TODAY).unwrap();
    assert_eq!(numbers(&out), vec!["2026-0001", "2026-0002"]);
    assert!(out.iter().all(|n| n["date"] == TODAY), "date = jour d'émission");
    assert_eq!(load_counter(&d, &KEY).get(2026), 2);
    let out = save(&d, vec![out[0].clone(), out[1].clone(), note("c", "", TODAY)], "2026-10-09").unwrap();
    assert_eq!(numbers(&out), vec!["2026-0001", "2026-0002", "2026-0003"]);
    assert_eq!(out[2]["date"], "2026-10-09");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn year_is_the_emission_year_and_restarts_each_year() {
    let d = tmp("year");
    let a = save(&d, vec![note("a", "", "2025-06-01")], "2026-12-31").unwrap();
    let b = save(&d, vec![a[0].clone(), note("b", "", "")], "2027-01-02").unwrap();
    assert_eq!(numbers(&b), vec!["2026-0001", "2027-0001"]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn an_assigned_number_and_date_can_never_be_changed() {
    let d = tmp("fixed");
    let first = save(&d, vec![note("a", "", "")], TODAY).unwrap();
    let mut tampered = first[0].clone();
    tampered["invoiceNumber"] = json!("2026-0777");
    tampered["date"] = json!("2019-03-03");
    tampered["totalAmount"] = json!(450); // les autres champs restent modifiables
    let out = save(&d, vec![tampered], "2026-11-01").unwrap();
    assert_eq!((number_of(&out[0]), out[0]["date"].as_str(), out[0]["totalAmount"].as_i64()), ("2026-0001", Some(TODAY), Some(450)));
    assert_eq!(load_counter(&d, &KEY).get(2026), 1, "aucun numéro consommé par une retouche");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn numbered_notes_cannot_be_deleted_but_unnumbered_ones_can() {
    let d = tmp("nodel");
    let first = save(&d, vec![note("a", "", ""), note("b", "", "")], TODAY).unwrap();
    // Liste sans « a » (suppression tentée, ou cache périmé) : « a » est conservée.
    let out = save(&d, vec![first[1].clone()], TODAY).unwrap();
    assert_eq!(out.len(), 2);
    assert!(out.iter().any(|n| n["id"] == "a" && number_of(n) == "2026-0001"));
    // Liste vide : rien n'est perdu.
    assert_eq!(save(&d, vec![], TODAY).unwrap().len(), 2);
    // Une note stockée SANS numéro (héritée) peut être supprimée.
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([note("old", "", "2025-01-01"), first[0].clone()])).unwrap();
    let out = save(&d, vec![first[0].clone()], TODAY).unwrap();
    assert_eq!(out.len(), 1);
    // Et un numéro n'est jamais réattribué, même après disparition (compteur).
    let out = save(&d, vec![out[0].clone(), note("n", "", "")], TODAY).unwrap();
    assert_eq!(numbers(&out), vec!["2026-0001", "2026-0003"], "0002 reste brûlé");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn migration_starts_the_counter_at_the_highest_existing_number_without_touching_notes() {
    let d = tmp("migr");
    let legacy = vec![note("a", "2026-0010", "2026-03-01"), note("b", "2026-0004", "2026-02-01"), note("c", "2025-0120", "2025-12-30"), note("d", "libre", "2026-04-01")];
    write_enc_json_in(&d, &KEY, NOTES_FILE, &Value::Array(legacy.clone())).unwrap();
    assert!(!d.join(COUNTER_FILE).exists());
    let out = save(&d, legacy.clone(), TODAY).unwrap();
    assert_eq!(out, legacy, "notes héritées inchangées octet pour octet");
    let c = load_counter(&d, &KEY);
    assert_eq!((c.get(2026), c.get(2025)), (10, 120));
    let out = save(&d, [legacy, vec![note("n", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&out[4]), "2026-0011");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn legacy_unnumbered_notes_are_numbered_on_next_write_keeping_their_date() {
    let d = tmp("legacy");
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([note("old", "", "2025-05-05")])).unwrap();
    let stored = read_notes(&d, &KEY);
    let out = save(&d, stored, TODAY).unwrap();
    assert_eq!((number_of(&out[0]), out[0]["date"].as_str()), ("2025-0001", Some("2025-05-05")), "année de la date de la note héritée");
    // Désormais figée.
    let mut again = out[0].clone();
    again["date"] = json!("2026-01-01");
    assert_eq!(save(&d, vec![again], TODAY).unwrap()[0]["date"], "2025-05-05");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn counter_behind_after_an_interrupted_write_is_repaired_by_the_max_rule() {
    let d = tmp("crash");
    save(&d, vec![note("a", "", ""), note("b", "", "")], TODAY).unwrap();
    // Plantage simulé entre le fichier des notes et le compteur : compteur remis en arrière.
    let mut behind = Counter::default();
    behind.years.insert("2026".into(), 1);
    save_counter(&d, &KEY, &behind).unwrap();
    let stored = read_notes(&d, &KEY);
    let out = save(&d, [stored, vec![note("c", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(numbers(&out), vec!["2026-0001", "2026-0002", "2026-0003"]);
    // Compteur absent : même résultat.
    fs::remove_file(d.join(COUNTER_FILE)).unwrap();
    let stored = read_notes(&d, &KEY);
    let out = save(&d, [stored, vec![note("e", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&out[3]), "2026-0004");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn numbers_grow_past_four_digits_and_malformed_ones_are_ignored_by_the_counter() {
    let d = tmp("grow");
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([note("a", "2026-9999", TODAY), note("b", "2026-99999999999999999999999", TODAY)])).unwrap();
    let stored = read_notes(&d, &KEY);
    let out = save(&d, [stored, vec![note("n", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&out[2]), "2026-10000");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn cancellation_fields_are_never_taken_from_the_frontend() {
    let d = tmp("cancelfields");
    let first = save(&d, vec![note("a", "", "")], TODAY).unwrap();
    let mut forged = first[0].clone();
    forged["cancelledAt"] = json!("2026-10-08T10:00:00Z");
    forged["cancelledBy"] = json!("moi");
    forged["cancellationReason"] = json!("x");
    let out = save(&d, vec![forged, note("new", "", "")], TODAY).unwrap();
    assert!(out.iter().all(|n| !is_cancelled(n) && n.get("cancelledBy").is_none()));
    // Une note annulée par Rust est figée : toute retouche est écartée.
    let mut stored = read_notes(&d, &KEY);
    stored[0]["cancelledAt"] = json!("2026-10-08T11:00:00Z");
    stored[0]["cancelledBy"] = json!("Dr");
    stored[0]["cancellationReason"] = json!("erreur");
    write_enc_json_in(&d, &KEY, NOTES_FILE, &Value::Array(stored.clone())).unwrap();
    let mut edit = stored[0].clone();
    edit["totalAmount"] = json!(1);
    edit["status"] = json!("UNPAID");
    edit.as_object_mut().unwrap().remove("cancelledAt");
    let out = save(&d, vec![edit, stored[1].clone()], TODAY).unwrap();
    assert_eq!(out[0], stored[0]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn concurrent_saves_never_hand_out_the_same_number() {
    let d = tmp("conc");
    // Chaque thread envoie une liste périmée ne contenant que sa note (cas du cache obsolète).
    let handles: Vec<_> = (0..12)
        .map(|i| {
            let d = d.clone();
            std::thread::spawn(move || {
                save(&d, vec![note(&format!("n{i}"), "", "")], TODAY).unwrap();
            })
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    let all = read_notes(&d, &KEY);
    assert_eq!(all.len(), 12, "aucune note numérotée n'est perdue par une liste périmée");
    let mut got = numbers(&all);
    got.sort();
    let expected: Vec<String> = (1..=12).map(|n| format_number(2026, n)).collect();
    assert_eq!(got, expected);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn non_list_payload_is_refused_without_touching_the_file() {
    let d = tmp("bad");
    save(&d, vec![note("a", "", "")], TODAY).unwrap();
    let before = fs::read(d.join(NOTES_FILE)).unwrap();
    assert!(on_save(&d, &KEY, json!({"x": 1}), TODAY, "test").is_err());
    assert!(on_save(&d, &KEY, json!([1, 2]), TODAY, "test").is_err());
    assert_eq!(fs::read(d.join(NOTES_FILE)).unwrap(), before);
    let _ = fs::remove_dir_all(&d);
}

// ─── Annulation, contrôle, assistante, restauration ──────────────────────────

use crate::access::Role;

fn cancel_ok(d: &Path, id: &str) -> Result<Value, String> {
    cancel(d, &KEY, Role::Medecin, id, "  Erreur   de saisie ", "Dr", "2026-10-08T10:00:00Z")
}

#[test]
fn cancellation_keeps_the_number_and_freezes_the_note() {
    let d = tmp("cancel");
    let notes = save(&d, vec![note("a", "", ""), note("b", "", "")], TODAY).unwrap();
    let c = cancel_ok(&d, "a").unwrap();
    assert_eq!((number_of(&c), c["cancelledBy"].as_str(), c["cancellationReason"].as_str()), ("2026-0001", Some("Dr"), Some("Erreur de saisie")));
    assert_eq!(c["cancelledAt"], "2026-10-08T10:00:00Z");
    let stored = read_notes(&d, &KEY);
    assert_eq!(stored.len(), 2, "la note reste dans la liste");
    assert!(is_cancelled(&stored[0]) && !is_cancelled(&stored[1]));
    // Figée : toute retouche du frontend est écartée, et elle ne peut pas être « dé-annulée ».
    let mut edit = notes[0].clone();
    edit["totalAmount"] = json!(1);
    let after = save(&d, vec![edit, stored[1].clone()], TODAY).unwrap();
    assert_eq!(after[0], stored[0]);
    // Le numéro annulé n'est jamais réattribué.
    let after = save(&d, [after, vec![note("n", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&after[2]), "2026-0003");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn cancellation_rules() {
    let d = tmp("cancelrules");
    save(&d, vec![note("a", "", "")], TODAY).unwrap();
    // Médecin seulement.
    assert!(cancel(&d, &KEY, Role::Assistant, "a", "erreur", "Sara", "t").unwrap_err().contains("médecin"));
    // Motif obligatoire et borné.
    for bad in ["", "   ", "ab"] {
        assert!(cancel(&d, &KEY, Role::Medecin, "a", bad, "Dr", "t").unwrap_err().contains("obligatoire"), "{bad:?}");
    }
    assert!(cancel(&d, &KEY, Role::Medecin, "a", &"x".repeat(201), "Dr", "t").unwrap_err().contains("trop long"));
    assert!(cancel_ok(&d, "inconnue").unwrap_err().contains("introuvable"));
    assert!(!is_cancelled(&read_notes(&d, &KEY)[0]), "rien n'a été écrit par les refus");
    // Une seule fois.
    cancel_ok(&d, "a").unwrap();
    assert!(cancel_ok(&d, "a").unwrap_err().contains("déjà annulée"));
    // Une note jamais numérotée se supprime, elle ne s'annule pas.
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([note("old", "", "2025-01-01")])).unwrap();
    assert!(cancel_ok(&d, "old").unwrap_err().contains("jamais été numérotée"));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_note_with_valid_receipts_is_cancelled_only_after_its_receipts() {
    use crate::receipts::{self, Actor};
    let d = tmp("cancelreceipts");
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}])).unwrap();
    save(&d, vec![with_payment("a", 300.0, "UNPAID", Some(300.0))], TODAY).unwrap();
    let doctor = Actor { name: "Dr".into(), role: Role::Medecin };
    let r = receipts::issue(&d, &KEY, "a", false, &doctor, "2026-10-08T09:00:00Z", TODAY).unwrap();
    assert!(cancel_ok(&d, "a").unwrap_err().contains("reçus valides"));
    receipts::cancel(&d, &KEY, &r.number, "erreur", &doctor, "2026-10-08T09:30:00Z", TODAY).unwrap();
    assert!(cancel_ok(&d, "a").is_ok());
    // Une note annulée n'accepte plus de reçu.
    assert!(receipts::issue(&d, &KEY, "a", false, &doctor, "t", TODAY).unwrap_err().contains("annulée"));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn check_reports_duplicates_gaps_and_malformed_numbers_without_changing_anything() {
    let notes = vec![
        note("a", "2026-0001", "d"), note("b", "2026-0002", "d"), note("c", "2026-0002", "d"), note("d", "2026-0005", "d"),
        note("e", "libre", "d"), note("f", "", "d"), note("g", "2025-0001", "d"),
    ];
    let before = notes.clone();
    let r = check(&notes);
    assert!(!r.clean);
    assert_eq!(r.duplicates, vec!["2026-0002"]);
    assert_eq!(r.malformed, vec!["libre"]);
    assert_eq!((r.gaps_total, r.gaps.clone()), (2, vec!["2026-0003".to_string(), "2026-0004".to_string()]));
    assert_eq!(r.unnumbered, 1);
    assert_eq!(r.years.iter().map(|y| (y.year, y.last, y.count)).collect::<Vec<_>>(), vec![(2025, 1, 1), (2026, 5, 4)]);
    assert_eq!(notes, before);
    // Suite propre : rien à signaler, les notes annulées comptent comme numérotées.
    let mut c = note("z", "2026-0002", "d");
    c["cancelledAt"] = json!("t");
    let ok = check(&[note("a", "2026-0001", "d"), c]);
    assert!(ok.clean && ok.cancelled == 1);
}

#[test]
fn assistant_payment_uses_the_counter_and_shares_it_with_the_doctor() {
    use crate::scoped::save_payment;
    let d = tmp("assist");
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}])).unwrap();
    let new = |extra: Value| {
        let mut v = json!({"patientId": "p1", "totalAmount": 300, "amountPaid": 0, "paymentMode": "CASH", "status": "UNPAID"});
        v.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        v
    };
    // Le médecin a déjà émis des notes : l'assistante continue la suite.
    save(&d, vec![note("m1", "", ""), note("m2", "", "")], TODAY).unwrap();
    let v = save_payment(&d, &KEY, &new(json!({})), TODAY, "pay1", "test").unwrap();
    let stored = read_notes(&d, &KEY);
    assert_eq!(number_of(&stored[2]), "2026-0003");
    assert_eq!(v.get("invoiceNumber"), None, "le numéro n'est pas dans la vue de l'assistante");
    // Une retouche d'une note existante ne consomme rien ; un numéro envoyé par l'assistante est ignoré.
    let v2 = save_payment(&d, &KEY, &new(json!({"id": "pay1", "amountPaid": 300, "invoiceNumber": "2026-0500"})), TODAY, "x", "test").unwrap();
    assert_eq!(v2["status"], "PAID");
    assert_eq!(number_of(&read_notes(&d, &KEY)[2]), "2026-0003");
    assert_eq!(load_counter(&d, &KEY).get(2026), 3);
    // Le médecin, ensuite, prend le numéro suivant.
    let after = save(&d, [read_notes(&d, &KEY), vec![note("m3", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&after[3]), "2026-0004");
    // Une note annulée n'est plus modifiable par l'assistante ni listée dans l'encaissement du jour.
    cancel_ok(&d, "pay1").unwrap();
    assert!(save_payment(&d, &KEY, &new(json!({"id": "pay1", "status": "UNPAID"})), TODAY, "x", "test").unwrap_err().contains("annulée"));
    assert!(crate::scoped::payments_today(&read_notes(&d, &KEY), TODAY).iter().all(|p| p["id"] != "pay1"));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn concurrent_doctor_and_assistant_never_share_a_number() {
    use crate::scoped::save_payment;
    let d = tmp("mixed");
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}])).unwrap();
    let handles: Vec<_> = (0..10)
        .map(|i| {
            let d = d.clone();
            std::thread::spawn(move || {
                if i % 2 == 0 {
                    save(&d, vec![note(&format!("m{i}"), "", "")], TODAY).unwrap();
                } else {
                    let p = json!({"patientId": "p1", "totalAmount": 100, "amountPaid": 0, "paymentMode": "CASH", "status": "UNPAID"});
                    save_payment(&d, &KEY, &p, TODAY, &format!("a{i}"), "test").unwrap();
                }
            })
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    let mut got = numbers(&read_notes(&d, &KEY));
    got.sort();
    assert_eq!(got, (1..=10).map(|n| format_number(2026, n)).collect::<Vec<_>>());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn restore_never_moves_the_counter_back() {
    let d = tmp("restore");
    save(&d, vec![note("a", "", ""), note("b", "", ""), note("c", "", "")], TODAY).unwrap();
    // Sauvegarde ancienne : un seul numéro attribué, plus un compteur 2025.
    let mut old_counter = Counter::default();
    old_counter.years.insert("2026".into(), 1);
    old_counter.years.insert("2025".into(), 80);
    let mut files = BTreeMap::new();
    files.insert(COUNTER_FILE.to_string(), serde_json::to_value(&old_counter).unwrap());
    files.insert(NOTES_FILE.to_string(), json!([note("a", "2026-0001", TODAY)]));
    merge_for_restore(&d, &KEY, &mut files);
    let merged: Counter = serde_json::from_value(files[COUNTER_FILE].clone()).unwrap();
    assert_eq!((merged.get(2026), merged.get(2025)), (3, 80), "maximum par année");
    // Poste neuf, sauvegarde sans compteur : le maximum des notes restaurées fait foi.
    let fresh = tmp("restore-fresh");
    let mut files = BTreeMap::new();
    files.insert(NOTES_FILE.to_string(), json!([note("a", "2026-0007", TODAY)]));
    merge_for_restore(&fresh, &KEY, &mut files);
    let merged: Counter = serde_json::from_value(files[COUNTER_FILE].clone()).unwrap();
    assert_eq!(merged.get(2026), 7);
    for x in [&d, &fresh] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn counter_file_is_reserved_and_the_journal_stays_content_free() {
    for role in [Role::Medecin, Role::Assistant] {
        assert!(!crate::access::file_allowed(role, COUNTER_FILE, crate::access::FileMode::Read), "{role:?}");
        assert!(!crate::access::file_allowed(role, COUNTER_FILE, crate::access::FileMode::Write), "{role:?}");
    }
    let src = include_str!("numbering.rs");
    for line in src.lines().filter(|l| l.contains("audit::log(")) {
        for banned in ["reason", "patient", "amount", "total"] {
            assert!(!line.contains(banned), "{line}");
        }
    }
}

// ─── Statut de paiement calculé ──────────────────────────────────────────────

fn with_payment(id: &str, total: f64, claimed: &str, paid: Option<f64>) -> Value {
    let mut n = json!({"id": id, "patientId": "p1", "date": "d", "invoiceNumber": "", "totalAmount": total, "status": claimed, "paymentMode": "CASH"});
    if let Some(p) = paid {
        n["amountPaid"] = json!(p);
    }
    n
}

#[test]
fn status_is_computed_from_the_amount_paid_never_taken_from_the_frontend() {
    assert_eq!((status_for(300.0, 300.0), status_for(350.0, 300.0), status_for(200.0, 300.0), status_for(0.0, 300.0), status_for(0.0, 0.0)), ("PAID", "PAID", "PARTIAL", "UNPAID", "UNPAID"));
    let d = tmp("status");
    // Le frontend annonce « Réglé » partout : seul le montant payé compte.
    let out = save(&d, vec![
        with_payment("a", 300.0, "PAID", None),
        with_payment("b", 300.0, "PAID", Some(200.0)),
        with_payment("c", 300.0, "UNPAID", Some(300.0)),
        with_payment("d", 300.0, "PARTIAL", Some(-5.0)),
        with_payment("e", 300.0, "PAID", Some(0.0)),
    ], TODAY).unwrap();
    let st: Vec<&str> = out.iter().map(|n| n["status"].as_str().unwrap()).collect();
    assert_eq!(st, vec!["UNPAID", "PARTIAL", "PAID", "UNPAID", "UNPAID"]);
    // Complément de paiement sur une note existante : repasse à « Réglé » seulement à 300.
    let mut b = out[1].clone();
    b["amountPaid"] = json!(299.99);
    assert_eq!(save(&d, vec![b.clone()], TODAY).unwrap().iter().find(|n| n["id"] == "b").unwrap()["status"], "PARTIAL");
    b["amountPaid"] = json!(300);
    assert_eq!(save(&d, vec![b], TODAY).unwrap().iter().find(|n| n["id"] == "b").unwrap()["status"], "PAID");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_stored_unpaid_note_cannot_be_flipped_to_paid_by_claiming_it() {
    let d = tmp("flip");
    let first = save(&d, vec![with_payment("a", 300.0, "UNPAID", None)], TODAY).unwrap();
    let mut claim = first[0].clone();
    claim["status"] = json!("PAID");
    assert_eq!(save(&d, vec![claim], TODAY).unwrap()[0]["status"], "UNPAID");
    // Montant dû relevé sur une note réglée sans montant payé enregistré (héritée) : devient partielle.
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([with_payment("old", 300.0, "PAID", None)])).unwrap();
    let mut raised = read_notes(&d, &KEY)[0].clone();
    raised["totalAmount"] = json!(500);
    assert_eq!(save(&d, vec![raised], TODAY).unwrap()[0]["status"], "PARTIAL");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn legacy_notes_keep_their_status_and_bytes_when_untouched() {
    let d = tmp("legacy-status");
    let legacy = vec![with_payment("p", 300.0, "PAID", None), with_payment("u", 100.0, "UNPAID", None), with_payment("z", 0.0, "PAID", None), with_payment("h", 500.0, "PARTIAL", Some(200.0))];
    let mut numbered = legacy.clone();
    for (i, n) in numbered.iter_mut().enumerate() {
        n["invoiceNumber"] = json!(format!("2026-{:04}", i + 1));
    }
    write_enc_json_in(&d, &KEY, NOTES_FILE, &Value::Array(numbered.clone())).unwrap();
    let out = save(&d, numbered.clone(), TODAY).unwrap();
    assert_eq!(out, numbered);
    let _ = fs::remove_dir_all(&d);
}

// ─── Migration des notes héritées ────────────────────────────────────────────

#[test]
fn legacy_notes_are_numbered_chronologically_with_the_year_of_their_date() {
    let d = tmp("migrate");
    // Fichier dans le désordre : numérotées par date croissante, année de leur date, après les numéros existants.
    let legacy = vec![
        note("c", "", "2026-03-10"), note("a", "", "2025-12-30"), note("existing", "2026-0004", "2026-02-02"),
        note("b", "", "2026-01-05"), note("same1", "", "2026-03-10"), note("z", "", "2025-02-01"),
    ];
    write_enc_json_in(&d, &KEY, NOTES_FILE, &Value::Array(legacy.clone())).unwrap();
    assert_eq!(migrate_legacy(&d, &KEY, TODAY).unwrap(), 5);
    let out = read_notes(&d, &KEY);
    let num = |id: &str| number_of(out.iter().find(|n| n["id"] == id).unwrap()).to_string();
    assert_eq!((num("z"), num("a")), ("2025-0001".into(), "2025-0002".into()));
    assert_eq!((num("b"), num("c"), num("same1")), ("2026-0005".into(), "2026-0006".into(), "2026-0007".into()), "date égale : ordre du fichier");
    assert_eq!(num("existing"), "2026-0004");
    // Dates et tous les autres champs intacts ; ordre du fichier intact.
    for (before, after) in legacy.iter().zip(&out) {
        let mut b = before.clone();
        b["invoiceNumber"] = after["invoiceNumber"].clone();
        assert_eq!(&b, after);
    }
    // Numéros uniques, compteur à jour, idempotent.
    let mut all = numbers(&out);
    all.sort();
    all.dedup();
    assert_eq!(all.len(), 6);
    assert_eq!((load_counter(&d, &KEY).get(2025), load_counter(&d, &KEY).get(2026)), (2, 7));
    assert_eq!(migrate_legacy(&d, &KEY, TODAY).unwrap(), 0);
    assert_eq!(read_notes(&d, &KEY), out);
    // Une nouvelle note prend la suite de l'année en cours.
    let after = save(&d, [out, vec![note("new", "", "")]].concat(), "2026-10-08").unwrap();
    assert_eq!(number_of(after.last().unwrap()), "2026-0008");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn migration_never_renumbers_issued_notes_even_duplicates_and_ignores_cancelled_ones() {
    let d = tmp("migrate-dup");
    let mut cancelled = note("x", "2026-0002", "2026-01-01");
    cancelled["cancelledAt"] = json!("t");
    let notes = vec![note("a", "2026-0002", "2026-01-01"), cancelled, note("legacy", "", "2026-01-02")];
    write_enc_json_in(&d, &KEY, NOTES_FILE, &Value::Array(notes)).unwrap();
    assert_eq!(migrate_legacy(&d, &KEY, TODAY).unwrap(), 1);
    let out = read_notes(&d, &KEY);
    assert_eq!(numbers(&out), vec!["2026-0002", "2026-0002", "2026-0003"], "doublon hérité conservé, seulement signalé");
    assert_eq!(check(&out).duplicates, vec!["2026-0002"]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_legacy_note_removed_from_the_write_does_not_burn_a_number() {
    let d = tmp("migrate-del");
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([note("keep", "", "2026-01-01"), note("drop", "", "2026-01-02")])).unwrap();
    let kept = read_notes(&d, &KEY)[0].clone();
    let out = save(&d, vec![kept], TODAY).unwrap();
    assert_eq!(numbers(&out), vec!["2026-0001"]);
    assert_eq!(load_counter(&d, &KEY).get(2026), 1);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn numbers_beyond_9999_are_well_formed_checked_and_sequential() {
    let d = tmp("beyond");
    write_enc_json_in(&d, &KEY, NOTES_FILE, &json!([note("a", "2026-9999", "2026-01-01"), note("b", "2026-10000", "2026-01-02")])).unwrap();
    let r = check(&read_notes(&d, &KEY));
    assert!(r.malformed.is_empty() && r.duplicates.is_empty(), "5 chiffres = numéro valide");
    assert_eq!(r.years[0].last, 10000);
    assert_eq!(r.gaps_total, 9998, "trous réels signalés, sans plantage");
    assert_eq!(r.gaps.len(), 30, "liste bornée");
    let out = save(&d, [read_notes(&d, &KEY), vec![note("n", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&out[2]), "2026-10001");
    let mut c = Counter::default();
    c.years.insert("2026".into(), 99_999);
    assert_eq!(c.next(2026), "2026-100000");
    let _ = fs::remove_dir_all(&d);
}
