//! Registre d'encaissements — ajout seul, chaîné par empreintes, écrit uniquement par Rust.
//!
//! - Registre `meddoc_payments.json` (chiffré, sauvegardé, réservé dans `access.rs` : ni `load_json` ni
//!   `save_json`). Chaque entrée : type (`payment` · `refund` · `migrated`), date du paiement (jour LOCAL
//!   posé par Rust), montant en centimes (négatif pour un remboursement), mode, auteur, note liée.
//!   Chaque entrée contient l'empreinte SHA-256 de la précédente : une entrée modifiée, retirée ou insérée
//!   est détectée par `verify`.
//! - Le montant payé d'une note (`amountPaid`) et son statut (`PAID` / `PARTIAL` / `UNPAID`) sont CALCULÉS
//!   ici à partir du registre : somme des entrées de la note. Les champs de la note ne sont qu'une copie ;
//!   une interface qui envoie un montant payé plus bas ne retire rien (un remboursement est une écriture
//!   négative, avec motif, jamais une modification).
//! - Migration : chaque note déjà payée ou partielle, sans entrée au registre, reçoit UNE entrée `migrated`
//!   datée de la date de la note, avec le mode existant. Idempotente, déclenchée sous le verrou de
//!   numérotation à chaque écriture de notes (et explicitement à l'ouverture de la session du médecin).
//! - Ordre d'écriture : registre d'abord, notes ensuite. Un plantage entre les deux laisse le registre en
//!   avance ; la prochaine écriture de la note recopie le registre dans la note. Verrou : toujours celui de
//!   `numbering` (pris avant toute lecture), donc aucun interblocage.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::access::Role;
use super::numbering;
use super::{read_enc_json_in, write_enc_json_in, KEY_LEN};

pub const REGISTRY_FILE: &str = "meddoc_payments.json";
pub const MODES: [&str; 4] = ["CASH", "CARD", "TRANSFER", "CHEQUE"];
const MIN_REASON_CHARS: usize = 3;
const MAX_REASON_CHARS: usize = 200;
/// 10 000 000,00 DH (même borne que l'encaissement de l'assistante).
const MAX_CENTS: i64 = 1_000_000_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub seq: u64,
    /// `payment` · `refund` · `migrated`
    pub kind: String,
    /// Jour du paiement (AAAA-MM-JJ, heure locale) ; pour `migrated`, la date de la note.
    pub date: String,
    /// Instant d'écriture (UTC).
    pub at: String,
    pub note_id: String,
    pub patient_id: String,
    /// Négatif pour un remboursement.
    pub amount_cents: i64,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub by: String,
    pub prev_hash: String,
    pub hash: String,
}

// ─── Chaînage ────────────────────────────────────────────────────────────────

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn compute_hash(e: &Entry) -> String {
    let mut c = e.clone();
    c.hash = String::new();
    let body = serde_json::to_vec(&c).unwrap_or_default();
    let mut h = Sha256::new();
    h.update(c.prev_hash.as_bytes());
    h.update(b"|");
    h.update(&body);
    hex(&h.finalize())
}

fn push_sealed(entries: &mut Vec<Entry>, mut e: Entry) {
    e.seq = entries.last().map_or(1, |p| p.seq + 1);
    e.prev_hash = entries.last().map_or(String::new(), |p| p.hash.clone());
    e.hash = compute_hash(&e);
    entries.push(e);
}

pub fn load(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Vec<Entry>, String> {
    match read_enc_json_in(dir, key, REGISTRY_FILE)? {
        None => Ok(Vec::new()),
        Some(v) => serde_json::from_value(v).map_err(|_| "Registre des encaissements illisible.".to_string()),
    }
}

fn save(dir: &Path, key: &[u8; KEY_LEN], entries: &[Entry]) -> Result<(), String> {
    write_enc_json_in(dir, key, REGISTRY_FILE, &serde_json::to_value(entries).map_err(|e| e.to_string())?)
}

// ─── Montants ────────────────────────────────────────────────────────────────

fn cents_of(x: f64) -> i64 {
    if x.is_finite() {
        (x * 100.0).round() as i64
    } else {
        0
    }
}

fn amount_json(cents: i64) -> Value {
    if cents % 100 == 0 {
        json!(cents / 100)
    } else {
        json!(cents as f64 / 100.0)
    }
}

fn id_of(n: &Value) -> &str {
    n.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

fn total_cents(n: &Value) -> i64 {
    cents_of(n.get("totalAmount").and_then(|v| v.as_f64()).unwrap_or(0.0)).max(0)
}

/// Montant payé tel que la note l'annonce : réglée = dû, partielle = montant payé, sinon 0.
pub fn claimed_cents(n: &Value) -> i64 {
    match n.get("status").and_then(|v| v.as_str()) {
        Some("PAID") => total_cents(n),
        Some("PARTIAL") => cents_of(n.get("amountPaid").and_then(|v| v.as_f64()).unwrap_or(0.0)).max(0),
        _ => 0,
    }
}

/// Net encaissé d'une note : somme signée de ses entrées.
pub fn net_cents(entries: &[Entry], note_id: &str) -> i64 {
    entries.iter().filter(|e| e.note_id == note_id).map(|e| e.amount_cents).sum()
}

fn valid_day(d: &str) -> bool {
    d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

fn mode_of(n: &Value) -> String {
    n.get("paymentMode").and_then(|v| v.as_str()).unwrap_or("CASH").to_string()
}

/// Recopie le montant du registre dans la note (copie dérivée) et recalcule son statut.
fn write_back(n: &mut Value, net: i64) {
    let total = total_cents(n);
    let status = numbering::status_for(net as f64 / 100.0, total as f64 / 100.0);
    if let Some(o) = n.as_object_mut() {
        o.insert("amountPaid".into(), amount_json(net));
        o.insert("status".into(), Value::String(status.to_string()));
    }
}

/// Une note dont le montant annoncé diverge du registre doit être réécrite.
fn diverges(n: &Value, net: i64) -> bool {
    claimed_cents(n) != net || n.get("amountPaid").and_then(|v| v.as_f64()).map_or(false, |a| cents_of(a) != net)
}

// ─── Migration ───────────────────────────────────────────────────────────────

pub const MIGRATION_REFUND_REASON: &str = "Annulation antérieure à la migration";

/// Une note annulée n'a jamais d'encaissement « migré ». Si le registre en contient déjà un (migration faite
/// avant cette règle), un remboursement « migré » du même montant est AJOUTÉ (rien n'est supprimé), daté du
/// jour de l'annulation : le net de la note redevient 0. Idempotent. Renvoie le nombre d'écritures ajoutées.
fn neutralize_cancelled(entries: &mut Vec<Entry>, stored: &[Value], today: &str) -> usize {
    let mut added = 0;
    for n in stored {
        let id = id_of(n);
        if id.is_empty() || !numbering::is_cancelled(n) {
            continue;
        }
        let migrated: i64 = entries.iter().filter(|e| e.note_id == id && e.kind == "migrated").map(|e| e.amount_cents).sum();
        let neutralized: i64 = entries.iter().filter(|e| e.note_id == id && e.kind == "refund" && e.by == "migration").map(|e| -e.amount_cents).sum();
        let todo = (migrated - neutralized).min(net_cents(entries, id));
        if todo <= 0 {
            continue;
        }
        let mode = entries.iter().find(|e| e.note_id == id && e.kind == "migrated").map_or_else(|| mode_of(n), |e| e.mode.clone());
        let day = n.get("cancelledAt").and_then(|d| d.as_str()).and_then(|d| d.get(..10)).filter(|d| valid_day(d)).unwrap_or(today).to_string();
        push_sealed(
            entries,
            Entry {
                seq: 0,
                kind: "refund".into(),
                date: day,
                at: super::util::now_iso(),
                note_id: id.to_string(),
                patient_id: n.get("patientId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                amount_cents: -todo,
                mode,
                reason: Some(MIGRATION_REFUND_REASON.into()),
                by: "migration".into(),
                prev_hash: String::new(),
                hash: String::new(),
            },
        );
        added += 1;
    }
    added
}

/// Une entrée `migrated` par note déjà payée / partielle qui n'en a aucune (jamais pour une note annulée),
/// puis neutralisation des encaissements migrés d'une note annulée. Renvoie le nombre d'écritures ajoutées.
fn migrate_into(entries: &mut Vec<Entry>, stored: &[Value], today: &str) -> usize {
    let mut added = 0;
    for n in stored {
        let id = id_of(n);
        if id.is_empty() || numbering::is_cancelled(n) || entries.iter().any(|e| e.note_id == id) {
            continue;
        }
        let paid = claimed_cents(n).min(MAX_CENTS);
        if paid <= 0 {
            continue;
        }
        let date = n.get("date").and_then(|d| d.as_str()).filter(|d| valid_day(d)).unwrap_or(today).to_string();
        push_sealed(
            entries,
            Entry {
                seq: 0,
                kind: "migrated".into(),
                date,
                at: super::util::now_iso(),
                note_id: id.to_string(),
                patient_id: n.get("patientId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                amount_cents: paid,
                mode: mode_of(n),
                reason: None,
                by: "migration".into(),
                prev_hash: String::new(),
                hash: String::new(),
            },
        );
        added += 1;
    }
    added + neutralize_cancelled(entries, stored, today)
}

/// Migration explicite (médecin), à l'ouverture de la session. Renvoie le nombre d'entrées ajoutées.
pub fn migrate(dir: &Path, key: &[u8; KEY_LEN], today: &str) -> Result<usize, String> {
    let (_pending, stored) = numbering::begin(dir, key, true)?;
    let mut entries = load(dir, key)?;
    let added = migrate_into(&mut entries, &stored, today);
    if added > 0 {
        save(dir, key, &entries)?;
    }
    Ok(added)
}

// ─── Rapprochement des notes avec le registre ────────────────────────────────

/// Appelé SOUS le verrou de numérotation, entre le calcul des notes (`numbering::apply`) et leur écriture.
/// - migre les notes stockées sans entrée ;
/// - tout montant payé annoncé au-dessus du registre devient une entrée `payment` datée d'aujourd'hui,
///   avec le mode de la note et l'auteur de la session (plafonné au montant dû) ;
/// - tout montant annoncé en dessous, ou divergent, est ramené au registre (rien ne se retire sans
///   remboursement) ;
/// - une note annulée n'est pas modifiée.
pub fn reconcile(dir: &Path, key: &[u8; KEY_LEN], stored: &[Value], out: &mut [Value], today: &str, by: &str) -> Result<(), String> {
    let mut entries = load(dir, key)?;
    let before = entries.len();
    migrate_into(&mut entries, stored, today);
    for n in out.iter_mut() {
        let id = id_of(n).to_string();
        if id.is_empty() || numbering::is_cancelled(n) {
            continue;
        }
        let ledger = net_cents(&entries, &id);
        let total = total_cents(n);
        let claimed = claimed_cents(n);
        let mut net = ledger;
        if claimed > ledger {
            let target = claimed.min(total);
            if target > ledger {
                let mode = mode_of(n);
                if !MODES.contains(&mode.as_str()) {
                    return Err("Mode de paiement invalide.".into());
                }
                push_sealed(
                    &mut entries,
                    Entry {
                        seq: 0,
                        kind: "payment".into(),
                        date: today.to_string(),
                        at: super::util::now_iso(),
                        note_id: id.clone(),
                        patient_id: n.get("patientId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        amount_cents: target - ledger,
                        mode,
                        reason: None,
                        by: by.to_string(),
                        prev_hash: String::new(),
                        hash: String::new(),
                    },
                );
                net = target;
            }
        }
        if diverges(n, net) {
            write_back(n, net);
        }
    }
    if entries.len() > before {
        save(dir, key, &entries)?;
    }
    Ok(())
}

// ─── Remboursement ───────────────────────────────────────────────────────────

fn clean_reason(reason: &str) -> Result<String, String> {
    let reason: String = reason.chars().filter(|c| !c.is_control()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    let n = reason.chars().count();
    if n < MIN_REASON_CHARS {
        return Err("Le motif du remboursement est obligatoire.".into());
    }
    if n > MAX_REASON_CHARS {
        return Err(format!("Motif trop long ({MAX_REASON_CHARS} caractères au plus)."));
    }
    Ok(reason)
}

/// Remboursement d'un patient (médecin seulement) : entrée NÉGATIVE avec motif obligatoire. Le montant ne
/// peut pas dépasser ce qui a été encaissé sur la note. La note est mise à jour depuis le registre.
pub fn refund(dir: &Path, key: &[u8; KEY_LEN], role: Role, note_id: &str, amount: f64, mode: &str, reason: &str, by: &str, today: &str) -> Result<Entry, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin peut rembourser un patient.".into());
    }
    if !MODES.contains(&mode) {
        return Err("Mode de paiement invalide.".into());
    }
    let cents = super::receipts::to_cents(amount)?;
    let reason = clean_reason(reason)?;
    let (pending, mut notes) = numbering::begin(dir, key, true)?;
    let mut entries = load(dir, key)?;
    migrate_into(&mut entries, &notes, today);
    let i = notes.iter().position(|n| id_of(n) == note_id).ok_or("Note introuvable.")?;
    let net = net_cents(&entries, note_id);
    if cents > net {
        return Err("Le remboursement dépasse le montant encaissé sur cette note.".into());
    }
    push_sealed(
        &mut entries,
        Entry {
            seq: 0,
            kind: "refund".into(),
            date: today.to_string(),
            at: super::util::now_iso(),
            note_id: note_id.to_string(),
            patient_id: notes[i].get("patientId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            amount_cents: -cents,
            mode: mode.to_string(),
            reason: Some(reason),
            by: by.to_string(),
            prev_hash: String::new(),
            hash: String::new(),
        },
    );
    let done = entries.last().cloned().ok_or("Registre vide.")?;
    save(dir, key, &entries)?;
    write_back(&mut notes[i], net - cents);
    write_enc_json_in(dir, key, numbering::NOTES_FILE, &Value::Array(notes))?;
    pending.commit()?;
    Ok(done)
}

/// Avant d'annuler une note (sous le verrou de numérotation, note encore active) : migre ses paiements
/// existants, puis exige un net de 0. `refund_mode` donné : le net est remboursé d'un coup (écriture négative,
/// même motif que l'annulation). Écrit le registre AVANT les notes.
pub fn settle_for_cancel(dir: &Path, key: &[u8; KEY_LEN], notes: &[Value], id: &str, refund_mode: Option<&str>, reason: &str, by: &str, today: &str) -> Result<(), String> {
    let mut entries = load(dir, key)?;
    let before = entries.len();
    migrate_into(&mut entries, notes, today);
    let net = net_cents(&entries, id);
    let mut outcome = Ok(());
    if net > 0 {
        match refund_mode {
            None => {
                outcome = Err(format!("Cette note est encaissée ({},{:02} DH) : remboursez-la d'abord, ou utilisez « Rembourser puis annuler ».", net / 100, net % 100));
            }
            Some(mode) if !MODES.contains(&mode) => outcome = Err("Mode de paiement invalide.".into()),
            Some(mode) => {
                let patient = notes.iter().find(|n| id_of(n) == id).and_then(|n| n.get("patientId")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                push_sealed(
                    &mut entries,
                    Entry {
                        seq: 0,
                        kind: "refund".into(),
                        date: today.to_string(),
                        at: super::util::now_iso(),
                        note_id: id.to_string(),
                        patient_id: patient,
                        amount_cents: -net,
                        mode: mode.to_string(),
                        reason: Some(reason.to_string()),
                        by: by.to_string(),
                        prev_hash: String::new(),
                        hash: String::new(),
                    },
                );
            }
        }
    }
    if entries.len() > before {
        save(dir, key, &entries)?;
    }
    outcome
}

// ─── Restauration ────────────────────────────────────────────────────────────

/// Le registre ne recule jamais à la restauration : si le registre du poste est plus long et que le registre
/// restauré en est un début (mêmes empreintes), on garde celui du poste.
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

// ─── Vérification ────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VerifyReport {
    pub ok: bool,
    pub count: usize,
    pub migrated: usize,
    pub refunds: usize,
    pub net_cents: i64,
    pub problems: Vec<String>,
}

pub fn verify_entries(entries: &[Entry]) -> VerifyReport {
    let mut problems = Vec::new();
    let mut prev = String::new();
    for (i, e) in entries.iter().enumerate() {
        if e.seq != i as u64 + 1 {
            problems.push(format!("Entrée {} : rang inattendu ({}).", i + 1, e.seq));
        }
        if e.prev_hash != prev || compute_hash(e) != e.hash {
            problems.push(format!("Entrée {} : empreinte invalide (registre modifié).", e.seq));
        }
        let sign_ok = match e.kind.as_str() {
            "refund" => e.amount_cents < 0 && e.reason.as_deref().map_or(false, |r| r.chars().count() >= MIN_REASON_CHARS),
            "payment" | "migrated" => e.amount_cents > 0,
            _ => false,
        };
        if !sign_ok {
            problems.push(format!("Entrée {} : type ou montant incohérent.", e.seq));
        }
        prev = e.hash.clone();
    }
    VerifyReport {
        ok: problems.is_empty(),
        count: entries.len(),
        migrated: entries.iter().filter(|e| e.kind == "migrated").count(),
        refunds: entries.iter().filter(|e| e.kind == "refund").count(),
        net_cents: entries.iter().map(|e| e.amount_cents).sum(),
        problems,
    }
}

// ─── Commandes ───────────────────────────────────────────────────────────────

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::{data_dir, util, AppState};

/// Journal d'audit : identifiant de note et montant, jamais le motif ni le patient.
#[tauri::command]
pub fn payment_refund<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, note_id: String, amount: f64, mode: String, reason: String) -> Result<Entry, String> {
    let session = require_session(gate(&app, &state, "payment_refund")?)?;
    let key = data_key_of(&state)?;
    let r = refund(&data_dir(&app)?, &key, session.role, &note_id, amount, &mode, &reason, &session.name, &util::today_local());
    audit::log(&app, Some(&session), "payment_refund", &match &r { Ok(e) => format!("{} {}", note_id, e.amount_cents), Err(_) => "refusé".into() }, r.is_ok());
    r
}

/// Dernières entrées du registre (médecin) ; `limit` plafonné à 500.
#[tauri::command]
pub fn payments_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, limit: Option<usize>) -> Result<Vec<Entry>, String> {
    gate(&app, &state, "payments_list")?;
    let key = data_key_of(&state)?;
    let all = load(&data_dir(&app)?, &key)?;
    let n = limit.unwrap_or(100).min(500);
    Ok(all.into_iter().rev().take(n).collect())
}

#[tauri::command]
pub fn payments_verify<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<VerifyReport, String> {
    gate(&app, &state, "payments_verify")?;
    let key = data_key_of(&state)?;
    Ok(verify_entries(&load(&data_dir(&app)?, &key)?))
}

/// Migration des notes déjà payées (médecin) : lancée à l'ouverture de sa session.
#[tauri::command]
pub fn payments_migrate<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<usize, String> {
    let session = require_session(gate(&app, &state, "payments_migrate")?)?;
    let key = data_key_of(&state)?;
    let r = migrate(&data_dir(&app)?, &key, &util::today_local());
    if let Ok(n) = &r {
        if *n > 0 {
            audit::log(&app, Some(&session), "payments_migrate", &format!("{n} encaissement(s) migré(s)"), true);
        }
    }
    r
}

#[cfg(test)]
#[path = "payments_tests.rs"]
mod tests;
