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
