//! Numérotation des notes d'honoraires — compteur Rust, séquentiel et jamais réutilisé.
//!
//! - Format `AAAA-NNNN` (4 chiffres minimum, le nombre s'allonge au-delà de 9999) ; `AAAA` = année du
//!   JOUR D'ÉMISSION (attribution du numéro), pas de la date saisie.
//! - Prochain numéro de l'année Y = max(compteur[Y], plus grand NNNN de l'année Y dans les notes) + 1,
//!   sous verrou. Le compteur est dans `meddoc_invoice_counter.json` (chiffré, sauvegardé, réservé :
//!   ni `load_json` ni `save_json`). Premier lancement après mise à jour = migration non destructive.
//! - Ordre d'écriture : 1) fichier des notes, 2) compteur. Un plantage entre les deux laisse un compteur
//!   en retard, rattrapé par le `max` ; jamais deux notes de même numéro.
//! - Crochet de `save_json` (médecin) : numéro et date imposés par Rust, numéro jamais modifié, note
//!   numérotée jamais supprimée (annulation à la place, voir `cancel`), champs d'annulation posés
//!   uniquement par Rust.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{read_enc_json_in, write_enc_json_in, KEY_LEN};

pub const NOTES_FILE: &str = "meddoc_honorary_notes.json";
pub const COUNTER_FILE: &str = "meddoc_invoice_counter.json";
const CANCEL_FIELDS: [&str; 3] = ["cancelledAt", "cancelledBy", "cancellationReason"];

static LOCK: Mutex<()> = Mutex::new(());

/// Verrou commun à TOUS les chemins qui attribuent un numéro (médecin, assistante, annulation).
pub fn lock() -> MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// Dernier numéro attribué, par année.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
pub struct Counter {
    #[serde(default)]
    pub years: BTreeMap<String, u64>,
}

/// `AAAA-NNNN` bien formé → (année, rang). Un numéro libre ou mal formé n'entre pas dans le `max`.
pub fn parse_number(n: &str) -> Option<(u32, u64)> {
    let (y, s) = n.split_once('-')?;
    if y.len() != 4 || s.len() < 4 || !y.bytes().all(|b| b.is_ascii_digit()) || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((y.parse().ok()?, s.parse().ok()?))
}

pub fn format_number(year: u32, seq: u64) -> String {
    format!("{year}-{seq:04}")
}

pub fn number_of(n: &Value) -> &str {
    n.get("invoiceNumber").and_then(|v| v.as_str()).unwrap_or("").trim()
}

/// Une note qui porte un numéro (même mal formé) : date et numéro figés, suppression interdite.
pub fn has_number(n: &Value) -> bool {
    !number_of(n).is_empty()
}

pub fn is_cancelled(n: &Value) -> bool {
    n.get("cancelledAt").and_then(|v| v.as_str()).map_or(false, |s| !s.trim().is_empty())
}

fn id_of(n: &Value) -> &str {
    n.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

impl Counter {
    pub fn get(&self, year: u32) -> u64 {
        self.years.get(&year.to_string()).copied().unwrap_or(0)
    }

    /// Remonte le compteur au plus grand numéro bien formé de chaque année (réparation / migration).
    pub fn absorb(&mut self, notes: &[Value]) {
        for n in notes {
            if let Some((y, s)) = parse_number(number_of(n)) {
                let e = self.years.entry(y.to_string()).or_insert(0);
                *e = (*e).max(s);
            }
        }
    }

    /// Attribue le numéro suivant de l'année.
    pub fn next(&mut self, year: u32) -> String {
        let e = self.years.entry(year.to_string()).or_insert(0);
        *e += 1;
        format_number(year, *e)
    }

    /// Maximum, par année, des deux compteurs (restauration).
    pub fn max_with(&mut self, other: &Counter) {
        for (y, s) in &other.years {
            let e = self.years.entry(y.clone()).or_insert(0);
            *e = (*e).max(*s);
        }
    }
}

pub fn load_counter(dir: &Path, key: &[u8; KEY_LEN]) -> Counter {
    read_enc_json_in(dir, key, COUNTER_FILE).ok().flatten().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

pub fn save_counter(dir: &Path, key: &[u8; KEY_LEN], c: &Counter) -> Result<(), String> {
    write_enc_json_in(dir, key, COUNTER_FILE, &serde_json::to_value(c).map_err(|e| e.to_string())?)
}

pub fn read_notes(dir: &Path, key: &[u8; KEY_LEN]) -> Vec<Value> {
    match read_enc_json_in(dir, key, NOTES_FILE) {
        Ok(Some(Value::Array(a))) => a,
        _ => Vec::new(),
    }
}

/// Lecture stricte : fichier absent = liste vide ; fichier illisible = erreur (jamais écrasé en silence).
pub fn read_notes_strict(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Vec<Value>, String> {
    match read_enc_json_in(dir, key, NOTES_FILE)? {
        None => Ok(Vec::new()),
        Some(Value::Array(a)) => Ok(a),
        Some(_) => Err("Fichier des notes d'honoraires illisible.".into()),
    }
}

/// Compteur à écrire APRÈS le fichier des notes ; garde le verrou jusque-là.
pub struct Pending {
    _guard: MutexGuard<'static, ()>,
    dir: PathBuf,
    key: [u8; KEY_LEN],
    original: Counter,
    pub counter: Counter,
}

impl Pending {
    pub fn commit(self) -> Result<(), String> {
        if self.counter != self.original {
            save_counter(&self.dir, &self.key, &self.counter)?;
        }
        Ok(())
    }
}

/// Ouvre une section critique : verrou PUIS lecture des notes stockées (jamais l'inverse, sinon deux
/// écritures simultanées se verraient périmées) et compteur réparé à partir d'elles.
/// `strict` : un fichier illisible est une erreur (chemins qui réécrivent la liste à partir de ce qu'ils
/// lisent) ; sinon il est traité comme vide (écriture complète envoyée par le médecin).
pub fn begin(dir: &Path, key: &[u8; KEY_LEN], strict: bool) -> Result<(Pending, Vec<Value>), String> {
    let guard = lock();
    let stored = if strict { read_notes_strict(dir, key)? } else { read_notes(dir, key) };
    let original = load_counter(dir, key);
    let mut counter = original.clone();
    counter.absorb(&stored);
    Ok((Pending { _guard: guard, dir: dir.to_path_buf(), key: *key, original, counter }, stored))
}

fn year_of(today: &str) -> Result<u32, String> {
    today.get(..4).and_then(|y| y.parse().ok()).ok_or_else(|| "Date système invalide.".to_string())
}

/// Statut de paiement CALCULÉ à partir des sommes : jamais saisi. « Réglé » seulement si le montant payé
/// couvre le montant dû.
pub fn status_for(paid: f64, total: f64) -> &'static str {
    if total > 0.0 && paid >= total {
        "PAID"
    } else if paid > 0.0 {
        "PARTIAL"
    } else {
        "UNPAID"
    }
}

/// Montant payé « hérité » d'une note enregistrée avant le calcul du statut (statut PAID sans montant payé).
fn legacy_paid(prior: &Value) -> f64 {
    let total = prior.get("totalAmount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    match prior.get("status").and_then(|v| v.as_str()) {
        Some("PAID") => total,
        Some("PARTIAL") => prior.get("amountPaid").and_then(|v| v.as_f64()).unwrap_or(0.0),
        _ => 0.0,
    }
}

/// Le statut de la note vient du montant payé, jamais du statut envoyé. Une note nouvelle sans montant
/// payé est « Non payé » (même si l'interface annonce « Réglé »). Une note enregistrée avant ce calcul et
/// non modifiée garde son statut octet pour octet.
fn derive_payment(obj: &mut serde_json::Map<String, Value>, prior: Option<&Value>) {
    let total = obj.get("totalAmount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let sent = obj.get("amountPaid").and_then(|v| v.as_f64());
    let unchanged_legacy = sent.is_none() && prior.map_or(false, |p| p.get("totalAmount").and_then(|v| v.as_f64()).unwrap_or(0.0) == total);
    if unchanged_legacy {
        if let Some(st) = prior.and_then(|p| p.get("status")).cloned() {
            obj.insert("status".into(), st);
        }
        return;
    }
    let paid = match sent {
        Some(v) => v.max(0.0),
        None => prior.map_or(0.0, legacy_paid),
    };
    let status = status_for(paid, total);
    if obj.get("status").and_then(|v| v.as_str()) != Some(status) {
        obj.insert("status".into(), Value::String(status.to_string()));
    }
}

/// Règles de numérotation appliquées à une écriture complète de la liste des notes (pur, testable).
/// - note stockée annulée : réimposée telle quelle (figée) ;
/// - note stockée numérotée : numéro et date stockés réimposés, champs d'annulation retirés ;
/// - note stockée sans numéro : numérotée (sa date n'est pas réécrite) ;
/// - note nouvelle : numérotée, date = jour d'émission ;
/// - statut de paiement toujours recalculé à partir du montant payé (`derive_payment`) ;
/// - note numérotée absente de la liste envoyée : conservée (une note numérotée ne se supprime pas).
pub fn apply(stored: &[Value], incoming: Vec<Value>, counter: &mut Counter, today: &str) -> Result<Vec<Value>, String> {
    let year = year_of(today)?;
    let mut out: Vec<Value> = Vec::with_capacity(incoming.len());
    let mut seen: Vec<String> = Vec::new();
    for mut n in incoming {
        let obj = n.as_object_mut().ok_or("Note invalide.")?;
        for f in CANCEL_FIELDS {
            obj.remove(f);
        }
        let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let prev = if id.is_empty() { None } else { stored.iter().find(|s| id_of(s) == id) };
        let prior_for_status = prev.filter(|p| !is_cancelled(p));
        match prev {
            Some(p) if is_cancelled(p) => {
                seen.push(id);
                out.push(p.clone());
                continue;
            }
            Some(p) if has_number(p) => {
                obj.insert("invoiceNumber".into(), Value::String(number_of(p).to_string()));
                match p.get("date") {
                    Some(d) => obj.insert("date".into(), d.clone()),
                    None => obj.remove("date"),
                };
            }
            Some(_) => {
                obj.insert("invoiceNumber".into(), Value::String(counter.next(year)));
            }
            None => {
                obj.insert("invoiceNumber".into(), Value::String(counter.next(year)));
                obj.insert("date".into(), Value::String(today.to_string()));
            }
        }
        derive_payment(obj, prior_for_status);
        if !id.is_empty() {
            seen.push(id);
        }
        out.push(n);
    }
    for p in stored {
        if (has_number(p) || is_cancelled(p)) && !seen.iter().any(|i| i == id_of(p)) {
            out.push(p.clone());
        }
    }
    Ok(out)
}

/// Crochet de `save_json` : renvoie la liste à écrire et le compteur à écrire ensuite (`commit`).
pub fn on_save(dir: &Path, key: &[u8; KEY_LEN], incoming: Value, today: &str) -> Result<(Value, Pending), String> {
    let Value::Array(list) = incoming else { return Err("Format des notes invalide.".into()) };
    let (mut pending, stored) = begin(dir, key, false)?;
    let out = apply(&stored, list, &mut pending.counter, today)?;
    Ok((Value::Array(out), pending))
}

// ─── Annulation ──────────────────────────────────────────────────────────────

const MIN_REASON_CHARS: usize = 3;
const MAX_REASON_CHARS: usize = 200;

/// Annule une note numérotée (médecin seulement) : motif obligatoire, date et auteur posés ici. La note
/// reste dans la liste avec son numéro, figée ; elle ne compte plus dans les montants. Une note jamais
/// numérotée se supprime ; une note qui a des reçus valides ne s'annule qu'après l'annulation des reçus.
pub fn cancel(dir: &Path, key: &[u8; KEY_LEN], role: super::access::Role, id: &str, reason: &str, by: &str, now_iso: &str) -> Result<Value, String> {
    if role != super::access::Role::Medecin {
        return Err("Seul le médecin peut annuler une note d'honoraires.".into());
    }
    let reason: String = reason.chars().filter(|c| !c.is_control()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    let n = reason.chars().count();
    if n < MIN_REASON_CHARS {
        return Err("Le motif de l'annulation est obligatoire.".into());
    }
    if n > MAX_REASON_CHARS {
        return Err(format!("Motif trop long ({MAX_REASON_CHARS} caractères au plus)."));
    }
    let (pending, mut notes) = begin(dir, key, true)?;
    let i = notes.iter().position(|x| id_of(x) == id).ok_or("Note introuvable.")?;
    if !has_number(&notes[i]) {
        return Err("Cette note n'a jamais été numérotée : supprimez-la plutôt que de l'annuler.".into());
    }
    if is_cancelled(&notes[i]) {
        return Err("Cette note est déjà annulée.".into());
    }
    let receipts = super::receipts::load(dir, key)?;
    if receipts.iter().any(|r| r.kind == "receipt" && r.note_id == id && !super::receipts::is_cancelled(&receipts, &r.number)) {
        return Err("Cette note a des reçus valides : annulez d'abord ses reçus.".into());
    }
    let obj = notes[i].as_object_mut().ok_or("Note invalide.")?;
    obj.insert("cancelledAt".into(), Value::String(now_iso.to_string()));
    obj.insert("cancelledBy".into(), Value::String(by.to_string()));
    obj.insert("cancellationReason".into(), Value::String(reason));
    let done = notes[i].clone();
    write_enc_json_in(dir, key, NOTES_FILE, &Value::Array(notes))?;
    pending.commit()?;
    Ok(done)
}

// ─── Contrôle de cohérence (information, rien n'est corrigé) ─────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YearInfo {
    pub year: u32,
    pub last: u64,
    pub count: usize,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckReport {
    /// Faux s'il existe un doublon, un numéro mal formé ou un trou.
    pub clean: bool,
    pub years: Vec<YearInfo>,
    pub duplicates: Vec<String>,
    pub malformed: Vec<String>,
    /// Numéros manquants dans la suite (au plus `MAX_LISTED`), et leur nombre total.
    pub gaps: Vec<String>,
    pub gaps_total: usize,
    /// Notes sans numéro (héritées) : numérotées à leur prochaine écriture.
    pub unnumbered: usize,
    pub cancelled: usize,
}

const MAX_LISTED: usize = 30;

pub fn check(notes: &[Value]) -> CheckReport {
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();
    let mut by_year: BTreeMap<u32, std::collections::BTreeSet<u64>> = BTreeMap::new();
    let (mut malformed, mut unnumbered, mut cancelled) = (Vec::new(), 0usize, 0usize);
    let mut counts: BTreeMap<u32, usize> = BTreeMap::new();
    for n in notes {
        if is_cancelled(n) {
            cancelled += 1;
        }
        let num = number_of(n);
        if num.is_empty() {
            unnumbered += 1;
            continue;
        }
        *seen.entry(num.to_string()).or_insert(0) += 1;
        match parse_number(num) {
            Some((y, s)) => {
                by_year.entry(y).or_default().insert(s);
                *counts.entry(y).or_insert(0) += 1;
            }
            None => malformed.push(num.to_string()),
        }
    }
    let duplicates: Vec<String> = seen.iter().filter(|(_, c)| **c > 1).map(|(k, _)| k.clone()).take(MAX_LISTED).collect();
    let mut gaps = Vec::new();
    let mut gaps_total = 0usize;
    for (y, set) in &by_year {
        let last = set.iter().next_back().copied().unwrap_or(0);
        for s in 1..=last {
            if !set.contains(&s) {
                gaps_total += 1;
                if gaps.len() < MAX_LISTED {
                    gaps.push(format_number(*y, s));
                }
            }
        }
    }
    malformed.truncate(MAX_LISTED);
    let years = by_year.iter().map(|(y, set)| YearInfo { year: *y, last: set.iter().next_back().copied().unwrap_or(0), count: counts.get(y).copied().unwrap_or(0) }).collect();
    CheckReport { clean: duplicates.is_empty() && malformed.is_empty() && gaps_total == 0, years, duplicates, malformed, gaps, gaps_total, unnumbered, cancelled }
}

// ─── Restauration ────────────────────────────────────────────────────────────

/// Le compteur ne recule jamais à la restauration : maximum, par année, du compteur du poste et de celui
/// de la sauvegarde. Un numéro attribué après la sauvegarde reste « brûlé » même si sa note est perdue.
pub fn merge_for_restore(dir: &Path, key: &[u8; KEY_LEN], files: &mut BTreeMap<String, Value>) {
    let mut best = load_counter(dir, key);
    if let Some(restored) = files.get(COUNTER_FILE).and_then(|v| serde_json::from_value::<Counter>(v.clone()).ok()) {
        best.max_with(&restored);
    }
    if let Some(Value::Array(notes)) = files.get(NOTES_FILE) {
        best.absorb(notes);
    }
    if !best.years.is_empty() {
        if let Ok(v) = serde_json::to_value(&best) {
            files.insert(COUNTER_FILE.to_string(), v);
        }
    }
}

// ─── Commandes ───────────────────────────────────────────────────────────────

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::{data_dir, util, AppState};

/// Journal : l'identifiant de la note seulement (jamais le motif, le patient ni le montant).
#[tauri::command]
pub fn honorary_note_cancel<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, reason: String) -> Result<Value, String> {
    let session = require_session(gate(&app, &state, "honorary_note_cancel")?)?;
    let key = data_key_of(&state)?;
    let r = cancel(&data_dir(&app)?, &key, session.role, &id, &reason, &session.name, &util::now_iso());
    audit::log(&app, Some(&session), "note_cancel", if r.is_ok() { &id } else { "refusé" }, r.is_ok());
    r
}

#[tauri::command]
pub fn invoice_numbering_check<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<CheckReport, String> {
    gate(&app, &state, "invoice_numbering_check")?;
    let key = data_key_of(&state)?;
    Ok(check(&read_notes_strict(&data_dir(&app)?, &key)?))
}

#[cfg(test)]
#[path = "numbering_tests.rs"]
mod tests;
