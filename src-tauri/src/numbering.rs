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
pub fn begin(dir: &Path, key: &[u8; KEY_LEN]) -> (Pending, Vec<Value>) {
    let guard = lock();
    let stored = read_notes(dir, key);
    let original = load_counter(dir, key);
    let mut counter = original.clone();
    counter.absorb(&stored);
    (Pending { _guard: guard, dir: dir.to_path_buf(), key: *key, original, counter }, stored)
}

fn year_of(today: &str) -> Result<u32, String> {
    today.get(..4).and_then(|y| y.parse().ok()).ok_or_else(|| "Date système invalide.".to_string())
}

/// Règles de numérotation appliquées à une écriture complète de la liste des notes (pur, testable).
/// - note stockée annulée : réimposée telle quelle (figée) ;
/// - note stockée numérotée : numéro et date stockés réimposés, champs d'annulation retirés ;
/// - note stockée sans numéro : numérotée (sa date n'est pas réécrite) ;
/// - note nouvelle : numérotée, date = jour d'émission ;
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
    let (mut pending, stored) = begin(dir, key);
    let out = apply(&stored, list, &mut pending.counter, today)?;
    Ok((Value::Array(out), pending))
}

#[cfg(test)]
#[path = "numbering_tests.rs"]
mod tests;
