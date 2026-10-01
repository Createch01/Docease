//! Réglages de sécurité de l'installation : verrouillage automatique après inactivité.
//!
//! Le délai (10 min par défaut, réglable par le médecin) est stocké dans
//! `app_settings.json`. Il est appliqué côté Rust par `access::gate` : une session
//! inactive est fermée (clé de données et rôle effacés) même si l'interface ne le fait
//! pas. L'interface signale son activité réelle avec `session_touch`.
//! Désactivé dans les builds de développement (`debug_assertions`).

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::access::{gate, require_session};
use super::users::write_atomic;
use super::util;
use super::{data_dir, AppState};

pub const SETTINGS_FILE: &str = "app_settings.json";
pub const DEFAULT_MINUTES: u32 = 10;
pub const MAX_MINUTES: u32 = 240;

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    #[serde(default = "default_minutes")]
    inactivity_minutes: u32,
}

fn default_minutes() -> u32 {
    DEFAULT_MINUTES
}

/// 0 = verrouillage automatique désactivé. Fichier absent ou illisible → valeur par défaut.
pub fn load_minutes(dir: &Path) -> u32 {
    fs::read_to_string(dir.join(SETTINGS_FILE))
        .ok()
        .and_then(|c| serde_json::from_str::<SettingsFile>(&c).ok())
        .map(|s| s.inactivity_minutes.min(MAX_MINUTES))
        .unwrap_or(DEFAULT_MINUTES)
}

pub fn validate_minutes(minutes: u32) -> Result<(), String> {
    if minutes > MAX_MINUTES {
        return Err(format!("Le délai ne peut pas dépasser {MAX_MINUTES} minutes."));
    }
    Ok(())
}

pub fn save_minutes(dir: &Path, minutes: u32) -> Result<(), String> {
    validate_minutes(minutes)?;
    let json = serde_json::to_vec_pretty(&SettingsFile { inactivity_minutes: minutes }).map_err(|e| e.to_string())?;
    write_atomic(&dir.join(SETTINGS_FILE), &json)
}

/// Délai réellement appliqué : jamais en développement.
pub fn effective_minutes(configured: u32) -> u32 {
    if cfg!(debug_assertions) { 0 } else { configured }
}

pub fn is_expired(last_activity: u64, now: u64, minutes: u32) -> bool {
    minutes > 0 && now.saturating_sub(last_activity) > u64::from(minutes) * 60
}

/// Chargé à chaque ouverture de session ; l'activité repart de maintenant.
pub fn on_session_open(state: &AppState, dir: &Path) {
    if let Ok(mut m) = state.inactivity_minutes.lock() {
        *m = load_minutes(dir);
    }
    touch(state);
}

pub fn touch(state: &AppState) {
    if let Ok(mut t) = state.last_activity.lock() {
        *t = util::now_secs();
    }
}

/// Ferme la session si le délai est dépassé. Renvoie `true` si elle vient d'être fermée.
pub fn expire_if_idle(state: &AppState) -> bool {
    let minutes = effective_minutes(state.inactivity_minutes.lock().map(|m| *m).unwrap_or(DEFAULT_MINUTES));
    let last = state.last_activity.lock().map(|t| *t).unwrap_or(0);
    if !is_expired(last, util::now_secs(), minutes) {
        return false;
    }
    if let Ok(mut k) = state.key.lock() {
        *k = None;
    }
    if let Ok(mut s) = state.session.lock() {
        *s = None;
    }
    true
}

#[derive(Serialize)]
pub struct SecuritySettings {
    pub inactivity_minutes: u32,
    /// `false` en développement : le délai est enregistré mais pas appliqué.
    pub enforced: bool,
}

#[tauri::command]
pub fn get_security_settings(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<SecuritySettings, String> {
    gate(&app, &state, "get_security_settings")?;
    let minutes = load_minutes(&data_dir(&app)?);
    Ok(SecuritySettings { inactivity_minutes: minutes, enforced: effective_minutes(minutes) > 0 })
}

#[tauri::command]
pub fn set_inactivity_minutes(app: tauri::AppHandle, state: tauri::State<AppState>, minutes: u32) -> Result<(), String> {
    let session = require_session(gate(&app, &state, "set_inactivity_minutes")?)?;
    save_minutes(&data_dir(&app)?, minutes)?;
    *state.inactivity_minutes.lock().map_err(|e| e.to_string())? = minutes;
    super::audit::log(&app, Some(&session), "set_inactivity_minutes", &format!("{minutes} min"), true);
    Ok(())
}

/// Signale une activité réelle de l'utilisateur (clavier, souris) : repousse le verrouillage.
#[tauri::command]
pub fn session_touch(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    gate(&app, &state, "session_touch")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_boundaries() {
        assert!(!is_expired(1_000, 1_000 + 600, 10), "exactement 10 min : pas encore");
        assert!(is_expired(1_000, 1_000 + 601, 10));
        assert!(!is_expired(0, 999_999, 0), "0 = jamais");
        assert!(!is_expired(5_000, 100, 10), "horloge reculée : pas d'expiration");
    }

    #[test]
    fn disabled_in_debug_builds() {
        // Les tests tournent en profil dev : le verrouillage n'y est jamais appliqué.
        assert_eq!(effective_minutes(10), 0);
    }

    #[test]
    fn settings_roundtrip_default_and_bounds() {
        let d = std::env::temp_dir().join(format!("docease-settings-{}", util::now_secs() * 1000 + std::process::id() as u64));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        assert_eq!(load_minutes(&d), DEFAULT_MINUTES, "absent → défaut");
        save_minutes(&d, 30).unwrap();
        assert_eq!(load_minutes(&d), 30);
        save_minutes(&d, 0).unwrap();
        assert_eq!(load_minutes(&d), 0);
        assert!(save_minutes(&d, MAX_MINUTES + 1).is_err());
        fs::write(d.join(SETTINGS_FILE), "n'importe quoi").unwrap();
        assert_eq!(load_minutes(&d), DEFAULT_MINUTES, "corrompu → défaut");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn only_the_medecin_may_change_the_delay() {
        use super::super::access::{check, rule_for, Denial, Role};
        assert_eq!(check(rule_for("set_inactivity_minutes"), Some(Role::Assistant)), Err(Denial::WrongRole));
        assert_eq!(check(rule_for("get_security_settings"), Some(Role::Assistant)), Ok(()));
        assert_eq!(check(rule_for("session_touch"), Some(Role::Assistant)), Ok(()));
        assert_eq!(check(rule_for("session_touch"), None), Err(Denial::NoSession));
    }
}
