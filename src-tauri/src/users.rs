//! Comptes utilisateurs et déverrouillage par utilisateur.
//!
//! La clé de données AES-256 est unique et ne change jamais. Chaque compte en possède
//! une copie enveloppée par SA clé, dérivée de SON mot de passe (Argon2) : l'assistante
//! déverrouille l'application sans connaître le mot de passe du médecin.
//! `users_meta.json` ne contient que des éléments dérivés (hash Argon2, sel, clé
//! enveloppée), jamais de mot de passe en clair.
//!
//! Migration depuis l'ancien schéma (mot de passe maître + collaborateurs en clair
//! dans `meddoc_doctor_info`) : sauvegarde datée d'abord, puis création des comptes ;
//! relançable sans dégât (voir `migrate_to_users` et `finalize_legacy_cleanup`).

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use rand::RngCore;
use serde::{Deserialize, Serialize};
use argon2::password_hash::rand_core::OsRng;

use super::access::{gate, require_session, Role, Session};
use super::audit;
use super::util;
use super::{
    data_dir, derive_key_from_pin, hash_pin, parse_recovery_phrase,
    generate_recovery_phrase, random_data_key, read_enc_json_in as read_enc_json, write_enc_json_in as write_enc_json, random_salt_b64, read_meta_in, unwrap_key,
    verify_pin, wrap_key, write_meta, AppState, SecurityMeta, KEY_LEN, SECURITY_FILE,
};

pub const USERS_FILE: &str = "users_meta.json";
pub const MIGRATION_BACKUPS_DIR: &str = "migration_backups";
const DOCTOR_INFO_FILE: &str = "meddoc_doctor_info.json";
const MAX_PASSWORD_CHARS: usize = 64;

#[derive(Serialize, Deserialize, Clone)]
pub struct UserRecord {
    pub id: String,
    pub name: String,
    pub role: Role,
    /// Hash Argon2 (PHC) : vérification rapide du mot de passe.
    pub pw_hash: String,
    pub wrap_salt: String,
    /// Clé de données enveloppée par Argon2(mot de passe, wrap_salt).
    pub wrapped_key: String,
    pub created_at: String,
    #[serde(default)]
    pub must_change_password: bool,
}

#[derive(Serialize, Deserialize, Default)]
pub struct UsersFile {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub users: Vec<UserRecord>,
}

#[derive(Serialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub role: Role,
}

#[derive(Serialize)]
pub struct UserSummary {
    pub id: String,
    pub name: String,
    pub role: Role,
    pub created_at: String,
    pub must_change_password: bool,
}

#[derive(Serialize)]
pub struct UnlockResult {
    pub ok: bool,
    pub needs_migration: bool,
    pub retry_after_secs: Option<u64>,
    pub session: Option<Session>,
}

fn summary(r: &UserRecord) -> UserSummary {
    UserSummary {
        id: r.id.clone(),
        name: r.name.clone(),
        role: r.role,
        created_at: r.created_at.clone(),
        must_change_password: r.must_change_password,
    }
}

// ─── Mots de passe ───────────────────────────────────────────────────────────

pub fn min_password_len(role: Role) -> usize {
    match role {
        Role::Medecin => 12,
        Role::Assistant => 8,
    }
}

/// Appliqué aux nouveaux comptes et aux changements uniquement : un mot de passe
/// existant plus court n'est jamais bloqué au déverrouillage.
pub fn validate_password(role: Role, password: &str) -> Result<(), String> {
    let n = password.chars().count();
    if n < min_password_len(role) {
        return Err(format!("Le mot de passe doit contenir au moins {} caractères.", min_password_len(role)));
    }
    if n > MAX_PASSWORD_CHARS {
        return Err(format!("Le mot de passe ne doit pas dépasser {MAX_PASSWORD_CHARS} caractères."));
    }
    Ok(())
}

fn new_id() -> String {
    let mut b = [0u8; 8];
    OsRng.fill_bytes(&mut b);
    format!("u-{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>())
}

pub fn new_record(
    name: &str,
    role: Role,
    password: &str,
    data_key: &[u8; KEY_LEN],
    must_change_password: bool,
) -> Result<UserRecord, String> {
    let wrap_salt = random_salt_b64();
    let wrapping_key = derive_key_from_pin(password, &wrap_salt)?;
    Ok(UserRecord {
        id: new_id(),
        name: name.trim().to_string(),
        role,
        pw_hash: hash_pin(password)?,
        wrap_salt,
        wrapped_key: wrap_key(&wrapping_key, data_key)?,
        created_at: util::now_iso(),
        must_change_password,
    })
}

/// `Ok(None)` : mauvais mot de passe. `Ok(Some(clé))` : clé de données déverrouillée.
pub fn authenticate(rec: &UserRecord, password: &str) -> Result<Option<[u8; KEY_LEN]>, String> {
    if !verify_pin(password, &rec.pw_hash)? {
        return Ok(None);
    }
    let wrapping_key = derive_key_from_pin(password, &rec.wrap_salt)?;
    unwrap_key(&wrapping_key, &rec.wrapped_key).map(Some)
}

fn rewrap(rec: &mut UserRecord, new_password: &str, data_key: &[u8; KEY_LEN]) -> Result<(), String> {
    let wrap_salt = random_salt_b64();
    let wrapping_key = derive_key_from_pin(new_password, &wrap_salt)?;
    rec.pw_hash = hash_pin(new_password)?;
    rec.wrapped_key = wrap_key(&wrapping_key, data_key)?;
    rec.wrap_salt = wrap_salt;
    Ok(())
}

// ─── Anti-force-brute ────────────────────────────────────────────────────────

/// Après 3 échecs sur un profil, délai croissant (5 s, 10 s, 20 s… plafonné à 5 min).
#[derive(Default)]
pub struct Throttle {
    entries: HashMap<String, (u32, u64)>, // (échecs, verrouillé jusqu'à — secondes)
}

impl Throttle {
    pub fn remaining(&self, id: &str, now: u64) -> Option<u64> {
        self.entries.get(id).and_then(|(_, until)| until.checked_sub(now)).filter(|r| *r > 0)
    }

    pub fn fail(&mut self, id: &str, now: u64) {
        let e = self.entries.entry(id.to_string()).or_insert((0, 0));
        e.0 += 1;
        if e.0 >= 3 {
            let delay = (5u64 << (e.0 - 3).min(6)).min(300);
            e.1 = now + delay;
        }
    }

    pub fn reset(&mut self, id: &str) {
        self.entries.remove(id);
    }
}

// ─── Fichier des comptes ─────────────────────────────────────────────────────

pub fn users_path(dir: &Path) -> PathBuf {
    dir.join(USERS_FILE)
}

pub fn load_users(dir: &Path) -> Result<Option<UsersFile>, String> {
    let p = users_path(dir);
    if !p.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map(Some).map_err(|e| format!("users_meta.json corrompu : {e}"))
}

/// Écriture atomique : fichier temporaire dans le même dossier, `fsync`, puis renommage.
/// Un arrêt (plantage, coupure de courant) en cours d'écriture laisse l'ancien fichier
/// intact ; au pire un `.tmp` orphelin, supprimé ici en cas d'échec.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_atomic_with(path, |f| f.write_all(bytes))
}

/// Variante où l'appelant produit le contenu (permet de simuler une écriture interrompue).
pub(crate) fn write_atomic_with(path: &Path, write: impl FnOnce(&mut fs::File) -> std::io::Result<()>) -> Result<(), String> {
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let mut name = path.file_name().ok_or("Chemin invalide")?.to_os_string();
    name.push(format!(".{}.tmp", SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let tmp = path.with_file_name(name);
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        write(&mut f)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}

pub fn save_users(dir: &Path, file: &UsersFile) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    write_atomic(&users_path(dir), json.as_bytes())
}

fn medecin_count(file: &UsersFile) -> usize {
    file.users.iter().filter(|u| u.role == Role::Medecin).count()
}

// ─── Opérations sur les comptes (pures, testées) ─────────────────────────────

pub fn add_user(
    file: &mut UsersFile,
    name: &str,
    role: Role,
    password: &str,
    data_key: &[u8; KEY_LEN],
    must_change_password: bool,
) -> Result<UserRecord, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Le nom doit contenir entre 1 et 80 caractères.".to_string());
    }
    if file.users.iter().any(|u| u.name.to_lowercase() == name.to_lowercase()) {
        return Err("Un compte porte déjà ce nom.".to_string());
    }
    validate_password(role, password)?;
    let rec = new_record(name, role, password, data_key, must_change_password)?;
    file.users.push(rec.clone());
    Ok(rec)
}

pub fn remove_user(file: &mut UsersFile, id: &str, actor_id: &str) -> Result<(), String> {
    if id == actor_id {
        return Err("Vous ne pouvez pas supprimer votre propre compte.".to_string());
    }
    let target = file.users.iter().find(|u| u.id == id).ok_or("Compte introuvable.")?;
    if target.role == Role::Medecin && medecin_count(file) <= 1 {
        return Err("Impossible de supprimer le dernier compte médecin.".to_string());
    }
    file.users.retain(|u| u.id != id);
    Ok(())
}

pub fn change_role(file: &mut UsersFile, id: &str, role: Role, actor_id: &str) -> Result<(), String> {
    if id == actor_id {
        return Err("Vous ne pouvez pas modifier votre propre rôle.".to_string());
    }
    let medecins = medecin_count(file);
    let target = file.users.iter_mut().find(|u| u.id == id).ok_or("Compte introuvable.")?;
    if target.role == Role::Medecin && role != Role::Medecin && medecins <= 1 {
        return Err("Impossible de retirer le rôle du dernier médecin.".to_string());
    }
    target.role = role;
    Ok(())
}

/// Réinitialisation par le médecin : réservée aux comptes assistante.
pub fn reset_password(file: &mut UsersFile, id: &str, new_password: &str, data_key: &[u8; KEY_LEN]) -> Result<(), String> {
    let target = file.users.iter_mut().find(|u| u.id == id).ok_or("Compte introuvable.")?;
    if target.role != Role::Assistant {
        return Err("Seul le mot de passe d'une assistante peut être réinitialisé ici.".to_string());
    }
    validate_password(target.role, new_password)?;
    rewrap(target, new_password, data_key)?;
    target.must_change_password = true;
    Ok(())
}

pub fn change_password(file: &mut UsersFile, id: &str, old: &str, new: &str) -> Result<(), String> {
    let target = file.users.iter_mut().find(|u| u.id == id).ok_or("Compte introuvable.")?;
    let data_key = authenticate(target, old)?.ok_or("Mot de passe actuel incorrect.")?;
    validate_password(target.role, new)?;
    rewrap(target, new, &data_key)?;
    target.must_change_password = false;
    Ok(())
}

// ─── Sauvegarde avant migration ──────────────────────────────────────────────

/// Sous-dossiers de données de l'application, seuls copiés avec les fichiers du dossier
/// racine. Le dossier de données contient aussi le profil WebView2 (`EBWebView`, fichiers
/// verrouillés par l'application en cours) et les journaux : ils ne font pas partie des
/// données et ne doivent jamais bloquer ni alourdir la sauvegarde.
const BACKED_UP_SUBDIRS: &[&str] = &["backups"];

fn copy_dir_filtered(src: &Path, dst: &Path, root: bool) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let target = dst.join(&name);
        if path.is_dir() {
            if root && BACKED_UP_SUBDIRS.iter().any(|d| name == *d) {
                copy_dir_filtered(&path, &target, false)?;
            }
        } else if path.is_file() {
            fs::copy(&path, &target).map_err(|e| format!("copie de {:?} : {e}", name))?;
        }
    }
    Ok(())
}

/// Copie `security_meta.json` et tous les fichiers de données (racine + `backups/`) dans
/// `migration_backups/pre-migration-<date>/`. Les copies restent chiffrées comme l'original.
/// Le profil WebView2, les journaux et les anciennes sauvegardes de migration sont exclus.
pub fn backup_data_dir(data_dir: &Path) -> Result<PathBuf, String> {
    let dest = data_dir.join(MIGRATION_BACKUPS_DIR).join(format!("pre-migration-{}", util::stamp_utc(util::now_secs())));
    let mut dest = dest;
    let mut n = 1;
    while dest.exists() {
        n += 1;
        dest = data_dir.join(MIGRATION_BACKUPS_DIR).join(format!("pre-migration-{}-{n}", util::stamp_utc(util::now_secs())));
    }
    if let Err(e) = copy_dir_filtered(data_dir, &dest, true) {
        let _ = fs::remove_dir_all(&dest); // pas de sauvegarde partielle qui ferait croire à une copie complète
        return Err(e);
    }
    Ok(dest)
}

// ─── Migration ───────────────────────────────────────────────────────────────

pub enum DoctorSeed {
    /// Reprend tel quel le mot de passe maître existant (hash + clé enveloppée).
    LegacyMeta,
    /// Crée le compte médecin avec ce mot de passe (cas de la récupération).
    NewPassword(String),
}

#[derive(Debug, Default)]
pub struct MigrationReport {
    pub already_migrated: bool,
    pub backup_dir: Option<PathBuf>,
    pub imported_users: usize,
}

fn legacy_role(raw: &str) -> Role {
    match raw {
        "Admin" | "Medecin" => Role::Medecin,
        _ => Role::Assistant, // « Assistant » et « User »
    }
}

/// Idempotente : si `users_meta.json` existe déjà, ne fait rien. Ordre des étapes :
/// sauvegarde → écriture de `users_meta.json` → nettoyage. Une interruption avant
/// l'écriture des comptes laisse l'ancien schéma intact ; une interruption après est
/// terminée par `finalize_legacy_cleanup` au prochain déverrouillage du médecin.
/// Une seule migration à la fois : deux déverrouillages simultanés (double déclenchement
/// côté interface) ne doivent pas créer deux sauvegardes ni écrire les comptes deux fois.
static MIGRATION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn migrate_to_users(data_dir: &Path, data_key: &[u8; KEY_LEN], seed: DoctorSeed) -> Result<MigrationReport, String> {
    let _guard = MIGRATION_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if load_users(data_dir)?.is_some() {
        return Ok(MigrationReport { already_migrated: true, ..Default::default() });
    }
    let backup = backup_data_dir(data_dir)?;

    let doctor_info = read_enc_json(data_dir, data_key, DOCTOR_INFO_FILE).ok().flatten();
    let doctor_name = doctor_info
        .as_ref()
        .and_then(|d| d.get("nameFr"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Médecin")
        .to_string();

    let mut file = UsersFile { version: 1, users: Vec::new() };

    match seed {
        DoctorSeed::LegacyMeta => {
            let (_, meta) = read_meta_in(data_dir)?;
            let (Some(salt), Some(wrapped)) = (meta.pin_wrap_salt, meta.wrapped_key_pin) else {
                return Err("Schéma de sécurité ancien : exécutez d'abord la migration vers la clé de récupération.".to_string());
            };
            if meta.pin_hash.is_empty() {
                return Err("Métadonnées de sécurité incomplètes.".to_string());
            }
            file.users.push(UserRecord {
                id: new_id(),
                name: doctor_name,
                role: Role::Medecin,
                pw_hash: meta.pin_hash,
                wrap_salt: salt,
                wrapped_key: wrapped,
                created_at: util::now_iso(),
                must_change_password: false,
            });
        }
        DoctorSeed::NewPassword(pw) => {
            validate_password(Role::Medecin, &pw)?;
            file.users.push(new_record(&doctor_name, Role::Medecin, &pw, data_key, false)?);
        }
    }

    // Anciens collaborateurs (PIN en clair dans la fiche cabinet) → comptes dont le
    // mot de passe actuel est l'ancien PIN, à changer à la première connexion.
    let mut imported = 0;
    if let Some(users) = doctor_info.as_ref().and_then(|d| d.get("users")).and_then(|u| u.as_array()) {
        for u in users {
            let (Some(name), Some(pin)) = (u.get("name").and_then(|v| v.as_str()), u.get("pin").and_then(|v| v.as_str())) else { continue };
            let name = name.trim();
            if name.is_empty() || pin.is_empty() {
                continue;
            }
            let role = legacy_role(u.get("role").and_then(|v| v.as_str()).unwrap_or(""));
            let mut unique = name.to_string();
            let mut i = 2;
            while file.users.iter().any(|x| x.name.to_lowercase() == unique.to_lowercase()) {
                unique = format!("{name} ({i})");
                i += 1;
            }
            file.users.push(new_record(&unique, role, pin, data_key, true)?);
            imported += 1;
        }
    }

    save_users(data_dir, &file)?;
    finalize_legacy_cleanup(data_dir, data_key)?;
    Ok(MigrationReport { already_migrated: false, backup_dir: Some(backup), imported_users: imported })
}

/// Idempotente, exécutée à chaque déverrouillage du médecin une fois les comptes créés :
/// retire de la fiche cabinet les PIN/collaborateurs en clair et du fichier de sécurité
/// l'ancien mot de passe maître (sinon un ancien mot de passe resterait valable).
pub fn finalize_legacy_cleanup(data_dir: &Path, data_key: &[u8; KEY_LEN]) -> Result<(), String> {
    if load_users(data_dir)?.is_none() {
        return Ok(());
    }

    if let Some(mut info) = read_enc_json(data_dir, data_key, DOCTOR_INFO_FILE).ok().flatten() {
        if let Some(obj) = info.as_object_mut() {
            let mut changed = false;
            for k in ["users", "pin", "pinEnabled", "activeUser"] {
                changed |= obj.remove(k).is_some();
            }
            if changed {
                write_enc_json(data_dir, data_key, DOCTOR_INFO_FILE, &info)?;
            }
        }
    }

    if data_dir.join(SECURITY_FILE).exists() {
        let (path, mut meta) = read_meta_in(data_dir)?;
        if !meta.pin_hash.is_empty() || meta.pin_wrap_salt.is_some() || meta.wrapped_key_pin.is_some() || meta.key_salt.is_some() {
            meta.pin_hash = String::new();
            meta.pin_wrap_salt = None;
            meta.wrapped_key_pin = None;
            meta.key_salt = None;
            write_meta(&path, &meta)?;
        }
    }
    Ok(())
}

// ─── État de session ─────────────────────────────────────────────────────────

pub(crate) fn session_of(rec: &UserRecord) -> Session {
    Session { user_id: rec.id.clone(), name: rec.name.clone(), role: rec.role, must_change_password: rec.must_change_password }
}

fn open_session(state: &AppState, dir: &Path, key: [u8; KEY_LEN], session: Session) -> Result<(), String> {
    *state.key.lock().map_err(|e| e.to_string())? = Some(key);
    *state.session.lock().map_err(|e| e.to_string())? = Some(session);
    super::settings::on_session_open(state, dir);
    Ok(())
}

pub(crate) fn data_key_of(state: &AppState) -> Result<[u8; KEY_LEN], String> {
    state.key.lock().map_err(|e| e.to_string())?.ok_or_else(|| "DocEase est verrouillé.".to_string())
}

fn throttle_check(state: &AppState, id: &str) -> Result<Option<u64>, String> {
    Ok(state.throttle.lock().map_err(|e| e.to_string())?.remaining(id, util::now_secs()))
}

fn refused(retry: Option<u64>) -> UnlockResult {
    UnlockResult { ok: false, needs_migration: false, retry_after_secs: retry, session: None }
}

// ─── Commandes ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_profiles<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<Profile>, String> {
    gate(&app, &state, "list_profiles")?;
    let dir = data_dir(&app)?;
    if let Some(file) = load_users(&dir)? {
        return Ok(file.users.iter().map(|u| Profile { id: u.id.clone(), name: u.name.clone(), role: u.role }).collect());
    }
    if dir.join(SECURITY_FILE).exists() {
        // Installation d'avant les comptes : un seul profil, le mot de passe maître.
        return Ok(vec![Profile { id: "legacy".to_string(), name: "Médecin".to_string(), role: Role::Medecin }]);
    }
    Ok(Vec::new())
}

#[tauri::command]
pub fn current_session<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Option<Session>, String> {
    gate(&app, &state, "current_session")
}

#[tauri::command]
pub fn lock<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<(), String> {
    let session = gate(&app, &state, "lock")?;
    if session.is_some() {
        audit::log(&app, session.as_ref(), "lock", "", true);
    }
    *state.key.lock().map_err(|e| e.to_string())? = None;
    *state.session.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn unlock<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, user_id: Option<String>, password: String) -> Result<UnlockResult, String> {
    gate(&app, &state, "unlock")?;
    let dir = data_dir(&app)?;

    let Some(file) = load_users(&dir)? else {
        return unlock_legacy(&app, &state, &dir, &password);
    };

    let id = user_id.ok_or("Choisissez un profil.")?;
    let known = file.users.iter().find(|u| u.id == id);
    let who = known.map(|u| u.name.as_str()).unwrap_or("(profil inconnu)");
    let who_role = known.map(|u| u.role.label());
    if let Some(wait) = throttle_check(&state, &id)? {
        audit::log_as(&app, who, who_role, "login_blocked", &format!("délai {wait} s"), false);
        return Ok(refused(Some(wait)));
    }
    let Some(rec) = known else {
        state.throttle.lock().map_err(|e| e.to_string())?.fail(&id, util::now_secs());
        audit::log_as(&app, who, None, "login_failed", "", false);
        return Ok(refused(None));
    };
    match authenticate(rec, &password)? {
        None => {
            audit::log_as(&app, who, who_role, "login_failed", "", false);
            let mut t = state.throttle.lock().map_err(|e| e.to_string())?;
            t.fail(&id, util::now_secs());
            Ok(refused(t.remaining(&id, util::now_secs())))
        }
        Some(key) => {
            state.throttle.lock().map_err(|e| e.to_string())?.reset(&id);
            if rec.role == Role::Medecin {
                if let Err(e) = finalize_legacy_cleanup(&dir, &key) {
                    log::error!("nettoyage post-migration : {e}");
                }
            }
            let session = session_of(rec);
            open_session(&state, &dir, key, session.clone())?;
            audit::log(&app, Some(&session), "login", "", true);
            Ok(UnlockResult { ok: true, needs_migration: false, retry_after_secs: None, session: Some(session) })
        }
    }
}

/// Installation sans `users_meta.json` : seul le mot de passe maître existe (médecin).
fn unlock_legacy<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &AppState, dir: &Path, password: &str) -> Result<UnlockResult, String> {
    const LEGACY: &str = "legacy";
    if let Some(wait) = throttle_check(state, LEGACY)? {
        return Ok(refused(Some(wait)));
    }
    let (_, meta) = read_meta_in(dir)?;
    if meta.pin_hash.is_empty() || !verify_pin(password, &meta.pin_hash)? {
        let mut t = state.throttle.lock().map_err(|e| e.to_string())?;
        t.fail(LEGACY, util::now_secs());
        audit::log_as(app, "Médecin (ancien accès)", Some("Medecin"), "login_failed", "", false);
        return Ok(refused(t.remaining(LEGACY, util::now_secs())));
    }
    state.throttle.lock().map_err(|e| e.to_string())?.reset(LEGACY);

    let temp_session = Session { user_id: LEGACY.to_string(), name: "Médecin".to_string(), role: Role::Medecin, must_change_password: false };

    if let (Some(salt), Some(wrapped)) = (&meta.pin_wrap_salt, &meta.wrapped_key_pin) {
        let key = unwrap_key(&derive_key_from_pin(password, salt)?, wrapped)?;
        let mut session = temp_session;
        match migrate_to_users(dir, &key, DoctorSeed::LegacyMeta) {
            Ok(report) => {
                if !report.already_migrated {
                    log::info!("migration : {} compte(s) importé(s), sauvegarde dans {:?}", report.imported_users, report.backup_dir);
                }
                if let Some(doc) = load_users(dir)?.and_then(|f| f.users.into_iter().find(|u| u.role == Role::Medecin)) {
                    session = session_of(&doc);
                }
            }
            // Non bloquant : les données sont intactes (sauvegarde faite), on réessaiera
            // au prochain déverrouillage.
            Err(e) => log::error!("migration vers les comptes utilisateurs : {e}"),
        }
        open_session(state, dir, key, session.clone())?;
        audit::log(app, Some(&session), "login", "après migration des comptes", true);
        return Ok(UnlockResult { ok: true, needs_migration: false, retry_after_secs: None, session: Some(session) });
    }

    // Schéma très ancien : clé dérivée directement du mot de passe. La migration
    // (`migrate_to_recovery`) suit immédiatement côté interface.
    let key_salt = meta.key_salt.ok_or("Security metadata is corrupt".to_string())?;
    let legacy_key = derive_key_from_pin(password, &key_salt)?;
    open_session(state, dir, legacy_key, temp_session.clone())?;
    audit::log(app, Some(&temp_session), "login", "ancien schéma", true);
    Ok(UnlockResult { ok: true, needs_migration: true, retry_after_secs: None, session: Some(temp_session) })
}

/// Vérifie le mot de passe d'un compte (ou, avant migration, du mot de passe maître).
pub(crate) fn password_matches(dir: &Path, user_id: &str, password: &str) -> Result<bool, String> {
    match load_users(dir)? {
        Some(file) => match file.users.iter().find(|u| u.id == user_id) {
            Some(rec) => verify_pin(password, &rec.pw_hash),
            None => Ok(false),
        },
        None => {
            let (_, meta) = read_meta_in(dir)?;
            Ok(!meta.pin_hash.is_empty() && verify_pin(password, &meta.pin_hash)?)
        }
    }
}

#[tauri::command]
pub fn verify_password<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, password: String) -> Result<bool, String> {
    let session = require_session(gate(&app, &state, "verify_password")?)?;
    let dir = data_dir(&app)?;
    if let Some(wait) = throttle_check(&state, &session.user_id)? {
        return Err(format!("Trop d'essais. Réessayez dans {wait} s."));
    }
    let ok = password_matches(&dir, &session.user_id, &password)?;
    if !ok {
        audit::log(&app, Some(&session), "password_check_failed", "sortie du mode salle d'attente", false);
    }
    let mut t = state.throttle.lock().map_err(|e| e.to_string())?;
    if ok { t.reset(&session.user_id) } else { t.fail(&session.user_id, util::now_secs()) }
    Ok(ok)
}

#[tauri::command]
pub fn change_own_password<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, old_password: String, new_password: String) -> Result<(), String> {
    let session = require_session(gate(&app, &state, "change_own_password")?)?;
    let dir = data_dir(&app)?;
    let mut file = load_users(&dir)?.ok_or("Comptes non initialisés : verrouillez puis déverrouillez DocEase.")?;
    if let Err(e) = change_password(&mut file, &session.user_id, &old_password, &new_password) {
        audit::log(&app, Some(&session), "password_change_failed", "", false);
        return Err(e);
    }
    save_users(&dir, &file)?;
    audit::log(&app, Some(&session), "password_changed", "", true);
    if let Some(s) = state.session.lock().map_err(|e| e.to_string())?.as_mut() {
        s.must_change_password = false;
    }
    Ok(())
}

#[tauri::command]
pub fn list_users<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<UserSummary>, String> {
    gate(&app, &state, "list_users")?;
    let file = load_users(&data_dir(&app)?)?.unwrap_or_default();
    Ok(file.users.iter().map(summary).collect())
}

#[tauri::command]
pub fn create_user<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, name: String, role: Role, password: String) -> Result<UserSummary, String> {
    let session = gate(&app, &state, "create_user")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let mut file = load_users(&dir)?.ok_or("Comptes non initialisés : verrouillez puis déverrouillez DocEase.")?;
    let rec = add_user(&mut file, &name, role, &password, &key, true)?;
    save_users(&dir, &file)?;
    audit::log(&app, session.as_ref(), "create_user", &format!("{} ({})", rec.name, rec.role.label()), true);
    Ok(summary(&rec))
}

#[tauri::command]
pub fn delete_user<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String) -> Result<(), String> {
    let session = require_session(gate(&app, &state, "delete_user")?)?;
    let dir = data_dir(&app)?;
    let mut file = load_users(&dir)?.ok_or("Comptes non initialisés.")?;
    let target = file.users.iter().find(|u| u.id == id).map(|u| u.name.clone()).unwrap_or_default();
    remove_user(&mut file, &id, &session.user_id)?;
    save_users(&dir, &file)?;
    audit::log(&app, Some(&session), "delete_user", &target, true);
    Ok(())
}

#[tauri::command]
pub fn set_user_role<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, role: Role) -> Result<(), String> {
    let session = require_session(gate(&app, &state, "set_user_role")?)?;
    let dir = data_dir(&app)?;
    let mut file = load_users(&dir)?.ok_or("Comptes non initialisés.")?;
    let target = file.users.iter().find(|u| u.id == id).map(|u| u.name.clone()).unwrap_or_default();
    change_role(&mut file, &id, role, &session.user_id)?;
    save_users(&dir, &file)?;
    audit::log(&app, Some(&session), "set_user_role", &format!("{target} → {}", role.label()), true);
    Ok(())
}

#[tauri::command]
pub fn reset_user_password<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, new_password: String) -> Result<(), String> {
    let session = gate(&app, &state, "reset_user_password")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let mut file = load_users(&dir)?.ok_or("Comptes non initialisés.")?;
    let target = file.users.iter().find(|u| u.id == id).map(|u| u.name.clone()).unwrap_or_default();
    reset_password(&mut file, &id, &new_password, &key)?;
    save_users(&dir, &file)?;
    audit::log(&app, session.as_ref(), "reset_user_password", &target, true);
    state.throttle.lock().map_err(|e| e.to_string())?.reset(&id);
    Ok(())
}

// ─── Configuration initiale et récupération ──────────────────────────────────

/// Première installation : crée le compte médecin et la phrase de récupération.
#[tauri::command]
pub fn setup_pin<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, pin: String, name: Option<String>) -> Result<String, String> {
    gate(&app, &state, "setup_pin")?;
    let dir = data_dir(&app)?;
    if dir.join(SECURITY_FILE).exists() || users_path(&dir).exists() {
        return Err("DocEase est déjà configuré.".to_string());
    }
    validate_password(Role::Medecin, &pin)?;

    let data_key = random_data_key();
    let (entropy, phrase) = generate_recovery_phrase()?;
    let doctor = new_record(name.as_deref().filter(|n| !n.trim().is_empty()).unwrap_or("Médecin"), Role::Medecin, &pin, &data_key, false)?;

    let meta = SecurityMeta { wrapped_key_recovery: Some(wrap_key(&entropy, &data_key)?), ..Default::default() };
    write_meta(&dir.join(SECURITY_FILE), &meta)?;
    save_users(&dir, &UsersFile { version: 1, users: vec![doctor.clone()] })?;

    open_session(&state, &dir, data_key, session_of(&doctor))?;
    audit::log(&app, Some(&session_of(&doctor)), "setup", "création du compte médecin", true);
    Ok(phrase)
}

/// « Mot de passe oublié » du médecin : la phrase de 24 mots rétablit l'accès et
/// définit un nouveau mot de passe pour un compte médecin. Une assistante qui oublie
/// son mot de passe passe par `reset_user_password` (médecin connecté).
#[tauri::command]
pub fn recover_with_phrase<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, phrase: String, new_pin: String, user_id: Option<String>) -> Result<String, String> {
    gate(&app, &state, "recover_with_phrase")?;
    let dir = data_dir(&app)?;
    let (meta_path, mut meta) = read_meta_in(&dir)?;
    let wrapped_recovery = meta.wrapped_key_recovery.clone().ok_or("Aucune clé de récupération n'est configurée pour cette installation.".to_string())?;

    let entropy = parse_recovery_phrase(&phrase)?;
    let data_key = unwrap_key(&entropy, &wrapped_recovery)
        .map_err(|_| "Cette phrase de récupération ne correspond pas à cette installation.".to_string())?;
    validate_password(Role::Medecin, &new_pin)?;

    let session = match load_users(&dir)? {
        None => {
            migrate_to_users(&dir, &data_key, DoctorSeed::NewPassword(new_pin.clone()))?;
            let file = load_users(&dir)?.ok_or("Création des comptes impossible.")?;
            session_of(file.users.iter().find(|u| u.role == Role::Medecin).ok_or("Compte médecin introuvable.")?)
        }
        Some(mut file) => {
            let target = match &user_id {
                Some(id) => file.users.iter_mut().find(|u| &u.id == id),
                None => file.users.iter_mut().find(|u| u.role == Role::Medecin),
            }
            .ok_or("Compte introuvable.")?;
            if target.role != Role::Medecin {
                return Err("La phrase de récupération ne concerne que le compte médecin.".to_string());
            }
            rewrap(target, &new_pin, &data_key)?;
            target.must_change_password = false;
            let session = session_of(target);
            save_users(&dir, &file)?;
            state.throttle.lock().map_err(|e| e.to_string())?.reset(&session.user_id);
            session
        }
    };

    // L'ancienne phrase est retirée : on en génère une nouvelle à afficher.
    let (new_entropy, new_phrase) = generate_recovery_phrase()?;
    meta.wrapped_key_recovery = Some(wrap_key(&new_entropy, &data_key)?);
    write_meta(&meta_path, &meta)?;

    audit::log(&app, Some(&session), "recover_with_phrase", "accès rétabli par la phrase de récupération", true);
    open_session(&state, &dir, data_key, session)?;
    Ok(new_phrase)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; KEY_LEN] {
        random_data_key()
    }

    fn file_with_doctor(k: &[u8; KEY_LEN]) -> (UsersFile, String) {
        let mut f = UsersFile::default();
        let d = add_user(&mut f, "Dr Test", Role::Medecin, "motdepasse-medecin", k, false).unwrap();
        (f, d.id)
    }

    #[test]
    fn each_user_unlocks_the_same_data_key_with_their_own_password() {
        let k = key();
        let (mut f, _) = file_with_doctor(&k);
        let a = add_user(&mut f, "Sara", Role::Assistant, "assistante1", &k, true).unwrap();
        for u in &f.users {
            // le mot de passe de l'autre ne fonctionne pas
            let other = if u.role == Role::Medecin { "assistante1" } else { "motdepasse-medecin" };
            assert!(authenticate(u, other).unwrap().is_none());
        }
        assert_eq!(authenticate(&a, "assistante1").unwrap().unwrap(), k);
        assert_eq!(authenticate(&f.users[0], "motdepasse-medecin").unwrap().unwrap(), k);
    }

    #[test]
    fn password_length_policy() {
        assert!(validate_password(Role::Assistant, "1234567").is_err());
        assert!(validate_password(Role::Assistant, "12345678").is_ok());
        assert!(validate_password(Role::Medecin, "12345678901").is_err());
        assert!(validate_password(Role::Medecin, "123456789012").is_ok());
        assert!(validate_password(Role::Assistant, &"a".repeat(65)).is_err());
        // un compte existant plus court reste déverrouillable (pas de contrôle à l'authentification)
        let k = key();
        let rec = new_record("Vieux", Role::Assistant, "1234", &k, true).unwrap();
        assert_eq!(authenticate(&rec, "1234").unwrap().unwrap(), k);
    }

    #[test]
    fn doctor_reset_changes_assistant_password_only() {
        let k = key();
        let (mut f, did) = file_with_doctor(&k);
        let a = add_user(&mut f, "Sara", Role::Assistant, "assistante1", &k, false).unwrap();
        reset_password(&mut f, &a.id, "nouveau-mdp-1", &k).unwrap();
        let a2 = f.users.iter().find(|u| u.id == a.id).unwrap();
        assert!(a2.must_change_password);
        assert!(authenticate(a2, "assistante1").unwrap().is_none());
        assert_eq!(authenticate(a2, "nouveau-mdp-1").unwrap().unwrap(), k);
        assert!(reset_password(&mut f, &a.id, "court", &k).is_err());
        assert!(reset_password(&mut f, &did, "autre-mdp-medecin", &k).is_err(), "pas de reset d'un médecin");
    }

    #[test]
    fn change_own_password_requires_old_one() {
        let k = key();
        let (mut f, _) = file_with_doctor(&k);
        let a = add_user(&mut f, "Sara", Role::Assistant, "assistante1", &k, true).unwrap();
        assert!(change_password(&mut f, &a.id, "faux", "nouveau-mdp-1").is_err());
        change_password(&mut f, &a.id, "assistante1", "nouveau-mdp-1").unwrap();
        let a2 = f.users.iter().find(|u| u.id == a.id).unwrap();
        assert!(!a2.must_change_password);
        assert_eq!(authenticate(a2, "nouveau-mdp-1").unwrap().unwrap(), k);
    }

    #[test]
    fn last_doctor_and_self_are_protected() {
        let k = key();
        let (mut f, did) = file_with_doctor(&k);
        let a = add_user(&mut f, "Sara", Role::Assistant, "assistante1", &k, false).unwrap();
        assert!(remove_user(&mut f, &did, &did).is_err());
        assert!(remove_user(&mut f, &did, &a.id).is_err(), "dernier médecin");
        assert!(change_role(&mut f, &did, Role::Assistant, &a.id).is_err(), "dernier médecin");
        assert!(change_role(&mut f, &a.id, Role::Medecin, &a.id).is_err(), "pas de changement de son propre rôle");
        change_role(&mut f, &a.id, Role::Medecin, &did).unwrap();
        remove_user(&mut f, &a.id, &did).unwrap();
        assert_eq!(f.users.len(), 1);
    }

    #[test]
    fn duplicate_names_are_rejected() {
        let k = key();
        let (mut f, _) = file_with_doctor(&k);
        assert!(add_user(&mut f, "dr test", Role::Assistant, "assistante1", &k, false).is_err());
        assert!(add_user(&mut f, "  ", Role::Assistant, "assistante1", &k, false).is_err());
    }

    #[test]
    fn throttle_delays_after_three_failures_and_resets() {
        let mut t = Throttle::default();
        t.fail("u", 100);
        t.fail("u", 100);
        assert_eq!(t.remaining("u", 100), None);
        t.fail("u", 100);
        assert_eq!(t.remaining("u", 100), Some(5));
        assert_eq!(t.remaining("u", 106), None);
        t.fail("u", 106);
        assert_eq!(t.remaining("u", 106), Some(10));
        for _ in 0..20 {
            t.fail("u", 1000);
        }
        assert_eq!(t.remaining("u", 1000), Some(300), "plafonné à 5 min");
        t.reset("u");
        assert_eq!(t.remaining("u", 1000), None);
    }

    // ─── Migration (sur un dossier temporaire, jamais sur les vraies données) ────

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("docease-test-{tag}-{}", new_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// Installation « ancien schéma » : mot de passe maître + collaborateurs en clair.
    fn legacy_install(dir: &Path, password: &str) -> [u8; KEY_LEN] {
        let k = random_data_key();
        let salt = random_salt_b64();
        let meta = SecurityMeta {
            pin_hash: hash_pin(password).unwrap(),
            pin_wrap_salt: Some(salt.clone()),
            wrapped_key_pin: Some(wrap_key(&derive_key_from_pin(password, &salt).unwrap(), &k).unwrap()),
            wrapped_key_recovery: Some(wrap_key(&random_data_key(), &k).unwrap()),
            ..Default::default()
        };
        write_meta(&dir.join(SECURITY_FILE), &meta).unwrap();
        let info = serde_json::json!({
            "nameFr": "Docteur Test", "currency": "DH", "pinEnabled": true, "pin": "9999",
            "activeUser": {"id": "x"},
            "users": [
                {"id": "1", "name": "Sara", "pin": "1234", "role": "Assistant"},
                {"id": "2", "name": "Karim", "pin": "4321", "role": "User"},
                {"id": "3", "name": "Dr Bis", "pin": "5555", "role": "Admin"},
                {"id": "4", "name": "sara", "pin": "0000", "role": "Assistant"},
                {"id": "5", "name": "Sans pin", "pin": "", "role": "Assistant"}
            ]
        });
        write_enc_json(dir, &k, DOCTOR_INFO_FILE, &info).unwrap();
        write_enc_json(dir, &k, "meddoc_patients.json", &serde_json::json!([{"id": "p1", "name": "DUPONT Jean", "allergies": "pénicilline"}])).unwrap();
        k
    }

    #[test]
    fn migration_creates_accounts_backs_up_and_is_idempotent() {
        let dir = temp_dir("mig");
        let k = legacy_install(&dir, "ancien-mdp");
        let patients_before = fs::read(dir.join("meddoc_patients.json")).unwrap();

        let report = migrate_to_users(&dir, &k, DoctorSeed::LegacyMeta).unwrap();
        assert!(!report.already_migrated);
        assert_eq!(report.imported_users, 4);
        let backup = report.backup_dir.unwrap();
        assert!(backup.join(SECURITY_FILE).exists() && backup.join("meddoc_patients.json").exists() && backup.join(DOCTOR_INFO_FILE).exists());
        assert_eq!(fs::read(backup.join("meddoc_patients.json")).unwrap(), patients_before);

        let f = load_users(&dir).unwrap().unwrap();
        assert_eq!(f.users.len(), 5);
        // médecin : l'ancien mot de passe maître fonctionne toujours, sans rechiffrer les données
        let doc = f.users.iter().find(|u| u.name == "Docteur Test").unwrap();
        assert_eq!(doc.role, Role::Medecin);
        assert_eq!(authenticate(doc, "ancien-mdp").unwrap().unwrap(), k);
        assert_eq!(fs::read(dir.join("meddoc_patients.json")).unwrap(), patients_before, "données non rechiffrées");
        // collaborateurs : Admin→Medecin, User→Assistant, ancien PIN = mot de passe, changement imposé
        let by = |n: &str| f.users.iter().find(|u| u.name == n).unwrap();
        assert_eq!(by("Karim").role, Role::Assistant);
        assert_eq!(by("Dr Bis").role, Role::Medecin);
        assert!(by("Sara").must_change_password);
        assert_eq!(authenticate(by("Sara"), "1234").unwrap().unwrap(), k);
        assert_eq!(by("sara (2)").role, Role::Assistant, "doublon renommé");
        assert!(f.users.iter().all(|u| u.name != "Sans pin"));

        // nettoyage : plus de PIN en clair ni d'ancien mot de passe maître
        let info = read_enc_json(&dir, &k, DOCTOR_INFO_FILE).unwrap().unwrap();
        for key in ["users", "pin", "pinEnabled", "activeUser"] {
            assert!(info.get(key).is_none(), "{key} doit être retiré");
        }
        assert_eq!(info["nameFr"], "Docteur Test");
        let (_, meta) = read_meta_in(&dir).unwrap();
        assert!(meta.pin_hash.is_empty() && meta.wrapped_key_pin.is_none() && meta.wrapped_key_recovery.is_some());

        // relance : sans dégât
        let users_json = fs::read_to_string(users_path(&dir)).unwrap();
        let again = migrate_to_users(&dir, &k, DoctorSeed::LegacyMeta).unwrap();
        assert!(again.already_migrated && again.backup_dir.is_none());
        finalize_legacy_cleanup(&dir, &k).unwrap();
        assert_eq!(fs::read_to_string(users_path(&dir)).unwrap(), users_json);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn migration_interrupted_after_accounts_is_finished_by_cleanup() {
        let dir = temp_dir("mig-int");
        let k = legacy_install(&dir, "ancien-mdp");
        migrate_to_users(&dir, &k, DoctorSeed::LegacyMeta).unwrap();
        // simule une interruption avant le nettoyage : on remet l'ancienne fiche cabinet
        let info = serde_json::json!({"nameFr": "Docteur Test", "pin": "9999", "users": [{"name": "Fantôme", "pin": "1", "role": "User"}]});
        write_enc_json(&dir, &k, DOCTOR_INFO_FILE, &info).unwrap();
        finalize_legacy_cleanup(&dir, &k).unwrap();
        let info = read_enc_json(&dir, &k, DOCTOR_INFO_FILE).unwrap().unwrap();
        assert!(info.get("pin").is_none() && info.get("users").is_none());
        assert_eq!(load_users(&dir).unwrap().unwrap().users.len(), 5, "pas de ré-import");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backup_copies_data_only_and_never_itself() {
        let dir = temp_dir("bak");
        fs::write(dir.join("a.json"), b"1").unwrap();
        fs::create_dir_all(dir.join("backups")).unwrap();
        fs::write(dir.join("backups/b.json"), b"2").unwrap();
        // profil WebView2 et journaux : exclus (fichiers verrouillés en conditions réelles)
        fs::create_dir_all(dir.join("EBWebView/Default")).unwrap();
        fs::write(dir.join("EBWebView/Default/Cookies"), b"x").unwrap();
        fs::create_dir_all(dir.join("logs")).unwrap();
        fs::write(dir.join("logs/Docease.log"), b"x").unwrap();
        let b1 = backup_data_dir(&dir).unwrap();
        let b2 = backup_data_dir(&dir).unwrap();
        assert_ne!(b1, b2);
        assert!(b1.join("a.json").exists() && b1.join("backups/b.json").exists());
        for b in [&b1, &b2] {
            assert!(!b.join(MIGRATION_BACKUPS_DIR).exists() && !b.join("EBWebView").exists() && !b.join("logs").exists());
        }
        let _ = fs::remove_dir_all(&dir);
    }

    // ── Saisie masquée du mot de passe (sans dépendance : pas de crate `rpassword` ici) ──

    #[cfg(windows)]
    struct HiddenInput {
        handle: isize,
        old_mode: Option<u32>,
    }

    #[cfg(windows)]
    extern "system" {
        fn GetStdHandle(n: u32) -> isize;
        fn GetConsoleMode(h: isize, mode: *mut u32) -> i32;
        fn SetConsoleMode(h: isize, mode: u32) -> i32;
    }

    #[cfg(windows)]
    impl HiddenInput {
        fn new() -> Self {
            const STD_INPUT_HANDLE: u32 = -10i32 as u32;
            const ENABLE_ECHO_INPUT: u32 = 0x0004;
            unsafe {
                let handle = GetStdHandle(STD_INPUT_HANDLE);
                let mut mode = 0u32;
                if GetConsoleMode(handle, &mut mode) != 0 {
                    SetConsoleMode(handle, mode & !ENABLE_ECHO_INPUT);
                    return HiddenInput { handle, old_mode: Some(mode) };
                }
                HiddenInput { handle, old_mode: None }
            }
        }
    }

    #[cfg(windows)]
    impl Drop for HiddenInput {
        fn drop(&mut self) {
            if let Some(m) = self.old_mode {
                unsafe { SetConsoleMode(self.handle, m) };
            }
        }
    }

    #[cfg(not(windows))]
    struct HiddenInput;

    #[cfg(not(windows))]
    impl HiddenInput {
        fn new() -> Self {
            let _ = std::process::Command::new("stty").arg("-echo").status();
            HiddenInput
        }
    }

    #[cfg(not(windows))]
    impl Drop for HiddenInput {
        fn drop(&mut self) {
            let _ = std::process::Command::new("stty").arg("echo").status();
        }
    }

    /// Demande le mot de passe au clavier, sans l'afficher ni le laisser dans l'historique.
    fn prompt_password(prompt: &str) -> String {
        use std::io::{BufRead, Write};
        eprint!("{prompt}");
        let _ = std::io::stderr().flush();
        let mut line = String::new();
        {
            let _hidden = HiddenInput::new();
            std::io::stdin().lock().read_line(&mut line).expect("lecture du mot de passe");
        }
        eprintln!();
        line.trim_end_matches(['\r', '\n']).to_string()
    }

    /// À lancer à la main sur une COPIE des vraies données (jamais le dossier réel) :
    ///   $env:DOCEASE_COPY_DIR = "C:\\chemin\\de\\la\\copie"
    ///   cargo test migration_on_real_data_copy -- --ignored --nocapture
    /// Le mot de passe maître est demandé au clavier (non affiché, absent de l'historique).
    #[test]
    #[ignore]
    fn migration_on_real_data_copy() {
        let dir = PathBuf::from(std::env::var("DOCEASE_COPY_DIR").expect("DOCEASE_COPY_DIR (dossier de la COPIE)"));
        assert!(
            !dir.components().any(|c| c.as_os_str() == "com.docease.desktop"),
            "refus : ceci semble être le dossier réel de l'application, utilisez une copie"
        );
        let password = prompt_password("Mot de passe maître (non affiché) : ");
        let (_, meta) = read_meta_in(&dir).unwrap();
        let (salt, wrapped) = (meta.pin_wrap_salt.clone().expect("copie déjà migrée ?"), meta.wrapped_key_pin.clone().unwrap());
        assert!(verify_pin(&password, &meta.pin_hash).unwrap(), "mot de passe incorrect");
        let k = unwrap_key(&derive_key_from_pin(&password, &salt).unwrap(), &wrapped).unwrap();
        let patients_before = read_enc_json(&dir, &k, "meddoc_patients.json").unwrap();
        let r = migrate_to_users(&dir, &k, DoctorSeed::LegacyMeta).unwrap();
        println!("{r:?}");
        assert_eq!(read_enc_json(&dir, &k, "meddoc_patients.json").unwrap(), patients_before, "données patients inchangées");
        let f = load_users(&dir).unwrap().unwrap();
        println!("{} compte(s) : {:?}", f.users.len(), f.users.iter().map(|u| (&u.name, u.role)).collect::<Vec<_>>());
        let doctor = f.users.iter().find(|u| u.role == Role::Medecin).expect("compte médecin");
        assert_eq!(authenticate(doctor, &password).unwrap().unwrap(), k, "le mot de passe maître ouvre le compte médecin");
        let again = migrate_to_users(&dir, &k, DoctorSeed::LegacyMeta).unwrap();
        assert!(again.already_migrated, "relance sans dégât");
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("docease-atomic-{tag}-{}", util::now_secs()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn atomic_write_replaces_content_and_leaves_no_tmp() {
        let d = tmp_dir("ok");
        let f = d.join("meddoc_patients.json");
        write_atomic(&f, b"v1").unwrap();
        write_atomic(&f, b"v2").unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"v2");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "aucun .tmp résiduel");
    }

    #[test]
    fn interrupted_write_keeps_previous_file_intact() {
        let d = tmp_dir("interrupt");
        let f = d.join("meddoc_patients.json");
        write_atomic(&f, b"ANCIEN").unwrap();
        // Écriture interrompue à mi-parcours (disque plein, plantage simulé par une erreur).
        let r = write_atomic_with(&f, |file| {
            file.write_all(b"NOUV")?;
            Err(std::io::Error::new(std::io::ErrorKind::Other, "interrompu"))
        });
        assert!(r.is_err());
        assert_eq!(fs::read(&f).unwrap(), b"ANCIEN", "l'ancien fichier reste intact");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1, "le .tmp partiel est supprimé");
    }
}
