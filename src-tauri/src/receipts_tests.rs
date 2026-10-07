use super::*;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const KEY: [u8; KEY_LEN] = [5u8; KEY_LEN];
const TODAY: &str = "2026-10-07";
const NOW: &str = "2026-10-07T10:00:00Z";

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-rec-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    write_enc_json_in(&d, &KEY, PATIENTS_FILE, &json!([{"id": "p1", "name": "HAYAT Salma", "diagnosis": "SECRET-DIAG"}, {"id": "p2", "name": "ALAMI Omar"}])).unwrap();
    write_enc_json_in(&d, &KEY, DOCTOR_INFO_FILE, &json!({"nameFr": "Dr X", "ice": "  001234  ", "vatExemptionNote": "Exonéré de TVA", "inpe": ""})).unwrap();
    d
}

fn set_notes(d: &Path, notes: Value) {
    write_enc_json_in(d, &KEY, NOTES_FILE, &notes).unwrap();
}

fn note(id: &str, patient: &str, date: &str, total: f64, status: &str, paid: f64) -> Value {
    json!({"id": id, "patientId": patient, "date": date, "totalAmount": total, "status": status, "amountPaid": paid, "paymentMode": "CASH",
           "services": [{"name": "Consultation", "price": total, "checked": true}, {"name": "ECG", "price": 0, "checked": false}],
           "prescriptionId": "rx-1", "consultationId": "c1", "diagnosis": "SECRET-DIAG", "invoiceNumber": "2026-0001"})
}

fn doctor() -> Actor {
    Actor { name: "Dr".into(), role: Role::Medecin }
}
fn assistant() -> Actor {
    Actor { name: "Sara".into(), role: Role::Assistant }
}

fn issue_at(d: &Path, id: &str, today: &str) -> Result<Entry, String> {
    issue(d, &KEY, id, false, &doctor(), NOW, today)
}

#[test]
fn amounts_in_words_follow_french_spelling() {
    let cases: &[(i64, &str)] = &[
        (0 + 50, "Zéro dirham et cinquante centimes"),
        (100, "Un dirham"),
        (200, "Deux dirhams"),
        (1600, "Seize dirhams"),
        (1700, "Dix-sept dirhams"),
        (2100, "Vingt-et-un dirhams"),
        (3100, "Trente-et-un dirhams"),
        (7100, "Soixante-et-onze dirhams"),
        (7200, "Soixante-douze dirhams"),
        (7900, "Soixante-dix-neuf dirhams"),
        (8000, "Quatre-vingts dirhams"),
        (8100, "Quatre-vingt-un dirhams"),
        (9100, "Quatre-vingt-onze dirhams"),
        (9900, "Quatre-vingt-dix-neuf dirhams"),
        (10000, "Cent dirhams"),
        (10100, "Cent un dirhams"),
        (20000, "Deux cents dirhams"),
        (20100, "Deux cent un dirhams"),
        (25000, "Deux cent cinquante dirhams"),
        (25050, "Deux cent cinquante dirhams et cinquante centimes"),
        (25001, "Deux cent cinquante dirhams et un centime"),
        (100000, "Mille dirhams"),
        (100100, "Mille un dirhams"),
        (200000, "Deux mille dirhams"),
        (8000000, "Quatre-vingt mille dirhams"),
        (20000000, "Deux cent mille dirhams"),
        (20000100, "Deux cent mille un dirhams"),
        (8000100, "Quatre-vingt mille un dirhams"),
        (12345600, "Cent vingt-trois mille quatre cent cinquante-six dirhams"),
        (100000000, "Un million de dirhams"),
        (200000000, "Deux millions de dirhams"),
        (100010000, "Un million cent dirhams"),
        (1000000000, "Dix millions de dirhams"),
        (-25000, "Moins deux cent cinquante dirhams"),
        (-25050, "Moins deux cent cinquante dirhams et cinquante centimes"),
    ];
    for (c, w) in cases {
        assert_eq!(&amount_in_words(*c), w, "{c} centimes");
    }
    // Tous les nombres de 0 à 999 : jamais vide, jamais de double espace.
    for n in 0..1000 {
        let w = number_in_words(n);
        assert!(!w.is_empty() && !w.contains("  ") && !w.contains("--"), "{n} → {w}");
    }
    // Jamais de « s » parasite sur cent / vingt dans un nombre suivi d'un autre.
    assert_eq!(number_in_words(380), "trois cent quatre-vingts");
    assert_eq!(number_in_words(381), "trois cent quatre-vingt-un");
    assert_eq!(number_in_words(1_200_000), "un million deux cent mille");
}

#[test]
fn cents_conversion_is_exact_and_bounded() {
    assert_eq!(to_cents(0.1 + 0.2), Ok(30));
    assert_eq!(to_cents(250.0), Ok(25_000));
    assert_eq!(to_cents(10_000_000.0), Ok(MAX_CENTS));
    for bad in [0.0, -1.0, 12.345, 10_000_000.01, f64::NAN, f64::INFINITY] {
        assert!(to_cents(bad).is_err(), "{bad}");
    }
}

#[test]
fn numbers_are_sequential_five_digits_and_never_reused() {
    let d = tmp("seq");
    set_notes(&d, json!([note("n1", "p1", TODAY, 300.0, "PAID", 0.0), note("n2", "p2", TODAY, 200.0, "PAID", 0.0)]));
    let a = issue_at(&d, "n1", TODAY).unwrap();
    let b = issue_at(&d, "n2", TODAY).unwrap();
    assert_eq!((a.number.as_str(), b.number.as_str()), ("REC-2026-00001", "REC-2026-00002"));
    assert_eq!((a.amount_cents, a.amount_in_words.as_str(), a.label.as_str()), (30_000, "Trois cents dirhams", "Consultation"));
    // Supprimer la note n'efface rien du registre et ne libère aucun numéro.
    set_notes(&d, json!([note("n3", "p1", TODAY, 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&d, "n3", TODAY).unwrap().number, "REC-2026-00003");
    assert_eq!(load(&d, &KEY).unwrap().len(), 3);
    assert!(verify(&d, &KEY).unwrap().ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn counter_restarts_each_year_and_grows_past_five_digits() {
    let d = tmp("year");
    set_notes(&d, json!([note("n1", "p1", "2026-12-31", 100.0, "PAID", 0.0), note("n2", "p1", "2027-01-01", 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&d, "n1", "2026-12-31").unwrap().number, "REC-2026-00001");
    assert_eq!(issue_at(&d, "n2", "2027-01-01").unwrap().number, "REC-2027-00001");
    assert_eq!(format_number(2026, 99_999), "REC-2026-99999");
    assert_eq!(format_number(2026, 100_000), "REC-2026-100000");
    assert_eq!(format_number(2026, 1_234_567), "REC-2026-1234567");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn interrupted_issue_never_duplicates_a_number() {
    let d = tmp("crash");
    set_notes(&d, json!([note("n1", "p1", TODAY, 100.0, "PAID", 0.0), note("n2", "p2", TODAY, 100.0, "PAID", 0.0)]));
    issue_at(&d, "n1", TODAY).unwrap();
    // Plantage simulé entre le registre et le compteur : compteur remis en arrière.
    save_counter(&d, &KEY, &Counter { year: 2026, last: 0 }).unwrap();
    assert!(verify(&d, &KEY).unwrap().problems.iter().any(|p| p.contains("compteur")));
    let b = issue_at(&d, "n2", TODAY).unwrap();
    assert_eq!(b.number, "REC-2026-00002", "le registre fait foi");
    assert!(verify(&d, &KEY).unwrap().ok);
    // Compteur absent : même résultat.
    fs::remove_file(d.join(COUNTER_FILE)).unwrap();
    set_notes(&d, json!([note("n3", "p1", TODAY, 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&d, "n3", TODAY).unwrap().number, "REC-2026-00003");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn concurrent_issues_get_distinct_consecutive_numbers() {
    let d = tmp("conc");
    let notes: Vec<Value> = (0..16).map(|i| note(&format!("n{i}"), "p1", TODAY, 100.0, "PAID", 0.0)).collect();
    set_notes(&d, Value::Array(notes));
    let handles: Vec<_> = (0..16)
        .map(|i| {
            let d = d.clone();
            std::thread::spawn(move || issue(&d, &KEY, &format!("n{i}"), false, &doctor(), NOW, TODAY).unwrap().number)
        })
        .collect();
    let mut numbers: Vec<String> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    numbers.sort();
    let expected: Vec<String> = (1..=16).map(|n| format_number(2026, n)).collect();
    assert_eq!(numbers, expected);
    assert!(verify(&d, &KEY).unwrap().ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn clock_set_back_is_refused() {
    let d = tmp("clock");
    set_notes(&d, json!([note("n1", "p1", "2026-10-07", 100.0, "PAID", 0.0), note("n2", "p1", "2026-10-06", 100.0, "PAID", 0.0)]));
    issue_at(&d, "n1", "2026-10-07").unwrap();
    let err = issue_at(&d, "n2", "2026-10-06").unwrap_err();
    assert!(err.contains("antérieure"), "{err}");
    assert_eq!(load(&d, &KEY).unwrap().len(), 1);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn receipt_amount_is_what_was_paid_and_not_yet_receipted() {
    let d = tmp("partial");
    set_notes(&d, json!([note("n1", "p1", TODAY, 500.0, "PARTIAL", 200.0)]));
    let r1 = issue_at(&d, "n1", TODAY).unwrap();
    assert_eq!((r1.amount_cents, r1.balance_due_cents), (20_000, 30_000));
    // Rien de nouveau payé : refusé, aucun numéro consommé.
    assert!(issue_at(&d, "n1", TODAY).unwrap_err().contains("déjà"));
    assert_eq!(load(&d, &KEY).unwrap().len(), 1);
    // Solde encaissé : second reçu pour le seul versement du solde.
    set_notes(&d, json!([note("n1", "p1", TODAY, 500.0, "PAID", 0.0)]));
    let r2 = issue_at(&d, "n1", TODAY).unwrap();
    assert_eq!((r2.amount_cents, r2.balance_due_cents, r2.number.as_str()), (30_000, 0, "REC-2026-00002"));
    // Impayé : rien à reçuer. Note ou patient inconnus : refus.
    set_notes(&d, json!([note("n9", "p1", TODAY, 500.0, "UNPAID", 0.0), note("n8", "inconnu", TODAY, 50.0, "PAID", 0.0)]));
    assert!(issue_at(&d, "n9", TODAY).unwrap_err().contains("Aucun versement"));
    assert!(issue_at(&d, "n8", TODAY).unwrap_err().contains("Patient"));
    assert!(issue_at(&d, "absente", TODAY).unwrap_err().contains("introuvable"));
    // Montant avec plus de 2 décimales : refusé.
    set_notes(&d, json!([note("n7", "p1", TODAY, 10.005, "PAID", 0.0)]));
    assert!(issue_at(&d, "n7", TODAY).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn receipt_never_carries_a_diagnosis_or_any_medical_link() {
    let d = tmp("nodiag");
    set_notes(&d, json!([note("n1", "p1", TODAY, 300.0, "PAID", 0.0)]));
    let r = issue_at(&d, "n1", TODAY).unwrap();
    let v = serde_json::to_value(&r).unwrap();
    let keys: Vec<&str> = v.as_object().unwrap().keys().map(|k| k.as_str()).collect();
    assert!(keys.iter().all(|k| ENTRY_FIELDS.contains(k)), "champs hors liste blanche : {keys:?}");
    let raw = fs::read(d.join(REGISTRY_FILE)).unwrap();
    let text = serde_json::to_string(&v).unwrap();
    for forbidden in ["SECRET-DIAG", "rx-1", "diagnosis", "prescriptionId", "consultationId"] {
        assert!(!text.contains(forbidden), "{forbidden}");
    }
    assert!(!raw.windows(11).any(|w| w == b"SECRET-DIAG"), "registre chiffré");
    assert_eq!(r.label, "Consultation");
    // Détail demandé par le médecin : seulement les prestations cochées de la note.
    set_notes(&d, json!([{"id": "n2", "patientId": "p1", "date": TODAY, "totalAmount": 400.0, "status": "PAID", "paymentMode": "CARD",
        "services": [{"name": "Consultation", "price": 300, "checked": true}, {"name": "ECG", "price": 100, "checked": true}, {"name": "Echo", "price": 0, "checked": false}]}]));
    assert_eq!(issue(&d, &KEY, "n2", true, &doctor(), NOW, TODAY).unwrap().label, "Consultation, ECG");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn assistant_issues_today_only_with_the_default_label() {
    let d = tmp("assist");
    set_notes(&d, json!([note("today", "p1", TODAY, 100.0, "PAID", 0.0), note("old", "p1", "2026-10-01", 100.0, "PAID", 0.0)]));
    assert!(issue(&d, &KEY, "old", false, &assistant(), NOW, TODAY).unwrap_err().contains("du jour"));
    assert!(issue(&d, &KEY, "today", true, &assistant(), NOW, TODAY).unwrap_err().contains("réservé au médecin"));
    let ok = issue(&d, &KEY, "today", false, &assistant(), NOW, TODAY).unwrap();
    assert_eq!((ok.issued_by.as_str(), ok.label.as_str()), ("Sara", "Consultation"));
    assert!(issue(&d, &KEY, "old", false, &doctor(), NOW, TODAY).is_ok(), "le médecin peut tout");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn legal_mentions_are_optional_trimmed_and_frozen_on_the_receipt() {
    let d = tmp("legal");
    set_notes(&d, json!([note("n1", "p1", TODAY, 100.0, "PAID", 0.0)]));
    let r = issue_at(&d, "n1", TODAY).unwrap();
    assert_eq!(r.legal.ice.as_deref(), Some("001234"));
    assert_eq!(r.legal.vat_note.as_deref(), Some("Exonéré de TVA"));
    assert!(r.legal.inpe.is_none() && r.legal.tax_id.is_none() && r.legal.professional_tax.is_none() && r.legal.order_number.is_none(), "rien n'est inventé");
    // Modifier la fiche cabinet ensuite ne change pas le reçu déjà émis.
    write_enc_json_in(&d, &KEY, DOCTOR_INFO_FILE, &json!({"ice": "999"})).unwrap();
    assert_eq!(load(&d, &KEY).unwrap()[0].legal.ice.as_deref(), Some("001234"));
    // Fiche sans mentions : aucune mention.
    write_enc_json_in(&d, &KEY, DOCTOR_INFO_FILE, &json!({"nameFr": "Dr"})).unwrap();
    set_notes(&d, json!([note("n2", "p1", TODAY, 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&d, "n2", TODAY).unwrap().legal, Legal::default());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn registry_chain_detects_modified_removed_or_inserted_entries() {
    let d = tmp("chain");
    set_notes(&d, json!([note("n1", "p1", TODAY, 100.0, "PAID", 0.0), note("n2", "p1", TODAY, 200.0, "PAID", 0.0), note("n3", "p2", TODAY, 300.0, "PAID", 0.0)]));
    for id in ["n1", "n2", "n3"] {
        issue_at(&d, id, TODAY).unwrap();
    }
    let good = load(&d, &KEY).unwrap();
    assert!(verify(&d, &KEY).unwrap().ok);
    let write = |e: &[Entry]| save(&d, &KEY, e).unwrap();
    // Montant modifié.
    let mut m = good.clone();
    m[1].amount_cents = 1;
    write(&m);
    assert!(verify(&d, &KEY).unwrap().problems.iter().any(|p| p.contains("modifié")));
    // Entrée du milieu retirée : chaîne rompue ET suite interrompue.
    let mut r = good.clone();
    r.remove(1);
    write(&r);
    let rep = verify(&d, &KEY).unwrap();
    assert!(!rep.ok && rep.problems.iter().any(|p| p.contains("chaîne rompue")) && rep.problems.iter().any(|p| p.contains("Suite interrompue")), "{:?}", rep.problems);
    // Dernière entrée retirée : le compteur en garde la trace.
    write(&good[..2]);
    assert!(verify(&d, &KEY).unwrap().problems.iter().any(|p| p.contains("s'arrête avant")));
    // Intact.
    write(&good);
    assert!(verify(&d, &KEY).unwrap().ok);
    let _ = fs::remove_dir_all(&d);
}

// ─── Annulation, duplicata, consultation ─────────────────────────────────────

fn two_receipts(tag: &str) -> (PathBuf, Entry, Entry) {
    let d = tmp(tag);
    set_notes(&d, json!([note("n1", "p1", TODAY, 300.0, "PAID", 0.0), note("n2", "p2", TODAY, 150.5, "PAID", 0.0)]));
    let a = issue_at(&d, "n1", TODAY).unwrap();
    let b = issue_at(&d, "n2", TODAY).unwrap();
    (d, a, b)
}

#[test]
fn cancellation_is_a_new_negative_receipt_in_the_same_sequence() {
    let (d, a, _b) = two_receipts("cancel");
    let c = cancel(&d, &KEY, &a.number, "  Erreur de saisie  ", &doctor(), NOW, TODAY).unwrap();
    assert_eq!((c.kind.as_str(), c.number.as_str(), c.amount_cents), ("cancellation", "REC-2026-00003", -30_000));
    assert_eq!(c.amount_in_words, "Moins trois cents dirhams");
    assert_eq!((c.cancels_number.as_deref(), c.reason.as_deref()), (Some("REC-2026-00001"), Some("Erreur de saisie")));
    assert_eq!(c.patient_name, a.patient_name);
    // Le reçu d'origine est intact (mêmes octets), son état est déduit.
    let entries = load(&d, &KEY).unwrap();
    assert_eq!(entries[0], a);
    let v = list(&d, &KEY, None).unwrap();
    let orig = v.iter().find(|x| x.entry.number == a.number).unwrap();
    assert_eq!((orig.status.as_str(), orig.cancelled_by.as_deref()), ("cancelled", Some("REC-2026-00003")));
    assert_eq!(v[0].status, "cancellation", "du plus récent au plus ancien");
    assert!(verify(&d, &KEY).unwrap().ok);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn cancellation_rules_once_only_doctor_only_reason_required() {
    let (d, a, b) = two_receipts("rules");
    // Assistante : refusée, rien n'est écrit.
    assert!(cancel(&d, &KEY, &a.number, "erreur", &assistant(), NOW, TODAY).unwrap_err().contains("médecin"));
    assert_eq!(load(&d, &KEY).unwrap().len(), 2);
    // Motif obligatoire / borné.
    for bad in ["", "  ", "ab"] {
        assert!(cancel(&d, &KEY, &a.number, bad, &doctor(), NOW, TODAY).unwrap_err().contains("obligatoire"), "{bad:?}");
    }
    assert!(cancel(&d, &KEY, &a.number, &"x".repeat(201), &doctor(), NOW, TODAY).unwrap_err().contains("trop long"));
    assert!(cancel(&d, &KEY, "REC-2026-99999", "erreur", &doctor(), NOW, TODAY).unwrap_err().contains("introuvable"));
    assert_eq!(load(&d, &KEY).unwrap().len(), 2, "aucun numéro consommé par un refus");
    // Une seule fois ; un reçu d'annulation n'est pas annulable.
    let c = cancel(&d, &KEY, &a.number, "erreur", &doctor(), NOW, TODAY).unwrap();
    assert!(cancel(&d, &KEY, &a.number, "encore", &doctor(), NOW, TODAY).unwrap_err().contains("déjà annulé"));
    assert!(cancel(&d, &KEY, &c.number, "annuler l'annulation", &doctor(), NOW, TODAY).unwrap_err().contains("ne peut pas être annulé"));
    // L'autre reçu reste valide.
    assert_eq!(list(&d, &KEY, Some("p2")).unwrap()[0].status, "valid");
    let _ = b;
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn cancelled_amount_can_be_receipted_again_with_a_new_number() {
    let (d, a, _b) = two_receipts("reissue");
    assert!(issue_at(&d, "n1", TODAY).unwrap_err().contains("déjà"), "payé et déjà reçu");
    cancel(&d, &KEY, &a.number, "mauvais montant saisi", &doctor(), NOW, TODAY).unwrap();
    let again = issue_at(&d, "n1", TODAY).unwrap();
    assert_eq!((again.number.as_str(), again.amount_cents), ("REC-2026-00004", 30_000));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn duplicate_never_takes_a_number_and_ranks_increase() {
    let (d, a, _b) = two_receipts("dup");
    let d1 = duplicate(&d, &KEY, &a.number, &doctor(), NOW, TODAY).unwrap();
    let d2 = duplicate(&d, &KEY, &a.number, &assistant(), NOW, TODAY).unwrap();
    assert_eq!((d1.duplicate_rank, d2.duplicate_rank), (Some(1), Some(2)));
    assert_eq!(d2.entry, a, "contenu figé identique à l'original");
    assert_eq!(d2.duplicates, 2);
    // Pas de nouveau numéro : le suivant reste le 3e.
    set_notes(&d, json!([note("n3", "p1", TODAY, 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&d, "n3", TODAY).unwrap().number, "REC-2026-00003");
    assert!(verify(&d, &KEY).unwrap().ok);
    // Les duplicata n'apparaissent pas comme des reçus dans les listes.
    assert!(list(&d, &KEY, None).unwrap().iter().all(|v| v.entry.kind != "duplicate"));
    // Reçu inconnu / duplicata d'un reçu annulé : le reçu annulé reste réimprimable (mention côté interface).
    assert!(duplicate(&d, &KEY, "REC-2026-77777", &doctor(), NOW, TODAY).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn assistant_only_sees_and_reprints_todays_receipts() {
    let d = tmp("assist2");
    set_notes(&d, json!([note("old", "p1", "2026-10-01", 100.0, "PAID", 0.0), note("new", "p2", TODAY, 200.0, "PAID", 0.0)]));
    let old = issue(&d, &KEY, "old", false, &doctor(), NOW, "2026-10-01").unwrap();
    let new = issue_at(&d, "new", TODAY).unwrap();
    assert!(get(&d, &KEY, &old.number, &assistant(), TODAY).unwrap_err().contains("du jour"));
    assert!(duplicate(&d, &KEY, &old.number, &assistant(), NOW, TODAY).unwrap_err().contains("du jour"));
    assert!(get(&d, &KEY, &new.number, &assistant(), TODAY).is_ok());
    assert!(duplicate(&d, &KEY, &new.number, &assistant(), NOW, TODAY).is_ok());
    let today = list_today(&d, &KEY, TODAY).unwrap();
    assert_eq!(today.len(), 1);
    assert_eq!(today[0].entry.number, new.number);
    // Le médecin voit tout.
    assert!(get(&d, &KEY, &old.number, &doctor(), TODAY).is_ok());
    assert_eq!(list(&d, &KEY, None).unwrap().len(), 2);
    assert!(duplicate(&d, &KEY, &old.number, &doctor(), NOW, TODAY).is_ok());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn verify_flags_a_duplicate_of_an_unknown_receipt_and_a_forged_cancellation() {
    let (d, a, _b) = two_receipts("forge");
    let mut entries = load(&d, &KEY).unwrap();
    // Duplicata d'un numéro inexistant, correctement chaîné : détecté par le contenu.
    let mut dup = entries[0].clone();
    dup.kind = "duplicate".into();
    dup.number = "REC-2026-12345".into();
    dup.seq = 0;
    dup.rank = Some(1);
    entries.push(seal(dup, &entries));
    save(&d, &KEY, &entries).unwrap();
    assert!(verify(&d, &KEY).unwrap().problems.iter().any(|p| p.contains("inconnu")));
    let _ = a;
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn journal_never_receives_names_amounts_or_reasons() {
    // Les appels audit::log du module ne portent que le numéro (ou « refusé »).
    let src = include_str!("receipts.rs");
    for line in src.lines().filter(|l| l.contains("audit::log(")) {
        for banned in ["patient_name", "amount", "reason", "label", "note_id"] {
            assert!(!line.contains(banned), "{line}");
        }
    }
    assert!(src.matches("audit::log(").count() >= 5);
}

// ─── Restauration ────────────────────────────────────────────────────────────

fn backup_files(d: &Path) -> std::collections::BTreeMap<String, Value> {
    let mut f = std::collections::BTreeMap::new();
    for name in [REGISTRY_FILE, COUNTER_FILE] {
        if let Ok(Some(v)) = read_enc_json_in(d, &KEY, name) {
            f.insert(name.to_string(), v);
        }
    }
    f
}

#[test]
fn restoring_an_older_backup_never_moves_the_registry_or_counter_back() {
    let d = tmp("restore");
    set_notes(&d, json!([note("n1", "p1", TODAY, 100.0, "PAID", 0.0), note("n2", "p1", TODAY, 100.0, "PAID", 0.0), note("n3", "p2", TODAY, 100.0, "PAID", 0.0)]));
    issue_at(&d, "n1", TODAY).unwrap();
    let mut old = backup_files(&d); // sauvegarde faite après le 1er reçu
    issue_at(&d, "n2", TODAY).unwrap();
    issue_at(&d, "n3", TODAY).unwrap();
    // Restauration de la sauvegarde ancienne sur le même poste.
    let m = merge_for_restore(&d, &KEY, &mut old);
    assert_eq!(m.kept_after_backup, 2);
    assert_eq!(serde_json::from_value::<Vec<Entry>>(old[REGISTRY_FILE].clone()).unwrap().len(), 3, "registre actuel conservé");
    assert_eq!(old[COUNTER_FILE]["last"], 3);
    // Appliquons ce contenu : le prochain numéro est le 4e, la chaîne est valide.
    for (name, v) in &old {
        write_enc_json_in(&d, &KEY, name, v).unwrap();
    }
    assert!(verify(&d, &KEY).unwrap().ok);
    set_notes(&d, json!([note("n4", "p1", TODAY, 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&d, "n4", TODAY).unwrap().number, "REC-2026-00004");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn restoring_on_a_fresh_station_takes_the_backup_registry_and_flags_nothing() {
    let src = tmp("restore-src");
    set_notes(&src, json!([note("n1", "p1", TODAY, 100.0, "PAID", 0.0), note("n2", "p2", TODAY, 200.0, "PAID", 0.0)]));
    issue_at(&src, "n1", TODAY).unwrap();
    issue_at(&src, "n2", TODAY).unwrap();
    let mut files = backup_files(&src);
    let fresh = tmp("restore-fresh"); // poste neuf : ni registre ni compteur
    let m = merge_for_restore(&fresh, &KEY, &mut files);
    assert_eq!(m.kept_after_backup, 0);
    for (name, v) in &files {
        write_enc_json_in(&fresh, &KEY, name, v).unwrap();
    }
    assert!(verify(&fresh, &KEY).unwrap().ok);
    set_notes(&fresh, json!([note("n3", "p1", TODAY, 100.0, "PAID", 0.0)]));
    assert_eq!(issue_at(&fresh, "n3", TODAY).unwrap().number, "REC-2026-00003");
    // Sauvegarde d'avant la fonctionnalité (aucun registre) sur un poste qui en a un : rien n'est perdu.
    let mut empty = std::collections::BTreeMap::new();
    let m2 = merge_for_restore(&fresh, &KEY, &mut empty);
    assert_eq!(m2.kept_after_backup, 3);
    assert_eq!(empty[COUNTER_FILE]["last"], 3);
    for d in [&src, &fresh] {
        let _ = fs::remove_dir_all(d);
    }
}

#[test]
fn diverging_registries_keep_the_backup_but_the_counter_never_goes_back() {
    let a = tmp("div-a");
    let b = tmp("div-b");
    set_notes(&a, json!([note("n1", "p1", TODAY, 100.0, "PAID", 0.0), note("n2", "p1", TODAY, 100.0, "PAID", 0.0)]));
    set_notes(&b, json!([note("n1", "p1", TODAY, 999.0, "PAID", 0.0)]));
    issue_at(&a, "n1", TODAY).unwrap();
    issue_at(&a, "n2", TODAY).unwrap();
    issue_at(&b, "n1", TODAY).unwrap();
    let mut from_b = backup_files(&b);
    merge_for_restore(&a, &KEY, &mut from_b);
    assert_eq!(from_b[COUNTER_FILE]["last"], 2, "compteur : le plus grand des deux");
    assert_eq!(serde_json::from_value::<Vec<Entry>>(from_b[REGISTRY_FILE].clone()).unwrap().len(), 1, "registres divergents : celui de la sauvegarde");
    for d in [&a, &b] {
        let _ = fs::remove_dir_all(d);
    }
}
