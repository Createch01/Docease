use super::*;
use crate::accounting;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const KEY: [u8; KEY_LEN] = [4u8; KEY_LEN];
const TODAY: &str = "2026-10-08";
const NOW: &str = "2026-10-08T09:00:00Z";

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-tar-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn act(id: Option<&str>, code: &str, label: &str, cat: &str, price: Option<i64>) -> ActInput {
    ActInput { id: id.map(String::from), code: code.into(), label: label.into(), category: cat.into(), price_cents: price, ..Default::default() }
}

/// Grille de test : Consultation 300 DH, ECG 200 DH, Contrôle 150 DH ; reste sans prix.
fn priced(d: &Path) {
    for (id, code, label, cat, p) in [
        ("act-consultation", "CS", "Consultation", "CONSULTATION", 30_000),
        ("act-ecg", "ECG", "ECG", "EXPLORATION", 20_000),
        ("act-controle", "CTRL", "Consultation de contrôle", "CONTROLE", 15_000),
    ] {
        save_act(d, &KEY, Role::Medecin, &act(Some(id), code, label, cat, Some(p)), "Dr", NOW, TODAY).unwrap();
    }
}

/// Équivalent de `save_json` pour le fichier des notes (crochet, écriture, compteur).
fn save_as(d: &Path, list: Vec<Value>, today: &str, role: Role) -> Result<Vec<Value>, String> {
    let (data, pending) = numbering::on_save_as(d, &KEY, Value::Array(list), today, "Dr Test", role)?;
    write_enc_json_in(d, &KEY, numbering::NOTES_FILE, &data)?;
    pending.commit()?;
    Ok(numbering::read_notes(d, &KEY))
}

fn dr(d: &Path, list: Vec<Value>) -> Vec<Value> {
    save_as(d, list, TODAY, Role::Medecin).unwrap()
}

fn find<'a>(notes: &'a [Value], id: &str) -> &'a Value {
    notes.iter().find(|n| n["id"] == id).unwrap()
}

fn new_note(id: &str, lines: Value) -> Value {
    json!({"id": id, "patientId": "p1", "patientName": "A", "date": TODAY, "invoiceNumber": "", "paymentMode": "CASH", "lines": lines})
}

fn pricing<'a>(g: &'a Grid, role: Role, eligible: bool) -> Pricing<'a> {
    Pricing { grid: g, role, by: "Sara", now: NOW, today: TODAY, free_control_eligible: eligible }
}

fn line(act: &str) -> LineInput {
    LineInput { act_id: Some(act.into()), ..Default::default() }
}

fn pct(p: u32, reason: &str) -> DiscountInput {
    DiscountInput { kind: "PERCENT".into(), percent: Some(p), reason: reason.into(), ..Default::default() }
}

fn free(reason: &str) -> DiscountInput {
    DiscountInput { kind: "FREE".into(), reason: reason.into(), ..Default::default() }
}

fn grid_with(cap: u32) -> Grid {
    let mut g = default_grid();
    g.acts[0].price_cents = Some(30_000);
    g.acts[1].price_cents = Some(15_000);
    g.acts[2].price_cents = Some(20_000);
    g.settings = Settings { assistant_discount_cap_pct: cap, free_control_days: 14 };
    g
}

// ─── Grille ──────────────────────────────────────────────────────────────────

#[test]
fn preloaded_grid_has_labels_only_and_no_invented_price_or_ngap() {
    let d = tmp("default");
    let g = load(&d, &KEY).unwrap();
    let labels: Vec<&str> = g.acts.iter().map(|a| a.label.as_str()).collect();
    assert_eq!(labels, vec!["Consultation", "Consultation de contrôle", "ECG", "Échocardiographie", "Holter ECG 24 h", "MAPA", "Épreuve d'effort", "Certificat médical"]);
    assert!(g.acts.iter().all(|a| a.price_cents.is_none() && a.ngap_letter.is_none() && a.ngap_coefficient.is_none() && a.active));
    assert!(!g.is_usable(), "bandeau « Complétez vos tarifs » tant qu'aucun prix");
    assert_eq!((g.settings.assistant_discount_cap_pct, g.settings.free_control_days), (0, 0));
    priced(&d);
    assert!(load(&d, &KEY).unwrap().is_usable());
    // Rien n'est lisible sur le disque.
    assert!(!fs::read(d.join(FILE)).unwrap().windows(12).any(|w| w == b"Consultation"));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn acts_are_validated_unique_and_never_deleted_only_deactivated() {
    let d = tmp("acts");
    assert!(save_act(&d, &KEY, Role::Assistant, &act(None, "X", "Acte", "AUTRE", None), "Sara", NOW, TODAY).unwrap_err().contains("médecin"));
    assert!(set_active(&d, &KEY, Role::Assistant, "act-ecg", false).is_err());
    assert!(save_settings(&d, &KEY, Role::Assistant, 50, 30).is_err());
    let ok = |a: ActInput| save_act(&d, &KEY, Role::Medecin, &a, "Dr", NOW, TODAY);
    assert!(ok(act(None, "", "Acte", "AUTRE", None)).is_err(), "code obligatoire");
    assert!(ok(act(None, "X", "", "AUTRE", None)).is_err(), "libellé obligatoire");
    assert!(ok(act(None, "X", "Acte", "INCONNUE", None)).is_err());
    assert!(ok(act(None, "X", "Acte", "AUTRE", Some(0))).is_err(), "prix nul refusé (vide = non renseigné)");
    assert!(ok(act(None, "X", "Acte", "AUTRE", Some(-5))).is_err());
    assert!(ok(act(None, "cs", "Autre", "AUTRE", None)).unwrap_err().contains("code"), "code unique, casse ignorée");
    assert!(ok(act(None, "ZZ", "consultation", "AUTRE", None)).unwrap_err().contains("libellé"));
    let mut a = act(None, "SPIRO", "Spirométrie", "EXPLORATION", Some(25_000));
    a.ngap_letter = Some("k".into());
    a.ngap_coefficient = Some("12,5".into());
    let g = ok(a).unwrap();
    let created = g.acts.last().unwrap();
    assert_eq!((created.ngap_letter.as_deref(), created.ngap_coefficient.as_deref(), created.active, created.order), (Some("K"), Some("12.5"), true, 9));
    let mut bad = act(None, "Y", "Y", "AUTRE", None);
    bad.ngap_coefficient = Some("abc".into());
    assert!(ok(bad).is_err());
    // Désactivation : l'acte reste dans la grille, il n'y a aucune suppression.
    let g = set_active(&d, &KEY, Role::Medecin, &created.id.clone(), false).unwrap();
    assert_eq!(g.acts.len(), 9);
    assert!(!g.find(&created.id).unwrap().active);
    assert!(set_active(&d, &KEY, Role::Medecin, "act-inconnu", false).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn a_price_change_is_logged_and_only_new_notes_use_it() {
    let d = tmp("freeze");
    priced(&d);
    let notes = dr(&d, vec![new_note("a", json!([{"actId": "act-consultation"}]))]);
    let a = find(&notes, "a");
    assert_eq!((a["netCents"].as_i64(), a["totalAmount"].as_f64(), a["lines"][0]["unitPriceCents"].as_i64()), (Some(30_000), Some(300.0), Some(30_000)));
    assert_eq!(a["lines"][0]["label"], "Consultation");
    assert_eq!(a["totalInWords"], "Trois cents dirhams");
    // Le médecin passe la consultation à 350 DH.
    let g = save_act(&d, &KEY, Role::Medecin, &act(Some("act-consultation"), "CS", "Consultation", "CONSULTATION", Some(35_000)), "Dr", NOW, "2026-10-09").unwrap();
    let hist = &g.find("act-consultation").unwrap().price_history;
    assert_eq!(hist.iter().map(|h| (h.price_cents, h.from.as_str())).collect::<Vec<_>>(), vec![(Some(30_000), TODAY), (Some(35_000), "2026-10-09")]);
    // L'ancienne note ne bouge pas, même réécrite avec une ligne forgée à 1 DH.
    let mut again = find(&dr(&d, vec![]), "a").clone();
    again["lines"] = json!([{"label": "Consultation", "quantity": 1, "unitPriceCents": 100, "netCents": 100}]);
    again["totalAmount"] = json!(1);
    again["netCents"] = json!(100);
    again["issuer"] = json!({"name": "Faux"});
    let notes = dr(&d, vec![again]);
    let a = find(&notes, "a");
    assert_eq!((a["netCents"].as_i64(), a["totalAmount"].as_f64(), a["lines"][0]["unitPriceCents"].as_i64()), (Some(30_000), Some(300.0), Some(30_000)), "lignes figées après émission");
    assert!(a["issuer"].get("name").is_none() || a["issuer"]["name"] != "Faux");
    // La nouvelle note prend le nouveau prix.
    let notes = dr(&d, vec![new_note("b", json!([{"actId": "act-consultation"}]))]);
    assert_eq!(find(&notes, "b")["netCents"], 35_000);
    assert_eq!(find(&notes, "a")["netCents"], 30_000);
    let _ = fs::remove_dir_all(&d);
}

// ─── Lignes ──────────────────────────────────────────────────────────────────

#[test]
fn deactivated_or_unpriced_acts_cannot_be_selected() {
    let d = tmp("unusable");
    priced(&d);
    set_active(&d, &KEY, Role::Medecin, "act-ecg", false).unwrap();
    let e = save_as(&d, vec![new_note("a", json!([{"actId": "act-ecg"}]))], TODAY, Role::Medecin).unwrap_err();
    assert!(e.contains("désactivé"), "{e}");
    let e = save_as(&d, vec![new_note("a", json!([{"actId": "act-holter"}]))], TODAY, Role::Medecin).unwrap_err();
    assert!(e.contains("pas de prix"), "{e}");
    assert!(save_as(&d, vec![new_note("a", json!([{"actId": "act-inconnu"}]))], TODAY, Role::Medecin).is_err());
    assert!(numbering::read_notes(&d, &KEY).is_empty(), "aucun refus n'écrit");
    // Un acte désactivé reste lisible sur l'ancienne note.
    set_active(&d, &KEY, Role::Medecin, "act-ecg", true).unwrap();
    dr(&d, vec![new_note("old", json!([{"actId": "act-ecg"}]))]);
    set_active(&d, &KEY, Role::Medecin, "act-ecg", false).unwrap();
    let notes = dr(&d, vec![]);
    assert_eq!(find(&notes, "old")["lines"][0]["label"], "ECG");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn grid_lines_take_their_price_from_the_grid_and_free_lines_are_for_the_doctor() {
    let g = grid_with(10);
    let m = pricing(&g, Role::Medecin, false);
    let a = pricing(&g, Role::Assistant, false);
    // Prix reçu différent du tarif : refusé (une remise avec motif est obligatoire).
    let mut cheaper = line("act-consultation");
    cheaper.unit_price_cents = Some(25_000);
    assert!(compute(&[cheaper], None, &m).unwrap_err().contains("remise avec motif"));
    let mut same = line("act-consultation");
    same.unit_price_cents = Some(30_000);
    assert_eq!(compute(&[same], None, &m).unwrap().net, 30_000);
    // Ligne libre : médecin seulement, libellé et prix obligatoires.
    let free_line = LineInput { label: Some("Visite à domicile".into()), unit_price_cents: Some(40_000), quantity: Some(2), ..Default::default() };
    let c = compute(&[free_line.clone()], None, &m).unwrap();
    assert_eq!((c.gross, c.net, c.lines[0]["quantity"].as_u64()), (80_000, 80_000, Some(2)));
    assert!(c.lines[0].get("actId").is_none() && c.lines[0].get("tariffUnitCents").is_none());
    assert!(compute(&[free_line], None, &a).unwrap_err().contains("médecin"));
    assert!(compute(&[LineInput { unit_price_cents: Some(100), ..Default::default() }], None, &m).is_err(), "libellé obligatoire");
    assert!(compute(&[LineInput { label: Some("x".into()), ..Default::default() }], None, &m).is_err(), "prix obligatoire");
    // Quantité et nombre de lignes.
    let mut q = line("act-ecg");
    q.quantity = Some(0);
    assert!(compute(&[q.clone()], None, &m).is_err());
    q.quantity = Some(100);
    assert!(compute(&[q], None, &m).is_err());
    assert!(compute(&[], None, &m).is_err());
    // Plusieurs lignes : brut = Σ quantité × tarif.
    let mut two = line("act-ecg");
    two.quantity = Some(2);
    let c = compute(&[line("act-consultation"), two], None, &m).unwrap();
    assert_eq!((c.gross, c.net), (30_000 + 2 * 20_000, 70_000));
}

// ─── Remises ─────────────────────────────────────────────────────────────────

#[test]
fn discounts_need_a_listed_reason_and_rust_sets_author_and_date() {
    let g = grid_with(0);
    let m = pricing(&g, Role::Medecin, false);
    let with = |d: DiscountInput| {
        let mut l = line("act-consultation");
        l.discount = Some(d);
        compute(&[l], None, &m)
    };
    assert!(with(pct(10, "")).unwrap_err().contains("Motif"), "remise sans motif refusée");
    assert!(with(pct(10, "INVENTE")).unwrap_err().contains("Motif"));
    let mut other = pct(10, "AUTRE");
    assert!(with(other.clone()).unwrap_err().contains("motif"), "« Autre » sans texte refusé");
    other.reason_text = Some("  ok ".into());
    assert!(with(other.clone()).is_err(), "texte trop court");
    other.reason_text = Some("Ami de la famille".into());
    let c = with(other).unwrap();
    let d = &c.lines[0]["discount"];
    assert_eq!((c.net, d["cents"].as_i64(), d["reason"].as_str(), d["reasonText"].as_str(), d["by"].as_str(), d["date"].as_str()), (27_000, Some(3_000), Some("AUTRE"), Some("Ami de la famille"), Some("Sara"), Some(TODAY)));
    assert_eq!(d["at"], NOW);
    // Pourcentage, montant, gratuité.
    assert_eq!(with(pct(15, "CONFRERE")).unwrap().net, 25_500);
    assert!(with(pct(0, "CONFRERE")).is_err() && with(pct(101, "CONFRERE")).is_err());
    let amount = |a: i64| DiscountInput { kind: "AMOUNT".into(), amount_cents: Some(a), reason: "GESTE".into(), ..Default::default() };
    assert_eq!(with(amount(5_050)).unwrap().net, 24_950);
    assert!(with(amount(0)).is_err() && with(amount(30_001)).is_err());
    let c = with(free("FAMILLE")).unwrap();
    assert_eq!((c.net, c.discount_total()), (0, 30_000));
    // Arrondi demi vers le haut : 33 % de 150 DH = 49,50 DH ; 1 % de 0,50 DH est impossible, 12 % de 12,50 DH = 1,50.
    let mut e = default_grid();
    e.acts[0].price_cents = Some(1_250);
    let mut l = line("act-consultation");
    l.discount = Some(pct(12, "GESTE"));
    assert_eq!(compute(&[l], None, &pricing(&e, Role::Medecin, false)).unwrap().net, 1_100);
    // Remise de note, appliquée après les remises de ligne.
    let mut l = line("act-consultation");
    l.discount = Some(pct(50, "SOCIAL"));
    let c = compute(&[l, line("act-ecg")], Some(&pct(10, "GESTE")), &m).unwrap();
    assert_eq!((c.gross, c.line_discounts, c.note_discount_cents, c.net), (50_000, 15_000, 3_500, 31_500));
}

#[test]
fn assistant_discounts_are_capped_by_the_doctors_setting() {
    let one = |d: Option<DiscountInput>, nd: Option<DiscountInput>, g: &Grid| {
        let mut l = line("act-consultation");
        l.discount = d;
        compute(&[l], nd.as_ref(), &pricing(g, Role::Assistant, false))
    };
    // Plafond par défaut : 0 % → aucune remise.
    let g0 = grid_with(0);
    assert_eq!(one(Some(pct(1, "GESTE")), None, &g0).unwrap_err(), "Remise réservée au médecin.");
    assert_eq!(one(None, Some(pct(5, "GESTE")), &g0).unwrap_err(), "Remise réservée au médecin.");
    assert!(compute(&[line("act-consultation")], None, &pricing(&g0, Role::Assistant, false)).is_ok(), "sans remise : accepté");
    // Plafond 10 % : 10 % passe, 11 % est refusé (ligne, note, montant).
    let g10 = grid_with(10);
    assert_eq!(one(Some(pct(10, "CONFRERE")), None, &g10).unwrap().net, 27_000);
    assert!(one(Some(pct(11, "CONFRERE")), None, &g10).unwrap_err().starts_with("Remise réservée au médecin"));
    assert!(one(None, Some(pct(11, "CONFRERE")), &g10).is_err());
    let amount = |a: i64| DiscountInput { kind: "AMOUNT".into(), amount_cents: Some(a), reason: "GESTE".into(), ..Default::default() };
    assert!(one(Some(amount(3_000)), None, &g10).is_ok());
    assert!(one(Some(amount(3_001)), None, &g10).is_err());
    // Cumul ligne + note : 6 % + 6 % dépasse 10 % du brut.
    assert!(one(Some(pct(6, "GESTE")), Some(pct(6, "GESTE")), &g10).is_err());
    // Le médecin n'est pas borné.
    let mut l = line("act-consultation");
    l.discount = Some(pct(100, "FAMILLE"));
    assert!(compute(&[l], None, &pricing(&g0, Role::Medecin, false)).is_ok());
}

#[test]
fn assistant_cannot_give_a_free_note_except_an_eligible_free_control() {
    let g = grid_with(100); // même un plafond à 100 % ne donne pas la gratuité
    let free_on_line = |reason: &str, eligible: bool| {
        let mut l = line("act-controle");
        l.discount = Some(free(reason));
        compute(&[l], None, &pricing(&g, Role::Assistant, eligible))
    };
    assert!(free_on_line("FAMILLE", true).unwrap_err().contains("Gratuité réservée au médecin"));
    assert!(free_on_line("CONTROLE_GRATUIT", false).unwrap_err().contains("Contrôle gratuit refusé"));
    let c = free_on_line("CONTROLE_GRATUIT", true).unwrap();
    assert_eq!((c.net, c.lines[0]["discount"]["reason"].as_str()), (0, Some("CONTROLE_GRATUIT")));
    // Gratuité de la note entière : mêmes règles.
    let on_note = |reason: &str, eligible: bool| compute(&[line("act-controle")], Some(&free(reason)), &pricing(&g, Role::Assistant, eligible));
    assert!(on_note("GESTE", true).is_err());
    assert_eq!(on_note("CONTROLE_GRATUIT", true).unwrap().net, 0);
    // Le médecin donne une gratuité pour n'importe quel motif.
    let mut l = line("act-controle");
    l.discount = Some(free("GESTE"));
    assert_eq!(compute(&[l], None, &pricing(&g, Role::Medecin, false)).unwrap().net, 0);
}

#[test]
fn free_control_is_offered_only_for_a_paid_consultation_inside_the_delay() {
    let d = tmp("offer");
    priced(&d);
    let paid_note = |id: &str, date: &str| {
        let mut n = new_note(id, json!([{"actId": "act-consultation"}]));
        n["date"] = json!(date);
        n["amountPaid"] = json!(300);
        n
    };
    save_as(&d, vec![paid_note("c1", "2026-10-01")], "2026-10-01", Role::Medecin).unwrap();
    let notes = numbering::read_notes(&d, &KEY);
    let entries = payments::load(&d, &KEY).unwrap();
    assert_eq!(find(&notes, "c1")["status"], "PAID");
    let offer = |today: &str, days: u32, patient: &str| free_control_offer(&notes, &entries, patient, today, days);
    let o = offer("2026-10-08", 14, "p1").unwrap();
    assert_eq!((o.note_id.as_str(), o.date.as_str(), o.note_number.as_str(), o.days), ("c1", "2026-10-01", "2026-0001", 14));
    assert!(offer("2026-10-15", 14, "p1").is_some(), "14 jours révolus : encore dans le délai");
    assert!(offer("2026-10-16", 14, "p1").is_none(), "15 jours : hors délai");
    assert!(offer("2026-10-08", 0, "p1").is_none(), "0 jour = désactivé");
    assert!(offer("2026-10-08", 14, "p2").is_none(), "autre patient");
    // Une consultation non payée ne donne pas droit au contrôle gratuit.
    let d2 = tmp("offer2");
    priced(&d2);
    let mut unpaid = new_note("u1", json!([{"actId": "act-consultation"}]));
    unpaid["date"] = json!("2026-10-07");
    save_as(&d2, vec![unpaid], "2026-10-07", Role::Medecin).unwrap();
    assert!(free_control_offer(&numbering::read_notes(&d2, &KEY), &payments::load(&d2, &KEY).unwrap(), "p1", "2026-10-08", 14).is_none());
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&d2);
}

// ─── Note à 0 DH ─────────────────────────────────────────────────────────────

#[test]
fn a_zero_note_is_numbered_free_and_outside_outstanding() {
    let d = tmp("zero");
    priced(&d);
    let mut gratuit = new_note("g", json!([{"actId": "act-controle", "discount": {"kind": "FREE", "reason": "CONTROLE_GRATUIT"}}]));
    gratuit["status"] = json!("PAID"); // l'interface ne décide pas du statut
    let impaye = new_note("u", json!([{"actId": "act-consultation"}]));
    let notes = dr(&d, vec![gratuit, impaye]);
    let g = find(&notes, "g");
    assert_eq!((g["invoiceNumber"].as_str(), g["status"].as_str(), g["totalAmount"].as_f64(), g["netCents"].as_i64(), g["grossCents"].as_i64(), g["discountCents"].as_i64()), (Some("2026-0001"), Some("FREE"), Some(0.0), Some(0), Some(15_000), Some(15_000)));
    assert_eq!(g["totalInWords"], "Zéro dirham");
    assert_eq!(find(&notes, "u")["status"], "UNPAID");
    // Aucun encaissement pour la note gratuite.
    assert!(payments::load(&d, &KEY).unwrap().is_empty());
    let s = accounting::summarize(&payments::load(&d, &KEY).unwrap(), &notes, &[], "2026-10-01", "2026-10-31", "month").unwrap();
    assert_eq!((s.outstanding_cents, s.outstanding_notes), (30_000, 1), "la note gratuite n'est pas « à encaisser »");
    assert_eq!((s.gross_invoiced_cents, s.invoiced_cents, s.discounts_cents, s.free_count), (45_000, 30_000, 15_000, 1));
    assert_eq!(s.discounts_by_reason, vec![accounting::ReasonTotal { reason: "CONTROLE_GRATUIT".into(), cents: 15_000, count: 1 }]);
    // Rien à payer : un paiement annoncé sur une note gratuite ne crée aucune écriture.
    let mut again = find(&notes, "g").clone();
    again["amountPaid"] = json!(100);
    again["status"] = json!("PAID");
    let notes = dr(&d, vec![again]);
    assert_eq!((find(&notes, "g")["status"].as_str(), find(&notes, "g")["amountPaid"].as_f64()), (Some("FREE"), Some(0.0)));
    assert!(payments::load(&d, &KEY).unwrap().is_empty());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn aggregates_split_gross_discounts_by_reason_and_net() {
    let d = tmp("agg");
    priced(&d);
    // n1 : consultation 300 − 10 % (confrère) = 270 ; n2 : ECG 200 gratuit (famille) ; n3 : consultation 300 + ECG 200,
    // remise de note 50 DH (geste) = 450 ; n4 annulée (exclue) ; n5 sans lignes héritée 120 DH (brut = net).
    let mut n1 = new_note("n1", json!([{"actId": "act-consultation", "discount": {"kind": "PERCENT", "percent": 10, "reason": "CONFRERE"}}]));
    let mut n2 = new_note("n2", json!([{"actId": "act-ecg", "discount": {"kind": "FREE", "reason": "FAMILLE"}}]));
    let mut n3 = new_note("n3", json!([{"actId": "act-consultation"}, {"actId": "act-ecg"}]));
    n3["noteDiscount"] = json!({"kind": "AMOUNT", "amountCents": 5_000, "reason": "GESTE"});
    let n4 = new_note("n4", json!([{"actId": "act-consultation"}]));
    for n in [&mut n1, &mut n2, &mut n3] {
        n["date"] = json!(TODAY);
    }
    let notes = dr(&d, vec![n1, n2, n3, n4]);
    numbering::cancel(&d, &KEY, Role::Medecin, "n4", "Erreur de saisie", "Dr", "2026-10-08T10:00:00Z").unwrap();
    let mut legacy = json!({"id": "n5", "patientId": "p1", "date": TODAY, "invoiceNumber": "2026-0099", "totalAmount": 120, "status": "UNPAID", "paymentMode": "CASH"});
    let mut all = numbering::read_notes(&d, &KEY);
    all.push(legacy.take());
    write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &Value::Array(all)).unwrap();
    assert_eq!(notes.len(), 4);
    let notes = numbering::read_notes(&d, &KEY);
    let s = accounting::summarize(&payments::load(&d, &KEY).unwrap(), &notes, &[], "2026-10-01", "2026-10-31", "month").unwrap();
    assert_eq!(s.gross_invoiced_cents, 30_000 + 20_000 + 50_000 + 12_000, "brut au tarif, annulée exclue, héritée = son montant");
    assert_eq!(s.discounts_cents, 3_000 + 20_000 + 5_000);
    assert_eq!(s.invoiced_cents, 27_000 + 0 + 45_000 + 12_000, "net");
    assert_eq!(s.gross_invoiced_cents - s.discounts_cents, s.invoiced_cents);
    assert_eq!(s.free_count, 1);
    assert_eq!(s.invoiced_count, 4);
    let by: Vec<(&str, i64, usize)> = s.discounts_by_reason.iter().map(|r| (r.reason.as_str(), r.cents, r.count)).collect();
    assert_eq!(by, vec![("FAMILLE", 20_000, 1), ("GESTE", 5_000, 1), ("CONFRERE", 3_000, 1)]);
    // Hors de la période : rien.
    let s = accounting::summarize(&[], &notes, &[], "2026-09-01", "2026-09-30", "month").unwrap();
    assert_eq!((s.gross_invoiced_cents, s.discounts_cents, s.free_count, s.discounts_by_reason.len()), (0, 0, 0, 0));
    let _ = fs::remove_dir_all(&d);
}

// ─── Migration ───────────────────────────────────────────────────────────────

#[test]
fn migration_wraps_every_note_in_one_line_without_changing_any_amount() {
    let d = tmp("migr");
    let legacy = |id: &str, total: f64, status: &str, paid: Option<f64>, num: &str| {
        let mut n = json!({"id": id, "patientId": "p1", "date": "2026-09-1", "invoiceNumber": num, "totalAmount": total, "status": status, "paymentMode": "CASH", "services": [{"name": "Consultation", "price": total, "checked": true}], "totalInWords": ""});
        if let Some(p) = paid {
            n["amountPaid"] = json!(p);
        }
        n
    };
    let list = vec![
        legacy("a", 300.0, "PAID", Some(300.0), "2026-0001"),
        legacy("b", 250.5, "PARTIAL", Some(100.25), "2026-0002"),
        legacy("c", 120.0, "UNPAID", None, "2026-0003"),
        legacy("z", 0.0, "UNPAID", None, "2026-0004"),
        {
            let mut n = legacy("x", 90.0, "UNPAID", None, "2026-0005");
            n["cancelledAt"] = json!("2026-09-30T10:00:00Z");
            n["cancelledBy"] = json!("Dr");
            n["cancellationReason"] = json!("Doublon");
            n
        },
    ];
    write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &Value::Array(list.clone())).unwrap();
    let cents = |ns: &[Value]| -> i64 { ns.iter().map(payments::total_cents).sum() };
    let before = cents(&list);
    assert_eq!(before, 30_000 + 25_050 + 12_000 + 0 + 9_000);

    let r = migrate_notes(&d, &KEY).unwrap();
    assert_eq!((r.migrated, r.total_before_cents, r.total_after_cents), (5, before, before));
    let after = numbering::read_notes(&d, &KEY);
    assert_eq!(cents(&after), before, "somme avant = somme après");
    for (b, a) in list.iter().zip(&after) {
        for f in ["totalAmount", "status", "amountPaid", "invoiceNumber", "date", "paymentMode", "services", "cancelledAt"] {
            assert_eq!(b.get(f), a.get(f), "{f} de {} inchangé", b["id"]);
        }
        let l = &a["lines"][0];
        assert_eq!((a["lines"].as_array().unwrap().len(), l["label"].as_str(), l["quantity"].as_u64()), (1, Some("Honoraires"), Some(1)));
        assert_eq!((l["unitPriceCents"].as_i64(), l["netCents"].as_i64(), a["discountCents"].as_i64()), (Some(payments::total_cents(b)), Some(payments::total_cents(b)), Some(0)));
    }
    assert!(after[0]["totalInWords"].as_str().unwrap().contains("dirhams"), "montant en lettres posé s'il manquait");
    // Sauvegarde pré-migration créée.
    let backups: Vec<_> = fs::read_dir(d.join(super::super::users::MIGRATION_BACKUPS_DIR)).unwrap().flatten().collect();
    assert_eq!(backups.len(), 1);
    // Idempotente : rien à reprendre, pas de seconde sauvegarde.
    assert_eq!(migrate_notes(&d, &KEY).unwrap().migrated, 0);
    assert_eq!(fs::read_dir(d.join(super::super::users::MIGRATION_BACKUPS_DIR)).unwrap().count(), 1);
    // Les agrégats ne changent pas non plus (brut = net, aucune remise).
    let notes = numbering::read_notes(&d, &KEY);
    let s = accounting::summarize(&[], &notes, &[], "2026-09-01", "2026-09-30", "month").unwrap();
    assert_eq!((s.discounts_cents, s.gross_invoiced_cents), (0, s.invoiced_cents));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn legacy_notes_without_lines_cannot_be_given_forged_lines_and_new_unlined_notes_are_wrapped() {
    let d = tmp("legacy");
    priced(&d);
    let stored = json!({"id": "old", "patientId": "p1", "date": "2026-09-01", "invoiceNumber": "2026-0001", "totalAmount": 100, "status": "UNPAID", "paymentMode": "CASH"});
    write_enc_json_in(&d, &KEY, numbering::NOTES_FILE, &json!([stored])).unwrap();
    let mut forged = find(&numbering::read_notes(&d, &KEY), "old").clone();
    forged["lines"] = json!([{"label": "Faux", "quantity": 1, "unitPriceCents": 1, "netCents": 1}]);
    forged["netCents"] = json!(1);
    forged["issuer"] = json!({"name": "Faux"});
    let notes = dr(&d, vec![forged]);
    let o = find(&notes, "old");
    assert!(o.get("lines").is_none() && o.get("netCents").is_none() && o.get("issuer").is_none(), "calculés jamais acceptés de l'interface");
    // Ancien chemin : note nouvelle sans lignes → ligne libre « Honoraires » (médecin), montant conservé.
    let notes = dr(&d, vec![json!({"id": "w", "patientId": "p1", "invoiceNumber": "", "totalAmount": 450, "paymentMode": "CASH"})]);
    let w = find(&notes, "w");
    assert_eq!((w["lines"][0]["label"].as_str(), w["netCents"].as_i64(), w["totalAmount"].as_f64(), w["status"].as_str()), (Some("Honoraires"), Some(45_000), Some(450.0), Some("UNPAID")));
    assert_eq!(w["totalInWords"], "Quatre cent cinquante dirhams");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn the_identity_is_frozen_in_the_note_at_issue_time() {
    let d = tmp("issuer");
    priced(&d);
    write_enc_json_in(&d, &KEY, receipts::DOCTOR_INFO_FILE, &json!({"nameFr": "Alami", "addressFr": "12 rue des Lilas", "inpe": "123456", "taxId": "98765", "patente": "555", "ice": "001234567890123", "rib": "RIB-XYZ", "cnssEmployer": "777", "stampAttachmentId": "pj-0123456789abcdef"})).unwrap();
    let notes = dr(&d, vec![new_note("a", json!([{"actId": "act-consultation"}]))]);
    let i = &find(&notes, "a")["issuer"];
    assert_eq!((i["name"].as_str(), i["address"].as_str(), i["ifNumber"].as_str(), i["tp"].as_str(), i["ice"].as_str(), i["inpe"].as_str(), i["rib"].as_str(), i["cnss"].as_str(), i["hasStamp"].as_bool()),
        (Some("Alami"), Some("12 rue des Lilas"), Some("98765"), Some("555"), Some("001234567890123"), Some("123456"), Some("RIB-XYZ"), Some("777"), Some(true)));
    // L'adresse change : l'ancienne note garde l'ancienne adresse, la nouvelle prend la nouvelle.
    write_enc_json_in(&d, &KEY, receipts::DOCTOR_INFO_FILE, &json!({"nameFr": "Alami", "addressFr": "99 avenue Neuve"})).unwrap();
    let notes = dr(&d, vec![find(&notes, "a").clone(), new_note("b", json!([{"actId": "act-ecg"}]))]);
    assert_eq!(find(&notes, "a")["issuer"]["address"], "12 rue des Lilas");
    assert_eq!(find(&notes, "b")["issuer"]["address"], "99 avenue Neuve");
    let _ = fs::remove_dir_all(&d);
}

// ─── Montant en lettres ──────────────────────────────────────────────────────

#[test]
fn amounts_in_words_are_correct_in_french() {
    let w = receipts::amount_in_words;
    assert_eq!(w(0), "Zéro dirham");
    assert_eq!(w(100), "Un dirham");
    assert_eq!(w(2_100), "Vingt-et-un dirhams");
    assert_eq!(w(7_100), "Soixante-et-onze dirhams");
    assert_eq!(w(8_000), "Quatre-vingts dirhams");
    assert_eq!(w(8_100), "Quatre-vingt-un dirhams");
    assert_eq!(w(10_000), "Cent dirhams");
    assert_eq!(w(20_000), "Deux cents dirhams");
    assert_eq!(w(100_000), "Mille dirhams");
    assert_eq!(w(110_050), "Mille cent dirhams et cinquante centimes");
    assert_eq!(w(99_999_999), "Neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf dirhams et quatre-vingt-dix-neuf centimes");
}

// ─── Reçu ────────────────────────────────────────────────────────────────────

#[test]
fn the_receipt_recalls_gross_discount_and_net_of_the_note() {
    let d = tmp("rcpt");
    priced(&d);
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}])).unwrap();
    let mut n = new_note("a", json!([{"actId": "act-consultation", "discount": {"kind": "PERCENT", "percent": 10, "reason": "CONFRERE"}}]));
    n["amountPaid"] = json!(100);
    dr(&d, vec![n]);
    let who = receipts::Actor { name: "Sara".into(), role: Role::Assistant };
    let e = receipts::issue(&d, &KEY, "a", false, &who, NOW, TODAY).unwrap();
    assert_eq!((e.note_number.as_deref(), e.gross_cents, e.discount_cents, e.note_total_cents, e.balance_due_cents, e.amount_cents), (Some("2026-0001"), Some(30_000), Some(3_000), Some(27_000), 17_000, 10_000));
    // Le registre relu (avec les nouveaux champs) garde une chaîne valide.
    let all = receipts::load(&d, &KEY).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0], e);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn the_preview_is_the_same_computation_as_the_emission() {
    let g = grid_with(10);
    let mut l = line("act-consultation");
    l.discount = Some(pct(10, "CONFRERE"));
    let p = preview(&[l.clone(), line("act-ecg")], None, &pricing(&g, Role::Assistant, false)).unwrap();
    assert_eq!((p.gross_cents, p.discount_cents, p.net_cents, p.in_words.as_str()), (50_000, 3_000, 47_000, "Quatre cent soixante-dix dirhams"));
    // Les refus de l'émission sont ceux de l'aperçu (assistante au-delà du plafond).
    l.discount = Some(pct(11, "CONFRERE"));
    assert!(preview(&[l], None, &pricing(&g, Role::Assistant, false)).unwrap_err().starts_with("Remise réservée au médecin"));
}
