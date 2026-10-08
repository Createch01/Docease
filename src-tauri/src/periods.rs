//! Clôture de période — registre en ajout seul, chaîné par empreintes, écrit uniquement par Rust.
//!
//! - Registre `meddoc_periods.json` (chiffré, sauvegardé, réservé : ni `load_json` ni `save_json`).
//!   Entrées `close` / `reopen` (mois `AAAA-MM`, jour posé par Rust, auteur, motif obligatoire pour une
//!   réouverture). L'état d'un mois est la DERNIÈRE écriture le concernant : jamais d'effacement, la
//!   réouverture est elle-même tracée.
//! - Un mois clôturé n'accepte plus aucune écriture datée dans ce mois (encaissement, remboursement,
//!   dépense, annulation de dépense) : refus Rust, message en français (`ensure_open`).
//! - Seul un mois DÉJÀ TERMINÉ peut être clôturé : le mois en cours reste ouvert, la caisse du jour n'est
//!   jamais bloquée. Un paiement reçu aujourd'hui sur une ancienne note reste permis (il est daté d'aujourd'hui).
//! - Médecin seulement (clôture, réouverture, consultation).

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::access::Role;
use super::{read_enc_json_in, write_enc_json_in, KEY_LEN};

pub const REGISTRY_FILE: &str = "meddoc_periods.json";
const MIN_REASON_CHARS: usize = 3;
const MAX_REASON_CHARS: usize = 200;

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub seq: u64,
    /// `close` · `reopen`
    pub kind: String,
    /// `AAAA-MM`
    pub month: String,
    /// Jour de l'écriture (local, posé par Rust).
    pub date: String,
    pub at: String,
    pub by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub prev_hash: String,
    pub hash: String,
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn compute_hash(e: &Entry) -> String {
    let mut c = e.clone();
    c.hash = String::new();
    let mut h = Sha256::new();
    h.update(c.prev_hash.as_bytes());
    h.update(b"|");
    h.update(&serde_json::to_vec(&c).unwrap_or_default());
    hex(&h.finalize())
}

pub fn load(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Vec<Entry>, String> {
    match read_enc_json_in(dir, key, REGISTRY_FILE)? {
        None => Ok(Vec::new()),
        Some(v) => serde_json::from_value(v).map_err(|_| "Registre des clôtures illisible.".to_string()),
    }
}

fn save(dir: &Path, key: &[u8; KEY_LEN], entries: &[Entry]) -> Result<(), String> {
    write_enc_json_in(dir, key, REGISTRY_FILE, &serde_json::to_value(entries).map_err(|e| e.to_string())?)
}

/// Mois actuellement clôturés (dernière écriture = `close`).
pub fn closed_months(entries: &[Entry]) -> Vec<String> {
    let mut state: BTreeMap<&str, bool> = BTreeMap::new();
    for e in entries {
        state.insert(e.month.as_str(), e.kind == "close");
    }
    state.into_iter().filter(|(_, closed)| *closed).map(|(m, _)| m.to_string()).collect()
}

pub fn valid_month(m: &str) -> bool {
    m.len() == 7 && m.as_bytes()[4] == b'-' && m[..4].bytes().all(|b| b.is_ascii_digit()) && matches!(m[5..].parse::<u32>(), Ok(1..=12)) && m[5..].len() == 2
}

pub fn month_label(m: &str) -> String {
    const NAMES: [&str; 12] = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    match (m.get(5..7).and_then(|x| x.parse::<usize>().ok()), m.get(..4)) {
        (Some(i @ 1..=12), Some(y)) => format!("{} {y}", NAMES[i - 1]),
        _ => m.to_string(),
    }
}

/// Refus si `date` (AAAA-MM-JJ) tombe dans un mois clôturé.
pub fn ensure_open(dir: &Path, key: &[u8; KEY_LEN], date: &str) -> Result<(), String> {
    let Some(month) = date.get(..7) else { return Ok(()) };
    if closed_months(&load(dir, key)?).iter().any(|m| m == month) {
        return Err(format!("Le mois de {} est clôturé : aucune écriture ne peut y être datée. Le médecin doit d'abord le rouvrir.", month_label(month)));
    }
    Ok(())
}

fn push(entries: &mut Vec<Entry>, kind: &str, month: &str, today: &str, by: &str, reason: Option<String>) -> Entry {
    let mut e = Entry {
        seq: entries.last().map_or(1, |p| p.seq + 1),
        kind: kind.into(),
        month: month.into(),
        date: today.into(),
        at: super::util::now_iso(),
        by: by.into(),
        reason,
        prev_hash: entries.last().map_or(String::new(), |p| p.hash.clone()),
        hash: String::new(),
    };
    e.hash = compute_hash(&e);
    entries.push(e.clone());
    e
}

pub fn close(dir: &Path, key: &[u8; KEY_LEN], role: Role, month: &str, by: &str, today: &str) -> Result<Entry, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin peut clôturer un mois.".into());
    }
    if !valid_month(month) {
        return Err("Mois invalide.".into());
    }
    if month >= &today[..7] {
        return Err("Seul un mois déjà terminé peut être clôturé.".into());
    }
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut entries = load(dir, key)?;
    if closed_months(&entries).iter().any(|m| m == month) {
        return Err("Ce mois est déjà clôturé.".into());
    }
    let e = push(&mut entries, "close", month, today, by, None);
    save(dir, key, &entries)?;
    Ok(e)
}

pub fn reopen(dir: &Path, key: &[u8; KEY_LEN], role: Role, month: &str, reason: &str, by: &str, today: &str) -> Result<Entry, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin peut rouvrir un mois.".into());
    }
    if !valid_month(month) {
        return Err("Mois invalide.".into());
    }
    let reason: String = reason.chars().filter(|c| !c.is_control()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    let n = reason.chars().count();
    if n < MIN_REASON_CHARS {
        return Err("Le motif de la réouverture est obligatoire.".into());
    }
    if n > MAX_REASON_CHARS {
        return Err(format!("Motif trop long ({MAX_REASON_CHARS} caractères au plus)."));
    }
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut entries = load(dir, key)?;
    if !closed_months(&entries).iter().any(|m| m == month) {
        return Err("Ce mois n'est pas clôturé.".into());
    }
    let e = push(&mut entries, "reopen", month, today, by, Some(reason));
    save(dir, key, &entries)?;
    Ok(e)
}

/// Le registre ne recule jamais à la restauration (même règle que les encaissements).
pub fn merge_for_restore(dir: &Path, key: &[u8; KEY_LEN], files: &mut BTreeMap<String, Value>) {
    let current = load(dir, key).unwrap_or_default();
    let restored: Vec<Entry> = files.get(REGISTRY_FILE).and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    let is_prefix = restored.len() <= current.len() && restored.iter().zip(&current).all(|(a, b)| a.hash == b.hash);
    if current.len() > restored.len() && is_prefix {
        if let Ok(v) = serde_json::to_value(&current) {
            files.insert(REGISTRY_FILE.to_string(), v);
        }
    }
}

pub fn verify_entries(entries: &[Entry]) -> Vec<String> {
    let mut problems = Vec::new();
    let mut prev = String::new();
    for (i, e) in entries.iter().enumerate() {
        if e.seq != i as u64 + 1 || e.prev_hash != prev || compute_hash(e) != e.hash {
            problems.push(format!("Clôture {} : registre modifié.", e.seq));
        }
        prev = e.hash.clone();
    }
    problems
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PeriodsView {
    pub closed: Vec<String>,
    pub entries: Vec<Entry>,
    pub problems: Vec<String>,
}

// ─── Commandes ───────────────────────────────────────────────────────────────

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::{data_dir, util, AppState};

#[tauri::command]
pub fn periods_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<PeriodsView, String> {
    gate(&app, &state, "periods_list")?;
    let key = data_key_of(&state)?;
    let entries = load(&data_dir(&app)?, &key)?;
    Ok(PeriodsView { closed: closed_months(&entries), problems: verify_entries(&entries), entries })
}

#[tauri::command]
pub fn period_close<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, month: String) -> Result<Entry, String> {
    let session = require_session(gate(&app, &state, "period_close")?)?;
    let key = data_key_of(&state)?;
    let r = close(&data_dir(&app)?, &key, session.role, &month, &session.name, &util::today_local());
    audit::log(&app, Some(&session), "period_close", &if r.is_ok() { month.clone() } else { "refusé".into() }, r.is_ok());
    r
}

/// Journal : le mois seulement (jamais le motif).
#[tauri::command]
pub fn period_reopen<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, month: String, reason: String) -> Result<Entry, String> {
    let session = require_session(gate(&app, &state, "period_reopen")?)?;
    let key = data_key_of(&state)?;
    let r = reopen(&data_dir(&app)?, &key, session.role, &month, &reason, &session.name, &util::today_local());
    audit::log(&app, Some(&session), "period_reopen", &if r.is_ok() { month.clone() } else { "refusé".into() }, r.is_ok());
    r
}
