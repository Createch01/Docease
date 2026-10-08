use super::*;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const KEY: [u8; KEY_LEN] = [6u8; KEY_LEN];
const TODAY: &str = "2026-10-08";

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-pay-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn note(id: &str, total: f64, paid: Option<f64>, mode: &str) -> Value {
    let mut n = json!({"id": id, "patientId": "p1", "date": TODAY, "invoiceNumber": "", "totalAmount": total, "status": "UNPAID", "paymentMode": mode});
    if let Some(p) = paid {
        n["amountPaid"] = json!(p);
    }
    n
}

/// Équivalent de `save_json` pour le fichier des notes (crochet, écriture, compteur).
fn save_as(d: &Path, list: Vec<Value>, today: &str, by: &str) -> Result<Vec<Value>, String> {
    let (data, pending) = numbering::on_save(d, &KEY, Value::Array(list), today, by)?;
    write_enc_json_in(d, &KEY, numbering::NOTES_FILE, &data)?;
    pending.commit()?;
    Ok(numbering::read_notes(d, &KEY))
}

fn save(d: &Path, list: Vec<Value>) -> Vec<Value> {
    save_as(d, list, TODAY, "Dr Test").unwrap()
}

fn find<'a>(notes: &'a [Value], id: &str) -> &'a Value {
    notes.iter().find(|n| n["id"] == id).unwrap()
}

#[test]
fn a_payment_on_a_note_becomes_a_dated_entry_with_mode_and_author() {
    let d = tmp("entry");
    let out = save(&d, vec![note("a", 300.0, Some(100.0), "CHEQUE")]);
    let l = load(&d, &KEY).unwrap();
    assert_eq!(l.len(), 1);
    let e = &l[0];
    assert_eq!((e.kind.as_str(), e.date.as_str(), e.amount_cents, e.mode.as_str(), e.by.as_str(), e.note_id.as_str()), ("payment", TODAY, 10_000, "CHEQUE", "Dr Test", "a"));
    assert_eq!(find(&out, "a")["status"], "PARTIAL");
    // Complément : seule la différence est écrite, à la date du jour du complément, avec SON mode.
    let mut b = find(&out, "a").clone();
    b["amountPaid"] = json!(300);
    b["paymentMode"] = json!("CASH");
    let out = save_as(&d, vec![b], "2026-10-12", "Assistante").unwrap();
    let l = load(&d, &KEY).unwrap();
    assert_eq!(l.len(), 2);
    assert_eq!((l[1].amount_cents, l[1].date.as_str(), l[1].mode.as_str(), l[1].by.as_str()), (20_000, "2026-10-12", "CASH", "Assistante"));
    assert_eq!(find(&out, "a")["status"], "PAID");
    assert!(verify_entries(&l).ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn the_frontend_cannot_lower_or_erase_a_payment() {
    let d = tmp("lower");
    let out = save(&d, vec![note("a", 300.0, Some(300.0), "CASH")]);
    assert_eq!(find(&out, "a")["status"], "PAID");
    let mut b = find(&out, "a").clone();
    b["amountPaid"] = json!(0);
    b["status"] = json!("UNPAID");
    let out = save(&d, vec![b]);
    assert_eq!(find(&out, "a")["status"], "PAID", "le statut vient du registre");
    assert_eq!(find(&out, "a")["amountPaid"], json!(300));
    assert_eq!(load(&d, &KEY).unwrap().len(), 1, "aucune écriture, aucun retrait");
    // Un montant payé relevé au-delà du dû est plafonné.
    let mut c = find(&out, "a").clone();
    c["amountPaid"] = json!(500);
    let out = save(&d, vec![c]);
    assert_eq!(find(&out, "a")["amountPaid"], json!(300));
    assert_eq!(net_cents(&load(&d, &KEY).unwrap(), "a"), 30_000);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_refund_is_a_negative_entry_with_a_mandatory_reason_and_never_a_modification() {
    let d = tmp("refund");
    save(&d, vec![note("a", 300.0, Some(300.0), "CASH")]);
    let r = |amount: f64, reason: &str, role: Role| refund(&d, &KEY, role, "a", amount, "CASH", reason, "Dr Test", "2026-10-09");
    assert!(r(50.0, "Erreur de tarif", Role::Assistant).unwrap_err().contains("médecin"));
    assert!(r(50.0, "", Role::Medecin).unwrap_err().contains("motif"));
    assert!(r(50.0, "  x ", Role::Medecin).unwrap_err().contains("motif"));
    assert!(r(0.0, "Erreur de tarif", Role::Medecin).is_err());
    assert!(r(-5.0, "Erreur de tarif", Role::Medecin).is_err());
    assert!(r(300.01, "Erreur de tarif", Role::Medecin).unwrap_err().contains("dépasse"));
    assert!(refund(&d, &KEY, Role::Medecin, "a", 10.0, "BITCOIN", "Erreur de tarif", "Dr", TODAY).is_err());
    assert!(refund(&d, &KEY, Role::Medecin, "zzz", 10.0, "CASH", "Erreur de tarif", "Dr", TODAY).unwrap_err().contains("introuvable"));
    let e = r(100.0, "Erreur de tarif", Role::Medecin).unwrap();
    assert_eq!((e.kind.as_str(), e.amount_cents, e.date.as_str(), e.reason.as_deref()), ("refund", -10_000, "2026-10-09", Some("Erreur de tarif")));
    let l = load(&d, &KEY).unwrap();
    assert_eq!(l.len(), 2, "l'encaissement d'origine reste intact");
    assert_eq!(l[0].amount_cents, 30_000);
    let notes = numbering::read_notes(&d, &KEY);
    assert_eq!((find(&notes, "a")["status"].as_str(), find(&notes, "a")["amountPaid"].clone()), (Some("PARTIAL"), json!(200)));
    // On ne rembourse pas plus que le net restant.
    assert!(r(200.01, "Erreur de tarif", Role::Medecin).is_err());
    r(200.0, "Séance annulée", Role::Medecin).unwrap();
    assert_eq!(find(&numbering::read_notes(&d, &KEY), "a")["status"], "UNPAID");
    assert_eq!(net_cents(&load(&d, &KEY).unwrap(), "a"), 0);
    assert!(verify_entries(&load(&d, &KEY).unwrap()).ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn existing_paid_and_partial_notes_are_migrated_once_with_their_date_and_mode() {
    let d = tmp("migrate");
    let mut paid = note("p", 300.0, None, "CARD");
    paid["status"] = json!("PAID");
    paid["date"] = json!("2026-09-01");
    paid["invoiceNumber"] = json!("2026-0001");
    let mut part = note("h", 500.0, Some(200.0), "TRANSFER");
    part["status"] = json!("PARTIAL");
    part["date"] = json!("2026-09-15");
    part["invoiceNumber"] = json!("2026-0002");
    let mut unpaid = note("u", 100.0, None, "CASH");
    unpaid["invoiceNumber"] = json!("2026-0003");
    let legacy = vec![paid, part, unpaid];
    write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &Value::Array(legacy.clone())).unwrap();
    assert_eq!(migrate(&d, &KEY, TODAY).unwrap(), 2);
    assert_eq!(migrate(&d, &KEY, TODAY).unwrap(), 0, "idempotente");
    let l = load(&d, &KEY).unwrap();
    let got: Vec<(&str, &str, i64, &str, &str)> = l.iter().map(|e| (e.note_id.as_str(), e.date.as_str(), e.amount_cents, e.mode.as_str(), e.kind.as_str())).collect();
    assert_eq!(got, vec![("p", "2026-09-01", 30_000, "CARD", "migrated"), ("h", "2026-09-15", 20_000, "TRANSFER", "migrated")]);
    // Les notes ne sont pas touchées par la migration, ni par une réécriture inchangée.
    assert_eq!(numbering::read_notes(&d, &KEY), legacy);
    assert_eq!(save(&d, legacy.clone()), legacy, "notes héritées inchangées octet pour octet");
    assert_eq!(load(&d, &KEY).unwrap().len(), 2, "pas de doublon");
    // Une écriture de notes sans migration préalable migre aussi (chemin médecin ou assistante).
    let d2 = tmp("migrate-lazy");
    write_enc_json_in(&d2, &KEY, numbering::NOTES_FILE, &Value::Array(legacy.clone())).unwrap();
    save(&d2, vec![note("n", 100.0, None, "CASH")]);
    assert_eq!(load(&d2, &KEY).unwrap().len(), 2);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&d2);
}

#[test]
fn a_modified_removed_or_inserted_entry_is_detected() {
    let d = tmp("chain");
    save(&d, vec![note("a", 300.0, Some(100.0), "CASH"), note("b", 300.0, Some(300.0), "CARD")]);
    let l = load(&d, &KEY).unwrap();
    assert!(verify_entries(&l).ok);
    let mut forged = l.clone();
    forged[0].amount_cents = 1;
    assert!(!verify_entries(&forged).ok);
    let removed = vec![l[1].clone()];
    assert!(!verify_entries(&removed).ok);
    let mut sign = l.clone();
    sign[1].kind = "refund".into();
    assert!(!verify_entries(&sign).ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn cancelled_notes_are_never_rewritten_and_modes_are_validated() {
    let d = tmp("cancel");
    let mut c = note("c", 300.0, Some(300.0), "CASH");
    c["invoiceNumber"] = json!("2026-0001");
    c["cancelledAt"] = json!("2026-10-01T10:00:00Z");
    write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &Value::Array(vec![c.clone()])).unwrap();
    let out = save(&d, vec![c.clone()]);
    assert_eq!(out, vec![c]);
    let err = save_as(&d, vec![note("x", 100.0, Some(100.0), "BITCOIN")], TODAY, "Dr").unwrap_err();
    assert!(err.contains("Mode de paiement"));
    for mode in MODES {
        save(&d, vec![note(&format!("m-{mode}"), 100.0, Some(100.0), mode)]);
    }
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn assistant_payments_go_through_the_same_register_with_her_name() {
    use crate::scoped::save_payment;
    let d = tmp("assist");
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}])).unwrap();
    let v = save_payment(&d, &KEY, &json!({"patientId": "p1", "totalAmount": 300, "amountPaid": 120, "paymentMode": "CHEQUE"}), TODAY, "pay1", "Assistante").unwrap();
    assert_eq!(v["status"], "PARTIAL");
    let id = v["id"].as_str().unwrap().to_string();
    // Elle ne peut pas baisser le montant payé ensuite : le registre garde 120.
    let v2 = save_payment(&d, &KEY, &json!({"id": id, "totalAmount": 300, "amountPaid": 0, "paymentMode": "CASH"}), TODAY, "x", "Assistante").unwrap();
    assert_eq!((v2["status"].as_str(), v2["amountPaid"].as_f64()), (Some("PARTIAL"), Some(120.0)));
    let v3 = save_payment(&d, &KEY, &json!({"id": id, "totalAmount": 300, "amountPaid": 300, "paymentMode": "CASH"}), TODAY, "x", "Assistante").unwrap();
    assert_eq!(v3["status"], "PAID");
    let l = load(&d, &KEY).unwrap();
    let got: Vec<(i64, &str, &str)> = l.iter().map(|e| (e.amount_cents, e.mode.as_str(), e.by.as_str())).collect();
    assert_eq!(got, vec![(12_000, "CHEQUE", "Assistante"), (18_000, "CASH", "Assistante")]);
    assert!(save_payment(&d, &KEY, &json!({"patientId": "p1", "totalAmount": 100, "amountPaid": 100, "paymentMode": "BITCOIN"}), TODAY, "z", "Assistante").is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn restore_never_shortens_the_register() {
    let d = tmp("restore");
    save(&d, vec![note("a", 300.0, Some(100.0), "CASH")]);
    let early = load(&d, &KEY).unwrap();
    let mut b = numbering::read_notes(&d, &KEY)[0].clone();
    b["amountPaid"] = json!(300);
    save(&d, vec![b]);
    assert_eq!(load(&d, &KEY).unwrap().len(), 2);
    let mut files: BTreeMap<String, Value> = BTreeMap::new();
    files.insert(REGISTRY_FILE.into(), serde_json::to_value(&early).unwrap());
    merge_for_restore(&d, &KEY, &mut files);
    let kept: Vec<Entry> = serde_json::from_value(files[REGISTRY_FILE].clone()).unwrap();
    assert_eq!(kept.len(), 2, "les encaissements postérieurs à la sauvegarde sont conservés");
    let _ = fs::remove_dir_all(&d);
}
