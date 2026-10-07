//! Panneau « À faire » : éléments d'action calculés et FILTRÉS PAR RÔLE côté Rust.
//!
//! - Une source = un fichier (`backup_source`, `results_source`, `appointments_source`,
//!   `unpaid_source`). Ajouter une source = ajouter un fichier et l'appeler dans `build`.
//! - Le rôle vient de la session Rust. L'assistante ne reçoit que les types de
//!   `ASSISTANT_KINDS` ; les fichiers médicaux ne sont pas lus pour elle (le fichier patients
//!   n'est réduit qu'à l'identité et au consentement WhatsApp, pour les rappels).
//! - Gravité : `critical` (rouge) réservée à la sauvegarde > 48 h / en échec / emplacement
//!   inaccessible et aux alertes de sécurité ; `todo` (orange) ; `info` (gris).
//! - Reporter / Ignorer : état conservé dans `meddoc_notification_state.json`
//!   (préfixe `meddoc_` : inclus dans les sauvegardes). Un élément ignoré réapparaît si son
//!   contenu change (`fingerprint`).
//! - Les éléments calculés côté interface (vaccins en retard) sont acceptés pour le seul
//!   médecin, sous le seul type `vaccines`, et passent par le même filtre d'état.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::access::{gate, require_session, Role};
use super::users::data_key_of;
use super::{data_dir, read_enc_json_in, util, write_enc_json_in, AppState, KEY_LEN};

mod appointments_source;
mod backup_source;
mod reminders_source;
mod results_source;
mod unpaid_source;

pub const STATE_FILE: &str = "meddoc_notification_state.json";
/// Types d'éléments que l'assistante peut voir et traiter : rien de médical.
pub const ASSISTANT_KINDS: &[&str] = &["appointments_changed", "reminders_tomorrow"];
const MEDECIN_EXTRA_KINDS: &[&str] = &["vaccines"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// Stable : type + patient. Sert de clé pour Reporter / Ignorer.
    pub id: String,
    pub kind: String,
    /// `critical` · `todo` · `info`
    pub severity: String,
    #[serde(default)]
    pub patient_id: Option<String>,
    #[serde(default)]
    pub patient_name: Option<String>,
    pub title: String,
    #[serde(default)]
    pub lines: Vec<String>,
    #[serde(default)]
    pub count: usize,
    /// `open_dossier` · `open_appointments` · `open_reminders` · `backup_now` · `open_backup_settings` · `open_billing`
    pub action: String,
    /// Empreinte du contenu : un élément ignoré réapparaît quand elle change.
    pub fingerprint: String,
    /// Faux pour les éléments critiques : ni reportables ni ignorables.
    pub dismissible: bool,
}

pub struct Inputs<'a> {
    pub role: Role,
    pub today: &'a str,
    pub appointments: &'a [Value],
    pub patients: &'a [Value],
    pub results: &'a [Value],
    pub notes: &'a [Value],
    pub backup: Option<&'a super::backup::Status>,
}

fn rank(severity: &str) -> u8 {
    match severity {
        "critical" => 0,
        "todo" => 1,
        _ => 2,
    }
}

/// Construit les éléments autorisés pour `role` (avant filtre d'état).
pub fn build(i: &Inputs) -> Vec<Item> {
    let mut items = Vec::new();
    items.extend(appointments_source::items(i.appointments, i.today));
    // Rappels de demain : médecin et assistante, sans donnée médicale (pour l'assistante, `patients`
    // ne contient que l'identité et le consentement).
    items.extend(reminders_source::items(i.appointments, i.patients, i.today));
    if i.role == Role::Medecin {
        if let Some(b) = i.backup {
            items.extend(backup_source::items(b));
        }
        items.extend(results_source::items(i.results, i.patients));
        items.extend(unpaid_source::items(i.notes));
    }
    // Garde-fou final : jamais un type hors liste pour l'assistante.
    if i.role == Role::Assistant {
        items.retain(|it| ASSISTANT_KINDS.contains(&it.kind.as_str()));
    }
    items
}

/// Éléments calculés par l'interface : médecin seulement, type `vaccines` seulement,
/// gravité forcée (un vaccin en retard n'est jamais critique).
pub fn sanitize_extra(role: Role, extra: Vec<Item>) -> Vec<Item> {
    if role != Role::Medecin {
        return Vec::new();
    }
    extra
        .into_iter()
        .filter(|e| MEDECIN_EXTRA_KINDS.contains(&e.kind.as_str()) && e.id.len() <= 200)
        .map(|mut e| {
            e.severity = "todo".into();
            e.dismissible = true;
            e.action = "open_dossier".into();
            e
        })
        .collect()
}

// ─── État Reporter / Ignorer ─────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Entry {
    pub fp: String,
    /// `dismissed` · `snoozed`
    pub mode: String,
    /// Reporté : réapparaît à partir de cette date (AAAA-MM-JJ).
    #[serde(default)]
    pub until: String,
}

pub fn is_hidden(entry: Option<&Entry>, fingerprint: &str, today: &str) -> bool {
    match entry {
        None => false,
        Some(e) if e.fp != fingerprint => false,
        Some(e) if e.mode == "dismissed" => true,
        Some(e) if e.mode == "snoozed" => today < e.until.as_str(),
        Some(_) => false,
    }
}

pub fn apply_state(items: Vec<Item>, state: &BTreeMap<String, Entry>, today: &str) -> Vec<Item> {
    let mut v: Vec<Item> = items
        .into_iter()
        .filter(|it| !it.dismissible || !is_hidden(state.get(&it.id), &it.fingerprint, today))
        .collect();
    v.sort_by(|a, b| rank(&a.severity).cmp(&rank(&b.severity)).then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())));
    v
}

fn read_state(dir: &Path, key: &[u8; KEY_LEN]) -> Result<BTreeMap<String, Entry>, String> {
    Ok(match read_enc_json_in(dir, key, STATE_FILE)? {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => Default::default(),
    })
}

fn read_list(dir: &Path, key: &[u8; KEY_LEN], file: &str) -> Vec<Value> {
    match read_enc_json_in(dir, key, file) {
        Ok(Some(Value::Array(a))) => a,
        _ => Vec::new(),
    }
}

/// Identifiant accepté pour l'état : court, sans caractère exotique ; l'assistante ne peut
/// agir que sur les types qu'elle voit.
pub fn id_allowed(role: Role, id: &str) -> bool {
    if id.is_empty() || id.len() > 200 || !id.chars().all(|c| c.is_alphanumeric() || ":-_. ".contains(c)) {
        return false;
    }
    match role {
        Role::Medecin => true,
        Role::Assistant => ASSISTANT_KINDS.iter().any(|k| id.starts_with(&format!("{k}:"))),
    }
}

#[tauri::command]
pub fn notifications_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, extra: Option<Vec<Item>>) -> Result<Vec<Item>, String> {
    let session = gate(&app, &state, "notifications_list")?;
    let role = require_session(session)?.role;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let today = util::today_local();

    let appointments = read_list(&dir, &key, "meddoc_appointments.json");
    // Fichiers médicaux et financiers : lus seulement pour le médecin.
    // Pour l'assistante, le fichier patients est réduit à l'identité + consentement dès la lecture.
    let (patients, results, notes, backup) = if role == Role::Medecin {
        (
            read_list(&dir, &key, "meddoc_patients.json"),
            read_list(&dir, &key, "meddoc_medical_results.json"),
            read_list(&dir, &key, "meddoc_honorary_notes.json"),
            super::backup::status(&dir, util::now_secs()).ok(),
        )
    } else {
        let identity: Vec<Value> = read_list(&dir, &key, "meddoc_patients.json").iter().map(super::scoped::identity_only).collect();
        (identity, Vec::new(), Vec::new(), None)
    };
    let mut backup = backup;
    if let Some(b) = backup.as_mut() {
        super::backup::name_altered(b, &patients);
    }
    let mut items = build(&Inputs { role, today: &today, appointments: &appointments, patients: &patients, results: &results, notes: &notes, backup: backup.as_ref() });
    items.extend(sanitize_extra(role, extra.unwrap_or_default()));

    let st = read_state(&dir, &key)?;
    Ok(apply_state(items, &st, &today))
}

/// `action` : `snooze` (reporter à demain), `dismiss` (ignorer), `restore` (annuler).
#[tauri::command]
pub fn notifications_set_state<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, fingerprint: String, action: String) -> Result<(), String> {
    let session = gate(&app, &state, "notifications_set_state")?;
    let role = require_session(session)?.role;
    if !id_allowed(role, &id) || fingerprint.len() > 400 {
        return Err("Accès refusé : cet élément n'est pas autorisé pour votre rôle.".into());
    }
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let mut st = read_state(&dir, &key)?;
    match action.as_str() {
        "snooze" => {
            let tomorrow = util::next_day(&util::today_local()).unwrap_or_default();
            st.insert(id, Entry { fp: fingerprint, mode: "snoozed".into(), until: tomorrow });
        }
        "dismiss" => {
            st.insert(id, Entry { fp: fingerprint, mode: "dismissed".into(), until: String::new() });
        }
        "restore" => {
            st.remove(&id);
        }
        _ => return Err("Action inconnue.".into()),
    }
    // Borne la taille du fichier d'état.
    while st.len() > 2000 {
        let k = st.keys().next().cloned().unwrap();
        st.remove(&k);
    }
    write_enc_json_in(&dir, &key, STATE_FILE, &serde_json::to_value(&st).map_err(|e| e.to_string())?)
}

#[cfg(test)]
mod tests;
