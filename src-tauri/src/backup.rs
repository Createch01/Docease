//! Sauvegarde automatique chiffrée et restauration (médecin uniquement).
//!
//! - Contenu : toutes les données (`meddoc_*.json`), les surcharges du catalogue
//!   (`medicament_overrides.json`, `medicament_audit_log.json`). JAMAIS : comptes
//!   (`users_meta.json`), métadonnées de sécurité, journal d'accès, réglages de verrouillage,
//!   configuration IA (clé API) ni `backup_meta.json`. À la restauration sur un nouveau poste,
//!   le médecin crée d'abord son compte puis restaure.
//! - Format v2 : enveloppe JSON `{ v, kdf, salt, nonce, ct, sha256 }`. Clé dérivée de la phrase
//!   de passe par Argon2id (64 Mio, 3 passes) ; AES-256-GCM avec les paramètres de l'en-tête en
//!   données authentifiées ; `sha256` du texte chiffré pour distinguer « fichier corrompu » de
//!   « mauvaise phrase de passe ». Le contenu est le JSON en clair des fichiers : une sauvegarde
//!   se restaure sur n'importe quel poste, avec la seule phrase de passe.
//! - Format v1 (ancien export du navigateur : PBKDF2-SHA256 200 000 + AES-GCM) : lecture seule.
//! - La phrase de passe est définie une fois (12 caractères minimum) et conservée dans
//!   `backup_meta.json` enveloppée par la clé de données : jamais en clair. Sans elle, les
//!   sauvegardes sont irrécupérables.
//! - Destinations : un dossier principal et un second optionnel. Écriture `.tmp` + `fsync` +
//!   renommage, puis relecture et déchiffrement de contrôle. Rotation : 7 quotidiennes,
//!   4 hebdomadaires, 12 mensuelles (dates en UTC, uniquement les fichiers `docease-*.dcb`).
//! - La clé de données n'existe en mémoire que session ouverte : aucune sauvegarde application
//!   fermée ou verrouillée.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::access::{gate, Role, Session};
use super::users::{data_key_of, write_atomic};
use super::{audit, data_dir, util, AppState, KEY_LEN, NONCE_LEN};

pub const META_FILE: &str = "backup_meta.json";
pub const SUBDIR: &str = "DocEase-Sauvegardes";
pub const EXT: &str = "dcb";
const RESTORE_COPIES_DIR: &str = "restore_backups";
const MIN_PASSPHRASE_CHARS: usize = 12;
const DUE_SECS: u64 = 24 * 3600;
const WARN_SECS: u64 = 24 * 3600;
const ALERT_SECS: u64 = 48 * 3600;
const RETRY_AFTER_FAILURE_SECS: u64 = 10 * 60;
const MAX_BACKUP_BYTES: u64 = 512 * 1024 * 1024;
const KEEP_DAILY: usize = 7;
const KEEP_WEEKLY: usize = 4;
const KEEP_MONTHLY: usize = 12;
const KEEP_RESTORE_COPIES: usize = 3;
/// Fichiers de données hors `meddoc_*.json` inclus dans la sauvegarde (surcharges du catalogue).
pub const EXTRA_DATA_FILES: &[&str] = &["medicament_overrides.json", "medicament_audit_log.json"];
const KDF_M_KIB: u32 = 65_536;
const KDF_T: u32 = 3;
const KDF_P: u32 = 1;

static OP_LOCK: Mutex<()> = Mutex::new(());

/// Délai maximal de la sauvegarde de fermeture : au-delà, la fenêtre se ferme quand même.
const EXIT_BACKUP_TIMEOUT: Duration = Duration::from_secs(30);
/// Événement envoyé à l'interface pour afficher « Sauvegarde en cours… » pendant la fermeture.
pub const CLOSING_EVENT: &str = "backup-closing";
static CLOSING: AtomicBool = AtomicBool::new(false);

#[cfg(test)]
pub(crate) static TEST_KDF: Mutex<Option<(u32, u32, u32)>> = Mutex::new(None);

fn kdf_params() -> (u32, u32, u32) {
    #[cfg(test)]
    if let Some(p) = *TEST_KDF.lock().unwrap() {
        return p;
    }
    (KDF_M_KIB, KDF_T, KDF_P)
}

// ─── Erreurs ─────────────────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Clone)]
pub enum BackupError {
    NotABackup,
    Corrupted,
    UnknownVersion(u64),
    WrongPassphrase,
    /// Format v1 : rien ne permet de distinguer les deux.
    WrongPassphraseOrCorrupted,
    PassphraseTooShort,
    PassphraseAlreadySet,
    OldPassphraseIncorrect,
    PassphraseUnchanged,
    NotConfigured,
    NothingToBackup,
    DestinationUnavailable(String),
    InvalidDestination(String),
    Verification(String),
    Io(String),
}

impl BackupError {
    pub fn code(&self) -> &'static str {
        match self {
            BackupError::NotABackup => "NOT_A_BACKUP",
            BackupError::Corrupted => "CORRUPTED",
            BackupError::UnknownVersion(_) => "UNKNOWN_VERSION",
            BackupError::WrongPassphrase => "WRONG_PASSPHRASE",
            BackupError::WrongPassphraseOrCorrupted => "WRONG_PASSPHRASE_OR_CORRUPTED",
            BackupError::PassphraseTooShort => "PASSPHRASE_TOO_SHORT",
            BackupError::PassphraseAlreadySet => "PASSPHRASE_ALREADY_SET",
            BackupError::OldPassphraseIncorrect => "OLD_PASSPHRASE_INCORRECT",
            BackupError::PassphraseUnchanged => "PASSPHRASE_UNCHANGED",
            BackupError::NotConfigured => "NOT_CONFIGURED",
            BackupError::NothingToBackup => "NOTHING_TO_BACKUP",
            BackupError::DestinationUnavailable(_) => "DESTINATION_UNAVAILABLE",
            BackupError::InvalidDestination(_) => "INVALID_DESTINATION",
            BackupError::Verification(_) => "VERIFICATION_FAILED",
            BackupError::Io(_) => "IO",
        }
    }

    pub fn message(&self) -> String {
        match self {
            BackupError::NotABackup => "Ce fichier n'est pas une sauvegarde DocEase.".into(),
            BackupError::Corrupted => "Le fichier de sauvegarde est corrompu ou incomplet.".into(),
            BackupError::UnknownVersion(v) => format!("Version de sauvegarde inconnue ({v}) : mettez DocEase à jour."),
            BackupError::WrongPassphrase => "Phrase de passe incorrecte.".into(),
            BackupError::WrongPassphraseOrCorrupted => "Phrase de passe incorrecte ou fichier corrompu (ancien format).".into(),
            BackupError::PassphraseTooShort => format!("La phrase de passe doit contenir au moins {MIN_PASSPHRASE_CHARS} caractères."),
            BackupError::PassphraseAlreadySet => "La phrase de passe de sauvegarde est déjà définie.".into(),
            BackupError::OldPassphraseIncorrect => "L'ancienne phrase de passe est incorrecte.".into(),
            BackupError::PassphraseUnchanged => "La nouvelle phrase de passe doit différer de l'ancienne.".into(),
            BackupError::NotConfigured => "La sauvegarde n'est pas configurée (phrase de passe et dossier requis).".into(),
            BackupError::NothingToBackup => "Aucune donnée à sauvegarder.".into(),
            BackupError::DestinationUnavailable(d) => format!("Emplacement inaccessible : {d}"),
            BackupError::InvalidDestination(d) => format!("Dossier refusé : {d}"),
            BackupError::Verification(d) => format!("Vérification de la sauvegarde échouée : {d}"),
            BackupError::Io(d) => d.clone(),
        }
    }
}

impl std::fmt::Display for BackupError {
    /// Forme transmise à l'interface : `CODE|message`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}|{}", self.code(), self.message())
    }
}

type Res<T> = Result<T, BackupError>;

fn io<E: std::fmt::Display>(e: E) -> BackupError {
    BackupError::Io(e.to_string())
}

// ─── Fichiers sauvegardés (liste unique) ─────────────────────────────────────

/// Seul point de décision de ce qui est sauvegardé ou restauré : fichiers de la racine du
/// dossier de données, `meddoc_*.json` (toutes les données de l'application, y compris les
/// futures) et les surcharges du catalogue.
pub fn is_backup_data_file(name: &str) -> bool {
    let safe = !name.is_empty()
        && name.len() <= 100
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    safe && name.ends_with(".json") && !name.contains("..") && (name.starts_with("meddoc_") || EXTRA_DATA_FILES.contains(&name))
}

type Files = BTreeMap<String, Value>;

/// Lit et déchiffre tous les fichiers de données. Un fichier illisible fait échouer la
/// sauvegarde (jamais de sauvegarde silencieusement incomplète).
pub fn collect(dir: &Path, key: &[u8; KEY_LEN]) -> Res<Files> {
    let mut files = Files::new();
    for entry in fs::read_dir(dir).map_err(io)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !entry.path().is_file() || !is_backup_data_file(&name) {
            continue;
        }
        let value = super::read_enc_json_in(dir, key, &name)
            .map_err(|e| BackupError::Io(format!("{name} : {e}")))?
            .ok_or_else(|| BackupError::Io(format!("{name} : fichier disparu")))?;
        files.insert(name, value);
    }
    Ok(files)
}

fn bundle_bytes(files: &Files) -> Res<Vec<u8>> {
    serde_json::to_vec(&json!({
        "format": 2,
        "created_at": util::now_iso(),
        "app_version": env!("CARGO_PKG_VERSION"),
        "files": files,
    }))
    .map_err(io)
}

// ─── Chiffrement ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct Kdf {
    alg: String,
    m: u32,
    t: u32,
    p: u32,
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    v: u64,
    kdf: Kdf,
    salt: String,
    nonce: String,
    ct: String,
    sha256: String,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn aad(kdf: &Kdf, salt_b64: &str) -> Vec<u8> {
    format!("docease-backup|v2|{}|{}|{}|{}|{}", kdf.alg, kdf.m, kdf.t, kdf.p, salt_b64).into_bytes()
}

fn derive_argon2(passphrase: &str, salt: &[u8], m: u32, t: u32, p: u32) -> Res<[u8; KEY_LEN]> {
    let params = Params::new(m, t, p, Some(KEY_LEN)).map_err(io)?;
    let mut out = [0u8; KEY_LEN];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut out)
        .map_err(io)?;
    Ok(out)
}

/// Chiffre `plaintext` avec la phrase de passe (format v2).
pub fn seal(passphrase: &str, plaintext: &[u8]) -> Res<Vec<u8>> {
    seal_with(passphrase, plaintext, kdf_params())
}

fn seal_with(passphrase: &str, plaintext: &[u8], (m, t, p): (u32, u32, u32)) -> Res<Vec<u8>> {
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let kdf = Kdf { alg: "argon2id".into(), m, t, p };
    let salt_b64 = B64.encode(salt);
    let key = derive_argon2(passphrase, &salt, m, t, p)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad: &aad(&kdf, &salt_b64) })
        .map_err(|e| BackupError::Io(e.to_string()))?;
    let env = Envelope { v: 2, kdf, salt: salt_b64, nonce: B64.encode(nonce), sha256: hex(&Sha256::digest(&ct)), ct: B64.encode(&ct) };
    serde_json::to_vec(&env).map_err(io)
}

pub struct Opened {
    pub format: u32,
    pub files: Files,
    pub created_at: Option<String>,
    pub app_version: Option<String>,
}

fn valid_files(map: &serde_json::Map<String, Value>, v1_keys: bool) -> Res<Files> {
    let mut files = Files::new();
    for (k, v) in map {
        let name = if v1_keys { format!("{k}.json") } else { k.clone() };
        if v1_keys {
            // Ancien export : seules les clés de données `meddoc_*` ; la date de dernière sauvegarde n'en est pas une.
            if !k.starts_with("meddoc_") || k == "meddoc_last_backup" || !is_backup_data_file(&name) {
                continue;
            }
        } else if !is_backup_data_file(&name) {
            return Err(BackupError::Corrupted);
        }
        files.insert(name, v.clone());
    }
    Ok(files)
}

fn open_v2(root: &Value, passphrase: &str) -> Res<Opened> {
    let env: Envelope = serde_json::from_value(root.clone()).map_err(|_| BackupError::Corrupted)?;
    // Bornes : un fichier hostile ne doit pas pouvoir réclamer des ressources démesurées.
    if env.kdf.alg != "argon2id" || env.kdf.m < 8 || env.kdf.m > 262_144 || env.kdf.t < 1 || env.kdf.t > 10 || env.kdf.p < 1 || env.kdf.p > 4 {
        return Err(BackupError::Corrupted);
    }
    let salt = B64.decode(&env.salt).map_err(|_| BackupError::Corrupted)?;
    let nonce = B64.decode(&env.nonce).map_err(|_| BackupError::Corrupted)?;
    let ct = B64.decode(&env.ct).map_err(|_| BackupError::Corrupted)?;
    if nonce.len() != NONCE_LEN || salt.len() < 8 {
        return Err(BackupError::Corrupted);
    }
    if hex(&Sha256::digest(&ct)) != env.sha256 {
        return Err(BackupError::Corrupted);
    }
    let key = derive_argon2(passphrase, &salt, env.kdf.m, env.kdf.t, env.kdf.p)?;
    let plain = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key))
        .decrypt(Nonce::from_slice(&nonce), Payload { msg: &ct, aad: &aad(&env.kdf, &env.salt) })
        .map_err(|_| BackupError::WrongPassphrase)?;
    let bundle: Value = serde_json::from_slice(&plain).map_err(|_| BackupError::Corrupted)?;
    let files = bundle.get("files").and_then(|f| f.as_object()).ok_or(BackupError::Corrupted)?;
    Ok(Opened {
        format: 2,
        files: valid_files(files, false)?,
        created_at: bundle.get("created_at").and_then(|v| v.as_str()).map(String::from),
        app_version: bundle.get("app_version").and_then(|v| v.as_str()).map(String::from),
    })
}

/// Ancien format (export du navigateur) : PBKDF2-HMAC-SHA256 200 000 itérations, AES-256-GCM.
fn open_v1(root: &Value, passphrase: &str) -> Res<Opened> {
    let field = |k: &str| root.get(k).and_then(|v| v.as_str()).ok_or(BackupError::NotABackup);
    let salt = B64.decode(field("salt")?).map_err(|_| BackupError::Corrupted)?;
    let iv = B64.decode(field("iv")?).map_err(|_| BackupError::Corrupted)?;
    let ct = B64.decode(field("ciphertext")?).map_err(|_| BackupError::Corrupted)?;
    if iv.len() != NONCE_LEN {
        return Err(BackupError::Corrupted);
    }
    let mut key = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), &salt, 200_000, &mut key);
    let plain = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key))
        .decrypt(Nonce::from_slice(&iv), ct.as_ref())
        .map_err(|_| BackupError::WrongPassphraseOrCorrupted)?;
    let payload: Value = serde_json::from_slice(&plain).map_err(|_| BackupError::Corrupted)?;
    let map = payload.as_object().ok_or(BackupError::Corrupted)?;
    Ok(Opened { format: 1, files: valid_files(map, true)?, created_at: None, app_version: None })
}

/// Déchiffre un fichier de sauvegarde (v2, ou v1 en lecture seule).
pub fn open(bytes: &[u8], passphrase: &str) -> Res<Opened> {
    let root: Value = serde_json::from_slice(bytes).map_err(|_| BackupError::Corrupted)?;
    let version = match root.get("v").and_then(|v| v.as_u64()) {
        Some(v) => v,
        None => return Err(BackupError::NotABackup),
    };
    match version {
        2 => open_v2(&root, passphrase),
        1 => open_v1(&root, passphrase),
        other => Err(BackupError::UnknownVersion(other)),
    }
}

// ─── Aperçu ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, PartialEq)]
pub struct Preview {
    pub format: u32,
    pub created_at: Option<String>,
    pub app_version: Option<String>,
    pub files: usize,
    pub patients: usize,
    pub consultations: usize,
    pub prescriptions: usize,
    pub appointments: usize,
    /// Date (AAAA-MM-JJ) la plus récente parmi consultations, ordonnances et rendez-vous.
    pub last_activity: Option<String>,
}

fn list_len(files: &Files, name: &str) -> usize {
    files.get(name).and_then(|v| v.as_array()).map_or(0, |a| a.len())
}

pub fn preview(o: &Opened) -> Preview {
    let mut last: Option<String> = None;
    for name in ["meddoc_consultations.json", "meddoc_prescriptions.json", "meddoc_appointments.json"] {
        if let Some(arr) = o.files.get(name).and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(d) = item.get("date").and_then(|d| d.as_str()) {
                    let d: String = d.chars().take(10).collect();
                    if d.len() == 10 && last.as_deref().map_or(true, |l| d.as_str() > l) {
                        last = Some(d);
                    }
                }
            }
        }
    }
    Preview {
        format: o.format,
        created_at: o.created_at.clone(),
        app_version: o.app_version.clone(),
        files: o.files.len(),
        patients: list_len(&o.files, "meddoc_patients.json"),
        consultations: list_len(&o.files, "meddoc_consultations.json"),
        prescriptions: list_len(&o.files, "meddoc_prescriptions.json"),
        appointments: list_len(&o.files, "meddoc_appointments.json"),
        last_activity: last,
    }
}

// ─── Configuration (backup_meta.json) ────────────────────────────────────────

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct Meta {
    #[serde(default)]
    pub v: u32,
    /// Phrase de passe chiffrée par la clé de données (base64) : jamais en clair.
    #[serde(default)]
    pub wrapped_passphrase: Option<String>,
    #[serde(default)]
    pub primary: Option<String>,
    #[serde(default)]
    pub secondary: Option<String>,
    #[serde(default)]
    pub last_success_at: Option<u64>,
    #[serde(default)]
    pub last_attempt_at: Option<u64>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub primary_error: Option<String>,
    #[serde(default)]
    pub secondary_error: Option<String>,
}

pub fn load_meta(dir: &Path) -> Res<Meta> {
    match fs::read_to_string(dir.join(META_FILE)) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| BackupError::Io(format!("{META_FILE} illisible : {e}"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Meta::default()),
        Err(e) => Err(io(e)),
    }
}

fn save_meta(dir: &Path, meta: &Meta) -> Res<()> {
    let mut m = meta.clone();
    m.v = 1;
    write_atomic(&dir.join(META_FILE), &serde_json::to_vec_pretty(&m).map_err(io)?).map_err(BackupError::Io)
}

pub fn set_passphrase(dir: &Path, key: &[u8; KEY_LEN], passphrase: &str) -> Res<()> {
    if passphrase.chars().count() < MIN_PASSPHRASE_CHARS {
        return Err(BackupError::PassphraseTooShort);
    }
    let mut meta = load_meta(dir)?;
    if meta.wrapped_passphrase.is_some() {
        return Err(BackupError::PassphraseAlreadySet);
    }
    meta.wrapped_passphrase = Some(B64.encode(super::encrypt(key, passphrase.as_bytes()).map_err(BackupError::Io)?));
    save_meta(dir, &meta)
}

/// Remplace la phrase de passe : l'ancienne doit être saisie et correspondre à celle conservée.
/// Seules les sauvegardes suivantes utilisent la nouvelle ; les fichiers existants restent
/// chiffrés avec l'ancienne (ils ne sont ni relus ni réécrits).
pub fn change_passphrase(dir: &Path, key: &[u8; KEY_LEN], old: &str, new: &str) -> Res<()> {
    let _guard = OP_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut meta = load_meta(dir)?;
    let current = stored_passphrase(&meta, key)?;
    if !same_secret(current.as_bytes(), old.as_bytes()) {
        return Err(BackupError::OldPassphraseIncorrect);
    }
    if new.chars().count() < MIN_PASSPHRASE_CHARS {
        return Err(BackupError::PassphraseTooShort);
    }
    if same_secret(current.as_bytes(), new.as_bytes()) {
        return Err(BackupError::PassphraseUnchanged);
    }
    meta.wrapped_passphrase = Some(B64.encode(super::encrypt(key, new.as_bytes()).map_err(BackupError::Io)?));
    save_meta(dir, &meta)
}

/// Comparaison sans court-circuit sur le contenu.
fn same_secret(a: &[u8], b: &[u8]) -> bool {
    let (ha, hb) = (Sha256::digest(a), Sha256::digest(b));
    ha.iter().zip(hb.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn stored_passphrase(meta: &Meta, key: &[u8; KEY_LEN]) -> Res<String> {
    let wrapped = meta.wrapped_passphrase.as_ref().ok_or(BackupError::NotConfigured)?;
    let bytes = B64.decode(wrapped).map_err(|_| BackupError::Io("Phrase de passe enveloppée illisible.".into()))?;
    let plain = super::decrypt(key, &bytes).map_err(|_| BackupError::Io("Phrase de passe enveloppée illisible.".into()))?;
    String::from_utf8(plain).map_err(io)
}

/// Dossier utilisable : existant, accessible en écriture.
pub fn check_dir(path: &Path) -> Res<()> {
    if !path.is_dir() {
        return Err(BackupError::DestinationUnavailable(path.display().to_string()));
    }
    let probe = path.join(format!(".docease-probe-{}", std::process::id()));
    fs::write(&probe, b"x").map_err(|_| BackupError::DestinationUnavailable(path.display().to_string()))?;
    let _ = fs::remove_file(&probe);
    Ok(())
}

fn validate_destination(data: &Path, raw: &str) -> Res<PathBuf> {
    let p = PathBuf::from(raw.trim());
    if !p.is_absolute() {
        return Err(BackupError::InvalidDestination("chemin absolu requis".into()));
    }
    check_dir(&p).map_err(|_| BackupError::InvalidDestination("dossier introuvable ou non modifiable".into()))?;
    let canon = fs::canonicalize(&p).map_err(io)?;
    if let Ok(d) = fs::canonicalize(data) {
        if canon.starts_with(&d) {
            return Err(BackupError::InvalidDestination("pas dans le dossier de données de DocEase".into()));
        }
    }
    Ok(p)
}

pub fn set_destinations(dir: &Path, primary: Option<&str>, secondary: Option<&str>) -> Res<Meta> {
    let primary = primary.map(|p| validate_destination(dir, p)).transpose()?;
    let secondary = secondary.filter(|s| !s.trim().is_empty()).map(|p| validate_destination(dir, p)).transpose()?;
    if primary.is_some() && primary == secondary {
        return Err(BackupError::InvalidDestination("le second emplacement doit différer du premier".into()));
    }
    let mut meta = load_meta(dir)?;
    meta.primary = primary.map(|p| p.display().to_string());
    meta.secondary = secondary.map(|p| p.display().to_string());
    meta.primary_error = None;
    meta.secondary_error = None;
    save_meta(dir, &meta)?;
    Ok(meta)
}

// ─── Noms et rotation ────────────────────────────────────────────────────────

pub fn file_name(secs: u64) -> String {
    format!("docease-{}.{EXT}", util::stamp_utc(secs))
}

/// `docease-AAAAMMJJ-HHMMSS.dcb` → (jour depuis 1970, année, mois). `None` si le nom diffère.
fn parse_name(name: &str) -> Option<(i64, i64, u32)> {
    let stem = name.strip_prefix("docease-")?.strip_suffix(&format!(".{EXT}"))?;
    let (date, time) = stem.split_once('-')?;
    if date.len() != 8 || time.len() != 6 || !date.chars().chain(time.chars()).all(|c| c.is_ascii_digit()) {
        return None;
    }
    let (y, m, d): (i64, u32, u32) = (date[0..4].parse().ok()?, date[4..6].parse().ok()?, date[6..8].parse().ok()?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some((util::days_from_civil(y, m, d), y, m))
}

/// Noms à CONSERVER : le plus récent de chacun des 7 derniers jours, des 4 dernières
/// semaines et des 12 derniers mois. Les noms qui ne suivent pas le motif ne sont jamais proposés
/// à la suppression par l'appelant.
pub fn select_keep(names: &[String]) -> BTreeSet<String> {
    let mut parsed: Vec<&String> = names.iter().filter(|n| parse_name(n).is_some()).collect();
    parsed.sort_by(|a, b| b.cmp(a)); // plus récent d'abord (le motif se trie chronologiquement)
    let mut keep = BTreeSet::new();
    let mut take = |bucket_of: &dyn Fn(i64, i64, u32) -> i64, max: usize| {
        let mut seen: BTreeSet<i64> = BTreeSet::new();
        for name in &parsed {
            let (days, y, m) = parse_name(name).unwrap();
            let b = bucket_of(days, y, m);
            if seen.contains(&b) {
                continue;
            }
            if seen.len() >= max {
                break;
            }
            seen.insert(b);
            keep.insert((*name).clone());
        }
    };
    take(&|days, _, _| days, KEEP_DAILY);
    take(&|days, _, _| (days + 3).div_euclid(7), KEEP_WEEKLY); // semaines du lundi
    take(&|_, y, m| y * 12 + m as i64, KEEP_MONTHLY);
    keep
}

fn backup_files_in(dest: &Path) -> Vec<String> {
    fs::read_dir(dest.join(SUBDIR))
        .map(|rd| {
            rd.flatten()
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| parse_name(n).is_some())
                .collect()
        })
        .unwrap_or_default()
}

fn rotate(dest: &Path) -> usize {
    let names = backup_files_in(dest);
    let keep = select_keep(&names);
    let mut removed = 0;
    for n in names.iter().filter(|n| !keep.contains(*n)) {
        if fs::remove_file(dest.join(SUBDIR).join(n)).is_ok() {
            removed += 1;
        }
    }
    removed
}

// ─── Sauvegarde ──────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct DestResult {
    pub path: String,
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct RunReport {
    pub file_name: String,
    pub bytes: usize,
    pub files: usize,
    pub destinations: Vec<DestResult>,
    pub rotated: usize,
}

fn write_one(dest: &Path, name: &str, sealed: &[u8]) -> Res<PathBuf> {
    check_dir(dest)?;
    let sub = dest.join(SUBDIR);
    fs::create_dir_all(&sub).map_err(io)?;
    let path = sub.join(name);
    write_atomic(&path, sealed).map_err(BackupError::Io)?;
    // Contrôle : octets relus identiques à ceux écrits.
    let back = fs::read(&path).map_err(io)?;
    if back != sealed {
        let _ = fs::remove_file(&path);
        return Err(BackupError::Verification("le fichier relu diffère du fichier écrit".into()));
    }
    Ok(path)
}

pub fn run_backup(dir: &Path, key: &[u8; KEY_LEN], now: u64) -> Res<RunReport> {
    let _guard = OP_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut meta = load_meta(dir)?;
    let passphrase = stored_passphrase(&meta, key)?;
    let primary = meta.primary.clone().ok_or(BackupError::NotConfigured)?;
    let files = collect(dir, key)?;
    if files.is_empty() {
        return Err(BackupError::NothingToBackup);
    }
    let plain = bundle_bytes(&files)?;
    let sealed = seal(&passphrase, &plain)?;
    let name = file_name(now);

    let mut results = Vec::new();
    let mut rotated = 0;
    let mut verified = false;
    let dests: Vec<(bool, String)> = std::iter::once((true, primary)).chain(meta.secondary.clone().map(|s| (false, s))).collect();
    for (is_primary, dest) in &dests {
        let outcome = write_one(Path::new(dest), &name, &sealed).and_then(|path| {
            // Déchiffrement de contrôle (une fois suffit : les octets sont identiques partout).
            if !verified {
                let bytes = fs::read(&path).map_err(io)?;
                let reopened = open(&bytes, &passphrase).map_err(|e| BackupError::Verification(e.message()))?;
                if reopened.files != files {
                    let _ = fs::remove_file(&path);
                    return Err(BackupError::Verification("le contenu déchiffré diffère de l'original".into()));
                }
                verified = true;
            }
            Ok(path)
        });
        match outcome {
            Ok(_) => {
                rotated += rotate(Path::new(dest));
                results.push(DestResult { path: dest.clone(), ok: true, error: None });
                if *is_primary { meta.primary_error = None } else { meta.secondary_error = None }
            }
            Err(e) => {
                results.push(DestResult { path: dest.clone(), ok: false, error: Some(e.message()) });
                if *is_primary { meta.primary_error = Some(e.message()) } else { meta.secondary_error = Some(e.message()) }
            }
        }
    }
    meta.last_attempt_at = Some(now);
    let any_ok = results.iter().any(|r| r.ok);
    if any_ok {
        meta.last_success_at = Some(now);
        meta.last_error = None;
    } else {
        meta.last_error = results.first().and_then(|r| r.error.clone());
    }
    save_meta(dir, &meta)?;
    if !any_ok {
        let first = results.first().and_then(|r| r.error.clone()).unwrap_or_default();
        return Err(BackupError::DestinationUnavailable(first));
    }
    Ok(RunReport { file_name: name, bytes: sealed.len(), files: files.len(), destinations: results, rotated })
}

/// Vrai si une sauvegarde est configurée et que la dernière date de plus de 24 h (ou n'a
/// jamais réussi). Après un échec, pas de nouvelle tentative pendant 10 minutes.
pub fn is_due(meta: &Meta, now: u64) -> bool {
    if meta.wrapped_passphrase.is_none() || meta.primary.is_none() {
        return false;
    }
    if meta.last_error.is_some() {
        if let Some(a) = meta.last_attempt_at {
            if now.saturating_sub(a) < RETRY_AFTER_FAILURE_SECS {
                return false;
            }
        }
    }
    match meta.last_success_at {
        Some(t) => now.saturating_sub(t) >= DUE_SECS,
        None => true,
    }
}

pub fn run_if_due(dir: &Path, key: &[u8; KEY_LEN], now: u64) -> Res<Option<RunReport>> {
    if !is_due(&load_meta(dir)?, now) {
        return Ok(None);
    }
    match run_backup(dir, key, now) {
        Ok(r) => Ok(Some(r)),
        Err(BackupError::NothingToBackup) => Ok(None),
        Err(e) => Err(e),
    }
}

// ─── État (tableau de bord) ──────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct DestStatus {
    pub role: &'static str,
    pub path: String,
    pub accessible: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Status {
    pub has_passphrase: bool,
    pub configured: bool,
    pub last_success_at: Option<u64>,
    pub age_secs: Option<u64>,
    pub last_error: Option<String>,
    pub destinations: Vec<DestStatus>,
    /// `ok` (≤ 24 h) · `warning` (24-48 h) · `alert` (> 48 h, jamais, non configurée ou emplacement inaccessible).
    pub level: &'static str,
    pub reason: Option<String>,
    /// Alerte permanente (orange) tant que les sauvegardes ne sont pas sur deux supports :
    /// `no_secondary` (aucun second emplacement) ou `same_disk` (les deux sur le même disque).
    pub redundancy: Option<&'static str>,
}

#[cfg(windows)]
fn win_prefix(p: &Path) -> Option<std::path::Prefix<'_>> {
    match p.components().next() {
        Some(std::path::Component::Prefix(x)) => Some(x.kind()),
        _ => None,
    }
}

/// Vrai si les deux dossiers sont sur le même volume (lettre de lecteur / partage sous
/// Windows, numéro de périphérique ailleurs). Un chemin illisible n'est jamais « le même ».
pub fn same_volume(a: &Path, b: &Path) -> bool {
    let (Ok(ca), Ok(cb)) = (fs::canonicalize(a), fs::canonicalize(b)) else { return false };
    #[cfg(windows)]
    {
        matches!((win_prefix(&ca), win_prefix(&cb)), (Some(x), Some(y)) if x == y)
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        matches!((fs::metadata(&ca), fs::metadata(&cb)), (Ok(x), Ok(y)) if x.dev() == y.dev())
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = (ca, cb);
        false
    }
}

fn redundancy_of(meta: &Meta) -> Option<&'static str> {
    let primary = meta.primary.as_ref()?;
    meta.wrapped_passphrase.as_ref()?;
    match &meta.secondary {
        None => Some("no_secondary"),
        Some(second) if same_volume(Path::new(primary), Path::new(second)) => Some("same_disk"),
        Some(_) => None,
    }
}

pub fn status(dir: &Path, now: u64) -> Res<Status> {
    let meta = load_meta(dir)?;
    let mut destinations = Vec::new();
    for (role, p) in [("principal", &meta.primary), ("secours", &meta.secondary)] {
        if let Some(p) = p {
            let r = check_dir(Path::new(p));
            destinations.push(DestStatus { role, path: p.clone(), accessible: r.is_ok(), error: r.err().map(|e| e.message()) });
        }
    }
    let has_passphrase = meta.wrapped_passphrase.is_some();
    let configured = has_passphrase && meta.primary.is_some();
    let age = meta.last_success_at.map(|t| now.saturating_sub(t));
    let (level, reason) = if !configured {
        ("alert", Some("Sauvegarde non configurée.".to_string()))
    } else if let Some(d) = destinations.iter().find(|d| !d.accessible) {
        ("alert", Some(format!("Emplacement {} inaccessible : {}", d.role, d.path)))
    } else {
        match age {
            None => ("alert", Some("Aucune sauvegarde réussie pour l'instant.".to_string())),
            Some(a) if a > ALERT_SECS => ("alert", Some("Dernière sauvegarde de plus de 48 h.".to_string())),
            Some(a) if a > WARN_SECS => ("warning", Some("Dernière sauvegarde de plus de 24 h.".to_string())),
            Some(_) => ("ok", None),
        }
    };
    let redundancy = redundancy_of(&meta);
    Ok(Status { has_passphrase, configured, last_success_at: meta.last_success_at, age_secs: age, last_error: meta.last_error, destinations, level, reason, redundancy })
}

// ─── Liste, aperçu, restauration ─────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub role: &'static str,
    /// Horodatage lu dans le nom (UTC) : `AAAAMMJJ-HHMMSS`.
    pub stamp: String,
    pub size: u64,
}

pub fn list(dir: &Path) -> Res<Vec<Entry>> {
    let meta = load_meta(dir)?;
    let mut out = Vec::new();
    for (role, p) in [("principal", &meta.primary), ("secours", &meta.secondary)] {
        let Some(p) = p else { continue };
        for name in backup_files_in(Path::new(p)) {
            let path = Path::new(p).join(SUBDIR).join(&name);
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let stamp = name.trim_start_matches("docease-").trim_end_matches(&format!(".{EXT}")).to_string();
            out.push(Entry { path: path.display().to_string(), name, role, stamp, size });
        }
    }
    out.sort_by(|a, b| b.stamp.cmp(&a.stamp).then(a.role.cmp(b.role)));
    Ok(out)
}

fn read_backup_file(path: &Path) -> Res<Vec<u8>> {
    let meta = fs::metadata(path).map_err(|_| BackupError::Io(format!("Fichier introuvable : {}", path.display())))?;
    if !meta.is_file() {
        return Err(BackupError::NotABackup);
    }
    if meta.len() > MAX_BACKUP_BYTES {
        return Err(BackupError::NotABackup);
    }
    fs::read(path).map_err(io)
}

pub fn inspect(path: &Path, passphrase: &str) -> Res<Preview> {
    Ok(preview(&open(&read_backup_file(path)?, passphrase)?))
}

#[derive(Serialize, Debug)]
pub struct RestoreReport {
    pub restored: usize,
    pub removed: usize,
    pub safety_copy: Option<String>,
}

/// Copie brute (chiffrée par la clé de données, sans phrase de passe) de l'état actuel :
/// fonctionne même si un fichier courant est corrompu.
fn safety_copy(dir: &Path, now: u64) -> Res<Option<PathBuf>> {
    let names: Vec<String> = fs::read_dir(dir)
        .map_err(io)?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| is_backup_data_file(n) && dir.join(n).is_file())
        .collect();
    if names.is_empty() {
        return Ok(None);
    }
    let root = dir.join(RESTORE_COPIES_DIR);
    let mut dest = root.join(format!("avant-restauration-{}", util::stamp_utc(now)));
    let mut n = 1;
    while dest.exists() {
        n += 1;
        dest = root.join(format!("avant-restauration-{}-{n}", util::stamp_utc(now)));
    }
    fs::create_dir_all(&dest).map_err(io)?;
    for name in &names {
        if let Err(e) = fs::copy(dir.join(name), dest.join(name)) {
            let _ = fs::remove_dir_all(&dest);
            return Err(BackupError::Io(format!("copie de sécurité de {name} : {e}")));
        }
    }
    // Ne garde que les dernières copies.
    let mut old: Vec<String> = fs::read_dir(&root)
        .map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.starts_with("avant-restauration-")).collect())
        .unwrap_or_default();
    old.sort();
    while old.len() > KEEP_RESTORE_COPIES {
        let victim = old.remove(0);
        let _ = fs::remove_dir_all(root.join(victim));
    }
    Ok(Some(dest))
}

/// Remplace les données courantes par celles de la sauvegarde. Copie de sécurité d'abord ;
/// tous les fichiers sont préparés (chiffrés par la clé de données) avant le premier
/// renommage ; en cas d'échec, l'état précédent est rétabli.
pub fn restore_files(dir: &Path, key: &[u8; KEY_LEN], files: &Files, now: u64) -> Res<RestoreReport> {
    let _guard = OP_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if files.is_empty() {
        return Err(BackupError::Corrupted);
    }
    if files.keys().any(|n| !is_backup_data_file(n)) {
        return Err(BackupError::Corrupted);
    }
    let safety = safety_copy(dir, now)?;

    // 1. Préparation (rien de visible n'a changé tant que ça échoue).
    let mut staged: Vec<(PathBuf, PathBuf)> = Vec::new();
    let cleanup = |staged: &Vec<(PathBuf, PathBuf)>| {
        for (tmp, _) in staged {
            let _ = fs::remove_file(tmp);
        }
    };
    for (name, value) in files {
        let target = dir.join(name);
        let tmp = dir.join(format!("{name}.restore.tmp"));
        let bytes = serde_json::to_vec(value).map_err(io).and_then(|j| super::encrypt(key, &j).map_err(BackupError::Io));
        let written = bytes.and_then(|b| {
            let mut f = fs::File::create(&tmp).map_err(io)?;
            std::io::Write::write_all(&mut f, &b).map_err(io)?;
            f.sync_all().map_err(io)
        });
        if let Err(e) = written {
            let _ = fs::remove_file(&tmp);
            cleanup(&staged);
            return Err(e);
        }
        staged.push((tmp, target));
    }
    // Fichiers de données actuels absents de la sauvegarde : retirés pour restaurer l'état exact.
    let current: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(io)?
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            e.path().is_file() && is_backup_data_file(&n) && !files.contains_key(&n)
        })
        .map(|e| e.path())
        .collect();

    // 2. Application avec journal de retour arrière.
    let mut originals: Vec<(PathBuf, Option<Vec<u8>>)> = Vec::new();
    let apply = (|| -> Res<()> {
        for (tmp, target) in &staged {
            originals.push((target.clone(), fs::read(target).ok()));
            fs::rename(tmp, target).map_err(io)?;
        }
        for p in &current {
            originals.push((p.clone(), fs::read(p).ok()));
            fs::remove_file(p).map_err(io)?;
        }
        Ok(())
    })();
    if let Err(e) = apply {
        for (path, content) in originals.iter().rev() {
            match content {
                Some(b) => { let _ = fs::write(path, b); }
                None => { let _ = fs::remove_file(path); }
            }
        }
        cleanup(&staged);
        return Err(e);
    }
    Ok(RestoreReport { restored: files.len(), removed: current.len(), safety_copy: safety.map(|p| p.display().to_string()) })
}

pub fn restore(dir: &Path, key: &[u8; KEY_LEN], path: &Path, passphrase: &str, now: u64) -> Res<RestoreReport> {
    let opened = open(&read_backup_file(path)?, passphrase)?;
    restore_files(dir, key, &opened.files, now)
}

// ─── Sauvegarde automatique : à la fermeture et au verrouillage ──────────────

/// Appelé avant l'effacement de la clé (verrouillage) et à la fermeture de la fenêtre :
/// sauvegarde si elle date de plus de 24 h. Ne bloque jamais l'action de l'utilisateur.
pub fn auto_backup_on_exit<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &AppState) {
    let session = state.session.lock().ok().and_then(|s| s.clone());
    let key = state.key.lock().ok().and_then(|k| *k);
    let (Some(session), Some(key)) = (session, key) else { return };
    if session.role != Role::Medecin {
        return;
    }
    let Ok(dir) = data_dir(app) else { return };
    match run_if_due(&dir, &key, util::now_secs()) {
        Ok(Some(r)) => audit::log(app, Some(&session), "backup_auto", &format!("{} fichier(s), {} emplacement(s)", r.files, r.destinations.len()), true),
        Ok(None) => {}
        Err(e) => audit::log(app, Some(&session), "backup_auto", &e.code(), false),
    }
}

/// Exécute `f` dans un thread et attend au plus `timeout` ; `None` si elle n'est pas finie
/// (le thread continue : l'écriture est atomique, un fichier partiel n'est jamais visible).
pub fn run_bounded<T: Send + 'static>(timeout: Duration, f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(f());
    });
    rx.recv_timeout(timeout).ok()
}

#[derive(Debug)]
pub enum ExitBackup {
    /// Pas de sauvegarde due (ou rien à sauvegarder).
    Skipped,
    Done(RunReport),
    /// Code d'erreur de la sauvegarde.
    Failed(String),
    TimedOut,
}

/// Sauvegarde de fermeture : seulement si elle est due, bornée par `timeout`.
pub fn exit_backup(dir: &Path, key: &[u8; KEY_LEN], now: u64, timeout: Duration) -> ExitBackup {
    if !matches!(load_meta(dir), Ok(m) if is_due(&m, now)) {
        return ExitBackup::Skipped;
    }
    let (d, k) = (dir.to_path_buf(), *key);
    match run_bounded(timeout, move || run_if_due(&d, &k, now)) {
        None => ExitBackup::TimedOut,
        Some(Ok(Some(r))) => ExitBackup::Done(r),
        Some(Ok(None)) => ExitBackup::Skipped,
        Some(Err(e)) => ExitBackup::Failed(e.code().to_string()),
    }
}

/// Fermeture de la fenêtre. Si une sauvegarde est due (session médecin ouverte), la fermeture
/// est suspendue : l'interface affiche « Sauvegarde en cours… », la sauvegarde tourne en
/// arrière-plan (30 s au plus), puis la fenêtre se ferme. Sinon la fermeture est immédiate.
pub fn on_close_requested<R: tauri::Runtime>(window: &tauri::Window<R>, api: &tauri::CloseRequestApi) {
    use tauri::{Emitter, Manager};
    if CLOSING.load(Ordering::SeqCst) {
        api.prevent_close();
        return;
    }
    let app = window.app_handle().clone();
    let (session, key) = {
        let state = app.state::<AppState>();
        let session = state.session.lock().ok().and_then(|s| s.clone());
        let key = state.key.lock().ok().and_then(|k| *k);
        (session, key)
    };
    let (Some(session), Some(key)) = (session, key) else { return };
    if session.role != Role::Medecin {
        return;
    }
    let Ok(dir) = data_dir(&app) else { return };
    let now = util::now_secs();
    if !matches!(load_meta(&dir), Ok(m) if is_due(&m, now)) {
        return;
    }
    CLOSING.store(true, Ordering::SeqCst);
    api.prevent_close();
    let _ = window.emit(CLOSING_EVENT, ());
    let window = window.clone();
    std::thread::spawn(move || {
        log_exit_backup(&app, &session, &exit_backup(&dir, &key, now, EXIT_BACKUP_TIMEOUT));
        // `destroy` ne repasse pas par CloseRequested.
        let _ = window.destroy();
    });
}

fn log_exit_backup<R: tauri::Runtime>(app: &tauri::AppHandle<R>, session: &Session, outcome: &ExitBackup) {
    match outcome {
        ExitBackup::Skipped => {}
        ExitBackup::Done(r) => audit::log(app, Some(session), "backup_auto", &format!("fermeture : {} fichier(s), {} emplacement(s)", r.files, r.destinations.len()), true),
        ExitBackup::Failed(code) => audit::log(app, Some(session), "backup_auto", &format!("fermeture : échec ({code})"), false),
        ExitBackup::TimedOut => audit::log(
            app,
            Some(session),
            "backup_auto",
            &format!("fermeture : sauvegarde non terminée après {} s, fenêtre fermée quand même", EXIT_BACKUP_TIMEOUT.as_secs()),
            false,
        ),
    }
}

// ─── Commandes ───────────────────────────────────────────────────────────────

/// Clé de données et dossier de données (la session a déjà été contrôlée par `gate`).
fn parts<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &AppState) -> Result<([u8; KEY_LEN], PathBuf), String> {
    Ok((data_key_of(state)?, data_dir(app)?))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Res<T> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn backup_status<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<Status, String> {
    gate(&app, &state, "backup_status")?;
    let (_, dir) = parts(&app, &state)?;
    blocking(move || status(&dir, util::now_secs())).await
}

#[tauri::command]
pub async fn backup_set_passphrase<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>, passphrase: String) -> Result<(), String> {
    let session = gate(&app, &state, "backup_set_passphrase")?;
    let (key, dir) = parts(&app, &state)?;
    let r = blocking(move || set_passphrase(&dir, &key, &passphrase)).await;
    audit::log(&app, session.as_ref(), "backup_set_passphrase", "", r.is_ok());
    r
}

#[tauri::command]
pub async fn backup_change_passphrase<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>, old_passphrase: String, new_passphrase: String) -> Result<(), String> {
    let session = gate(&app, &state, "backup_change_passphrase")?;
    let (key, dir) = parts(&app, &state)?;
    let r = blocking(move || change_passphrase(&dir, &key, &old_passphrase, &new_passphrase)).await;
    audit::log(&app, session.as_ref(), "backup_change_passphrase", &r.as_ref().err().map(|e| e.split('|').next().unwrap_or("").to_string()).unwrap_or_default(), r.is_ok());
    r
}

#[tauri::command]
pub async fn backup_set_destinations<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>, primary: Option<String>, secondary: Option<String>) -> Result<(), String> {
    let session = gate(&app, &state, "backup_set_destinations")?;
    let (_, dir) = parts(&app, &state)?;
    let r = blocking(move || set_destinations(&dir, primary.as_deref(), secondary.as_deref()).map(|_| ())).await;
    audit::log(&app, session.as_ref(), "backup_set_destinations", "", r.is_ok());
    r
}

#[tauri::command]
pub async fn backup_run_now<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<RunReport, String> {
    let session = gate(&app, &state, "backup_run_now")?;
    let (key, dir) = parts(&app, &state)?;
    let r = blocking(move || run_backup(&dir, &key, util::now_secs())).await;
    audit::log(&app, session.as_ref(), "backup_run", &r.as_ref().map(|x| format!("{} fichier(s)", x.files)).unwrap_or_else(|e| e.split('|').next().unwrap_or("").to_string()), r.is_ok());
    r
}

#[tauri::command]
pub async fn backup_run_if_due<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<Option<RunReport>, String> {
    let session = gate(&app, &state, "backup_run_if_due")?;
    let (key, dir) = parts(&app, &state)?;
    let r = blocking(move || run_if_due(&dir, &key, util::now_secs())).await;
    if let Ok(Some(rep)) = &r {
        audit::log(&app, session.as_ref(), "backup_auto", &format!("{} fichier(s)", rep.files), true);
    } else if let Err(e) = &r {
        audit::log(&app, session.as_ref(), "backup_auto", e.split('|').next().unwrap_or(""), false);
    }
    r
}

#[tauri::command]
pub async fn backup_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<Vec<Entry>, String> {
    gate(&app, &state, "backup_list")?;
    let (_, dir) = parts(&app, &state)?;
    blocking(move || list(&dir)).await
}

#[tauri::command]
pub async fn backup_inspect<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>, path: String, passphrase: String) -> Result<Preview, String> {
    gate(&app, &state, "backup_inspect")?;
    parts(&app, &state)?;
    blocking(move || inspect(Path::new(&path), &passphrase)).await
}

#[tauri::command]
pub async fn backup_restore<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>, path: String, passphrase: String) -> Result<RestoreReport, String> {
    let session = gate(&app, &state, "backup_restore")?;
    let (key, dir) = parts(&app, &state)?;
    let r = blocking(move || restore(&dir, &key, Path::new(&path), &passphrase, util::now_secs())).await;
    audit::log(&app, session.as_ref(), "backup_restore", &r.as_ref().map(|x| format!("{} fichier(s)", x.restored)).unwrap_or_else(|e| e.split('|').next().unwrap_or("").to_string()), r.is_ok());
    r
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #[test]
    fn vaccination_records_are_part_of_the_backup() {
        assert!(is_backup_data_file("meddoc_vaccinations.json"));
        assert!(is_backup_data_file("meddoc_notification_state.json"));
    }

    use super::*;

    const KEY: [u8; KEY_LEN] = [7u8; KEY_LEN];
    const PASS: &str = "une phrase de passe solide";

    fn fast_kdf() {
        *TEST_KDF.lock().unwrap() = Some((256, 1, 1));
    }

    fn tmp(tag: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let d = std::env::temp_dir().join(format!("docease-bk-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn put(dir: &Path, name: &str, v: &Value) {
        super::super::write_enc_json_in(dir, &KEY, name, v).unwrap();
    }

    fn data_dir_with_files() -> PathBuf {
        let d = tmp("data");
        put(&d, "meddoc_patients.json", &json!([{"id": "p1", "name": "DUPONT Jean"}, {"id": "p2", "name": "MARTIN Awa"}]));
        put(&d, "meddoc_consultations.json", &json!([{"id": "c1", "date": "2026-09-01"}, {"id": "c2", "date": "2026-10-02T10:00:00Z"}]));
        put(&d, "meddoc_appointment_settings.json", &json!({"messages": {"confirmation": {"fr": "x"}}}));
        put(&d, "medicament_overrides.json", &json!({"A": []}));
        // Ne doivent JAMAIS figurer dans une sauvegarde :
        fs::write(d.join("users_meta.json"), b"{}").unwrap();
        fs::write(d.join("security_meta.json"), b"{}").unwrap();
        fs::write(d.join("audit_log.jsonl"), b"x").unwrap();
        fs::write(d.join("app_settings.json"), b"{}").unwrap();
        fs::write(d.join("meddoc_ai.bin"), b"secret").unwrap();
        d
    }

    fn configured(dir: &Path) -> (PathBuf, PathBuf) {
        let a = tmp("destA");
        let b = tmp("destB");
        set_passphrase(dir, &KEY, PASS).unwrap();
        set_destinations(dir, Some(a.to_str().unwrap()), Some(b.to_str().unwrap())).unwrap();
        (a, b)
    }

    #[test]
    fn roundtrip_and_error_kinds() {
        fast_kdf();
        let sealed = seal(PASS, b"{\"format\":2,\"files\":{}}").unwrap();
        assert!(open(&sealed, PASS).is_ok());
        assert_eq!(open(&sealed, "mauvaise phrase de passe").err(), Some(BackupError::WrongPassphrase));
        // Fichier altéré (un caractère du texte chiffré) → corrompu, pas « mauvaise phrase ».
        let mut v: Value = serde_json::from_slice(&sealed).unwrap();
        let ct = v["ct"].as_str().unwrap().to_string();
        let flipped = if ct.starts_with('A') { format!("B{}", &ct[1..]) } else { format!("A{}", &ct[1..]) };
        v["ct"] = json!(flipped);
        assert_eq!(open(&serde_json::to_vec(&v).unwrap(), PASS).err(), Some(BackupError::Corrupted));
        // Tronqué, illisible, étranger, version inconnue.
        assert_eq!(open(&sealed[..sealed.len() / 2], PASS).err(), Some(BackupError::Corrupted));
        assert_eq!(open(b"n'importe quoi", PASS).err(), Some(BackupError::Corrupted));
        assert_eq!(open(b"{\"foo\":1}", PASS).err(), Some(BackupError::NotABackup));
        assert_eq!(open(b"{\"v\":9}", PASS).err(), Some(BackupError::UnknownVersion(9)));
        // En-tête falsifié (paramètres KDF) : refusé, jamais exécuté.
        let mut v: Value = serde_json::from_slice(&sealed).unwrap();
        v["kdf"]["m"] = json!(4_000_000);
        assert_eq!(open(&serde_json::to_vec(&v).unwrap(), PASS).err(), Some(BackupError::Corrupted));
    }

    #[test]
    fn production_parameters_are_argon2id_64mib() {
        let sealed = seal_with(PASS, b"{\"format\":2,\"files\":{}}", (KDF_M_KIB, KDF_T, KDF_P)).unwrap();
        let v: Value = serde_json::from_slice(&sealed).unwrap();
        assert_eq!(v["v"], 2);
        assert_eq!(v["kdf"]["alg"], "argon2id");
        assert_eq!(v["kdf"]["m"], 65_536);
        assert!(open(&sealed, PASS).is_ok());
    }

    #[test]
    fn v1_export_is_still_readable() {
        // Même construction que services/cryptoService.ts : PBKDF2-SHA256 200 000, AES-GCM, JSON { clé: données }.
        let salt = [3u8; 16];
        let iv = [5u8; NONCE_LEN];
        let mut key = [0u8; KEY_LEN];
        pbkdf2::pbkdf2_hmac::<Sha256>(b"ancienne phrase", &salt, 200_000, &mut key);
        let payload = json!({
            "meddoc_patients": [{"id": "p1"}], "meddoc_consultations": [], "meddoc_last_backup": "2026-01-01",
            "autre_chose": 1, "../meddoc_evil": 2
        });
        let ct = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key)).encrypt(Nonce::from_slice(&iv), serde_json::to_vec(&payload).unwrap().as_ref()).unwrap();
        let file = serde_json::to_vec(&json!({"v": 1, "salt": B64.encode(salt), "iv": B64.encode(iv), "ciphertext": B64.encode(&ct)})).unwrap();
        let o = open(&file, "ancienne phrase").unwrap();
        assert_eq!(o.format, 1);
        assert_eq!(o.files.keys().cloned().collect::<Vec<_>>(), vec!["meddoc_consultations.json", "meddoc_patients.json"]);
        assert_eq!(preview(&o).patients, 1);
        assert_eq!(open(&file, "autre").err(), Some(BackupError::WrongPassphraseOrCorrupted));
    }

    #[test]
    fn backup_contains_data_and_catalogue_overrides_only() {
        fast_kdf();
        let d = data_dir_with_files();
        let (a, b) = configured(&d);
        let r = run_backup(&d, &KEY, 1_790_000_000).unwrap();
        assert_eq!(r.files, 4);
        assert!(r.destinations.iter().all(|x| x.ok));
        for dest in [&a, &b] {
            let f = dest.join(SUBDIR).join(&r.file_name);
            let o = open(&fs::read(&f).unwrap(), PASS).unwrap();
            let names: Vec<_> = o.files.keys().cloned().collect();
            assert_eq!(names, vec!["meddoc_appointment_settings.json", "meddoc_consultations.json", "meddoc_patients.json", "medicament_overrides.json"]);
            let p = preview(&o);
            assert_eq!((p.patients, p.consultations), (2, 2));
            assert_eq!(p.last_activity.as_deref(), Some("2026-10-02"));
            // Le texte brut du fichier ne contient aucune donnée patient.
            assert!(!String::from_utf8_lossy(&fs::read(&f).unwrap()).contains("DUPONT"));
        }
        // Statut et phrase de passe jamais en clair.
        let meta = fs::read_to_string(d.join(META_FILE)).unwrap();
        assert!(!meta.contains(PASS));
        assert_eq!(load_meta(&d).unwrap().last_success_at, Some(1_790_000_000));
        assert_eq!(status(&d, 1_790_000_000 + 3 * 3600).unwrap().level, "ok");
    }

    #[test]
    fn passphrase_rules() {
        let d = tmp("pp");
        assert_eq!(set_passphrase(&d, &KEY, "trop court").err(), Some(BackupError::PassphraseTooShort));
        set_passphrase(&d, &KEY, PASS).unwrap();
        assert_eq!(set_passphrase(&d, &KEY, "une autre phrase longue").err(), Some(BackupError::PassphraseAlreadySet));
        assert_eq!(stored_passphrase(&load_meta(&d).unwrap(), &KEY).unwrap(), PASS);
        // Une autre clé de données ne la déchiffre pas.
        assert!(stored_passphrase(&load_meta(&d).unwrap(), &[9u8; KEY_LEN]).is_err());
    }

    #[test]
    fn changing_passphrase_keeps_old_backups_readable_with_old_one() {
        fast_kdf();
        const NEW: &str = "une toute nouvelle phrase";
        let d = data_dir_with_files();
        let (a, _b) = configured(&d);
        let before = run_backup(&d, &KEY, 1_790_000_000).unwrap();

        // Refus : ancienne incorrecte, nouvelle trop courte ou identique ; rien ne change.
        assert_eq!(change_passphrase(&d, &KEY, "mauvaise ancienne phrase", NEW).err(), Some(BackupError::OldPassphraseIncorrect));
        assert_eq!(change_passphrase(&d, &KEY, PASS, "court").err(), Some(BackupError::PassphraseTooShort));
        assert_eq!(change_passphrase(&d, &KEY, PASS, PASS).err(), Some(BackupError::PassphraseUnchanged));
        assert_eq!(stored_passphrase(&load_meta(&d).unwrap(), &KEY).unwrap(), PASS);

        change_passphrase(&d, &KEY, PASS, NEW).unwrap();
        assert_eq!(stored_passphrase(&load_meta(&d).unwrap(), &KEY).unwrap(), NEW);
        assert!(!fs::read_to_string(d.join(META_FILE)).unwrap().contains(NEW));

        // La nouvelle sauvegarde utilise la nouvelle phrase ; l'ancienne reste lisible avec l'ancienne.
        let after = run_backup(&d, &KEY, 1_790_000_000 + 2 * 86_400).unwrap();
        let old_file = fs::read(a.join(SUBDIR).join(&before.file_name)).unwrap();
        let new_file = fs::read(a.join(SUBDIR).join(&after.file_name)).unwrap();
        assert!(open(&old_file, PASS).is_ok());
        assert_eq!(open(&old_file, NEW).err(), Some(BackupError::WrongPassphrase));
        assert!(open(&new_file, NEW).is_ok());
        assert_eq!(open(&new_file, PASS).err(), Some(BackupError::WrongPassphrase));
        // Une autre clé de données (autre session) ne peut pas changer la phrase.
        assert!(change_passphrase(&d, &[9u8; KEY_LEN], NEW, "encore une autre phrase").is_err());
    }

    #[test]
    fn redundancy_alert_until_a_second_disk_is_configured() {
        fast_kdf();
        let d = data_dir_with_files();
        let a = tmp("redA");
        let b = tmp("redB");
        // Rien de configuré : l'alerte rouge « non configurée » suffit, pas d'alerte orange.
        assert_eq!(status(&d, 1).unwrap().redundancy, None);
        set_passphrase(&d, &KEY, PASS).unwrap();
        set_destinations(&d, Some(a.to_str().unwrap()), None).unwrap();
        assert_eq!(status(&d, 1).unwrap().redundancy, Some("no_secondary"));
        // Deux dossiers du même volume (ici : deux dossiers temporaires du même disque).
        set_destinations(&d, Some(a.to_str().unwrap()), Some(b.to_str().unwrap())).unwrap();
        assert!(same_volume(&a, &b));
        assert_eq!(status(&d, 1).unwrap().redundancy, Some("same_disk"));
        // Un chemin introuvable n'est jamais déclaré « même disque » (l'alerte rouge d'accès le couvre).
        assert!(!same_volume(&a, &b.join("absent")));
        fs::remove_dir_all(&b).unwrap();
        assert_eq!(status(&d, 1).unwrap().redundancy, None);
    }

    #[cfg(windows)]
    #[test]
    fn same_volume_compares_drive_prefixes() {
        let prefix = |p: &'static str| win_prefix(Path::new(p));
        assert_ne!(prefix(r"\\?\C:\a"), prefix(r"\\?\E:\a"));
        assert_eq!(prefix(r"\\?\C:\a"), prefix(r"\\?\C:\b\c"));
    }

    #[test]
    fn run_bounded_returns_result_or_gives_up_at_the_deadline() {
        assert_eq!(run_bounded(Duration::from_secs(5), || 41 + 1), Some(42));
        let slow = run_bounded(Duration::from_millis(50), || {
            std::thread::sleep(Duration::from_millis(600));
            1
        });
        assert_eq!(slow, None);
    }

    #[test]
    fn exit_backup_runs_only_when_due_and_reports_each_outcome() {
        fast_kdf();
        let d = data_dir_with_files();
        // Non configurée : rien à faire, fermeture immédiate.
        assert!(matches!(exit_backup(&d, &KEY, 1_790_000_000, Duration::from_secs(30)), ExitBackup::Skipped));
        let (a, _b) = configured(&d);
        let first = exit_backup(&d, &KEY, 1_790_000_000, Duration::from_secs(30));
        assert!(matches!(first, ExitBackup::Done(ref r) if r.files == 4), "{first:?}");
        assert!(a.join(SUBDIR).read_dir().unwrap().count() == 1);
        // Faite il y a 3 h : pas due, rien n'est écrit.
        assert!(matches!(exit_backup(&d, &KEY, 1_790_000_000 + 3 * 3600, Duration::from_secs(30)), ExitBackup::Skipped));
        assert_eq!(a.join(SUBDIR).read_dir().unwrap().count(), 1);
        // Due de nouveau, mais délai nul : la fermeture n'attend pas.
        let late = exit_backup(&d, &KEY, 1_790_000_000 + 2 * 86_400, Duration::ZERO);
        assert!(matches!(late, ExitBackup::TimedOut | ExitBackup::Done(_)), "{late:?}");
    }

    #[test]
    fn rotation_keeps_7_daily_4_weekly_12_monthly() {
        let day = 86_400u64;
        let t0 = util::days_from_civil(2026, 10, 4) as u64 * day + 12 * 3600;
        // Une sauvegarde par jour pendant 500 jours + un fichier étranger.
        let mut names: Vec<String> = (0..500).map(|i| file_name(t0 - i * day)).collect();
        names.push("notes-perso.txt".into());
        let keep = select_keep(&names);
        assert!(keep.contains(&file_name(t0)), "la plus récente est toujours conservée");
        for i in 0..7 {
            assert!(keep.contains(&file_name(t0 - i * day)), "quotidienne {i}");
        }
        assert!(!keep.contains(&file_name(t0 - 100 * day)), "une sauvegarde intermédiaire ancienne est supprimée");
        assert!(keep.len() <= 7 + 4 + 12 && keep.len() >= 12, "conservées : {}", keep.len());
        assert!(!keep.contains("notes-perso.txt"), "jamais proposé : le fichier étranger n'est pas du motif");
        // Mensuelles : le plus récent de chacun des 12 derniers mois est là.
        let months: BTreeSet<i64> = keep.iter().filter_map(|n| parse_name(n)).map(|(_, y, m)| y * 12 + m as i64).collect();
        assert!(months.len() >= 12);
    }

    #[test]
    fn rotation_only_removes_matching_files_on_disk() {
        fast_kdf();
        let d = data_dir_with_files();
        let (a, _b) = configured(&d);
        let sub = a.join(SUBDIR);
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("mes-documents.txt"), b"a garder").unwrap();
        let day = 86_400u64;
        let t0 = util::days_from_civil(2026, 10, 4) as u64 * day + 3600;
        for i in 1..=40u64 {
            fs::write(sub.join(file_name(t0 - i * day)), b"vieux").unwrap();
        }
        let r = run_backup(&d, &KEY, t0).unwrap();
        assert!(r.rotated > 0);
        assert!(sub.join("mes-documents.txt").exists());
        assert!(sub.join(&r.file_name).exists());
        let n = backup_files_in(&a).len();
        assert!(n <= 7 + 4 + 12 && n >= 8, "{n}");
    }

    #[test]
    fn restore_replaces_state_with_safety_copy_and_removes_extra_files() {
        fast_kdf();
        let d = data_dir_with_files();
        let (a, _b) = configured(&d);
        let r = run_backup(&d, &KEY, 1_790_000_000).unwrap();
        let backup = a.join(SUBDIR).join(&r.file_name);
        // L'état change après la sauvegarde.
        put(&d, "meddoc_patients.json", &json!([{"id": "p9", "name": "NOUVEAU"}]));
        put(&d, "meddoc_tasks.json", &json!([{"id": "t1"}]));
        let rep = restore(&d, &KEY, &backup, PASS, 1_790_001_000).unwrap();
        assert_eq!((rep.restored, rep.removed), (4, 1));
        let patients = super::super::read_enc_json_in(&d, &KEY, "meddoc_patients.json").unwrap().unwrap();
        assert_eq!(patients.as_array().unwrap().len(), 2);
        assert!(!d.join("meddoc_tasks.json").exists(), "fichier absent de la sauvegarde retiré");
        assert!(d.join("users_meta.json").exists() && d.join("security_meta.json").exists(), "comptes et sécurité jamais touchés");
        // Copie de sécurité = état d'avant la restauration, lisible avec la clé de données.
        let safety = PathBuf::from(rep.safety_copy.unwrap());
        assert_eq!(super::super::read_enc_json_in(&safety, &KEY, "meddoc_patients.json").unwrap().unwrap()[0]["id"], "p9");
        assert!(super::super::read_enc_json_in(&safety, &KEY, "meddoc_tasks.json").unwrap().is_some());
        assert!(fs::read_dir(&d).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".restore.tmp")));
    }

    #[test]
    fn restore_refuses_bad_input_without_touching_data() {
        fast_kdf();
        let d = data_dir_with_files();
        let (a, _b) = configured(&d);
        let r = run_backup(&d, &KEY, 1_790_000_000).unwrap();
        let backup = a.join(SUBDIR).join(&r.file_name);
        let before = fs::read(d.join("meddoc_patients.json")).unwrap();
        // Mauvaise phrase.
        assert_eq!(restore(&d, &KEY, &backup, "pas la bonne phrase", 1).err(), Some(BackupError::WrongPassphrase));
        // Fichier corrompu.
        let bad = a.join("corrompu.dcb");
        let mut bytes = fs::read(&backup).unwrap();
        let len = bytes.len();
        bytes.truncate(len - 40);
        fs::write(&bad, &bytes).unwrap();
        assert_eq!(restore(&d, &KEY, &bad, PASS, 1).err(), Some(BackupError::Corrupted));
        // Fichier absent / dossier.
        assert!(restore(&d, &KEY, &a.join("absent.dcb"), PASS, 1).is_err());
        // Nom de fichier hostile dans le contenu.
        let mut hostile = Files::new();
        hostile.insert("users_meta.json".into(), json!({}));
        assert_eq!(restore_files(&d, &KEY, &hostile, 1).err(), Some(BackupError::Corrupted));
        assert_eq!(fs::read(d.join("meddoc_patients.json")).unwrap(), before, "données intactes");
        assert!(!d.join(RESTORE_COPIES_DIR).exists(), "aucune copie de sécurité si rien n'a été tenté");
    }

    #[test]
    fn restore_from_v1_file_on_fresh_install() {
        let d = tmp("fresh");
        let salt = [1u8; 16];
        let iv = [2u8; NONCE_LEN];
        let mut key = [0u8; KEY_LEN];
        pbkdf2::pbkdf2_hmac::<Sha256>(b"phrase v1 historique", &salt, 200_000, &mut key);
        let payload = json!({"meddoc_patients": [{"id": "p1"}], "meddoc_doctor_info": {"nameFr": "Dr X"}});
        let ct = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key)).encrypt(Nonce::from_slice(&iv), serde_json::to_vec(&payload).unwrap().as_ref()).unwrap();
        let f = d.join("ancien.json");
        fs::write(&f, serde_json::to_vec(&json!({"v": 1, "salt": B64.encode(salt), "iv": B64.encode(iv), "ciphertext": B64.encode(&ct)})).unwrap()).unwrap();
        let rep = restore(&d, &KEY, &f, "phrase v1 historique", 5).unwrap();
        assert_eq!(rep.restored, 2);
        assert!(rep.safety_copy.is_none(), "poste vide : rien à copier");
        assert_eq!(super::super::read_enc_json_in(&d, &KEY, "meddoc_patients.json").unwrap().unwrap()[0]["id"], "p1");
    }

    #[test]
    fn unplugged_destination_is_reported_and_other_destination_still_written() {
        fast_kdf();
        let d = data_dir_with_files();
        let (a, b) = configured(&d);
        fs::remove_dir_all(&a).unwrap(); // clé USB débranchée
        let r = run_backup(&d, &KEY, 1_790_000_000).unwrap();
        assert!(!r.destinations[0].ok && r.destinations[1].ok);
        assert!(b.join(SUBDIR).join(&r.file_name).exists());
        let st = status(&d, 1_790_000_100).unwrap();
        assert_eq!(st.level, "alert");
        assert!(st.reason.unwrap().contains("inaccessible"));
        assert!(!st.destinations[0].accessible && st.destinations[1].accessible);
        // Tous les emplacements perdus : erreur, aucun succès enregistré.
        fs::remove_dir_all(&b).unwrap();
        let d2 = data_dir_with_files();
        let _ = configured(&d2);
        let m = load_meta(&d2).unwrap();
        fs::remove_dir_all(m.primary.clone().unwrap()).unwrap();
        fs::remove_dir_all(m.secondary.clone().unwrap()).unwrap();
        let e = run_backup(&d2, &KEY, 1_790_000_000).err().unwrap();
        assert_eq!(e.code(), "DESTINATION_UNAVAILABLE");
        let m = load_meta(&d2).unwrap();
        assert!(m.last_success_at.is_none() && m.last_error.is_some());
    }

    #[test]
    fn destinations_are_validated() {
        let d = tmp("val");
        assert_eq!(set_destinations(&d, Some("relatif/dossier"), None).err().map(|e| e.code()), Some("INVALID_DESTINATION"));
        assert_eq!(set_destinations(&d, Some(d.join("absent").to_str().unwrap()), None).err().map(|e| e.code()), Some("INVALID_DESTINATION"));
        let inside = d.join("sous");
        fs::create_dir_all(&inside).unwrap();
        assert!(set_destinations(&d, Some(inside.to_str().unwrap()), None).is_err(), "pas dans le dossier de données");
        let ok = tmp("val-ok");
        assert!(set_destinations(&d, Some(ok.to_str().unwrap()), Some(ok.to_str().unwrap())).is_err(), "deux fois le même dossier");
        assert!(set_destinations(&d, Some(ok.to_str().unwrap()), None).is_ok());
    }

    #[test]
    fn due_logic_and_status_levels() {
        let h = 3600u64;
        let mut m = Meta { wrapped_passphrase: Some("x".into()), primary: Some("/p".into()), ..Default::default() };
        assert!(is_due(&m, 1000), "jamais sauvegardé");
        m.last_success_at = Some(1_000_000);
        assert!(!is_due(&m, 1_000_000 + 23 * h));
        assert!(is_due(&m, 1_000_000 + 24 * h));
        m.last_error = Some("e".into());
        m.last_attempt_at = Some(1_000_000 + 24 * h);
        assert!(!is_due(&m, 1_000_000 + 24 * h + 60), "pas de nouvelle tentative immédiate après un échec");
        assert!(is_due(&m, 1_000_000 + 24 * h + 700));
        assert!(!is_due(&Meta::default(), 5), "non configurée : jamais due");
        // Niveaux d'alerte (dossier principal accessible).
        let d = tmp("lvl");
        let p = tmp("lvl-dest");
        set_passphrase(&d, &KEY, PASS).unwrap();
        set_destinations(&d, Some(p.to_str().unwrap()), None).unwrap();
        assert_eq!(status(&d, 100).unwrap().level, "alert");
        let mut meta = load_meta(&d).unwrap();
        meta.last_success_at = Some(1_000_000);
        save_meta(&d, &meta).unwrap();
        assert_eq!(status(&d, 1_000_000 + 3 * h).unwrap().level, "ok");
        assert_eq!(status(&d, 1_000_000 + 30 * h).unwrap().level, "warning");
        assert_eq!(status(&d, 1_000_000 + 49 * h).unwrap().level, "alert");
    }

    #[test]
    fn data_file_list_is_the_single_source() {
        for ok in ["meddoc_patients.json", "meddoc_futur_fichier.json", "medicament_overrides.json", "medicament_audit_log.json"] {
            assert!(is_backup_data_file(ok), "{ok}");
        }
        for ko in [
            "users_meta.json", "security_meta.json", "audit_log.jsonl", "app_settings.json", "backup_meta.json", "meddoc_ai.bin",
            "../meddoc_x.json", "meddoc_x.json.tmp", "backups/meddoc_x.json", "", "meddoc_..json", "meddoc_a b.json",
        ] {
            assert!(!is_backup_data_file(ko), "{ko}");
        }
    }
}
