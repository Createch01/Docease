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
    let (data, pending) = on_save(d, &KEY, Value::Array(list), today)?;
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
    assert_eq!((number_of(&out[0]), out[0]["date"].as_str()), ("2026-0001", Some("2025-05-05")));
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
    assert!(on_save(&d, &KEY, json!({"x": 1}), TODAY).is_err());
    assert!(on_save(&d, &KEY, json!([1, 2]), TODAY).is_err());
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
    save(&d, vec![note("a", "", "")], TODAY).unwrap();
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
    let v = save_payment(&d, &KEY, &new(json!({})), TODAY, "pay1").unwrap();
    let stored = read_notes(&d, &KEY);
    assert_eq!(number_of(&stored[2]), "2026-0003");
    assert_eq!(v.get("invoiceNumber"), None, "le numéro n'est pas dans la vue de l'assistante");
    // Une retouche d'une note existante ne consomme rien ; un numéro envoyé par l'assistante est ignoré.
    let v2 = save_payment(&d, &KEY, &new(json!({"id": "pay1", "status": "PAID", "invoiceNumber": "2026-0500"})), TODAY, "x").unwrap();
    assert_eq!(v2["status"], "PAID");
    assert_eq!(number_of(&read_notes(&d, &KEY)[2]), "2026-0003");
    assert_eq!(load_counter(&d, &KEY).get(2026), 3);
    // Le médecin, ensuite, prend le numéro suivant.
    let after = save(&d, [read_notes(&d, &KEY), vec![note("m3", "", "")]].concat(), TODAY).unwrap();
    assert_eq!(number_of(&after[3]), "2026-0004");
    // Une note annulée n'est plus modifiable par l'assistante ni listée dans l'encaissement du jour.
    cancel_ok(&d, "pay1").unwrap();
    assert!(save_payment(&d, &KEY, &new(json!({"id": "pay1", "status": "UNPAID"})), TODAY, "x").unwrap_err().contains("annulée"));
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
                    save_payment(&d, &KEY, &p, TODAY, &format!("a{i}")).unwrap();
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
