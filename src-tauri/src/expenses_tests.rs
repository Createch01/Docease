use super::*;
use crate::{accounting, attachments, numbering, payments};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const KEY: [u8; KEY_LEN] = [6u8; KEY_LEN];
const TODAY: &str = "2026-10-08";

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-exp-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn new(date: &str, category: &str, cents: i64) -> NewExpense {
    NewExpense { date_expense: date.into(), category: category.into(), supplier: "Pharma Plus".into(), label: "Achat".into(), amount_cents: cents, mode: "CASH".into(), ..Default::default() }
}

fn add_ok(d: &Path, n: &NewExpense) -> Entry {
    add(d, &KEY, Role::Medecin, n, "Dr", TODAY).unwrap()
}

fn pdf() -> Vec<u8> {
    b"%PDF-1.4\n1 0 obj<</Title(X)>>endobj\n%%EOF".to_vec()
}

fn receipt(d: &Path) -> String {
    let input = attachments::AddInput { patient_id: attachments::CABINET_OWNER.into(), title: "Facture".into(), category: "autre".into(), exam_date: "2026-10-01".into(), ..Default::default() };
    attachments::add(d, &KEY, input, pdf(), "Dr", "2026-10-08T10:00:00Z", TODAY).unwrap().id
}

#[test]
fn ids_are_sequential_per_year_and_the_entry_is_fully_described() {
    let d = tmp("ids");
    let mut n = new("2026-10-01", "Loyer & charges locatives", 450_000);
    n.vat_cents = Some(75_000);
    n.supplier_invoice = Some("F-12".into());
    n.receipt_ids = vec![receipt(&d)];
    let a = add_ok(&d, &n);
    assert_eq!((a.id.as_str(), a.seq, a.date_expense.as_str(), a.date_entry.as_str(), a.by.as_str(), a.amount_cents, a.vat_cents), ("DEP-2026-00001", 1, "2026-10-01", TODAY, "Dr", 450_000, Some(75_000)));
    assert_eq!(add_ok(&d, &new("2026-10-02", "Divers", 1_000)).id, "DEP-2026-00002");
    let on_jan = add(&d, &KEY, Role::Medecin, &new("2026-10-03", "Divers", 1_000), "Dr", "2027-01-05").unwrap();
    assert_eq!(on_jan.id, "DEP-2027-00001", "le rang repart à 1 chaque année");
    assert!(verify_entries(&load(&d, &KEY).unwrap(), true).ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn invalid_expenses_are_refused() {
    let d = tmp("invalid");
    let tryit = |n: NewExpense| add(&d, &KEY, Role::Medecin, &n, "Dr", TODAY).unwrap_err();
    assert!(tryit(new("2026-10-09", "Divers", 1_000)).contains("futur"), "dépense datée dans le futur");
    assert!(tryit(new("2026-02-31", "Divers", 1_000)).contains("invalide"));
    assert!(tryit(new("2026-10-01", "Inconnue", 1_000)).contains("Catégorie"));
    assert!(tryit(new("2026-10-01", "Divers", 0)).contains("Montant"));
    assert!(tryit(new("2026-10-01", "Divers", -5)).contains("Montant"));
    let mut n = new("2026-10-01", "Divers", 1_000);
    n.mode = "BITCOIN".into();
    assert!(tryit(n).contains("Mode"));
    let mut n = new("2026-10-01", "Divers", 1_000);
    n.vat_cents = Some(2_000);
    assert!(tryit(n).contains("TVA"));
    let mut n = new("2026-10-01", "Divers", 1_000);
    n.cheque_number = Some("123".into());
    assert!(tryit(n).contains("chèque"));
    let mut n = new("2026-10-01", "Divers", 1_000);
    n.label = "   ".into();
    assert!(tryit(n).contains("Libellé"));
    let mut n = new("2026-10-01", "Divers", 1_000);
    n.receipt_ids = vec!["inexistant".into()];
    assert!(tryit(n).contains("Justificatif"));
    assert!(load(&d, &KEY).unwrap().is_empty(), "aucun refus n'écrit");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn cancellation_needs_a_reason_keeps_the_original_and_is_medecin_only() {
    let d = tmp("cancel");
    let a = add_ok(&d, &new("2026-10-01", "Divers", 10_000));
    assert!(cancel(&d, &KEY, Role::Medecin, &a.id, "", "Dr", TODAY).unwrap_err().contains("motif"));
    assert!(cancel(&d, &KEY, Role::Medecin, &a.id, " x ", "Dr", TODAY).unwrap_err().contains("motif"));
    assert!(cancel(&d, &KEY, Role::Assistant, &a.id, "Erreur de saisie", "Sara", TODAY).unwrap_err().contains("médecin"));
    assert!(cancel(&d, &KEY, Role::Medecin, "DEP-2026-09999", "Erreur de saisie", "Dr", TODAY).unwrap_err().contains("introuvable"));
    let c = cancel(&d, &KEY, Role::Medecin, &a.id, "Erreur de saisie", "Dr", TODAY).unwrap();
    assert_eq!((c.kind.as_str(), c.cancels.as_deref(), c.reason.as_deref(), c.date_entry.as_str()), ("cancellation", Some("DEP-2026-00001"), Some("Erreur de saisie"), TODAY));
    assert!(cancel(&d, &KEY, Role::Medecin, &a.id, "Erreur de saisie", "Dr", TODAY).unwrap_err().contains("déjà annulée"));
    let e = load(&d, &KEY).unwrap();
    assert_eq!(e.len(), 2);
    assert_eq!(e[0], a, "l'originale n'est jamais modifiée");
    let l = list(&e, "2026-01-01", "2026-12-31", None, None, None, None);
    assert_eq!((l.rows.len(), l.rows[0].status.as_str(), l.rows[0].cancelled_reason.as_deref()), (1, "cancelled", Some("Erreur de saisie")));
    assert_eq!((l.totals.expenses_cents, l.totals.count), (0, 0), "une dépense annulée ne compte plus");
    assert!(verify_entries(&e, true).ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn correct_is_cancel_plus_recreate_in_one_write_all_or_nothing() {
    let d = tmp("correct");
    let a = add_ok(&d, &new("2026-10-01", "Divers", 10_000));
    let mut bad = new("2026-10-01", "Divers", 12_000);
    bad.mode = "BITCOIN".into();
    assert!(correct(&d, &KEY, Role::Medecin, &a.id, "Mauvais montant", &bad, "Dr", TODAY).is_err());
    assert_eq!(load(&d, &KEY).unwrap().len(), 1, "correction invalide : rien n'est annulé");
    let (c, b) = correct(&d, &KEY, Role::Medecin, &a.id, "Mauvais montant", &new("2026-10-01", "Divers", 12_000), "Dr", TODAY).unwrap();
    assert_eq!((c.kind.as_str(), b.id.as_str(), b.amount_cents), ("cancellation", "DEP-2026-00002", 12_000));
    let l = list(&load(&d, &KEY).unwrap(), "2026-01-01", "2026-12-31", None, None, None, None);
    assert_eq!((l.totals.expenses_cents, l.totals.count), (12_000, 1));
    assert!(correct(&d, &KEY, Role::Assistant, &b.id, "Mauvais montant", &new("2026-10-08", "Divers", 1), "Sara", TODAY).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn closed_months_refuse_expenses_cancellations_and_payments_and_reopening_is_traced() {
    let d = tmp("periods");
    let a = add_ok(&d, &new("2026-09-10", "Divers", 5_000));
    // Seul le médecin clôture ; seul un mois terminé se clôture.
    assert!(periods::close(&d, &KEY, Role::Assistant, "2026-09", "Sara", TODAY).unwrap_err().contains("médecin"));
    assert!(periods::close(&d, &KEY, Role::Medecin, "2026-10", "Dr", TODAY).unwrap_err().contains("terminé"));
    assert!(periods::close(&d, &KEY, Role::Medecin, "2026-13", "Dr", TODAY).unwrap_err().contains("invalide"));
    periods::close(&d, &KEY, Role::Medecin, "2026-09", "Dr", TODAY).unwrap();
    assert!(periods::close(&d, &KEY, Role::Medecin, "2026-09", "Dr", TODAY).unwrap_err().contains("déjà"));
    // Dépense, annulation et correction dans le mois clôturé : refusées, en français.
    let err = add(&d, &KEY, Role::Medecin, &new("2026-09-20", "Divers", 1_000), "Dr", TODAY).unwrap_err();
    assert!(err.contains("septembre 2026") && err.contains("clôturé"), "{err}");
    assert!(cancel(&d, &KEY, Role::Medecin, &a.id, "Erreur de saisie", "Dr", TODAY).unwrap_err().contains("clôturé"));
    assert!(correct(&d, &KEY, Role::Medecin, &a.id, "Erreur de saisie", &new("2026-10-01", "Divers", 1), "Dr", TODAY).unwrap_err().contains("clôturé"));
    // Une dépense d'octobre reste possible ; un paiement d'aujourd'hui sur une ancienne note aussi (daté d'aujourd'hui).
    assert!(add(&d, &KEY, Role::Medecin, &new("2026-10-02", "Divers", 1_000), "Dr", TODAY).is_ok());
    assert!(periods::ensure_open(&d, &KEY, TODAY).is_ok());
    // Remboursement ou paiement dont la date tomberait dans le mois clôturé : refusé.
    let notes = json!([{"id": "n1", "patientId": "p1", "date": "2026-08-20", "invoiceNumber": "2026-0001", "totalAmount": 300, "status": "PAID", "paymentMode": "CASH"}]);
    write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &notes).unwrap();
    payments::migrate(&d, &KEY, TODAY).unwrap();
    let r = payments::refund(&d, &KEY, Role::Medecin, "n1", 50.0, "CASH", "Erreur de tarif", "Dr", "2026-09-15");
    assert!(r.unwrap_err().contains("clôturé"));
    assert!(payments::refund(&d, &KEY, Role::Medecin, "n1", 50.0, "CASH", "Erreur de tarif", "Dr", TODAY).is_ok());
    // Réouverture : médecin seulement, motif obligatoire, tracée ; le registre garde les deux écritures.
    assert!(periods::reopen(&d, &KEY, Role::Assistant, "2026-09", "Besoin", "Sara", TODAY).unwrap_err().contains("médecin"));
    assert!(periods::reopen(&d, &KEY, Role::Medecin, "2026-09", "", "Dr", TODAY).unwrap_err().contains("motif"));
    assert!(periods::reopen(&d, &KEY, Role::Medecin, "2026-08", "Besoin", "Dr", TODAY).unwrap_err().contains("pas clôturé"));
    periods::reopen(&d, &KEY, Role::Medecin, "2026-09", "Oubli d'une facture", "Dr", TODAY).unwrap();
    let log = periods::load(&d, &KEY).unwrap();
    assert_eq!(log.iter().map(|e| (e.kind.as_str(), e.month.as_str(), e.reason.as_deref())).collect::<Vec<_>>(), vec![("close", "2026-09", None), ("reopen", "2026-09", Some("Oubli d'une facture"))]);
    assert!(periods::closed_months(&log).is_empty());
    assert!(periods::verify_entries(&log).is_empty());
    assert!(add(&d, &KEY, Role::Medecin, &new("2026-09-20", "Divers", 1_000), "Dr", TODAY).is_ok());
    let mut forged = log.clone();
    forged[0].month = "2026-08".into();
    assert!(!periods::verify_entries(&forged).is_empty());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn assistant_enters_only_todays_ordinary_expenses() {
    let d = tmp("assistant");
    let go = |n: NewExpense| add(&d, &KEY, Role::Assistant, &n, "Sara", TODAY);
    assert!(go(new(TODAY, "Fournitures de bureau", 3_000)).is_ok());
    assert!(go(new("2026-10-07", "Fournitures de bureau", 3_000)).unwrap_err().contains("du jour"));
    assert!(go(new(TODAY, AMORTIZABLE_CATEGORY, 3_000)).unwrap_err().contains("médecin"));
    let mut n = new(TODAY, "Divers", 3_000);
    n.receipt_ids = vec![receipt(&d)];
    assert!(go(n).unwrap_err().contains("justificatif"));
    assert!(cancel(&d, &KEY, Role::Assistant, "DEP-2026-00001", "Erreur de saisie", "Sara", TODAY).is_err());
    assert!(add_category(&d, &KEY, Role::Assistant, "Autre").is_err());
    assert!(set_category_active(&d, &KEY, Role::Assistant, "Divers", false).is_err());
    let today = list(&load(&d, &KEY).unwrap(), "0000-01-01", "9999-12-31", None, None, None, Some(TODAY));
    assert_eq!(today.rows.len(), 1);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn totals_exclude_amortizable_and_cancelled_and_count_missing_receipts() {
    let d = tmp("totals");
    let mut with = new("2026-10-01", "Loyer & charges locatives", 400_000);
    with.receipt_ids = vec![receipt(&d)];
    add_ok(&d, &with);
    add_ok(&d, &new("2026-10-02", "Consommables médicaux", 25_050));
    add_ok(&d, &new("2026-10-03", AMORTIZABLE_CATEGORY, 1_200_000));
    let gone = add_ok(&d, &new("2026-10-04", "Divers", 99_900));
    cancel(&d, &KEY, Role::Medecin, &gone.id, "Doublon", "Dr", TODAY).unwrap();
    let e = load(&d, &KEY).unwrap();
    let l = list(&e, "2026-10-01", "2026-10-31", None, None, None, None);
    assert_eq!((l.totals.expenses_cents, l.totals.amortizable_cents, l.totals.count, l.totals.without_receipt), (425_050, 1_200_000, 3, 2));
    assert_eq!(l.totals.by_category.iter().map(|c| (c.category.as_str(), c.cents, c.amortizable)).collect::<Vec<_>>(), vec![(AMORTIZABLE_CATEGORY, 1_200_000, true), ("Loyer & charges locatives", 400_000, false), ("Consommables médicaux", 25_050, false)]);
    // Filtres.
    assert_eq!(list(&e, "2026-10-01", "2026-10-31", None, None, Some(true), None).rows.len(), 1);
    assert_eq!(list(&e, "2026-10-01", "2026-10-31", None, None, Some(false), None).rows.len(), 3, "sans justificatif (annulée comprise dans les lignes)");
    assert_eq!(list(&e, "2026-10-01", "2026-10-31", Some("Divers"), None, None, None).rows.len(), 1);
    assert_eq!(list(&e, "2026-10-02", "2026-10-02", None, Some("CASH"), None, None).rows.len(), 1);
    // Le résultat de l'agrégat : net encaissé − dépenses (hors à amortir).
    let s = accounting::summarize(&[], &[], &e, "2026-10-01", "2026-10-31", "month").unwrap();
    assert_eq!((s.expenses_cents, s.amortizable_cents, s.result_cents, s.net_cents), (425_050, 1_200_000, -425_050, 0));
    assert_eq!(s.buckets[0].expenses_cents, 425_050);
    assert_eq!(s.expenses_by_mode.iter().map(|m| (m.mode.as_str(), m.cents)).collect::<Vec<_>>(), vec![("CASH", 425_050 + 1_200_000)]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn categories_can_be_added_and_deactivated_but_never_deleted() {
    let d = tmp("cats");
    assert_eq!(load_categories(&d, &KEY).len(), 20);
    assert!(add_category(&d, &KEY, Role::Medecin, "Ménage").is_ok());
    assert!(add_category(&d, &KEY, Role::Medecin, "ménage").unwrap_err().contains("existe"));
    add_ok(&d, &new("2026-10-01", "Ménage", 1_000));
    set_category_active(&d, &KEY, Role::Medecin, "Ménage", false).unwrap();
    assert!(add(&d, &KEY, Role::Medecin, &new("2026-10-01", "Ménage", 1_000), "Dr", TODAY).unwrap_err().contains("désactivée"));
    assert!(load_categories(&d, &KEY).iter().any(|c| c.name == "Ménage" && !c.active), "la catégorie utilisée est conservée, désactivée");
    let l = list(&load(&d, &KEY).unwrap(), "2026-01-01", "2026-12-31", None, None, None, None);
    assert_eq!(l.rows.len(), 1, "la dépense déjà saisie reste lisible");
    assert!(load_categories(&d, &KEY).iter().find(|c| c.name == AMORTIZABLE_CATEGORY).unwrap().amortizable);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn the_dep_counter_never_has_gaps_nor_goes_back_after_a_restore() {
    let d = tmp("counter");
    add_ok(&d, &new("2026-10-01", "Divers", 1_000));
    let early = load(&d, &KEY).unwrap();
    let early_counter = load_counter(&d, &KEY);
    add_ok(&d, &new("2026-10-02", "Divers", 1_000));
    add_ok(&d, &new("2026-10-03", "Divers", 1_000));
    // Restauration d'une sauvegarde plus ancienne : registre et compteur ne reculent pas.
    let mut files: BTreeMap<String, Value> = BTreeMap::new();
    files.insert(REGISTRY_FILE.into(), serde_json::to_value(&early).unwrap());
    files.insert(COUNTER_FILE.into(), serde_json::to_value(&early_counter).unwrap());
    merge_for_restore(&d, &KEY, &mut files);
    let kept: Vec<Entry> = serde_json::from_value(files[REGISTRY_FILE].clone()).unwrap();
    assert_eq!(kept.len(), 3);
    let counter: Counter = serde_json::from_value(files[COUNTER_FILE].clone()).unwrap();
    assert_eq!(counter.years.get("2026"), Some(&3));
    // Poste neuf (aucun registre) restauré depuis la sauvegarde : le rang suit, sans reprendre un numéro attribué.
    let fresh = tmp("counter-fresh");
    let mut files2: BTreeMap<String, Value> = BTreeMap::new();
    files2.insert(REGISTRY_FILE.into(), serde_json::to_value(&kept).unwrap());
    files2.insert(COUNTER_FILE.into(), serde_json::to_value(&counter).unwrap());
    for (k, v) in &files2 {
        write_enc_json_in(&fresh, &KEY, k, v).unwrap();
    }
    assert_eq!(add_ok(&fresh, &new("2026-10-05", "Divers", 1_000)).id, "DEP-2026-00004");
    // Un compteur en retard (plantage entre registre et compteur) est rattrapé par le registre.
    save_counter(&fresh, &KEY, &Counter::default()).unwrap();
    assert_eq!(add_ok(&fresh, &new("2026-10-06", "Divers", 1_000)).id, "DEP-2026-00005");
    let ids: Vec<String> = load(&fresh, &KEY).unwrap().into_iter().map(|e| e.id).collect();
    assert_eq!(ids, vec!["DEP-2026-00001", "DEP-2026-00002", "DEP-2026-00003", "DEP-2026-00004", "DEP-2026-00005"]);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&fresh);
}

#[test]
fn a_modified_removed_or_inserted_entry_is_detected() {
    let d = tmp("chain");
    add_ok(&d, &new("2026-10-01", "Divers", 1_000));
    add_ok(&d, &new("2026-10-02", "Divers", 2_000));
    add_ok(&d, &new("2026-10-03", "Divers", 3_000));
    let l = load(&d, &KEY).unwrap();
    assert!(verify_entries(&l, true).ok);
    let mut forged = l.clone();
    forged[1].amount_cents = 1;
    assert!(!verify_entries(&forged, true).ok);
    let mut removed = l.clone();
    removed.remove(1);
    let r = verify_entries(&removed, true);
    assert!(!r.ok && r.problems.iter().any(|p| p.contains("trou")), "{:?}", r.problems);
    assert!(!verify_entries(&l, false).ok, "compteur en retard signalé");
    let mut bad_cancel = l.clone();
    bad_cancel.push(cancellation("DEP-2026-00001", "ok".into(), "Dr", TODAY));
    assert!(!verify_entries(&bad_cancel, true).ok, "annulation sans empreinte valide ni motif");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn legacy_expenses_are_converted_once_and_the_original_is_kept() {
    use base64::Engine;
    let d = tmp("legacy");
    let url = format!("data:application/pdf;base64,{}", base64::engine::general_purpose::STANDARD.encode(pdf()));
    let old = json!([
        {"id": "1", "date": "2026-09-03", "category": "Loyer & charges du local", "label": "Loyer septembre", "amount": 4500, "receiptDataUrl": url},
        {"id": "2", "date": "2026-09-05", "category": "Autre", "categoryDetail": "Fleurs", "label": "Bouquet", "amount": 120.5, "noReceiptConfirmed": true},
        {"id": "3", "date": "2026-09-06", "category": "Équipement médical & amortissement", "label": "Tensiomètre", "amount": 800, "receiptDataUrl": "data:image/png;base64,AAAA"},
    ]);
    write_enc_json_in(&d, &KEY, REGISTRY_FILE, &old).unwrap();
    assert!(load(&d, &KEY).is_err(), "ancien format : à reprendre d'abord");
    assert_eq!(ensure_migrated(&d, &KEY, TODAY).unwrap(), 3);
    assert_eq!(ensure_migrated(&d, &KEY, TODAY).unwrap(), 0, "idempotente");
    assert_eq!(read_enc_json_in(&d, &KEY, LEGACY_COPY).unwrap().unwrap(), old, "l'original est conservé");
    let e = load(&d, &KEY).unwrap();
    let got: Vec<(&str, &str, i64, bool, bool, bool)> = e.iter().map(|x| (x.id.as_str(), x.category.as_str(), x.amount_cents, x.migrated, x.amortizable, !x.receipt_ids.is_empty())).collect();
    assert_eq!(got, vec![
        ("DEP-2026-00001", "Loyer & charges locatives", 450_000, true, false, true),
        ("DEP-2026-00002", "Divers", 12_050, true, false, false),
        ("DEP-2026-00003", AMORTIZABLE_CATEGORY, 80_000, true, true, false),
    ]);
    assert_eq!(e[1].sub_category.as_deref(), Some("Fleurs"));
    assert!(verify_entries(&e, true).ok);
    let metas = attachments::load_index(&d, &KEY).unwrap();
    assert_eq!(metas.len(), 1);
    assert_eq!(metas[0].patient_id, attachments::CABINET_OWNER);
    assert_eq!(e[0].receipt_ids, vec![metas[0].id.clone()]);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn expense_receipts_are_kept_for_good() {
    let d = tmp("receipt-keep");
    let id = receipt(&d);
    assert!(attachments::delete(&d, &KEY, &id).unwrap_err().contains("pièce comptable"));
    assert_eq!(attachments::status(&d, &KEY).unwrap().orphan_records, 0, "pas une pièce orpheline");
    let bad = attachments::AddInput { patient_id: attachments::CABINET_OWNER.into(), title: "x".into(), category: "autre".into(), exam_date: "2026-10-01".into(), linked_type: Some("result".into()), linked_id: Some("r".into()), ..Default::default() };
    assert!(attachments::add(&d, &KEY, bad, pdf(), "Dr", "2026-10-08T10:00:00Z", TODAY).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn suppliers_are_remembered_without_duplicates() {
    let d = tmp("suppliers");
    add_ok(&d, &new("2026-10-01", "Divers", 1_000));
    let mut n = new("2026-10-02", "Divers", 1_000);
    n.supplier = "Maroc Telecom".into();
    add_ok(&d, &n);
    add_ok(&d, &new("2026-10-03", "Divers", 1_000));
    assert_eq!(suppliers(&load(&d, &KEY).unwrap()), vec!["Maroc Telecom", "Pharma Plus"]);
    let _ = fs::remove_dir_all(&d);
}
