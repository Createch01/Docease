//! Identité professionnelle du cabinet — validation et cachet, côté Rust.
//!
//! - Les champs restent dans la fiche cabinet (`meddoc_doctor_info.json`) : une seule source pour tous les
//!   documents. Le médecin l'écrit par `save_json` ; l'assistante ne peut pas (fichier absent de sa liste
//!   blanche) et ne lit que `CLINIC_PUBLIC_FIELDS` (voir `scoped.rs`).
//! - Contrôle à l'écriture (champs MODIFIÉS seulement, pour ne pas bloquer une page sans rapport avec une
//!   ancienne valeur) : ICE = 15 chiffres ; INPE, IF (`taxId`), TP (`patente`) = chiffres uniquement, sans
//!   longueur imposée. Espaces, points, tirets et barres sont retirés avant contrôle. Les autres champs sont
//!   facultatifs.
//! - Cachet / signature : pièce jointe chiffrée (propriétaire « cabinet », métadonnées supprimées par
//!   `media_clean`) ; la fiche ne garde que son identifiant (`stampAttachmentId`). Lecture pour impression
//!   par toute session (`identity_stamp`) : l'assistante imprime le reçu sans accès aux pièces jointes.

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};

use super::access::Role;
use super::receipts::DOCTOR_INFO_FILE;
use super::{read_enc_json_in, write_enc_json_in, KEY_LEN};

/// 2 Mo : un cachet n'a pas besoin de plus.
pub const MAX_STAMP_BYTES: usize = 2 * 1024 * 1024;
const MAX_TEXT: usize = 300;

static LOCK: Mutex<()> = Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// Retire espaces, points, tirets et barres (saisie « 001 234 567 000 087 »).
pub fn digits_only(raw: &str) -> String {
    raw.chars().filter(|c| !c.is_whitespace() && !matches!(c, '.' | '-' | '/' | '_')).collect()
}

fn str_of<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

/// Valide et normalise un identifiant numérique. Vide : accepté (facultatif).
fn check_number(label: &str, raw: &str, exact_len: Option<usize>) -> Result<String, String> {
    let d = digits_only(raw);
    if d.is_empty() {
        return Ok(String::new());
    }
    if !d.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("{label} : chiffres uniquement."));
    }
    if let Some(n) = exact_len {
        if d.len() != n {
            return Err(format!("{label} : {n} chiffres exactement ({} saisis).", d.len()));
        }
    }
    Ok(d)
}

/// Crochet de `save_json` pour la fiche cabinet : renvoie la fiche à écrire (identifiants normalisés) ou
/// refuse sans rien écrire.
pub fn on_save(dir: &Path, key: &[u8; KEY_LEN], stored: Option<&Value>, mut incoming: Value) -> Result<Value, String> {
    let Some(obj) = incoming.as_object_mut() else { return Err("Fiche cabinet invalide.".into()) };
    let empty = json!({});
    let before = stored.unwrap_or(&empty);
    // (champ, libellé, longueur exacte)
    for (field, label, len) in [("ice", "ICE", Some(15usize)), ("inpe", "INPE", None), ("taxId", "Identifiant fiscal (IF)", None), ("patente", "Taxe professionnelle (TP)", None)] {
        let Some(raw) = obj.get(field).and_then(|v| v.as_str()).map(String::from) else { continue };
        if raw == str_of(before, field) {
            continue; // valeur inchangée : pas de nouveau contrôle (jamais de blocage pour une ancienne saisie)
        }
        let norm = check_number(label, &raw, len)?;
        obj.insert(field.into(), Value::String(norm));
    }
    for (field, label) in [("cnssEmployer", "CNSS employeur"), ("rib", "RIB"), ("ordreNumber", "N° d'inscription à l'Ordre")] {
        if let Some(raw) = obj.get(field).and_then(|v| v.as_str()).map(String::from) {
            let c: String = raw.chars().filter(|c| !c.is_control()).collect();
            let c = c.split_whitespace().collect::<Vec<_>>().join(" ");
            if c.chars().count() > MAX_TEXT {
                return Err(format!("{label} : {MAX_TEXT} caractères au plus."));
            }
            obj.insert(field.into(), Value::String(c));
        }
    }
    // Le cachet ne se désigne que par une pièce du cabinet qui existe (jamais un identifiant libre).
    if let Some(id) = obj.get("stampAttachmentId").and_then(|v| v.as_str()).map(String::from) {
        if id != str_of(before, "stampAttachmentId") && !id.is_empty() {
            let ok = super::attachments::valid_id(&id)
                && super::attachments::load_index(dir, key)?.iter().any(|m| m.id == id && m.patient_id == super::attachments::CABINET_OWNER);
            if !ok {
                return Err("Cachet invalide : pièce introuvable.".into());
            }
        }
    }
    Ok(incoming)
}

/// INPE et IF manquants : bandeau « Identité professionnelle incomplète ».
pub fn missing(info: &Value) -> Vec<&'static str> {
    let mut m = Vec::new();
    if digits_only(str_of(info, "inpe")).is_empty() {
        m.push("inpe");
    }
    if digits_only(str_of(info, "taxId")).is_empty() {
        m.push("taxId");
    }
    m
}

// ─── Cachet ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StampView {
    pub id: String,
    pub mime: String,
    pub data_base64: String,
}

/// Enregistre le cachet / la signature (médecin) : image seulement, métadonnées supprimées, chiffrée ; la fiche
/// cabinet reçoit l'identifiant. Renvoie l'identifiant de la pièce.
pub fn stamp_set(dir: &Path, key: &[u8; KEY_LEN], role: Role, raw: Vec<u8>, by: &str, now: &str, today: &str) -> Result<String, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin enregistre le cachet.".into());
    }
    if raw.len() > MAX_STAMP_BYTES {
        return Err("Cachet : 2 Mo au plus.".into());
    }
    match super::media_clean::detect(&raw) {
        Some(k) if k.mime().starts_with("image/") => {}
        _ => return Err("Cachet : image JPG ou PNG uniquement.".into()),
    }
    let _g = lock();
    let mut info = read_enc_json_in(dir, key, DOCTOR_INFO_FILE)?.unwrap_or_else(|| json!({}));
    let input = super::attachments::AddInput {
        patient_id: super::attachments::CABINET_OWNER.into(),
        title: "Cachet et signature".into(),
        category: "autre".into(),
        exam_date: today.into(),
        ..Default::default()
    };
    let meta = super::attachments::add(dir, key, input, raw, by, now, today)?;
    info.as_object_mut().ok_or("Fiche cabinet invalide.")?.insert("stampAttachmentId".into(), json!(meta.id));
    write_enc_json_in(dir, key, DOCTOR_INFO_FILE, &info)?;
    Ok(meta.id)
}

/// Cachet pour impression (toute session) : `None` si aucun cachet n'est enregistré.
pub fn stamp_read(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Option<StampView>, String> {
    use base64::Engine as _;
    let info = read_enc_json_in(dir, key, DOCTOR_INFO_FILE)?.unwrap_or_else(|| json!({}));
    let id = str_of(&info, "stampAttachmentId");
    if id.is_empty() {
        return Ok(None);
    }
    let (meta, bytes) = super::attachments::read(dir, key, id)?;
    Ok(Some(StampView { id: id.to_string(), mime: meta.mime, data_base64: base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

// ─── Commandes ───────────────────────────────────────────────────────────────

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::{data_dir, util, AppState};

/// Journal : identifiant de la pièce seulement.
#[tauri::command]
pub fn identity_stamp_set<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, data_base64: String) -> Result<String, String> {
    use base64::Engine as _;
    let session = require_session(gate(&app, &state, "identity_stamp_set")?)?;
    let key = data_key_of(&state)?;
    if data_base64.len() > MAX_STAMP_BYTES / 3 * 4 + 8 {
        return Err("Cachet : 2 Mo au plus.".into());
    }
    let raw = base64::engine::general_purpose::STANDARD.decode(data_base64.as_bytes()).map_err(|_| "Fichier illisible.".to_string())?;
    let r = stamp_set(&data_dir(&app)?, &key, session.role, raw, &session.name, &util::now_iso(), &util::today_local());
    audit::log(&app, Some(&session), "identity_stamp_set", &match &r { Ok(id) => id.clone(), Err(_) => "refusé".into() }, r.is_ok());
    r
}

/// Cachet pour l'impression des reçus (assistante comprise).
#[tauri::command]
pub fn identity_stamp<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Option<StampView>, String> {
    require_session(gate(&app, &state, "identity_stamp")?)?;
    let key = data_key_of(&state)?;
    stamp_read(&data_dir(&app)?, &key)
}

/// Champs d'identité manquants (INPE, IF) : alimente le bandeau « Identité professionnelle incomplète ».
#[tauri::command]
pub fn identity_check<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    require_session(gate(&app, &state, "identity_check")?)?;
    let key = data_key_of(&state)?;
    let info = read_enc_json_in(&data_dir(&app)?, &key, DOCTOR_INFO_FILE)?.unwrap_or_else(|| json!({}));
    Ok(missing(&info).into_iter().map(String::from).collect())
}

#[cfg(test)]
#[path = "identity_tests.rs"]
mod tests;
