use super::*;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const KEY: [u8; KEY_LEN] = [6u8; KEY_LEN];

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-acc-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn note(id: &str, total: f64, paid: f64, mode: &str, patient: &str) -> Value {
    json!({"id": id, "patientId": patient, "date": "x", "invoiceNumber": "", "totalAmount": total, "status": "UNPAID", "amountPaid": paid, "paymentMode": mode})
}

/// Écrit des notes « un jour donné » comme `save_json` le ferait ce jour-là, par `by`.
fn save_on(d: &Path, today: &str, by: &str, list: Vec<Value>) -> Vec<Value> {
    let (data, pending) = numbering::on_save(d, &KEY, Value::Array(list), today, by).unwrap();
    super::super::write_enc_json_in(d, &KEY, numbering::NOTES_FILE, &data).unwrap();
    pending.commit().unwrap();
    numbering::read_notes(d, &KEY)
}

fn get(notes: &[Value], id: &str) -> Value {
    notes.iter().find(|n| n["id"] == id).unwrap().clone()
}

fn sum(d: &Path, from: &str, to: &str, gran: &str) -> Summary {
    summarize(&payments::load(d, &KEY).unwrap(), &numbering::read_notes(d, &KEY), from, to, gran).unwrap()
}

#[test]
fn a_september_payment_on_an_august_note_counts_in_september_not_august() {
    let d = tmp("sept");
    // Note émise le 20 août, non payée ; le patient règle 150 le 5 septembre, en chèque.
    let notes = save_on(&d, "2026-08-20", "Dr", vec![note("a", 300.0, 0.0, "CASH", "p1")]);
    let mut a = get(&notes, "a");
    a["amountPaid"] = json!(150);
    a["paymentMode"] = json!("CHEQUE");
    save_on(&d, "2026-09-05", "Sara", vec![a]);
    let aug = sum(&d, "2026-08-01", "2026-08-31", "month");
    assert_eq!((aug.net_cents, aug.gross_cents, aug.invoiced_cents, aug.invoiced_count), (0, 0, 30_000, 1), "facturé en août, rien d'encaissé en août");
    let sep = sum(&d, "2026-09-01", "2026-09-30", "month");
    assert_eq!((sep.net_cents, sep.gross_cents, sep.payments_count, sep.patients_count, sep.invoiced_cents), (15_000, 15_000, 1, 1, 0));
    assert_eq!(sep.by_mode.iter().find(|m| m.mode == "CHEQUE").unwrap().net_cents, 15_000);
    assert_eq!(sep.outstanding_cents, 15_000, "reste à encaisser : 300 − 150");
    assert_eq!(sep.outstanding_notes, 1);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_refund_is_deducted_on_the_day_it_is_written() {
    let d = tmp("refund");
    save_on(&d, "2026-09-02", "Dr", vec![note("a", 300.0, 300.0, "CASH", "p1")]);
    payments::refund(&d, &KEY, super::super::access::Role::Medecin, "a", 100.0, "CASH", "Erreur de tarif", "Dr", "2026-09-10").unwrap();
    let sep2 = sum(&d, "2026-09-02", "2026-09-02", "day");
    assert_eq!((sep2.net_cents, sep2.refunds_cents), (30_000, 0), "le jour du paiement n'est pas modifié");
    let sep10 = sum(&d, "2026-09-10", "2026-09-10", "day");
    assert_eq!((sep10.gross_cents, sep10.refunds_cents, sep10.net_cents, sep10.payments_count), (0, 10_000, -10_000, 0));
    let all = sum(&d, "2026-09-01", "2026-09-30", "week");
    assert_eq!((all.gross_cents, all.refunds_cents, all.net_cents), (30_000, 10_000, 20_000));
    assert_eq!(all.buckets.len(), 5, "semaines du lundi 31/08 au lundi 28/09");
    assert_eq!(all.buckets.iter().map(|b| b.net_cents).collect::<Vec<_>>(), vec![30_000, -10_000, 0, 0, 0]);
    assert_eq!(all.outstanding_cents, 10_000);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_cancelled_note_without_payment_counts_for_nothing() {
    let d = tmp("cancelled");
    save_on(&d, "2026-09-02", "Dr", vec![note("a", 300.0, 0.0, "CASH", "p1"), note("b", 200.0, 0.0, "CASH", "p2")]);
    numbering::cancel(&d, &KEY, super::super::access::Role::Medecin, "a", "Émise par erreur", "Dr", "2026-09-02T10:00:00Z").unwrap();
    let s = sum(&d, "2026-09-01", "2026-09-30", "month");
    assert_eq!((s.invoiced_cents, s.invoiced_count, s.outstanding_cents, s.outstanding_notes, s.net_cents, s.payments_count), (20_000, 1, 20_000, 1, 0, 0));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn totals_by_mode_and_distinct_patients_are_correct() {
    let d = tmp("modes");
    save_on(&d, "2026-09-03", "Dr", vec![
        note("a", 300.0, 300.0, "CASH", "p1"),
        note("b", 200.0, 200.0, "CARD", "p2"),
        note("c", 100.0, 100.0, "TRANSFER", "p1"),
        note("e", 50.0, 50.0, "CHEQUE", "p3"),
    ]);
    let s = sum(&d, "2026-09-03", "2026-09-03", "day");
    let by: Vec<(&str, i64, usize)> = s.by_mode.iter().map(|m| (m.mode.as_str(), m.net_cents, m.payments_count)).collect();
    assert_eq!(by, vec![("CASH", 30_000, 1), ("CARD", 20_000, 1), ("TRANSFER", 10_000, 1), ("CHEQUE", 5_000, 1)]);
    assert_eq!((s.net_cents, s.payments_count, s.patients_count), (65_000, 4, 3));
    assert_eq!(s.buckets.len(), 1);
    assert_eq!(s.buckets[0].patients_count, 3);
    let j = journal(&payments::load(&d, &KEY).unwrap(), &numbering::read_notes(&d, &KEY), &[json!({"id": "p1", "name": "AMRANI Sara"})], "2026-09-01", "2026-09-30", Some("CASH"), None, true, 3600).unwrap();
    assert_eq!(j.rows.len(), 1);
    assert_eq!((j.rows[0].patient_name.as_str(), j.rows[0].amount_cents, j.rows[0].kind.as_str()), ("AMRANI Sara", 30_000, "payment"));
    assert_eq!(j.net_cents, 30_000);
    let j = journal(&payments::load(&d, &KEY).unwrap(), &numbering::read_notes(&d, &KEY), &[], "2026-09-01", "2026-09-30", None, Some("refund"), true, 0).unwrap();
    assert!(j.rows.is_empty());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn migrated_lines_are_flagged_and_neutralized_pairs_are_kept_out_of_the_totals() {
    let d = tmp("migrated");
    let mut a = note("a", 300.0, 0.0, "CASH", "p1");
    a["status"] = json!("PAID");
    a.as_object_mut().unwrap().remove("amountPaid");
    a["date"] = json!("2026-09-01");
    a["invoiceNumber"] = json!("2026-0001");
    let mut b = a.clone();
    b["id"] = json!("b");
    b["invoiceNumber"] = json!("2026-0002");
    super::super::write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &Value::Array(vec![a.clone(), b.clone()])).unwrap();
    payments::migrate(&d, &KEY, "2026-10-08").unwrap();
    b["cancelledAt"] = json!("2026-09-04T09:00:00Z");
    super::super::write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &Value::Array(vec![a, b])).unwrap();
    payments::migrate(&d, &KEY, "2026-10-08").unwrap();
    let s = sum(&d, "2026-09-01", "2026-09-30", "month");
    assert_eq!((s.gross_cents, s.refunds_cents, s.net_cents), (30_000, 0, 30_000), "la paire neutralisée n'est pas comptée");
    assert_eq!((s.migrated_cents, s.migrated_count, s.neutralized_cents), (30_000, 1, 30_000));
    let j = journal(&payments::load(&d, &KEY).unwrap(), &numbering::read_notes(&d, &KEY), &[], "2026-09-01", "2026-09-30", None, None, false, 0).unwrap();
    assert_eq!(j.rows.len(), 3, "les trois lignes restent visibles");
    assert!(j.rows.iter().all(|r| r.migrated));
    assert_eq!(j.rows.iter().filter(|r| r.neutralized).count(), 2);
    assert_eq!(j.net_cents, 30_000);
    assert!(j.rows.iter().all(|r| r.patient_name.is_empty() && r.time.is_empty()));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn periods_are_validated_and_granularities_fill_empty_buckets() {
    let d = tmp("periods");
    let e = payments::load(&d, &KEY).unwrap();
    assert!(summarize(&e, &[], "2026-02-31", "2026-03-01", "day").is_err());
    assert!(summarize(&e, &[], "2026-03-02", "2026-03-01", "day").is_err());
    assert!(summarize(&e, &[], "2026-03-01", "2026-03-02", "hour").is_err());
    assert!(summarize(&e, &[], "1990-01-01", "2026-03-02", "day").unwrap_err().contains("trop longue"));
    assert_eq!(summarize(&e, &[], "2026-01-15", "2026-04-03", "month").unwrap().buckets.iter().map(|b| b.key.as_str()).collect::<Vec<_>>(), vec!["2026-01", "2026-02", "2026-03", "2026-04"]);
    assert_eq!(summarize(&e, &[], "2024-06-01", "2026-04-03", "year").unwrap().buckets.len(), 3);
    assert_eq!(summarize(&e, &[], "2026-10-07", "2026-10-13", "week").unwrap().buckets.iter().map(|b| b.key.as_str()).collect::<Vec<_>>(), vec!["2026-10-05", "2026-10-12"]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn journal_time_is_local_and_rows_are_ordered() {
    assert_eq!(local_time("2026-10-08T14:03:22Z", 3600), "15:03");
    assert_eq!(local_time("2026-10-08T23:30:00Z", 3600), "00:30");
    assert_eq!(local_time("n'importe quoi", 3600), "");
}
