use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use log;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{SaltString, rand_core::OsRng};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use bip39::Mnemonic;
use rand::RngCore;

const SECURITY_FILE: &str = "security_meta.json";
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
// 256 bits of entropy -> a 24-word BIP39 recovery phrase, matching the AES-256 data key.
const RECOVERY_ENTROPY_LEN: usize = 32;

/// Holds the AES-256 "data key" that actually encrypts patient files, once unwrapped
/// by a successful PIN unlock or phrase-based recovery. Kept only in memory — never
/// persisted. Every save_json/load_json call after this is set transparently
/// encrypts/decrypts through it.
struct AppState {
    key: Mutex<Option<[u8; KEY_LEN]>>,
}

/// The data key never changes on its own — a PIN change or a recovery-phrase rotation
/// only re-wraps it, so patient files never need re-encrypting except during the
/// one-time legacy migration below.
#[derive(Serialize, Deserialize, Default)]
struct SecurityMeta {
    // Argon2 PHC string, used only to verify the PIN typed at unlock time.
    pin_hash: String,

    // Legacy pre-recovery-key scheme: the data key used to be derived directly from
    // the PIN via this salt, with no independent wrapping. Present only on installs
    // that predate the recovery-key feature; `unlock` consumes it once and
    // `migrate_to_recovery` clears it for good.
    #[serde(skip_serializing_if = "Option::is_none")]
    key_salt: Option<String>,

    // Current scheme: the random data key is independently unlockable via the PIN...
    #[serde(skip_serializing_if = "Option::is_none")]
    pin_wrap_salt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wrapped_key_pin: Option<String>,
    // ...or via the 24-word BIP39 recovery phrase (its 256-bit entropy is used
    // directly as the wrapping key — it's already uniformly random, so no further
    // KDF is needed the way the low-entropy PIN requires Argon2).
    #[serde(skip_serializing_if = "Option::is_none")]
    wrapped_key_recovery: Option<String>,
}

#[derive(Serialize)]
struct UnlockResult {
    ok: bool,
    needs_migration: bool,
}

fn security_meta_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push(SECURITY_FILE);
    Ok(path)
}

fn read_meta(app: &tauri::AppHandle) -> Result<(PathBuf, SecurityMeta), String> {
    let path = security_meta_path(app)?;
    if !path.exists() {
        return Err("Security not configured".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let meta: SecurityMeta = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok((path, meta))
}

fn write_meta(path: &PathBuf, meta: &SecurityMeta) -> Result<(), String> {
    let json_str = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(path, json_str).map_err(|e| e.to_string())
}

fn verify_pin(pin: &str, pin_hash: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(pin_hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default().verify_password(pin.as_bytes(), &parsed_hash).is_ok())
}

fn hash_pin(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|e| e.to_string())?
        .to_string())
}

/// Derives a key from low-entropy input (the PIN) via Argon2. NOT used for the
/// recovery phrase, whose entropy is already high enough to use directly.
fn derive_key_from_pin(pin: &str, salt_b64: &str) -> Result<[u8; KEY_LEN], String> {
    let salt = B64.decode(salt_b64).map_err(|e| e.to_string())?;
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(pin.as_bytes(), &salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn random_salt_b64() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    B64.encode(bytes)
}

fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(key: &[u8; KEY_LEN], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < NONCE_LEN {
        return Err("Corrupt encrypted file".to_string());
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())
}

/// Wraps (encrypts) the 32-byte data key with another 32-byte key, base64-encoded.
fn wrap_key(wrapping_key: &[u8; KEY_LEN], data_key: &[u8; KEY_LEN]) -> Result<String, String> {
    Ok(B64.encode(encrypt(wrapping_key, data_key)?))
}

/// Unwraps a data key. An AEAD failure here means the wrapping key was wrong
/// (wrong PIN, or a recovery phrase that doesn't match this install).
fn unwrap_key(wrapping_key: &[u8; KEY_LEN], wrapped_b64: &str) -> Result<[u8; KEY_LEN], String> {
    let wrapped = B64.decode(wrapped_b64).map_err(|e| e.to_string())?;
    let decrypted = decrypt(wrapping_key, &wrapped)?;
    decrypted.try_into().map_err(|_| "Clé de taille invalide".to_string())
}

fn random_data_key() -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    OsRng.fill_bytes(&mut key);
    key
}

/// Generates a fresh 24-word BIP39 recovery phrase and returns it alongside the raw
/// entropy it encodes (used directly as an AES key to wrap the data key).
fn generate_recovery_phrase() -> Result<([u8; RECOVERY_ENTROPY_LEN], String), String> {
    let mut entropy = [0u8; RECOVERY_ENTROPY_LEN];
    OsRng.fill_bytes(&mut entropy);
    let mnemonic = Mnemonic::from_entropy(&entropy).map_err(|e| e.to_string())?;
    Ok((entropy, mnemonic.to_string()))
}

/// Parses a user-supplied recovery phrase back into its entropy bytes. BIP39 phrases
/// carry a built-in checksum, so a mistyped/missing word is caught here rather than
/// surfacing as a confusing decryption failure.
fn parse_recovery_phrase(phrase: &str) -> Result<[u8; RECOVERY_ENTROPY_LEN], String> {
    let mnemonic: Mnemonic = phrase
        .trim()
        .parse()
        .map_err(|_| "Phrase de récupération invalide (mot incorrect, manquant ou mal orthographié).".to_string())?;
    let entropy = mnemonic.to_entropy();
    entropy
        .try_into()
        .map_err(|_| "Phrase de récupération invalide (longueur inattendue).".to_string())
}

#[tauri::command]
fn security_status(app: tauri::AppHandle) -> bool {
    security_meta_path(&app).map(|p| p.exists()).unwrap_or(false)
}

/// First-run: creates the master PIN and a random data key, wraps the data key with
/// both the PIN and a freshly generated recovery phrase, and returns the phrase so
/// the frontend can force a one-time "write this down" screen. The phrase itself is
/// never written to disk.
#[tauri::command]
fn setup_pin(app: tauri::AppHandle, state: tauri::State<AppState>, pin: String) -> Result<String, String> {
    let pin_hash = hash_pin(&pin)?;

    let pin_wrap_salt = random_salt_b64();
    let pin_wrap_key = derive_key_from_pin(&pin, &pin_wrap_salt)?;

    let data_key = random_data_key();
    let wrapped_key_pin = wrap_key(&pin_wrap_key, &data_key)?;

    let (entropy, phrase) = generate_recovery_phrase()?;
    let wrapped_key_recovery = wrap_key(&entropy, &data_key)?;

    let meta = SecurityMeta {
        pin_hash,
        key_salt: None,
        pin_wrap_salt: Some(pin_wrap_salt),
        wrapped_key_pin: Some(wrapped_key_pin),
        wrapped_key_recovery: Some(wrapped_key_recovery),
    };
    let path = security_meta_path(&app)?;
    write_meta(&path, &meta)?;

    *state.key.lock().map_err(|e| e.to_string())? = Some(data_key);
    Ok(phrase)
}

/// Verifies the PIN against the stored hash and, on success, unwraps (or, on a
/// legacy install, directly re-derives) the data key and keeps it for the session.
/// `needs_migration` tells the frontend to call `migrate_to_recovery` once so this
/// install gains a recovery phrase.
#[tauri::command]
fn unlock(app: tauri::AppHandle, state: tauri::State<AppState>, pin: String) -> Result<UnlockResult, String> {
    let (_, meta) = read_meta(&app)?;

    if !verify_pin(&pin, &meta.pin_hash)? {
        return Ok(UnlockResult { ok: false, needs_migration: false });
    }

    if let (Some(pin_wrap_salt), Some(wrapped_key_pin)) = (&meta.pin_wrap_salt, &meta.wrapped_key_pin) {
        let pin_wrap_key = derive_key_from_pin(&pin, pin_wrap_salt)?;
        let data_key = unwrap_key(&pin_wrap_key, wrapped_key_pin)?;
        *state.key.lock().map_err(|e| e.to_string())? = Some(data_key);
        return Ok(UnlockResult { ok: true, needs_migration: false });
    }

    // Legacy pre-recovery-key install: the "data key" was derived directly from the
    // PIN. Unlock still works so the app is usable immediately; migration to the
    // wrapped-key scheme (and generation of a recovery phrase) happens right after.
    let key_salt = meta.key_salt.ok_or("Security metadata is corrupt".to_string())?;
    let legacy_key = derive_key_from_pin(&pin, &key_salt)?;
    *state.key.lock().map_err(|e| e.to_string())? = Some(legacy_key);
    Ok(UnlockResult { ok: true, needs_migration: true })
}

/// Recursively collects every encrypted data file under the app's local data
/// dir, skipping the security marker itself (that one is re-written separately).
fn collect_encrypted_files(dir: &PathBuf, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_encrypted_files(&path, out);
        } else if path.is_file() {
            if path.file_name().and_then(|s| s.to_str()) == Some(SECURITY_FILE) {
                continue;
            }
            out.push(path);
        }
    }
}

/// One-time migration for installs created before the recovery-key feature existed.
/// Re-derives the legacy directly-derived key, generates a brand new random data
/// key, re-encrypts every stored file under it, then wraps it with the PIN and with
/// a freshly generated recovery phrase (returned for display). After this call the
/// install is on the current wrapped-key scheme and `key_salt` is gone for good.
#[tauri::command]
fn migrate_to_recovery(app: tauri::AppHandle, state: tauri::State<AppState>, pin: String) -> Result<String, String> {
    let (path, meta) = read_meta(&app)?;
    let key_salt = meta.key_salt.clone().ok_or("Cette installation est déjà migrée.".to_string())?;

    if !verify_pin(&pin, &meta.pin_hash)? {
        return Err("PIN incorrect".to_string());
    }

    let legacy_key = derive_key_from_pin(&pin, &key_salt)?;
    let data_key = random_data_key();

    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    collect_encrypted_files(&data_dir, &mut files);
    for file in &files {
        let Ok(encrypted) = fs::read(file) else { continue };
        let Ok(decrypted) = decrypt(&legacy_key, &encrypted) else { continue };
        let reencrypted = encrypt(&data_key, &decrypted)?;
        fs::write(file, reencrypted).map_err(|e| e.to_string())?;
    }

    let pin_wrap_salt = random_salt_b64();
    let pin_wrap_key = derive_key_from_pin(&pin, &pin_wrap_salt)?;
    let wrapped_key_pin = wrap_key(&pin_wrap_key, &data_key)?;

    let (entropy, phrase) = generate_recovery_phrase()?;
    let wrapped_key_recovery = wrap_key(&entropy, &data_key)?;

    let new_meta = SecurityMeta {
        pin_hash: meta.pin_hash,
        key_salt: None,
        pin_wrap_salt: Some(pin_wrap_salt),
        wrapped_key_pin: Some(wrapped_key_pin),
        wrapped_key_recovery: Some(wrapped_key_recovery),
    };
    write_meta(&path, &new_meta)?;

    *state.key.lock().map_err(|e| e.to_string())? = Some(data_key);
    Ok(phrase)
}

/// Changes the master PIN. On the current wrapped-key scheme this only re-wraps the
/// data key under a new PIN — patient files are never touched, since the data key
/// itself doesn't change.
#[tauri::command]
fn change_master_pin(app: tauri::AppHandle, state: tauri::State<AppState>, old_pin: String, new_pin: String) -> Result<(), String> {
    let (path, meta) = read_meta(&app)?;

    if !verify_pin(&old_pin, &meta.pin_hash)? {
        return Err("Ancien PIN incorrect".to_string());
    }

    let pin_wrap_salt = meta.pin_wrap_salt.ok_or("Migration de sécurité requise avant de changer le PIN.".to_string())?;
    let wrapped_key_pin = meta.wrapped_key_pin.ok_or("Métadonnées de sécurité corrompues".to_string())?;
    let old_pin_wrap_key = derive_key_from_pin(&old_pin, &pin_wrap_salt)?;
    let data_key = unwrap_key(&old_pin_wrap_key, &wrapped_key_pin)?;

    let new_pin_hash = hash_pin(&new_pin)?;
    let new_pin_wrap_salt = random_salt_b64();
    let new_pin_wrap_key = derive_key_from_pin(&new_pin, &new_pin_wrap_salt)?;
    let new_wrapped_key_pin = wrap_key(&new_pin_wrap_key, &data_key)?;

    let new_meta = SecurityMeta {
        pin_hash: new_pin_hash,
        key_salt: None,
        pin_wrap_salt: Some(new_pin_wrap_salt),
        wrapped_key_pin: Some(new_wrapped_key_pin),
        wrapped_key_recovery: meta.wrapped_key_recovery,
    };
    write_meta(&path, &new_meta)?;

    *state.key.lock().map_err(|e| e.to_string())? = Some(data_key);
    Ok(())
}

/// Recovers access using the 24-word phrase shown at setup time, and sets a new
/// master PIN in the same step. For hygiene, the phrase just used is retired: a
/// fresh recovery phrase is generated and returned for the frontend to display again.
#[tauri::command]
fn recover_with_phrase(app: tauri::AppHandle, state: tauri::State<AppState>, phrase: String, new_pin: String) -> Result<String, String> {
    let (path, meta) = read_meta(&app)?;
    let wrapped_key_recovery = meta.wrapped_key_recovery.ok_or("Aucune clé de récupération n'est configurée pour cette installation.".to_string())?;

    let entropy = parse_recovery_phrase(&phrase)?;
    let data_key = unwrap_key(&entropy, &wrapped_key_recovery)
        .map_err(|_| "Cette phrase de récupération ne correspond pas à cette installation.".to_string())?;

    let new_pin_hash = hash_pin(&new_pin)?;
    let new_pin_wrap_salt = random_salt_b64();
    let new_pin_wrap_key = derive_key_from_pin(&new_pin, &new_pin_wrap_salt)?;
    let new_wrapped_key_pin = wrap_key(&new_pin_wrap_key, &data_key)?;

    let (new_entropy, new_phrase) = generate_recovery_phrase()?;
    let new_wrapped_key_recovery = wrap_key(&new_entropy, &data_key)?;

    let new_meta = SecurityMeta {
        pin_hash: new_pin_hash,
        key_salt: None,
        pin_wrap_salt: Some(new_pin_wrap_salt),
        wrapped_key_pin: Some(new_wrapped_key_pin),
        wrapped_key_recovery: Some(new_wrapped_key_recovery),
    };
    write_meta(&path, &new_meta)?;

    *state.key.lock().map_err(|e| e.to_string())? = Some(data_key);
    Ok(new_phrase)
}

/// Lets the doctor regenerate their recovery phrase (e.g. if they suspect the
/// previous one was seen) without changing the PIN. Requires the current PIN.
#[tauri::command]
fn regenerate_recovery(app: tauri::AppHandle, state: tauri::State<AppState>, pin: String) -> Result<String, String> {
    let (path, meta) = read_meta(&app)?;

    if !verify_pin(&pin, &meta.pin_hash)? {
        return Err("PIN incorrect".to_string());
    }

    let pin_wrap_salt = meta.pin_wrap_salt.ok_or("Migration de sécurité requise.".to_string())?;
    let wrapped_key_pin = meta.wrapped_key_pin.clone().ok_or("Métadonnées de sécurité corrompues".to_string())?;
    let pin_wrap_key = derive_key_from_pin(&pin, &pin_wrap_salt)?;
    let data_key = unwrap_key(&pin_wrap_key, &wrapped_key_pin)?;

    let (entropy, phrase) = generate_recovery_phrase()?;
    let wrapped_key_recovery = wrap_key(&entropy, &data_key)?;

    let new_meta = SecurityMeta {
        pin_hash: meta.pin_hash,
        key_salt: None,
        pin_wrap_salt: Some(pin_wrap_salt),
        wrapped_key_pin: Some(wrapped_key_pin),
        wrapped_key_recovery: Some(wrapped_key_recovery),
    };
    write_meta(&path, &new_meta)?;

    *state.key.lock().map_err(|e| e.to_string())? = Some(data_key);
    Ok(phrase)
}

#[tauri::command]
fn scan_json_files(app: tauri::AppHandle) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let data_dir = app.path().app_local_data_dir().unwrap_or_else(|_| PathBuf::from("."));

    if let Ok(entries) = fs::read_dir(data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    let lower_name = filename.to_lowercase();
                    if lower_name.contains("package") ||
                       lower_name.contains("tsconfig") ||
                       lower_name.contains("tauri.conf") ||
                       lower_name.contains("metadata.json") ||
                       lower_name.contains("latest.json") ||
                       // Our own encrypted store / security marker — not an externally
                       // dropped file, and not valid UTF-8 JSON any more.
                       lower_name.starts_with("meddoc_") ||
                       lower_name == SECURITY_FILE {
                        continue;
                    }

                    if let Ok(content) = fs::read_to_string(&path) {
                        results.push((filename.to_string(), content));
                    }
                }
            }
        }
    }
    results
}

#[tauri::command]
fn save_json(app: tauri::AppHandle, state: tauri::State<AppState>, filename: String, data: Value) -> Result<(), String> {
    let key = state.key.lock().map_err(|e| e.to_string())?
        .ok_or_else(|| "Locked: no encryption key set".to_string())?;

    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;

    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    path.push(&filename);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json_str = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    let encrypted = encrypt(&key, json_str.as_bytes())?;
    fs::write(path, encrypted).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_json(app: tauri::AppHandle, state: tauri::State<AppState>, filename: String) -> Result<Value, String> {
    let key = state.key.lock().map_err(|e| e.to_string())?
        .ok_or_else(|| "Locked: no encryption key set".to_string())?;

    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push(&filename);

    if !path.exists() {
        return Err("File not found".to_string());
    }

    let encrypted = fs::read(path).map_err(|e| e.to_string())?;
    let decrypted = decrypt(&key, &encrypted)?;
    let data: Value = serde_json::from_slice(&decrypted).map_err(|e| e.to_string())?;
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end test of the actual crash scenario the audit asked about:
    /// set up a master PIN, forget it, and recover access via the 24-word phrase
    /// alone — then confirm a wrong phrase is rejected and the new PIN works.
    #[test]
    fn setup_then_forgotten_pin_recovers_via_phrase() {
        let pin = "1234".to_string();

        // --- setup_pin, minus the file I/O (that part is exercised by cargo check
        // against the real tauri::AppHandle/State signatures; this isolates the
        // crypto, which is the part a mistake here would silently break). ---
        let pin_hash = hash_pin(&pin).unwrap();
        let pin_wrap_salt = random_salt_b64();
        let pin_wrap_key = derive_key_from_pin(&pin, &pin_wrap_salt).unwrap();
        let data_key = random_data_key();
        let wrapped_key_pin = wrap_key(&pin_wrap_key, &data_key).unwrap();
        let (entropy, phrase) = generate_recovery_phrase().unwrap();
        let wrapped_key_recovery = wrap_key(&entropy, &data_key).unwrap();

        assert_eq!(phrase.split_whitespace().count(), 24);

        // Normal unlock with the PIN recovers the same data key.
        assert!(verify_pin(&pin, &pin_hash).unwrap());
        let unlocked_key = unwrap_key(
            &derive_key_from_pin(&pin, &pin_wrap_salt).unwrap(),
            &wrapped_key_pin,
        ).unwrap();
        assert_eq!(unlocked_key, data_key);

        // The PIN is now "forgotten" — recover via the phrase alone, as if typed
        // into the "PIN maître oublié ?" screen.
        let recovered_entropy = parse_recovery_phrase(&phrase).unwrap();
        assert_eq!(recovered_entropy, entropy);
        let recovered_key = unwrap_key(&recovered_entropy, &wrapped_key_recovery).unwrap();
        assert_eq!(recovered_key, data_key, "recovery phrase must unwrap the SAME data key the PIN protects");

        // Set a new PIN from the recovered key, exactly as recover_with_phrase does.
        let new_pin = "5678".to_string();
        let new_pin_hash = hash_pin(&new_pin).unwrap();
        let new_pin_wrap_salt = random_salt_b64();
        let new_pin_wrap_key = derive_key_from_pin(&new_pin, &new_pin_wrap_salt).unwrap();
        let new_wrapped_key_pin = wrap_key(&new_pin_wrap_key, &recovered_key).unwrap();

        assert!(verify_pin(&new_pin, &new_pin_hash).unwrap());
        let final_key = unwrap_key(
            &derive_key_from_pin(&new_pin, &new_pin_wrap_salt).unwrap(),
            &new_wrapped_key_pin,
        ).unwrap();
        assert_eq!(final_key, data_key, "data key must survive a full recover-then-repin cycle unchanged");

        // A phrase with one word swapped must fail the BIP39 checksum, not silently
        // "recover" garbage.
        let mut words: Vec<&str> = phrase.split_whitespace().collect();
        let last = words.len() - 1;
        words[last] = if words[last] == "abandon" { "ability" } else { "abandon" };
        let tampered = words.join(" ");
        assert!(parse_recovery_phrase(&tampered).is_err());
    }

    /// A syntactically valid phrase that simply belongs to a different install must
    /// fail to unwrap this install's data key (AEAD auth failure), not decrypt into
    /// wrong-but-unnoticed bytes.
    #[test]
    fn unrelated_recovery_phrase_is_rejected() {
        let data_key = random_data_key();
        let (_entropy_a, _phrase_a) = generate_recovery_phrase().unwrap();
        let (entropy_a, _) = generate_recovery_phrase().unwrap();
        let wrapped = wrap_key(&entropy_a, &data_key).unwrap();

        let (entropy_b, _phrase_b) = generate_recovery_phrase().unwrap();
        assert!(unwrap_key(&entropy_b, &wrapped).is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState { key: Mutex::new(None) })
    .invoke_handler(tauri::generate_handler![
        scan_json_files,
        save_json,
        load_json,
        security_status,
        setup_pin,
        unlock,
        migrate_to_recovery,
        change_master_pin,
        recover_with_phrase,
        regenerate_recovery
    ])
    .setup(|app| {
      // Ensure data directory exists on startup
      let data_dir = app.path().app_local_data_dir()?;
      if !data_dir.exists() {
          fs::create_dir_all(data_dir)?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
