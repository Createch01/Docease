//! Journal d'accès simple : qui, quoi, quand.
//!
//! Une ligne JSON par événement dans `audit_log.jsonl` (dossier de données). Il consigne
//! les connexions (réussies ou non), verrouillages, changements de comptes, écritures de
//! l'assistante et refus d'accès — jamais de contenu patient ni de mot de passe. Il est
//! consultable par le médecin seulement (`audit_log_list`).
//!
//! Limites assumées : le fichier n'est pas chiffré (il doit pouvoir enregistrer les
//! échecs de connexion, donc sans clé de données) et n'est pas infalsifiable ; il ne
//! contient aucune donnée de santé. Il est tronqué par rotation au-delà de 1 Mo.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::access::{gate, Session};
use super::util;
use super::{data_dir, AppState};

pub const AUDIT_FILE: &str = "audit_log.jsonl";
const AUDIT_ROTATED: &str = "audit_log.1.jsonl";
const MAX_BYTES: u64 = 1_000_000;
const DEFAULT_LIMIT: usize = 500;
const MAX_LIMIT: usize = 5_000;
const MAX_FIELD: usize = 200;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AuditEntry {
    /// Date UTC ISO 8601.
    pub t: String,
    /// Nom du compte (ou identifiant de profil si le compte est inconnu).
    pub user: String,
    pub role: Option<String>,
    /// Code d'action : login, login_failed, lock, access_denied, create_user…
    pub action: String,
    pub detail: String,
    pub ok: bool,
}

fn clip(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(MAX_FIELD).collect()
}

pub fn make_entry(user: &str, role: Option<&str>, action: &str, detail: &str, ok: bool) -> AuditEntry {
    AuditEntry {
        t: util::now_iso(),
        user: clip(user),
        role: role.map(clip),
        action: clip(action),
        detail: clip(detail),
        ok,
    }
}

pub fn append_entry(dir: &Path, entry: &AuditEntry) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(AUDIT_FILE);
    if fs::metadata(&path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(&path, dir.join(AUDIT_ROTATED));
    }
    let mut line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    line.push('\n');
    let mut f = OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?;
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

/// Les `limit` derniers événements, du plus récent au plus ancien. Les lignes illisibles sont ignorées.
pub fn read_entries(dir: &Path, limit: usize) -> Vec<AuditEntry> {
    let mut all: Vec<AuditEntry> = Vec::new();
    for name in [AUDIT_ROTATED, AUDIT_FILE] {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            all.extend(content.lines().filter_map(|l| serde_json::from_str::<AuditEntry>(l).ok()));
        }
    }
    all.reverse();
    all.truncate(limit.clamp(1, MAX_LIMIT));
    all
}

/// Enregistre un événement ; une erreur d'écriture ne doit jamais bloquer l'action elle-même.
pub fn log<R: tauri::Runtime>(app: &tauri::AppHandle<R>, session: Option<&Session>, action: &str, detail: &str, ok: bool) {
    let (user, role) = match session {
        Some(s) => (s.name.as_str(), Some(s.role.label())),
        None => ("(non connecté)", None),
    };
    log_as(app, user, role, action, detail, ok);
}

pub fn log_as<R: tauri::Runtime>(app: &tauri::AppHandle<R>, user: &str, role: Option<&str>, action: &str, detail: &str, ok: bool) {
    if let Ok(dir) = data_dir(app) {
        if let Err(e) = append_entry(&dir, &make_entry(user, role, action, detail, ok)) {
            log::warn!("journal d'accès : {e}");
        }
    }
}

#[tauri::command]
pub fn audit_log_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, limit: Option<usize>) -> Result<Vec<AuditEntry>, String> {
    gate(&app, &state, "audit_log_list")?;
    Ok(read_entries(&data_dir(&app)?, limit.unwrap_or(DEFAULT_LIMIT)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("docease-audit-{tag}-{}", util::now_secs() * 1000 + std::process::id() as u64));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn entries_are_returned_newest_first_and_limited() {
        let d = temp_dir("order");
        for i in 0..5 {
            append_entry(&d, &make_entry("Sara", Some("Assistant"), "login", &format!("n{i}"), true)).unwrap();
        }
        let e = read_entries(&d, 3);
        assert_eq!(e.iter().map(|x| x.detail.as_str()).collect::<Vec<_>>(), ["n4", "n3", "n2"]);
        assert!(e[0].t.ends_with('Z') && e[0].ok);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn unreadable_lines_are_skipped_and_fields_are_sanitised() {
        let d = temp_dir("bad");
        append_entry(&d, &make_entry("a\nb", None, "x\u{0}y", &"z".repeat(1_000), false)).unwrap();
        let mut f = OpenOptions::new().append(true).open(d.join(AUDIT_FILE)).unwrap();
        f.write_all(b"pas du json\n").unwrap();
        let e = read_entries(&d, 10);
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].user, "ab");
        assert_eq!(e[0].action, "xy");
        assert_eq!(e[0].detail.chars().count(), MAX_FIELD);
        assert!(!e[0].ok);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn log_rotates_instead_of_growing_forever() {
        let d = temp_dir("rot");
        fs::write(d.join(AUDIT_FILE), vec![b'x'; (MAX_BYTES + 1) as usize]).unwrap();
        append_entry(&d, &make_entry("Dr", Some("Medecin"), "login", "", true)).unwrap();
        assert!(d.join(AUDIT_ROTATED).exists());
        assert_eq!(read_entries(&d, 10).len(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn audit_listing_is_medecin_only() {
        use super::super::access::{check, rule_for, Denial, Role};
        assert_eq!(check(rule_for("audit_log_list"), Some(Role::Assistant)), Err(Denial::WrongRole));
        assert_eq!(check(rule_for("audit_log_list"), Some(Role::Medecin)), Ok(()));
    }
}
