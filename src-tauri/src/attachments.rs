//! Pièces jointes au dossier patient (PDF / JPG / PNG) — réservées au médecin.
//!
//! - Chaque pièce est un fichier `pieces_jointes/pj-<16 hex>.dcp` : AES-256-GCM avec la clé de
//!   données, AAD = identifiant (un fichier renommé ou échangé est refusé). Jamais d'octet en clair
//!   sur disque, jamais de fichier temporaire : l'interface reçoit les octets déchiffrés en mémoire.
//! - Écriture atomique (`write_atomic`). Ordre : 1) fichier chiffré, 2) index. Un plantage laisse au
//!   pire un fichier orphelin (balayé), jamais une entrée d'index sans fichier. Suppression : index
//!   d'abord, fichier ensuite.
//! - L'index `meddoc_attachments.json` (chiffré, inclus dans la sauvegarde) n'est écrit que par ces
//!   commandes (réservé dans `access.rs` : ni `load_json` ni `save_json`).
//! - Le type est reconnu par le CONTENU ; les images sont nettoyées de leurs métadonnées (GPS,
//!   appareil, date…) AVANT le calcul de l'empreinte `sha256` (voir `media_clean`).
//! - Le journal ne contient que l'identifiant de la pièce : jamais le titre, le contenu ni le patient.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::access::{gate, require_session};
use super::audit;
use super::media_clean;
use super::users::{data_key_of, write_atomic};
use super::{data_dir, read_enc_json_in, util, write_enc_json_in, AppState, KEY_LEN, NONCE_LEN};

pub const INDEX_FILE: &str = "meddoc_attachments.json";
pub const DIR: &str = "pieces_jointes";
pub const EXT: &str = "dcp";
/// 20 Mo par fichier (D1).
pub const MAX_FILE_BYTES: usize = 20 * 1024 * 1024;
/// Au-delà de 1 Go au total : alerte « lourd pour la sauvegarde » (D2) — pas de plafond dur.
pub const HEAVY_BYTES: u64 = 1024 * 1024 * 1024;
pub const CATEGORIES: &[&str] = &["ECG", "biologie", "imagerie", "courrier", "autre"];
const MAX_TITLE_CHARS: usize = 120;
const MAX_THUMB_BYTES: usize = 24 * 1024;
/// Un fichier sans entrée d'index n'est balayé qu'après ce délai (envoi en cours).
const ORPHAN_GRACE_SECS: u64 = 3600;

static LOCK: Mutex<()> = Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub id: String,
    pub patient_id: String,
    pub title: String,
    pub category: String,
    /// AAAA-MM-JJ
    pub exam_date: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_id: Option<String>,
    pub mime: String,
    pub size: u64,
    /// Empreinte du contenu STOCKÉ (après nettoyage des métadonnées), en clair.
    pub sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb: Option<String>,
    pub created_at: String,
    pub created_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Entrée renvoyée à l'interface : `missing` vrai si le fichier chiffré n'existe pas.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MetaView {
    #[serde(flatten)]
    pub meta: Meta,
    pub missing: bool,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AddInput {
    pub patient_id: String,
    pub title: String,
    pub category: String,
    pub exam_date: String,
    #[serde(default)]
    pub linked_type: Option<String>,
    #[serde(default)]
    pub linked_id: Option<String>,
    #[serde(default)]
    pub thumb: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub exam_date: Option<String>,
    /// `Some(None)` n'existe pas en JSON : on utilise `clear_link` pour retirer le lien.
    #[serde(default)]
    pub linked_type: Option<String>,
    #[serde(default)]
    pub linked_id: Option<String>,
    #[serde(default)]
    pub clear_link: bool,
}

// ─── Chiffrement ─────────────────────────────────────────────────────────────

/// AES-256-GCM, nonce aléatoire en tête, `aad` authentifié. Aussi utilisé par la sauvegarde.
pub fn seal_aad(key: &[u8; KEY_LEN], aad: &[u8], plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let ct = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key))
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plain, aad })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

pub fn open_aad(key: &[u8; KEY_LEN], aad: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < NONCE_LEN + 16 {
        return Err("Fichier chiffré corrompu.".into());
    }
    let (nonce, ct) = data.split_at(NONCE_LEN);
    Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key))
        .decrypt(Nonce::from_slice(nonce), Payload { msg: ct, aad })
        .map_err(|_| "Fichier chiffré altéré ou illisible.".to_string())
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

// ─── Chemins et identifiants ─────────────────────────────────────────────────

/// `pj-` + 16 chiffres hexadécimaux minuscules.
pub fn valid_id(id: &str) -> bool {
    id.len() == 19 && id.starts_with("pj-") && id[3..].bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn new_id() -> String {
    let mut b = [0u8; 8];
    rand::rngs::OsRng.fill_bytes(&mut b);
    format!("pj-{}", hex(&b))
}

pub fn store_dir(dir: &Path) -> PathBuf {
    dir.join(DIR)
}

pub fn blob_path(dir: &Path, id: &str) -> PathBuf {
    store_dir(dir).join(format!("{id}.{EXT}"))
}

// ─── Index ───────────────────────────────────────────────────────────────────

pub fn load_index(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Vec<Meta>, String> {
    match read_enc_json_in(dir, key, INDEX_FILE)? {
        None => Ok(Vec::new()),
        Some(v) => serde_json::from_value(v).map_err(|e| format!("{INDEX_FILE} : format inattendu ({e})")),
    }
}

fn save_index(dir: &Path, key: &[u8; KEY_LEN], list: &[Meta]) -> Result<(), String> {
    write_enc_json_in(dir, key, INDEX_FILE, &serde_json::to_value(list).map_err(|e| e.to_string())?)
}

fn read_list(dir: &Path, key: &[u8; KEY_LEN], file: &str) -> Vec<Value> {
    match read_enc_json_in(dir, key, file) {
        Ok(Some(Value::Array(a))) => a,
        _ => Vec::new(),
    }
}

// ─── Validation ──────────────────────────────────────────────────────────────

fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' || !b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return false;
    }
    let (y, m, d): (i64, u32, u32) = (s[0..4].parse().unwrap_or(0), s[5..7].parse().unwrap_or(0), s[8..10].parse().unwrap_or(0));
    if !(1900..=2200).contains(&y) || !(1..=12).contains(&m) || d == 0 {
        return false;
    }
    // Jour valide pour le mois : aller-retour par le calendrier.
    let back = util::date_utc((util::days_from_civil(y, m, d) * 86_400).max(0) as u64);
    back == s
}

fn check_title(t: &str) -> Result<String, String> {
    let t = t.trim();
    if t.is_empty() {
        return Err("Le titre est obligatoire.".into());
    }
    if t.chars().count() > MAX_TITLE_CHARS {
        return Err(format!("Titre trop long ({MAX_TITLE_CHARS} caractères au plus)."));
    }
    if t.chars().any(|c| c.is_control()) {
        return Err("Titre invalide.".into());
    }
    Ok(t.to_string())
}

fn check_category(c: &str) -> Result<(), String> {
    CATEGORIES.contains(&c).then_some(()).ok_or_else(|| "Catégorie inconnue.".to_string())
}

fn check_exam_date(d: &str, today: &str) -> Result<(), String> {
    if !valid_date(d) {
        return Err("Date de l'examen invalide.".into());
    }
    if d > today {
        return Err("La date de l'examen ne peut pas être dans le futur.".into());
    }
    Ok(())
}

/// Vignette : `data:image/jpeg;base64,…` ou `data:image/png;base64,…`, base64 valide, ≤ 24 Ko.
fn check_thumb(t: &str) -> Result<(), String> {
    let payload = t.strip_prefix("data:image/jpeg;base64,").or_else(|| t.strip_prefix("data:image/png;base64,")).ok_or("Vignette invalide.")?;
    if t.len() > MAX_THUMB_BYTES {
        return Err("Vignette trop volumineuse.".into());
    }
    B64.decode(payload).map(|_| ()).map_err(|_| "Vignette invalide.".to_string())
}

fn check_link(dir: &Path, key: &[u8; KEY_LEN], patient_id: &str, ty: &Option<String>, id: &Option<String>) -> Result<(), String> {
    match (ty.as_deref(), id.as_deref()) {
        (None, None) => Ok(()),
        (Some(t), Some(i)) if !i.is_empty() && i.len() <= 100 => {
            let file = match t {
                "consultation" => "meddoc_consultations.json",
                "result" => "meddoc_medical_results.json",
                _ => return Err("Type de lien inconnu.".into()),
            };
            let found = read_list(dir, key, file).iter().any(|x| x.get("id").and_then(|v| v.as_str()) == Some(i) && x.get("patientId").and_then(|v| v.as_str()) == Some(patient_id));
            found.then_some(()).ok_or_else(|| "L'élément lié n'existe pas pour ce patient.".to_string())
        }
        _ => Err("Lien incomplet.".into()),
    }
}

// ─── Opérations (testables sans Tauri) ───────────────────────────────────────

pub fn add(dir: &Path, key: &[u8; KEY_LEN], input: AddInput, raw: Vec<u8>, by: &str, now: &str, today: &str) -> Result<Meta, String> {
    if raw.is_empty() {
        return Err("Fichier vide.".into());
    }
    if raw.len() > MAX_FILE_BYTES {
        return Err(format!("Fichier trop volumineux ({} Mo au plus).", MAX_FILE_BYTES / 1024 / 1024));
    }
    let kind = media_clean::detect(&raw).ok_or("Type de fichier non accepté (PDF, JPG ou PNG uniquement).")?;
    let title = check_title(&input.title)?;
    check_category(&input.category)?;
    check_exam_date(&input.exam_date, today)?;
    if let Some(t) = &input.thumb {
        check_thumb(t)?;
    }
    let _g = lock();
    let patient_ok = read_list(dir, key, "meddoc_patients.json").iter().any(|p| p.get("id").and_then(|v| v.as_str()) == Some(input.patient_id.as_str()));
    if input.patient_id.is_empty() || !patient_ok {
        return Err("Patient introuvable.".into());
    }
    check_link(dir, key, &input.patient_id, &input.linked_type, &input.linked_id)?;

    // Nettoyage des métadonnées AVANT l'empreinte et le chiffrement.
    let stored = media_clean::clean(kind, raw)?;
    if stored.len() > MAX_FILE_BYTES {
        return Err(format!("Fichier trop volumineux ({} Mo au plus).", MAX_FILE_BYTES / 1024 / 1024));
    }
    let id = new_id();
    let meta = Meta {
        id: id.clone(),
        patient_id: input.patient_id,
        title,
        category: input.category,
        exam_date: input.exam_date,
        linked_type: input.linked_type,
        linked_id: input.linked_id,
        mime: kind.mime().into(),
        size: stored.len() as u64,
        sha256: sha256_hex(&stored),
        thumb: input.thumb,
        created_at: now.into(),
        created_by: by.into(),
        updated_at: None,
    };
    let sealed = seal_aad(key, id.as_bytes(), &stored)?;
    // L'index est lu AVANT d'écrire quoi que ce soit : un index illisible ne laisse aucun fichier derrière.
    let mut index = load_index(dir, key)?;
    fs::create_dir_all(store_dir(dir)).map_err(|e| e.to_string())?;
    // 1) fichier chiffré, 2) index.
    write_atomic(&blob_path(dir, &id), &sealed)?;
    index.push(meta.clone());
    if let Err(e) = save_index(dir, key, &index) {
        let _ = fs::remove_file(blob_path(dir, &id));
        return Err(e);
    }
    Ok(meta)
}

pub fn list(dir: &Path, key: &[u8; KEY_LEN], patient_id: &str) -> Result<Vec<MetaView>, String> {
    let _g = lock();
    Ok(load_index(dir, key)?
        .into_iter()
        .filter(|m| m.patient_id == patient_id)
        .map(|m| {
            let missing = !blob_path(dir, &m.id).is_file();
            MetaView { meta: m, missing }
        })
        .collect())
}

pub fn update(dir: &Path, key: &[u8; KEY_LEN], id: &str, patch: UpdateInput, now: &str, today: &str) -> Result<Meta, String> {
    if !valid_id(id) {
        return Err("Pièce jointe introuvable.".into());
    }
    let _g = lock();
    let mut index = load_index(dir, key)?;
    let pos = index.iter().position(|m| m.id == id).ok_or("Pièce jointe introuvable.")?;
    let mut m = index[pos].clone();
    if let Some(t) = &patch.title {
        m.title = check_title(t)?;
    }
    if let Some(c) = &patch.category {
        check_category(c)?;
        m.category = c.clone();
    }
    if let Some(d) = &patch.exam_date {
        check_exam_date(d, today)?;
        m.exam_date = d.clone();
    }
    if patch.clear_link {
        m.linked_type = None;
        m.linked_id = None;
    } else if patch.linked_type.is_some() || patch.linked_id.is_some() {
        check_link(dir, key, &m.patient_id, &patch.linked_type, &patch.linked_id)?;
        m.linked_type = patch.linked_type.clone();
        m.linked_id = patch.linked_id.clone();
    }
    m.updated_at = Some(now.into());
    index[pos] = m.clone();
    save_index(dir, key, &index)?;
    Ok(m)
}

/// Octets déchiffrés, empreinte vérifiée.
pub fn read(dir: &Path, key: &[u8; KEY_LEN], id: &str) -> Result<(Meta, Vec<u8>), String> {
    if !valid_id(id) {
        return Err("Pièce jointe introuvable.".into());
    }
    let meta = {
        let _g = lock();
        load_index(dir, key)?.into_iter().find(|m| m.id == id).ok_or("Pièce jointe introuvable.")?
    };
    let sealed = fs::read(blob_path(dir, id)).map_err(|_| "Fichier manquant.".to_string())?;
    let plain = open_aad(key, id.as_bytes(), &sealed)?;
    if sha256_hex(&plain) != meta.sha256 {
        return Err("Le fichier ne correspond plus à son empreinte : il est altéré.".into());
    }
    Ok((meta, plain))
}

/// Index d'abord, fichier ensuite. Renvoie l'entrée supprimée.
pub fn delete(dir: &Path, key: &[u8; KEY_LEN], id: &str) -> Result<Meta, String> {
    if !valid_id(id) {
        return Err("Pièce jointe introuvable.".into());
    }
    let _g = lock();
    let mut index = load_index(dir, key)?;
    let pos = index.iter().position(|m| m.id == id).ok_or("Pièce jointe introuvable.")?;
    let removed = index.remove(pos);
    save_index(dir, key, &index)?;
    let _ = fs::remove_file(blob_path(dir, id));
    Ok(removed)
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub count: usize,
    pub bytes: u64,
    /// `ok` · `heavy` (au-delà de 1 Go)
    pub level: &'static str,
    /// Entrées dont le fichier chiffré manque.
    pub missing: usize,
    /// Entrées dont le patient n'existe plus.
    pub orphan_records: usize,
    /// Fichiers sans entrée d'index supprimés par ce balayage.
    pub swept: usize,
}

pub fn level_for(bytes: u64) -> &'static str {
    if bytes > HEAVY_BYTES { "heavy" } else { "ok" }
}

/// État + balayage des fichiers orphelins (sans entrée d'index, plus vieux que le délai de grâce).
pub fn status(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Status, String> {
    let _g = lock();
    let index = load_index(dir, key)?;
    let patients = read_list(dir, key, "meddoc_patients.json");
    let known: std::collections::HashSet<&str> = index.iter().map(|m| m.id.as_str()).collect();
    let mut swept = 0;
    if let Ok(rd) = fs::read_dir(store_dir(dir)) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let Some(stem) = name.strip_suffix(&format!(".{EXT}")) else { continue };
            if known.contains(stem) || !valid_id(stem) {
                continue;
            }
            let age = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).map(|d| d.as_secs()).unwrap_or(0);
            if age >= ORPHAN_GRACE_SECS && fs::remove_file(e.path()).is_ok() {
                swept += 1;
            }
        }
    }
    let bytes: u64 = index.iter().map(|m| m.size).sum();
    Ok(Status {
        count: index.len(),
        bytes,
        level: level_for(bytes),
        missing: index.iter().filter(|m| !blob_path(dir, &m.id).is_file()).count(),
        orphan_records: index.iter().filter(|m| !patients.iter().any(|p| p.get("id").and_then(|v| v.as_str()) == Some(m.patient_id.as_str()))).count(),
        swept,
    })
}

// ─── Commandes ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn attachment_add<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, meta: Value, data_base64: String) -> Result<Meta, String> {
    let session = require_session(gate(&app, &state, "attachment_add")?)?;
    let key = data_key_of(&state)?;
    let input: AddInput = serde_json::from_value(meta).map_err(|_| "Informations de la pièce jointe invalides.".to_string())?;
    // Garde-fou avant décodage : 20 Mo → ~27 Mo de base64.
    if data_base64.len() > MAX_FILE_BYTES / 3 * 4 + 8 {
        return Err(format!("Fichier trop volumineux ({} Mo au plus).", MAX_FILE_BYTES / 1024 / 1024));
    }
    let raw = B64.decode(data_base64.as_bytes()).map_err(|_| "Fichier illisible.".to_string())?;
    let dir = data_dir(&app)?;
    let r = add(&dir, &key, input, raw, &session.name, &util::now_iso(), &util::today_local());
    match &r {
        Ok(m) => audit::log(&app, Some(&session), "attachment_add", &m.id, true),
        Err(_) => audit::log(&app, Some(&session), "attachment_add", "refusé", false),
    }
    r
}

#[tauri::command]
pub fn attachment_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, patient_id: String) -> Result<Vec<MetaView>, String> {
    gate(&app, &state, "attachment_list")?;
    let key = data_key_of(&state)?;
    list(&data_dir(&app)?, &key, &patient_id)
}

#[tauri::command]
pub fn attachment_update<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, patch: Value) -> Result<Meta, String> {
    let session = require_session(gate(&app, &state, "attachment_update")?)?;
    let key = data_key_of(&state)?;
    let patch: UpdateInput = serde_json::from_value(patch).map_err(|_| "Modification invalide.".to_string())?;
    let r = update(&data_dir(&app)?, &key, &id, patch, &util::now_iso(), &util::today_local());
    audit::log(&app, Some(&session), "attachment_update", &id, r.is_ok());
    r
}

/// Octets déchiffrés, en réponse binaire (ArrayBuffer côté interface).
#[tauri::command]
pub fn attachment_read<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String) -> Result<tauri::ipc::Response, String> {
    let session = require_session(gate(&app, &state, "attachment_read")?)?;
    let key = data_key_of(&state)?;
    let r = read(&data_dir(&app)?, &key, &id);
    audit::log(&app, Some(&session), "attachment_open", &id, r.is_ok());
    r.map(|(_, bytes)| tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn attachment_delete<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let session = require_session(gate(&app, &state, "attachment_delete")?)?;
    let key = data_key_of(&state)?;
    let r = delete(&data_dir(&app)?, &key, &id);
    audit::log(&app, Some(&session), "attachment_delete", &id, r.is_ok());
    r.map(|_| ())
}

#[tauri::command]
pub fn attachments_status<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Status, String> {
    gate(&app, &state, "attachments_status")?;
    let key = data_key_of(&state)?;
    status(&data_dir(&app)?, &key)
}

#[cfg(test)]
#[path = "attachments_tests.rs"]
mod tests;
