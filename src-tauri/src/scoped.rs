//! Commandes typées pour l'assistante : Rust filtre les champs, le frontend ne reçoit
//! (et ne peut écrire) que ce que le rôle autorise.
//!
//! - Patients : lecture limitée à l'identité/contact ; l'écriture FUSIONNE ces seuls
//!   champs dans le dossier existant, sans jamais toucher aux champs médicaux.
//! - File d'attente : mêmes règles ; un nouvel arrivant reprend côté Rust le dossier
//!   complet du patient (le médecin le retrouve en consultation).
//! - Encaissement : visites du jour uniquement ; montant dû, montant payé, mode,
//!   statut. Ni historique, ni totaux, ni contenu d'ordonnance, ni tarifs.
//! - Fiche cabinet : sous-ensemble public (nom, spécialité, devise, coordonnées).
//! - Kiosque : numéro d'ordre + prénom et initiale du nom.

use std::path::Path;

use serde_json::{json, Map, Value};

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::util;
use super::{data_dir, read_enc_json_in, write_enc_json_in, AppState};

const PATIENTS_FILE: &str = "meddoc_patients.json";
const QUEUE_FILE: &str = "meddoc_today_queue.json";
const NOTES_FILE: &str = "meddoc_honorary_notes.json";
const DOCTOR_INFO_FILE: &str = "meddoc_doctor_info.json";

/// Identité et contact (nom, prénom, téléphone, date de naissance, sexe) + champs
/// techniques indispensables à la fiche (identifiant, nom composé, âge calculé,
/// catégorie adulte/enfant/femme, date d'inscription).
pub const IDENTITY_FIELDS: &[&str] = &[
    "id", "name", "lastName", "firstName", "phone", "dateOfBirth", "sex", "age", "type", "registeredDate",
    "whatsappConsent", "whatsappConsentAt",
];

const CLINIC_PUBLIC_FIELDS: &[&str] = &[
    "cabinetName", "nameFr", "nameAr", "specialtyFr", "specialtyAr", "currency", "phone", "addressFr", "addressAr", "hours",
];

const MAX_AMOUNT: f64 = 10_000_000.0;

fn pick(v: &Value, fields: &[&str]) -> Map<String, Value> {
    let mut out = Map::new();
    if let Some(obj) = v.as_object() {
        for f in fields {
            if let Some(x) = obj.get(*f) {
                out.insert((*f).to_string(), x.clone());
            }
        }
    }
    out
}

pub fn identity_only(p: &Value) -> Value {
    Value::Object(pick(p, IDENTITY_FIELDS))
}

fn id_of(v: &Value) -> Option<&str> {
    v.get("id").and_then(|i| i.as_str()).filter(|s| !s.is_empty())
}

fn overlay_identity(stored: &mut Value, incoming: &Value) {
    if let Some(obj) = stored.as_object_mut() {
        for (k, v) in pick(incoming, IDENTITY_FIELDS) {
            obj.insert(k, v);
        }
    }
}

/// Fusionne l'identité reçue dans les dossiers existants. Un patient absent de
/// `incoming` est conservé tel quel (l'assistante ne supprime pas de dossier) ;
/// tout champ non-identité reçu est ignoré.
pub fn merge_patients(mut stored: Vec<Value>, incoming: &[Value]) -> Result<Vec<Value>, String> {
    for inc in incoming {
        let id = id_of(inc).ok_or("Patient sans identifiant.")?;
        match stored.iter_mut().find(|p| id_of(p) == Some(id)) {
            Some(existing) => overlay_identity(existing, inc),
            None => stored.push(identity_only(inc)),
        }
    }
    Ok(stored)
}

/// Nouvelle file : l'ordre et la composition viennent de `incoming` ; chaque entrée
/// garde son contenu déjà stocké (file, sinon dossier patient) et reçoit l'identité.
pub fn merge_queue(stored_queue: &[Value], patients: &[Value], incoming: &[Value]) -> Result<Vec<Value>, String> {
    let mut out = Vec::with_capacity(incoming.len());
    for inc in incoming {
        let id = id_of(inc).ok_or("Patient sans identifiant.")?;
        let mut entry = stored_queue
            .iter()
            .chain(patients.iter())
            .find(|p| id_of(p) == Some(id))
            .cloned()
            .unwrap_or_else(|| json!({}));
        overlay_identity(&mut entry, inc);
        out.push(entry);
    }
    Ok(out)
}

pub fn clinic_public(info: &Value) -> Value {
    Value::Object(pick(info, CLINIC_PUBLIC_FIELDS))
}

// ─── Encaissement ────────────────────────────────────────────────────────────

fn str_field<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

fn num_field(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(|x| x.as_f64()).filter(|n| n.is_finite())
}

fn valid_amount(n: f64) -> bool {
    (0.0..=MAX_AMOUNT).contains(&n)
}

/// Vue assistante d'une note : uniquement les champs d'encaissement.
fn payment_view(n: &Value) -> Value {
    let total = num_field(n, "totalAmount").unwrap_or(0.0);
    let status = str_field(n, "status").unwrap_or("UNPAID");
    let paid = match status {
        "PAID" => total,
        "PARTIAL" => num_field(n, "amountPaid").unwrap_or(0.0),
        _ => 0.0,
    };
    json!({
        "id": n.get("id"),
        "patientId": n.get("patientId"),
        "patientName": n.get("patientName"),
        "date": n.get("date"),
        "totalAmount": total,
        "amountPaid": paid,
        "paymentMode": str_field(n, "paymentMode").unwrap_or("CASH"),
        "status": status,
    })
}

pub fn payments_today(notes: &[Value], today: &str) -> Vec<Value> {
    notes.iter().filter(|n| str_field(n, "date") == Some(today)).map(payment_view).collect()
}

/// Applique une saisie d'encaissement sur les notes (visites du jour seulement).
/// - note existante du jour : seuls statut, montant payé et mode changent
///   (le montant dû / les tarifs ne sont jamais modifiés) ;
/// - nouvelle note : créée pour un patient existant, montant dû saisi, une seule
///   ligne « Consultation ».
pub fn apply_payment(notes: &mut Vec<Value>, patients: &[Value], input: &Value, today: &str, new_id: &str) -> Result<Value, String> {
    let mode = str_field(input, "paymentMode").unwrap_or("");
    if !["CASH", "CARD", "TRANSFER"].contains(&mode) {
        return Err("Mode de paiement invalide.".to_string());
    }
    let status = str_field(input, "status").unwrap_or("");
    if !["PAID", "UNPAID", "PARTIAL"].contains(&status) {
        return Err("Statut de paiement invalide.".to_string());
    }
    let requested_paid = num_field(input, "amountPaid").unwrap_or(0.0);
    if !valid_amount(requested_paid) {
        return Err("Montant payé invalide.".to_string());
    }

    let finish = |note: &mut Value, total: f64| -> Result<(), String> {
        let paid = match status {
            "PAID" => total,
            "UNPAID" => 0.0,
            _ => {
                if !(requested_paid > 0.0 && requested_paid < total) {
                    return Err("Paiement partiel : le montant payé doit être entre 0 et le montant dû.".to_string());
                }
                requested_paid
            }
        };
        let obj = note.as_object_mut().ok_or("Note corrompue.")?;
        obj.insert("status".into(), json!(status));
        obj.insert("paymentMode".into(), json!(mode));
        obj.insert("amountPaid".into(), json!(paid));
        Ok(())
    };

    if let Some(id) = id_of(input) {
        let note = notes.iter_mut().find(|n| id_of(n) == Some(id)).ok_or("Encaissement introuvable.")?;
        if str_field(note, "date") != Some(today) {
            return Err("Seules les visites du jour peuvent être modifiées.".to_string());
        }
        let total = num_field(note, "totalAmount").unwrap_or(0.0);
        finish(note, total)?;
        return Ok(payment_view(note));
    }

    let patient_id = str_field(input, "patientId").ok_or("Patient requis.")?;
    let patient = patients.iter().find(|p| id_of(p) == Some(patient_id)).ok_or("Patient introuvable.")?;
    let total = num_field(input, "totalAmount").ok_or("Montant dû requis.")?;
    if !valid_amount(total) {
        return Err("Montant dû invalide.".to_string());
    }
    let year = &today[..4];
    let count = notes.iter().filter(|n| str_field(n, "date").map_or(false, |d| d.starts_with(year))).count();
    let mut note = json!({
        "id": new_id,
        "patientId": patient_id,
        "patientName": patient.get("name").cloned().unwrap_or(json!("")),
        "patientPhone": patient.get("phone"),
        "date": today,
        "invoiceNumber": format!("{year}-{:04}", count + 1),
        "services": [{"name": "Consultation", "price": total, "checked": true}],
        "totalAmount": total,
        "totalInWords": "",
    });
    finish(&mut note, total)?;
    let view = payment_view(&note);
    notes.push(note);
    Ok(view)
}

// ─── Kiosque ─────────────────────────────────────────────────────────────────

/// « Prénom I. » — sans motif ni heure. `name` suit la convention « NOM Prénom ».
pub fn kiosk_label(p: &Value) -> String {
    let (first, last) = match (str_field(p, "firstName"), str_field(p, "lastName")) {
        (Some(f), Some(l)) if !f.trim().is_empty() && !l.trim().is_empty() => (f.trim().to_string(), l.trim().to_string()),
        _ => {
            let name = str_field(p, "name").unwrap_or("").trim().to_string();
            let mut parts = name.split_whitespace();
            let last = parts.next().unwrap_or("").to_string();
            (parts.collect::<Vec<_>>().join(" "), last)
        }
    };
    let initial = last.chars().next().map(|c| format!(" {}.", c.to_uppercase())).unwrap_or_default();
    format!("{first}{initial}").trim().to_string()
}

pub fn kiosk_entries(queue: &[Value]) -> Vec<Value> {
    queue
        .iter()
        .enumerate()
        .map(|(i, p)| json!({"number": i + 1, "label": kiosk_label(p)}))
        .collect()
}

// ─── Accès disque ────────────────────────────────────────────────────────────

fn read_list(dir: &Path, key: &[u8; super::KEY_LEN], file: &str) -> Result<Vec<Value>, String> {
    match read_enc_json_in(dir, key, file)? {
        Some(Value::Array(a)) => Ok(a),
        Some(_) => Err(format!("{file} : format inattendu.")),
        None => Ok(Vec::new()),
    }
}

fn random_note_id() -> String {
    use rand::RngCore;
    let mut b = [0u8; 6];
    argon2::password_hash::rand_core::OsRng.fill_bytes(&mut b);
    format!("pay-{}-{}", util::now_secs(), b.iter().map(|x| format!("{x:02x}")).collect::<String>())
}

#[tauri::command]
pub fn patients_list_identity<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<Value>, String> {
    gate(&app, &state, "patients_list_identity")?;
    let key = data_key_of(&state)?;
    Ok(read_list(&data_dir(&app)?, &key, PATIENTS_FILE)?.iter().map(identity_only).collect())
}

#[tauri::command]
pub fn patients_save_identity<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, patients: Vec<Value>) -> Result<Vec<Value>, String> {
    let session = gate(&app, &state, "patients_save_identity")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let before = read_list(&dir, &key, PATIENTS_FILE)?;
    let mut merged = merge_patients(before.clone(), &patients)?;
    // Consentement WhatsApp : …By et …At posés par Rust depuis la session, jamais reçus du frontend.
    let by = session.as_ref().map(|s| s.name.clone()).unwrap_or_default();
    super::messaging::stamp_consent_changes(&before, &mut merged, &by, &util::now_iso());
    write_enc_json_in(&dir, &key, PATIENTS_FILE, &Value::Array(merged.clone()))?;
    audit::log(&app, session.as_ref(), "patients_save_identity", &format!("{} fiche(s) reçue(s)", patients.len()), true);
    Ok(merged.iter().map(identity_only).collect())
}

#[tauri::command]
pub fn queue_list_identity<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<Value>, String> {
    gate(&app, &state, "queue_list_identity")?;
    let key = data_key_of(&state)?;
    Ok(read_list(&data_dir(&app)?, &key, QUEUE_FILE)?.iter().map(identity_only).collect())
}

#[tauri::command]
pub fn queue_save_identity<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, queue: Vec<Value>) -> Result<Vec<Value>, String> {
    let session = gate(&app, &state, "queue_save_identity")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let merged = merge_queue(&read_list(&dir, &key, QUEUE_FILE)?, &read_list(&dir, &key, PATIENTS_FILE)?, &queue)?;
    write_enc_json_in(&dir, &key, QUEUE_FILE, &Value::Array(merged.clone()))?;
    audit::log(&app, session.as_ref(), "queue_save_identity", &format!("{} patient(s) en salle d'attente", queue.len()), true);
    Ok(merged.iter().map(identity_only).collect())
}

#[tauri::command]
pub fn billing_today_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<Value>, String> {
    gate(&app, &state, "billing_today_list")?;
    let key = data_key_of(&state)?;
    Ok(payments_today(&read_list(&data_dir(&app)?, &key, NOTES_FILE)?, &util::today_utc()))
}

#[tauri::command]
pub fn billing_today_save<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, payment: Value) -> Result<Value, String> {
    let session = gate(&app, &state, "billing_today_save")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let mut notes = read_list(&dir, &key, NOTES_FILE)?;
    let patients = read_list(&dir, &key, PATIENTS_FILE)?;
    let view = apply_payment(&mut notes, &patients, &payment, &util::today_utc(), &random_note_id())?;
    write_enc_json_in(&dir, &key, NOTES_FILE, &Value::Array(notes))?;
    audit::log(&app, session.as_ref(), "billing_today_save", view.get("status").and_then(|s| s.as_str()).unwrap_or(""), true);
    Ok(view)
}

#[tauri::command]
pub fn clinic_public_info<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Value, String> {
    gate(&app, &state, "clinic_public_info")?;
    let key = data_key_of(&state)?;
    let info = read_enc_json_in(&data_dir(&app)?, &key, DOCTOR_INFO_FILE)?.unwrap_or_else(|| json!({}));
    Ok(clinic_public(&info))
}

#[tauri::command]
pub fn kiosk_queue<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<Value>, String> {
    require_session(gate(&app, &state, "kiosk_queue")?)?;
    // Le mode salle d'attente suspend le verrouillage automatique : en sortir exige le mot de passe.
    super::settings::touch(&state);
    let key = data_key_of(&state)?;
    Ok(kiosk_entries(&read_list(&data_dir(&app)?, &key, QUEUE_FILE)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_patient() -> Value {
        json!({
            "id": "p1", "name": "DUPONT Jean", "lastName": "DUPONT", "firstName": "Jean",
            "phone": "0600000000", "dateOfBirth": "1980-01-02", "sex": "M", "age": 46, "type": "Adult",
            "cin": "AB123", "address": "rue X", "allergies": "pénicilline", "pathologies": "HTA",
            "currentMedications": [{"name": "X"}], "vitalSigns": [{"bp": "12/8"}], "weight": "80"
        })
    }

    #[test]
    fn identity_view_hides_every_medical_field() {
        let v = identity_only(&full_patient());
        let keys: Vec<&str> = v.as_object().unwrap().keys().map(|s| s.as_str()).collect();
        for k in ["cin", "address", "allergies", "pathologies", "currentMedications", "vitalSigns", "weight"] {
            assert!(!keys.contains(&k), "{k} ne doit pas être exposé");
        }
        assert_eq!(v["firstName"], "Jean");
        assert_eq!(v["phone"], "0600000000");
    }

    #[test]
    fn identity_view_carries_whatsapp_consent_but_never_its_author() {
        let mut p = full_patient();
        p["whatsappConsent"] = json!("yes");
        p["whatsappConsentAt"] = json!("2026-10-06T09:00:00Z");
        p["whatsappConsentBy"] = json!("Dr Test");
        let v = identity_only(&p);
        assert_eq!(v["whatsappConsent"], "yes");
        assert_eq!(v["whatsappConsentAt"], "2026-10-06T09:00:00Z");
        assert!(v.get("whatsappConsentBy").is_none(), "…By est posé par Rust, jamais reçu ni renvoyé comme champ d'identité");
        // Une écriture d'identité ne peut pas imposer …By.
        let merged = merge_patients(vec![full_patient()], &[json!({"id": "p1", "whatsappConsent": "yes", "whatsappConsentBy": "FAUX"})]).unwrap();
        assert!(merged[0].get("whatsappConsentBy").is_none());
    }

    #[test]
    fn write_merges_identity_without_touching_medical_fields() {
        let stored = vec![full_patient()];
        let incoming = vec![json!({
            "id": "p1", "phone": "0611111111", "firstName": "Jeannot",
            // tentative d'écriture de champs médicaux : ignorés
            "allergies": "EFFACÉ", "pathologies": "EFFACÉ", "currentMedications": []
        })];
        let out = merge_patients(stored, &incoming).unwrap();
        assert_eq!(out[0]["phone"], "0611111111");
        assert_eq!(out[0]["firstName"], "Jeannot");
        assert_eq!(out[0]["allergies"], "pénicilline");
        assert_eq!(out[0]["pathologies"], "HTA");
        assert_eq!(out[0]["currentMedications"][0]["name"], "X");
        assert_eq!(out[0]["cin"], "AB123");
    }

    #[test]
    fn new_patient_is_created_identity_only_and_nothing_is_deleted() {
        let out = merge_patients(vec![full_patient()], &[json!({"id": "p2", "name": "BENALI Sara", "allergies": "x", "sex": "F"})]).unwrap();
        assert_eq!(out.len(), 2);
        assert!(out[1].get("allergies").is_none());
        // un patient absent de l'envoi n'est pas supprimé
        let out = merge_patients(vec![full_patient()], &[]).unwrap();
        assert_eq!(out.len(), 1);
        assert!(merge_patients(vec![], &[json!({"name": "sans id"})]).is_err());
    }

    #[test]
    fn queue_entry_for_new_arrival_keeps_full_record_server_side() {
        let patients = vec![full_patient()];
        let out = merge_queue(&[], &patients, &[json!({"id": "p1", "phone": "0622222222"})]).unwrap();
        assert_eq!(out[0]["phone"], "0622222222");
        assert_eq!(out[0]["allergies"], "pénicilline", "le médecin retrouve le dossier complet");
        // retrait de la file : absent de l'envoi → retiré de la file seulement
        assert!(merge_queue(&out, &patients, &[]).unwrap().is_empty());
    }

    #[test]
    fn clinic_info_is_a_whitelist() {
        let v = clinic_public(&json!({"nameFr": "Dr X", "currency": "DH", "stampUrl": "data:...", "signatureUrl": "data:...", "inpe": "1", "standardConsultationFee": 300}));
        assert_eq!(v.as_object().unwrap().len(), 2);
    }

    fn note(id: &str, date: &str, total: f64, status: &str) -> Value {
        json!({
            "id": id, "patientId": "p1", "patientName": "DUPONT Jean", "date": date,
            "invoiceNumber": "2026-0001", "services": [{"name": "Echo", "price": total, "checked": true}],
            "totalAmount": total, "totalInWords": "x", "status": status, "paymentMode": "CASH",
            "prescriptionId": "rx-9"
        })
    }

    #[test]
    fn payments_list_is_today_only_without_prescription_or_service_content() {
        let notes = vec![note("a", "2026-10-01", 300.0, "PAID"), note("b", "2026-09-30", 500.0, "UNPAID")];
        let v = payments_today(&notes, "2026-10-01");
        assert_eq!(v.len(), 1);
        let keys: Vec<&str> = v[0].as_object().unwrap().keys().map(|s| s.as_str()).collect();
        for k in ["services", "prescriptionId", "invoiceNumber", "totalInWords"] {
            assert!(!keys.contains(&k), "{k} ne doit pas être exposé");
        }
        assert_eq!(v[0]["amountPaid"], 300.0);
    }

    #[test]
    fn existing_payment_changes_never_touch_the_amount_due() {
        let mut notes = vec![note("a", "2026-10-01", 300.0, "UNPAID")];
        let patients = vec![full_patient()];
        let input = json!({"id": "a", "totalAmount": 1.0, "paymentMode": "CARD", "status": "PARTIAL", "amountPaid": 100.0, "services": []});
        let v = apply_payment(&mut notes, &patients, &input, "2026-10-01", "n").unwrap();
        assert_eq!(v["totalAmount"], 300.0, "tarif inchangé");
        assert_eq!(v["amountPaid"], 100.0);
        assert_eq!(notes[0]["services"][0]["name"], "Echo");
        assert_eq!(notes[0]["prescriptionId"], "rx-9");
        let paid = json!({"id": "a", "paymentMode": "CASH", "status": "PAID", "amountPaid": 0});
        assert_eq!(apply_payment(&mut notes, &patients, &paid, "2026-10-01", "n").unwrap()["amountPaid"], 300.0);
    }

    #[test]
    fn past_visits_cannot_be_edited_and_inputs_are_validated() {
        let mut notes = vec![note("old", "2026-09-30", 300.0, "UNPAID")];
        let patients = vec![full_patient()];
        let ok = |status: &str| json!({"id": "old", "paymentMode": "CASH", "status": status, "amountPaid": 0});
        assert!(apply_payment(&mut notes, &patients, &ok("PAID"), "2026-10-01", "n").is_err());
        let new = |extra: Value| {
            let mut v = json!({"patientId": "p1", "totalAmount": 300.0, "paymentMode": "CASH", "status": "UNPAID", "amountPaid": 0});
            v.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
            v
        };
        let mut n2: Vec<Value> = vec![];
        assert!(apply_payment(&mut n2, &patients, &new(json!({"paymentMode": "BITCOIN"})), "2026-10-01", "n").is_err());
        assert!(apply_payment(&mut n2, &patients, &new(json!({"status": "WAT"})), "2026-10-01", "n").is_err());
        assert!(apply_payment(&mut n2, &patients, &new(json!({"totalAmount": -5})), "2026-10-01", "n").is_err());
        assert!(apply_payment(&mut n2, &patients, &new(json!({"patientId": "inconnu"})), "2026-10-01", "n").is_err());
        assert!(apply_payment(&mut n2, &patients, &new(json!({"status": "PARTIAL", "amountPaid": 300.0})), "2026-10-01", "n").is_err());
        assert!(n2.is_empty());
        let v = apply_payment(&mut n2, &patients, &new(json!({})), "2026-10-01", "n1").unwrap();
        assert_eq!(v["totalAmount"], 300.0);
        assert_eq!(n2[0]["patientName"], "DUPONT Jean", "nom pris du dossier, pas de la saisie");
        assert_eq!(n2[0]["invoiceNumber"], "2026-0001");
    }

    #[test]
    fn kiosk_shows_number_first_name_and_initial_only() {
        let q = vec![
            json!({"id": "1", "firstName": "Amine", "lastName": "Benali", "note": "douleur thoracique", "arrival": "09:12"}),
            json!({"id": "2", "name": "ALAOUI Fatima Zahra"}),
            json!({"id": "3", "name": "SOLO"}),
        ];
        let e = kiosk_entries(&q);
        assert_eq!(e[0], json!({"number": 1, "label": "Amine B."}));
        assert_eq!(e[1], json!({"number": 2, "label": "Fatima Zahra A."}));
        assert_eq!(e[2]["label"], "S.");
        assert_eq!(e[0].as_object().unwrap().len(), 2, "pas de motif ni d'heure");
    }

    // Contexte patient codé (allergies / pathologies / stade rénal…) : réservé au médecin.
    const CONTEXT_FIELDS: [&str; 10] = [
        "allergyList", "pathologyList", "noKnownAllergy", "renalStage", "contextUpdatedAt", "contextUpdatedBy",
        "legacyContext", "allergyTags", "pathologyTags", "isHeartPatient",
    ];

    fn context_patient() -> Value {
        let mut p = full_patient();
        let o = p.as_object_mut().unwrap();
        o.insert("allergyList".into(), json!([{"ref": "ALG_PENICILLINES", "label": "Pénicillines", "coded": true, "reaction": "anaphylaxie", "addedAt": "2026-10-03"}]));
        o.insert("pathologyList".into(), json!([{"ref": "N18.9", "label": "Maladie rénale chronique", "coded": true, "addedAt": "2026-10-03"}]));
        o.insert("noKnownAllergy".into(), json!(false));
        o.insert("renalStage".into(), json!("30-59"));
        o.insert("contextUpdatedAt".into(), json!("2026-10-03T10:00:00.000Z"));
        o.insert("contextUpdatedBy".into(), json!("Dr Alami"));
        o.insert("legacyContext".into(), json!({"allergies": "pénicilline"}));
        o.insert("allergyTags".into(), json!(["Pénicillines"]));
        o.insert("pathologyTags".into(), json!(["Maladie rénale chronique"]));
        o.insert("isHeartPatient".into(), json!(true));
        p
    }

    #[test]
    fn context_fields_are_not_identity_fields() {
        for k in CONTEXT_FIELDS {
            assert!(!IDENTITY_FIELDS.contains(&k), "{k} ne doit jamais entrer dans la liste blanche d'identité");
        }
    }

    #[test]
    fn identity_view_hides_the_coded_context() {
        let v = identity_only(&context_patient());
        let obj = v.as_object().unwrap();
        for k in CONTEXT_FIELDS {
            assert!(!obj.contains_key(k), "{k} ne doit pas être exposé à l'assistante");
        }
    }

    #[test]
    fn assistant_cannot_write_or_erase_the_coded_context() {
        let stored = vec![context_patient()];
        let incoming = vec![json!({
            "id": "p1", "phone": "0611111111",
            "allergyList": [], "pathologyList": [], "noKnownAllergy": true, "renalStage": "ge60",
            "contextUpdatedAt": "1999-01-01", "contextUpdatedBy": "assistante", "legacyContext": {},
            "allergyTags": [], "pathologyTags": [], "isHeartPatient": false
        })];
        let out = merge_patients(stored.clone(), &incoming).unwrap();
        assert_eq!(out[0]["phone"], "0611111111");
        for k in CONTEXT_FIELDS {
            assert_eq!(out[0][k], context_patient()[k], "{k} doit rester inchangé");
        }
        // un nouveau patient créé par l'assistante n'embarque aucun champ de contexte
        let out = merge_patients(stored, &[json!({"id": "p9", "name": "NOUVEAU Test", "allergyList": [{"label": "x"}], "renalStage": "lt15"})]).unwrap();
        for k in CONTEXT_FIELDS {
            assert!(out[1].get(k).is_none(), "{k} ignoré à la création");
        }
    }

    #[test]
    fn queue_for_assistant_keeps_context_server_side() {
        let patients = vec![context_patient()];
        let out = merge_queue(&[], &patients, &[json!({"id": "p1", "allergyList": [], "renalStage": "lt15"})]).unwrap();
        assert_eq!(out[0]["allergyList"], context_patient()["allergyList"]);
        assert_eq!(out[0]["renalStage"], "30-59");
    }
}
