//! Messages WhatsApp (envoi par lien wa.me) — partie Rust.
//!
//! - `whatsapp_open` : seule voie d'ouverture de WhatsApp. Le frontend n'a AUCUNE capacité
//!   d'ouverture d'URL (aucune permission `opener:*` dans `capabilities/`) : Rust valide le
//!   numéro et le texte, vérifie le consentement dans les fichiers chiffrés, construit
//!   `https://wa.me/<chiffres>?text=…` puis l'ouvre via `tauri-plugin-opener`.
//! - `appointment_mark_sent` : Rust pose `…SentAt` (heure serveur) et `…SentBy` (session).
//! - Filtres appliqués par `save_json` : traçabilité des RDV (`apply_appointments_filter`) et
//!   consentement des dossiers (`apply_patients_filter`) — le frontend ne peut ni forger ni
//!   effacer ces champs, quelle que soit la session.
//! - Le journal ne contient jamais ni numéro, ni texte, ni motif : id du RDV et type seulement.

use serde_json::{json, Map, Value};

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::{data_dir, read_enc_json_in, util, write_enc_json_in, AppState};

pub const APPOINTMENTS_FILE: &str = "meddoc_appointments.json";
pub const PATIENTS_FILE: &str = "meddoc_patients.json";

const MAX_TEXT_CHARS: usize = 1000;
const MAX_ID_LEN: usize = 200;

// ─── Numéros ────────────────────────────────────────────────────────────────

/// `^\+[1-9]\d{7,14}$`
pub fn is_valid_e164(s: &str) -> bool {
    let Some(rest) = s.strip_prefix('+') else { return false };
    let b = rest.as_bytes();
    (8..=15).contains(&b.len()) && b.iter().all(|c| c.is_ascii_digit()) && b[0] != b'0'
}

fn from_moroccan_national(nine: &str) -> Option<String> {
    if nine.len() == 9 && (nine.starts_with('6') || nine.starts_with('7')) {
        Some(format!("+212{nine}"))
    } else {
        None
    }
}

/// Miroir de `services/messaging/phone.ts` (jeu de cas partagé `tests/fixtures/phone-cases.json`).
pub fn normalize_whatsapp_number(raw: &str) -> Option<String> {
    let cleaned: String = raw.chars().filter(|c| !c.is_whitespace() && !matches!(c, '.' | '-' | '(' | ')' | '\u{a0}')).collect();
    let digits = cleaned.strip_prefix('+').unwrap_or(&cleaned);
    if digits.is_empty() || !digits.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let intl: Option<&str> = if cleaned.starts_with('+') {
        Some(digits)
    } else if let Some(r) = cleaned.strip_prefix("00") {
        Some(r)
    } else if cleaned.starts_with("212") {
        Some(cleaned.as_str())
    } else {
        None
    };
    if let Some(intl) = intl {
        if let Some(nat) = intl.strip_prefix("212") {
            return from_moroccan_national(nat);
        }
        let e164 = format!("+{intl}");
        return is_valid_e164(&e164).then_some(e164);
    }
    if cleaned.starts_with('0') && cleaned.len() == 10 {
        return from_moroccan_national(&cleaned[1..]);
    }
    None
}

// ─── Lien wa.me ─────────────────────────────────────────────────────────────

/// Encodage pourcent des octets UTF-8 (tout sauf les caractères non réservés).
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn kind_field(kind: &str) -> Option<&'static str> {
    match kind {
        "confirmation" => Some("confirmation"),
        "reminder" => Some("reminder"),
        "change" => Some("changeNotice"),
        _ => None,
    }
}

/// Valide les paramètres et construit l'URL. Aucune ouverture ici.
pub fn build_wa_url(phone_e164: &str, text: &str) -> Result<String, String> {
    if !is_valid_e164(phone_e164) {
        return Err("Numéro WhatsApp invalide.".into());
    }
    if text.trim().is_empty() {
        return Err("Message vide.".into());
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(format!("Message trop long ({MAX_TEXT_CHARS} caractères au plus)."));
    }
    Ok(format!("https://wa.me/{}?text={}", &phone_e164[1..], percent_encode(text)))
}

// ─── Fichiers : accès aux champs ────────────────────────────────────────────

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

fn id_of(v: &Value) -> Option<&str> {
    v.get("id").and_then(|i| i.as_str()).filter(|x| !x.is_empty())
}

fn read_list(dir: &std::path::Path, key: &[u8; super::KEY_LEN], file: &str) -> Result<Vec<Value>, String> {
    match read_enc_json_in(dir, key, file)? {
        Some(Value::Array(a)) => Ok(a),
        Some(_) => Err(format!("{file} : format inattendu.")),
        None => Ok(Vec::new()),
    }
}

/// Consentement à jour : vrai seulement si le RDV est lié à un dossier dont le consentement vaut « yes ».
/// Relu dans les fichiers à CHAQUE envoi : un retrait de consentement bloque tout de suite.
pub fn consent_allows(appointments: &[Value], patients: &[Value], appointment_id: &str) -> Result<(), String> {
    let appt = appointments.iter().find(|a| id_of(a) == Some(appointment_id)).ok_or("Rendez-vous introuvable.")?;
    let pid = s(appt, "patientId");
    if pid.is_empty() {
        return Err("Le rendez-vous n'est pas lié à un dossier patient.".into());
    }
    let patient = patients.iter().find(|p| id_of(p) == Some(pid)).ok_or("Dossier patient introuvable.")?;
    match s(patient, "whatsappConsent") {
        "yes" => Ok(()),
        _ => Err("Le patient n'a pas accepté d'être contacté par WhatsApp.".into()),
    }
}

// ─── Filtres de sauvegarde (save_json) ──────────────────────────────────────

const TRACE_FIELDS: &[&str] = &[
    "confirmationSentAt", "confirmationSentBy", "reminderSentAt", "reminderSentBy", "changeNoticeSentAt", "changeNoticeSentBy",
];
/// Remises à zéro à la reprogrammation (date ou heure modifiée).
const RESET_ON_RESCHEDULE: &[&str] = &["confirmationSentAt", "confirmationSentBy", "reminderSentAt", "reminderSentBy"];

/// Rendez-vous reçus du frontend : les champs de traçabilité reçus sont IGNORÉS, ceux déjà
/// stockés sont conservés ; si la date ou l'heure change, confirmation et rappel sont remis à zéro.
pub fn apply_appointments_filter(stored: &[Value], incoming: Value) -> Value {
    let Value::Array(list) = incoming else { return incoming };
    let out = list
        .into_iter()
        .map(|mut a| {
            let Some(obj) = a.as_object_mut() else { return a };
            let old = obj.get("id").and_then(|i| i.as_str()).and_then(|id| stored.iter().find(|p| id_of(p) == Some(id)));
            for f in TRACE_FIELDS {
                obj.remove(*f);
            }
            if let Some(old) = old {
                for f in TRACE_FIELDS {
                    if let Some(v) = old.get(*f) {
                        obj.insert((*f).to_string(), v.clone());
                    }
                }
                if s(old, "date") != obj.get("date").and_then(|x| x.as_str()).unwrap_or("") || s(old, "time") != obj.get("time").and_then(|x| x.as_str()).unwrap_or("") {
                    for f in RESET_ON_RESCHEDULE {
                        obj.remove(*f);
                    }
                }
            }
            a
        })
        .collect();
    Value::Array(out)
}

/// Pour chaque dossier : si le consentement change (ou apparaît), Rust pose `whatsappConsentAt`
/// (heure serveur) et `whatsappConsentBy` (session) ; sinon les valeurs stockées sont conservées.
/// Toute valeur de ces deux champs reçue du frontend est écrasée.
pub fn stamp_consent_changes(before: &[Value], after: &mut [Value], by: &str, at: &str) {
    for p in after.iter_mut() {
        let Some(id) = id_of(p).map(|x| x.to_string()) else { continue };
        let old = before.iter().find(|b| id_of(b) == Some(id.as_str()));
        let new_consent = s(p, "whatsappConsent").to_string();
        let old_consent = old.map(|o| s(o, "whatsappConsent")).unwrap_or("");
        let Some(obj) = p.as_object_mut() else { continue };
        obj.remove("whatsappConsentAt");
        obj.remove("whatsappConsentBy");
        if new_consent != old_consent {
            // Valeur absente (« non renseigné ») ou « yes » / « no » : l'évènement est tracé dans tous les cas.
            if !matches!(new_consent.as_str(), "" | "yes" | "no") {
                obj.remove("whatsappConsent");
            }
            obj.insert("whatsappConsentAt".into(), json!(at));
            obj.insert("whatsappConsentBy".into(), json!(by));
        } else if let Some(o) = old {
            for f in ["whatsappConsentAt", "whatsappConsentBy"] {
                if let Some(v) = o.get(f) {
                    obj.insert(f.to_string(), v.clone());
                }
            }
        }
    }
}

/// Point d'entrée de `save_json` pour les fichiers filtrés ; les autres passent tels quels.
pub fn filter_on_save(filename: &str, stored: Option<Value>, incoming: Value, by: &str, at: &str) -> Value {
    let stored_list: Vec<Value> = match stored {
        Some(Value::Array(a)) => a,
        _ => Vec::new(),
    };
    match filename {
        APPOINTMENTS_FILE => apply_appointments_filter(&stored_list, incoming),
        PATIENTS_FILE => match incoming {
            Value::Array(mut list) => {
                stamp_consent_changes(&stored_list, &mut list, by, at);
                Value::Array(list)
            }
            other => other,
        },
        _ => incoming,
    }
}

// ─── Commandes ──────────────────────────────────────────────────────────────

/// Pose `…SentAt` / `…SentBy` sur un RDV. Renvoie le RDV mis à jour.
pub fn apply_mark_sent(list: &mut [Value], id: &str, kind: &str, by: &str, at: &str) -> Result<Value, String> {
    let prefix = kind_field(kind).ok_or("Type de message inconnu.")?;
    let appt = list.iter_mut().find(|a| id_of(a) == Some(id)).ok_or("Rendez-vous introuvable.")?;
    let obj: &mut Map<String, Value> = appt.as_object_mut().ok_or("Rendez-vous illisible.")?;
    obj.insert(format!("{prefix}SentAt"), json!(at));
    obj.insert(format!("{prefix}SentBy"), json!(by));
    Ok(appt.clone())
}

#[tauri::command]
pub fn appointment_mark_sent<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, kind: String) -> Result<Value, String> {
    let session = require_session(gate(&app, &state, "appointment_mark_sent")?)?;
    if id.len() > MAX_ID_LEN {
        return Err("Identifiant invalide.".into());
    }
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let mut list = read_list(&dir, &key, APPOINTMENTS_FILE)?;
    let updated = apply_mark_sent(&mut list, &id, &kind, &session.name, &util::now_iso())?;
    write_enc_json_in(&dir, &key, APPOINTMENTS_FILE, &Value::Array(list))?;
    // Journal : id du RDV et type seulement (jamais de numéro, de texte ni de motif).
    audit::log(&app, Some(&session), "appointment_mark_sent", &format!("{id} {kind}"), true);
    Ok(updated)
}

/// Ouverture de l'URL par le plugin opener, appelé depuis Rust uniquement.
fn open_url<R: tauri::Runtime>(app: &tauri::AppHandle<R>, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("Impossible d'ouvrir WhatsApp : {e}"))
}

#[tauri::command]
pub fn whatsapp_open<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<AppState>,
    phone_e164: String,
    text: String,
    appointment_id: String,
    kind: String,
) -> Result<(), String> {
    let session = require_session(gate(&app, &state, "whatsapp_open")?)?;
    let log_refusal = |why: &str| audit::log(&app, Some(&session), "whatsapp_open", &format!("{appointment_id} {kind} refusé : {why}"), false);
    if appointment_id.is_empty() || appointment_id.len() > MAX_ID_LEN || kind_field(&kind).is_none() {
        log_refusal("paramètres");
        return Err("Paramètres invalides.".into());
    }
    let url = build_wa_url(&phone_e164, &text).map_err(|e| {
        log_refusal("numéro ou texte");
        e
    })?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    consent_allows(&read_list(&dir, &key, APPOINTMENTS_FILE)?, &read_list(&dir, &key, PATIENTS_FILE)?, &appointment_id).map_err(|e| {
        log_refusal("consentement");
        e
    })?;
    open_url(&app, &url)?;
    audit::log(&app, Some(&session), "whatsapp_open", &format!("{appointment_id} {kind}"), true);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phone_normalization_matches_shared_cases() {
        let cases: Value = serde_json::from_str(include_str!("../../tests/fixtures/phone-cases.json")).unwrap();
        let list = cases["cases"].as_array().unwrap();
        assert!(list.len() > 20);
        for c in list {
            let input = c["input"].as_str().unwrap();
            let expected = c["expected"].as_str().map(|x| x.to_string());
            assert_eq!(normalize_whatsapp_number(input), expected, "« {input} »");
        }
    }

    #[test]
    fn e164_validation() {
        assert!(is_valid_e164("+212612345678"));
        for bad in ["212612345678", "+0612345678", "+1234567", "+1234567890123456", "+21261234a678", "", "+", "+ 212612345678"] {
            assert!(!is_valid_e164(bad), "{bad}");
        }
    }

    #[test]
    fn wa_url_is_built_and_encoded() {
        let u = build_wa_url("+212612345678", "Bonjour Sara, à demain ! 10h30").unwrap();
        assert!(u.starts_with("https://wa.me/212612345678?text="));
        assert!(u.contains("Bonjour%20Sara%2C%20%C3%A0%20demain%20%21%2010h30"));
        assert!(!u.contains(' '));
        // Pas d'injection de paramètres ni de schéma par le texte.
        let u = build_wa_url("+212612345678", "a&phone=+1555&x=#frag?y").unwrap();
        assert_eq!(u.matches('?').count(), 1);
        assert!(!u.contains('&') && !u.contains('#'));
    }

    #[test]
    fn wa_open_refuses_bad_number_and_long_text() {
        for bad in ["0612345678", "+0612345678", "+212 6123", "javascript:alert(1)", "+212612345678/../x", ""] {
            assert!(build_wa_url(bad, "ok").is_err(), "{bad}");
        }
        assert!(build_wa_url("+212612345678", "").is_err());
        assert!(build_wa_url("+212612345678", &"a".repeat(1000)).is_ok());
        assert!(build_wa_url("+212612345678", &"a".repeat(1001)).is_err());
        // 1000 caractères multi-octets : la limite est en caractères, pas en octets.
        assert!(build_wa_url("+212612345678", &"é".repeat(1000)).is_ok());
    }

    fn appt(id: &str, patient: Option<&str>) -> Value {
        let mut a = json!({"id": id, "patientName": "X", "date": "2026-10-07", "time": "10:00", "status": "CONFIRMED", "note": "motif"});
        if let Some(p) = patient {
            a["patientId"] = json!(p);
        }
        a
    }

    #[test]
    fn consent_withdrawal_blocks_sending_immediately() {
        let appts = vec![appt("a1", Some("p1")), appt("a2", None)];
        let yes = vec![json!({"id": "p1", "whatsappConsent": "yes"})];
        let no = vec![json!({"id": "p1", "whatsappConsent": "no"})];
        let unset = vec![json!({"id": "p1"})];
        assert!(consent_allows(&appts, &yes, "a1").is_ok());
        assert!(consent_allows(&appts, &no, "a1").is_err(), "retrait du consentement");
        assert!(consent_allows(&appts, &unset, "a1").is_err());
        assert!(consent_allows(&appts, &yes, "a2").is_err(), "RDV sans dossier");
        assert!(consent_allows(&appts, &yes, "absent").is_err());
        assert!(consent_allows(&appts, &[], "a1").is_err());
    }

    #[test]
    fn mark_sent_sets_server_trace_and_rejects_unknown() {
        let mut list = vec![appt("a1", Some("p1"))];
        let u = apply_mark_sent(&mut list, "a1", "reminder", "Dr Test", "2026-10-06T08:00:00Z").unwrap();
        assert_eq!(u["reminderSentAt"], "2026-10-06T08:00:00Z");
        assert_eq!(u["reminderSentBy"], "Dr Test");
        assert!(list[0].get("confirmationSentAt").is_none());
        apply_mark_sent(&mut list, "a1", "change", "Dr Test", "t").unwrap();
        assert_eq!(list[0]["changeNoticeSentBy"], "Dr Test");
        assert!(apply_mark_sent(&mut list, "a1", "autre", "x", "t").is_err());
        assert!(apply_mark_sent(&mut list, "zz", "reminder", "x", "t").is_err());
    }

    #[test]
    fn appointment_trace_cannot_be_forged_by_the_frontend() {
        let mut stored = appt("a1", Some("p1"));
        stored["confirmationSentAt"] = json!("vrai-1");
        stored["confirmationSentBy"] = json!("Dr");
        // Le frontend tente de falsifier / d'effacer la trace.
        let mut inc = appt("a1", Some("p1"));
        inc["confirmationSentAt"] = json!("FAUX");
        inc["reminderSentAt"] = json!("FAUX");
        inc["reminderSentBy"] = json!("FAUX");
        let out = apply_appointments_filter(&[stored.clone()], json!([inc]));
        assert_eq!(out[0]["confirmationSentAt"], "vrai-1");
        assert_eq!(out[0]["confirmationSentBy"], "Dr");
        assert!(out[0].get("reminderSentAt").is_none() && out[0].get("reminderSentBy").is_none());
        // Effacement tenté : la valeur stockée revient.
        let out = apply_appointments_filter(&[stored.clone()], json!([appt("a1", Some("p1"))]));
        assert_eq!(out[0]["confirmationSentAt"], "vrai-1");
        // Nouveau RDV : aucune trace reçue n'est retenue.
        let mut fresh = appt("a9", None);
        fresh["reminderSentAt"] = json!("FAUX");
        assert!(apply_appointments_filter(&[stored], json!([fresh]))[0].get("reminderSentAt").is_none());
    }

    #[test]
    fn rescheduling_resets_confirmation_and_reminder_only() {
        let mut stored = appt("a1", Some("p1"));
        for (k, v) in [("confirmationSentAt", "c"), ("confirmationSentBy", "u"), ("reminderSentAt", "r"), ("reminderSentBy", "u"), ("changeNoticeSentAt", "n"), ("changeNoticeSentBy", "u")] {
            stored[k] = json!(v);
        }
        let mut moved_date = appt("a1", Some("p1"));
        moved_date["date"] = json!("2026-10-08");
        let mut moved_time = appt("a1", Some("p1"));
        moved_time["time"] = json!("11:00");
        let same = appt("a1", Some("p1"));
        for moved in [moved_date, moved_time] {
            let out = apply_appointments_filter(&[stored.clone()], json!([moved]));
            for f in RESET_ON_RESCHEDULE {
                assert!(out[0].get(*f).is_none(), "{f}");
            }
            assert_eq!(out[0]["changeNoticeSentAt"], "n");
        }
        assert_eq!(apply_appointments_filter(&[stored], json!([same]))[0]["reminderSentAt"], "r");
    }

    #[test]
    fn consent_by_and_at_are_set_by_rust_whoever_the_session() {
        let before = vec![json!({"id": "p1", "name": "A"})];
        // Assistante ou médecin : consentement posé avec de fausses valeurs de traçabilité.
        let mut after = vec![json!({"id": "p1", "name": "A", "whatsappConsent": "yes", "whatsappConsentAt": "FAUX", "whatsappConsentBy": "FAUX"})];
        stamp_consent_changes(&before, &mut after, "Assistante Sara", "2026-10-06T09:00:00Z");
        assert_eq!(after[0]["whatsappConsentBy"], "Assistante Sara");
        assert_eq!(after[0]["whatsappConsentAt"], "2026-10-06T09:00:00Z");

        // Sans changement : valeurs conservées, valeurs reçues ignorées.
        let before = after.clone();
        let mut again = vec![json!({"id": "p1", "name": "A", "whatsappConsent": "yes", "whatsappConsentAt": "AUTRE", "whatsappConsentBy": "AUTRE"})];
        stamp_consent_changes(&before, &mut again, "Dr", "2026-10-07T09:00:00Z");
        assert_eq!(again[0]["whatsappConsentBy"], "Assistante Sara");
        assert_eq!(again[0]["whatsappConsentAt"], "2026-10-06T09:00:00Z");

        // Retrait (yes → no) : tracé, par la session courante.
        let mut no = vec![json!({"id": "p1", "name": "A", "whatsappConsent": "no"})];
        stamp_consent_changes(&before, &mut no, "Dr", "2026-10-08T09:00:00Z");
        assert_eq!(no[0]["whatsappConsent"], "no");
        assert_eq!(no[0]["whatsappConsentBy"], "Dr");
        assert_eq!(no[0]["whatsappConsentAt"], "2026-10-08T09:00:00Z");

        // Valeur de consentement invalide : retirée.
        let mut bad = vec![json!({"id": "p1", "whatsappConsent": "peut-être"})];
        stamp_consent_changes(&before, &mut bad, "Dr", "t");
        assert!(bad[0].get("whatsappConsent").is_none());
    }

    #[test]
    fn filter_on_save_only_touches_its_two_files() {
        let v = json!([{"id": "x", "reminderSentAt": "garde"}]);
        assert_eq!(filter_on_save("meddoc_consultations.json", None, v.clone(), "u", "t"), v);
        let out = filter_on_save(APPOINTMENTS_FILE, None, v, "u", "t");
        assert!(out[0].get("reminderSentAt").is_none());
    }
}
