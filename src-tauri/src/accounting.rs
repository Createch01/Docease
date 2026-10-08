//! Agrégats comptables — lecture seule, calculés par Rust (l'interface n'additionne jamais de montants).
//!
//! - Comptabilité de caisse : une recette se compte à la DATE DU PAIEMENT (registre des encaissements,
//!   `payments.rs`), jamais à la date ou au statut de la note. Un remboursement se déduit le jour où il est
//!   écrit.
//! - Montants en centimes entiers (`i64`) ; l'arrondi n'existe qu'à l'affichage.
//! - Les lignes « migré » (reprise des paiements antérieurs au registre) sont comptées et identifiées.
//!   Exception : pour une note annulée, l'encaissement migré à tort et son remboursement de neutralisation
//!   sont écartés du brut et des remboursements (leur net est 0) et affichés à part (`neutralized_cents`).
//! - « Facturé » = notes non annulées par date d'émission. « Reste à encaisser » = Σ (dû − net du registre) des
//!   notes non annulées, toutes dates.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use super::numbering;
use super::payments::{self, Entry, MODES};
use super::{read_enc_json_in, KEY_LEN};

const MAX_BUCKETS: usize = 800;

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModeTotal {
    pub mode: String,
    pub gross_cents: i64,
    pub refunds_cents: i64,
    pub net_cents: i64,
    pub payments_count: usize,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    /// Jour, lundi de la semaine, `AAAA-MM` ou `AAAA` selon la granularité.
    pub key: String,
    pub gross_cents: i64,
    pub refunds_cents: i64,
    pub net_cents: i64,
    pub payments_count: usize,
    pub patients_count: usize,
    pub by_mode: Vec<ModeTotal>,
    /// Notes non annulées émises dans cette tranche.
    pub invoiced_cents: i64,
    pub invoiced_count: usize,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub from: String,
    pub to: String,
    pub granularity: String,
    pub gross_cents: i64,
    pub refunds_cents: i64,
    pub net_cents: i64,
    pub payments_count: usize,
    pub patients_count: usize,
    /// Part du brut qui vient de la reprise des paiements antérieurs au registre (identifiée, comptée).
    pub migrated_cents: i64,
    pub migrated_count: usize,
    /// Encaissements migrés à tort sur des notes annulées, compensés (écartés du brut et des remboursements).
    pub neutralized_cents: i64,
    pub by_mode: Vec<ModeTotal>,
    pub buckets: Vec<Bucket>,
    pub invoiced_cents: i64,
    pub invoiced_count: usize,
    /// Σ (dû − net encaissé) des notes non annulées, toutes dates.
    pub outstanding_cents: i64,
    pub outstanding_notes: usize,
}

// ─── Dates ───────────────────────────────────────────────────────────────────

pub fn parse_day(d: &str) -> Option<i64> {
    let b = d.as_bytes();
    if d.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let (y, m, dd) = (d.get(..4)?.parse::<i64>().ok()?, d.get(5..7)?.parse::<u32>().ok()?, d.get(8..10)?.parse::<u32>().ok()?);
    if !(1..=12).contains(&m) || !(1..=31).contains(&dd) {
        return None;
    }
    let days = super::util::days_from_civil(y, m, dd);
    // Rejette 2026-02-31 : l'aller-retour doit redonner la même date.
    (day_str(days) == d).then_some(days)
}

pub fn day_str(days: i64) -> String {
    super::util::date_utc((days.max(0) as u64) * 86_400)
}

/// Lundi de la semaine du jour `days` (1970-01-01 était un jeudi).
fn monday_of(days: i64) -> i64 {
    days - (days + 3).rem_euclid(7)
}

fn bucket_key(date: &str, gran: &str) -> Option<String> {
    let days = parse_day(date.get(..10)?)?;
    Some(match gran {
        "day" => date[..10].to_string(),
        "week" => day_str(monday_of(days)),
        "month" => date[..7].to_string(),
        _ => date[..4].to_string(),
    })
}

/// Toutes les clés de la période, y compris vides (courbes continues).
fn bucket_keys(from: i64, to: i64, gran: &str) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    match gran {
        "day" | "week" => {
            let step = if gran == "day" { 1 } else { 7 };
            let mut d = if gran == "day" { from } else { monday_of(from) };
            while d <= to {
                keys.push(day_str(d));
                d += step;
                if keys.len() > MAX_BUCKETS {
                    return Err("Période trop longue pour cette granularité.".into());
                }
            }
        }
        _ => {
            let (a, b) = (day_str(from), day_str(to));
            let (mut y, mut m) = (a[..4].parse::<i32>().unwrap_or(0), a[5..7].parse::<u32>().unwrap_or(1));
            let (ey, em) = (b[..4].parse::<i32>().unwrap_or(0), b[5..7].parse::<u32>().unwrap_or(1));
            while (y, m) <= (ey, em) {
                if gran == "month" {
                    keys.push(format!("{y:04}-{m:02}"));
                    m += 1;
                    if m > 12 {
                        m = 1;
                        y += 1;
                    }
                } else {
                    keys.push(format!("{y:04}"));
                    y += 1;
                    m = 1;
                }
                if keys.len() > MAX_BUCKETS {
                    return Err("Période trop longue pour cette granularité.".into());
                }
            }
        }
    }
    Ok(keys)
}

fn check_period(from: &str, to: &str) -> Result<(i64, i64), String> {
    let (f, t) = (parse_day(from).ok_or("Date de début invalide.")?, parse_day(to).ok_or("Date de fin invalide.")?);
    if f > t {
        return Err("La date de début est postérieure à la date de fin.".into());
    }
    Ok((f, t))
}

// ─── Agrégation ──────────────────────────────────────────────────────────────

fn empty_modes() -> Vec<ModeTotal> {
    MODES.iter().map(|m| ModeTotal { mode: m.to_string(), ..Default::default() }).collect()
}

fn add_to_modes(modes: &mut Vec<ModeTotal>, e: &Entry) {
    let i = match modes.iter().position(|m| m.mode == e.mode) {
        Some(i) => i,
        None => {
            modes.push(ModeTotal { mode: e.mode.clone(), ..Default::default() });
            modes.len() - 1
        }
    };
    let t = &mut modes[i];
    if e.amount_cents > 0 {
        t.gross_cents += e.amount_cents;
        t.payments_count += 1;
    } else {
        t.refunds_cents += -e.amount_cents;
    }
    t.net_cents += e.amount_cents;
}

/// Notes dont l'encaissement migré à tort a été compensé : leurs deux lignes sont écartées (net 0).
fn neutralized_notes(entries: &[Entry]) -> BTreeSet<&str> {
    entries.iter().filter(|e| e.kind == "refund" && e.by == "migration").map(|e| e.note_id.as_str()).collect()
}

fn is_neutralization_pair(e: &Entry, neutralized: &BTreeSet<&str>) -> bool {
    neutralized.contains(e.note_id.as_str()) && (e.kind == "migrated" || (e.kind == "refund" && e.by == "migration"))
}

pub fn summarize(entries: &[Entry], notes: &[Value], from: &str, to: &str, gran: &str) -> Result<Summary, String> {
    let (f, t) = check_period(from, to)?;
    if !["day", "week", "month", "year"].contains(&gran) {
        return Err("Granularité inconnue.".into());
    }
    let neutralized = neutralized_notes(entries);
    let mut buckets: BTreeMap<String, (Bucket, BTreeSet<String>)> = BTreeMap::new();
    for k in bucket_keys(f, t, gran)? {
        buckets.insert(k.clone(), (Bucket { key: k, gross_cents: 0, refunds_cents: 0, net_cents: 0, payments_count: 0, patients_count: 0, by_mode: empty_modes(), invoiced_cents: 0, invoiced_count: 0 }, BTreeSet::new()));
    }
    let mut s = Summary {
        from: from.into(),
        to: to.into(),
        granularity: gran.into(),
        gross_cents: 0,
        refunds_cents: 0,
        net_cents: 0,
        payments_count: 0,
        patients_count: 0,
        migrated_cents: 0,
        migrated_count: 0,
        neutralized_cents: 0,
        by_mode: empty_modes(),
        buckets: Vec::new(),
        invoiced_cents: 0,
        invoiced_count: 0,
        outstanding_cents: 0,
        outstanding_notes: 0,
    };
    let mut patients: BTreeSet<&str> = BTreeSet::new();
    for e in entries {
        if e.date.as_str() < from || e.date.as_str() > to {
            continue;
        }
        if is_neutralization_pair(e, &neutralized) {
            if e.kind == "refund" {
                s.neutralized_cents += -e.amount_cents;
            }
            continue;
        }
        add_to_modes(&mut s.by_mode, e);
        if e.amount_cents > 0 {
            s.gross_cents += e.amount_cents;
            s.payments_count += 1;
            patients.insert(e.patient_id.as_str());
            if e.kind == "migrated" {
                s.migrated_cents += e.amount_cents;
                s.migrated_count += 1;
            }
        } else {
            s.refunds_cents += -e.amount_cents;
        }
        s.net_cents += e.amount_cents;
        if let Some(key) = bucket_key(&e.date, gran) {
            if let Some((b, p)) = buckets.get_mut(&key) {
                add_to_modes(&mut b.by_mode, e);
                if e.amount_cents > 0 {
                    b.gross_cents += e.amount_cents;
                    b.payments_count += 1;
                    p.insert(e.patient_id.clone());
                } else {
                    b.refunds_cents += -e.amount_cents;
                }
                b.net_cents += e.amount_cents;
            }
        }
    }
    s.patients_count = patients.len();
    for n in notes {
        if numbering::is_cancelled(n) {
            continue;
        }
        let id = n.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let total = payments::total_cents(n);
        let date = n.get("date").and_then(|v| v.as_str()).unwrap_or("").get(..10).unwrap_or("");
        if date >= from && date <= to {
            s.invoiced_cents += total;
            s.invoiced_count += 1;
            if let Some((b, _)) = bucket_key(date, gran).and_then(|k| buckets.get_mut(&k)) {
                b.invoiced_cents += total;
                b.invoiced_count += 1;
            }
        }
        let due = total - payments::net_cents(entries, id);
        if due > 0 {
            s.outstanding_cents += due;
            s.outstanding_notes += 1;
        }
    }
    s.buckets = buckets.into_values().map(|(mut b, p)| { b.patients_count = p.len(); b }).collect();
    Ok(s)
}

// ─── Journal ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JournalRow {
    pub seq: u64,
    pub date: String,
    /// Heure locale `HH:MM` ; vide pour une reprise (migrée).
    pub time: String,
    pub note_id: String,
    pub note_number: String,
    pub patient_name: String,
    /// `payment` (encaissement, y compris migré) · `refund`
    pub kind: String,
    pub mode: String,
    pub amount_cents: i64,
    pub by: String,
    pub reason: Option<String>,
    pub migrated: bool,
    pub note_cancelled: bool,
    /// Encaissement migré à tort sur une note annulée, ou son remboursement de compensation : visible, hors totaux.
    pub neutralized: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayTotal {
    pub date: String,
    pub gross_cents: i64,
    pub refunds_cents: i64,
    pub net_cents: i64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Journal {
    pub rows: Vec<JournalRow>,
    pub day_totals: Vec<DayTotal>,
    pub mode_totals: Vec<ModeTotal>,
    pub gross_cents: i64,
    pub refunds_cents: i64,
    pub net_cents: i64,
}

fn local_time(at: &str, offset_secs: i64) -> String {
    let (h, m) = match (at.get(11..13).and_then(|x| x.parse::<i64>().ok()), at.get(14..16).and_then(|x| x.parse::<i64>().ok())) {
        (Some(h), Some(m)) => (h, m),
        _ => return String::new(),
    };
    let secs = (h * 3600 + m * 60 + offset_secs).rem_euclid(86_400);
    format!("{:02}:{:02}", secs / 3600, (secs % 3600) / 60)
}

/// `with_names` : le nom du patient n'est donné qu'au médecin.
pub fn journal(entries: &[Entry], notes: &[Value], patients: &[Value], from: &str, to: &str, mode: Option<&str>, kind: Option<&str>, with_names: bool, offset_secs: i64) -> Result<Journal, String> {
    check_period(from, to)?;
    if let Some(m) = mode {
        if !MODES.contains(&m) {
            return Err("Mode de paiement inconnu.".into());
        }
    }
    if let Some(k) = kind {
        if k != "payment" && k != "refund" {
            return Err("Type d'écriture inconnu.".into());
        }
    }
    let neutralized = neutralized_notes(entries);
    let mut rows = Vec::new();
    for e in entries {
        if e.date.as_str() < from || e.date.as_str() > to {
            continue;
        }
        let is_refund = e.amount_cents < 0;
        if mode.map_or(false, |m| m != e.mode) || kind.map_or(false, |k| (k == "refund") != is_refund) {
            continue;
        }
        let note = notes.iter().find(|n| n.get("id").and_then(|v| v.as_str()) == Some(e.note_id.as_str()));
        let name = if with_names {
            patients.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(e.patient_id.as_str())).and_then(|p| p.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string()
        } else {
            String::new()
        };
        rows.push(JournalRow {
            seq: e.seq,
            date: e.date.clone(),
            time: if e.kind == "migrated" || e.by == "migration" { String::new() } else { local_time(&e.at, offset_secs) },
            note_id: e.note_id.clone(),
            note_number: note.map(numbering::number_of).unwrap_or("").to_string(),
            patient_name: name,
            kind: if is_refund { "refund".into() } else { "payment".into() },
            mode: e.mode.clone(),
            amount_cents: e.amount_cents,
            by: e.by.clone(),
            reason: e.reason.clone(),
            migrated: e.kind == "migrated" || e.by == "migration",
            note_cancelled: note.map_or(false, numbering::is_cancelled),
            neutralized: is_neutralization_pair(e, &neutralized),
        });
    }
    rows.sort_by(|a, b| (a.date.as_str(), a.seq).cmp(&(b.date.as_str(), b.seq)));
    let mut days: BTreeMap<String, DayTotal> = BTreeMap::new();
    let mut modes = empty_modes();
    let (mut gross, mut refunds) = (0i64, 0i64);
    for r in rows.iter().filter(|r| !r.neutralized) {
        let d = days.entry(r.date.clone()).or_insert_with(|| DayTotal { date: r.date.clone(), gross_cents: 0, refunds_cents: 0, net_cents: 0 });
        if r.amount_cents > 0 {
            d.gross_cents += r.amount_cents;
            gross += r.amount_cents;
        } else {
            d.refunds_cents += -r.amount_cents;
            refunds += -r.amount_cents;
        }
        d.net_cents += r.amount_cents;
        let pseudo = entries.iter().find(|e| e.seq == r.seq);
        if let Some(e) = pseudo {
            add_to_modes(&mut modes, e);
        }
    }
    Ok(Journal { rows, day_totals: days.into_values().collect(), mode_totals: modes, gross_cents: gross, refunds_cents: refunds, net_cents: gross - refunds })
}

// ─── Accès disque et commandes ───────────────────────────────────────────────

fn read_list(dir: &Path, key: &[u8; KEY_LEN], file: &str) -> Vec<Value> {
    match read_enc_json_in(dir, key, file) {
        Ok(Some(Value::Array(a))) => a,
        _ => Vec::new(),
    }
}

use super::access::{gate, require_session};
use super::users::data_key_of;
use super::{data_dir, util, AppState};

#[tauri::command]
pub fn accounting_summary<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, from: String, to: String, granularity: String) -> Result<Summary, String> {
    gate(&app, &state, "accounting_summary")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    summarize(&payments::load(&dir, &key)?, &numbering::read_notes_strict(&dir, &key)?, &from, &to, &granularity)
}

#[tauri::command]
pub fn accounting_journal<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, from: String, to: String, mode: Option<String>, kind: Option<String>) -> Result<Journal, String> {
    gate(&app, &state, "accounting_journal")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    journal(&payments::load(&dir, &key)?, &numbering::read_notes_strict(&dir, &key)?, &read_list(&dir, &key, "meddoc_patients.json"), &from, &to, mode.as_deref(), kind.as_deref(), true, util::local_offset_secs())
}

/// Écritures du JOUR seulement, sans nom de patient (assistante comprise) : elle ne voit ni historique ni totaux d'autres jours.
#[tauri::command]
pub fn accounting_journal_today<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Journal, String> {
    require_session(gate(&app, &state, "accounting_journal_today")?)?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let today = util::today_local();
    journal(&payments::load(&dir, &key)?, &numbering::read_notes_strict(&dir, &key)?, &[], &today, &today, None, None, false, util::local_offset_secs())
}

#[cfg(test)]
#[path = "accounting_tests.rs"]
mod tests;
