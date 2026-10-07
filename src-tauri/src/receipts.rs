//! Reçus de paiement — registre immuable, numérotation attribuée par Rust.
//!
//! - Registre `meddoc_receipts.json` (chiffré, inclus dans la sauvegarde) : liste en AJOUT SEUL. Il
//!   n'est écrit que par les commandes de ce module (réservé dans `access.rs` : ni `load_json` ni
//!   `save_json`). Chaque entrée contient l'empreinte SHA-256 de la précédente : une entrée modifiée,
//!   retirée ou insérée est détectée par `verify`.
//! - Numéro `REC-AAAA-NNNNN` : année et numéro viennent de Rust (horloge locale, compteur), jamais de
//!   l'interface. Prochain numéro = max(compteur, plus grand numéro de l'année dans le registre) + 1,
//!   sous verrou. Ordre d'écriture : registre d'abord, compteur ensuite (un plantage laisse un compteur
//!   en retard, rattrapé par le `max`).
//! - Aucun champ libre, aucun diagnostic : la structure `Entry` est la liste blanche. Le montant est un
//!   entier de centimes ; le montant en lettres est produit ici (`amount_in_words`).

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::access::Role;
use super::{read_enc_json_in, write_enc_json_in, KEY_LEN};

pub const REGISTRY_FILE: &str = "meddoc_receipts.json";
pub const COUNTER_FILE: &str = "meddoc_receipt_counter.json";
const NOTES_FILE: &str = "meddoc_honorary_notes.json";
const PATIENTS_FILE: &str = "meddoc_patients.json";
const DOCTOR_INFO_FILE: &str = "meddoc_doctor_info.json";
/// 10 000 000,00 DH (même borne que l'encaissement, `scoped::MAX_AMOUNT`).
pub const MAX_CENTS: i64 = 1_000_000_000;
pub const DEFAULT_LABEL: &str = "Consultation";
const MAX_LABEL_CHARS: usize = 200;
const MAX_LEGAL_CHARS: usize = 120;
const MAX_VAT_CHARS: usize = 300;

static LOCK: Mutex<()> = Mutex::new(());

pub fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

pub struct Actor {
    pub name: String,
    pub role: Role,
}

/// Mentions légales du cabinet, figées sur le reçu à l'émission. Toutes optionnelles : rien n'est
/// affiché ni inventé quand elles ne sont pas renseignées.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Legal {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inpe: Option<String>,
    #[serde(default, rename = "if", skip_serializing_if = "Option::is_none")]
    pub tax_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub professional_tax: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order_number: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vat_note: Option<String>,
}

/// Entrée du registre. `kind` : `receipt` · `cancellation` · `duplicate`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub kind: String,
    /// Reçu / reçu d'annulation : son numéro. Duplicata : numéro du reçu réimprimé.
    pub number: String,
    /// Rang dans l'année (0 pour un duplicata, qui n'attribue aucun numéro).
    pub seq: u64,
    pub year: u32,
    pub date: String,
    pub issued_at: String,
    pub issued_by: String,
    pub note_id: String,
    pub patient_id: String,
    pub patient_name: String,
    /// Négatif pour un reçu d'annulation.
    pub amount_cents: i64,
    pub amount_in_words: String,
    pub payment_mode: String,
    pub label: String,
    pub balance_due_cents: i64,
    #[serde(default)]
    pub legal: Legal,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancels_number: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Duplicata : rang (1, 2, …).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<u32>,
    pub prev_hash: String,
    pub hash: String,
}

pub const ENTRY_FIELDS: &[&str] = &[
    "kind", "number", "seq", "year", "date", "issuedAt", "issuedBy", "noteId", "patientId", "patientName", "amountCents",
    "amountInWords", "paymentMode", "label", "balanceDueCents", "legal", "cancelsNumber", "reason", "rank", "prevHash", "hash",
];

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
struct Counter {
    year: u32,
    last: u64,
}

// ─── Montants ────────────────────────────────────────────────────────────────

/// Montant en dirhams (`f64` de la note) → centimes. Refuse ≤ 0, > borne, et plus de 2 décimales.
pub fn to_cents(amount: f64) -> Result<i64, String> {
    if !amount.is_finite() || amount <= 0.0 {
        return Err("Montant invalide.".into());
    }
    let scaled = amount * 100.0;
    let cents = scaled.round();
    if (scaled - cents).abs() > 1e-6 {
        return Err("Montant invalide : deux décimales au plus.".into());
    }
    if cents as i64 > MAX_CENTS {
        return Err("Montant trop élevé.".into());
    }
    Ok(cents as i64)
}

const UNITS: [&str; 17] = [
    "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
];
const TENS: [&str; 7] = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/// 0..=99. Traits d'union dans les nombres composés ; « et » entre traits d'union (21, 31… 71).
/// `terminal` : « quatre-vingts » prend son s seulement s'il termine le nombre.
fn below_100(n: u64, terminal: bool) -> String {
    match n {
        0..=16 => UNITS[n as usize].to_string(),
        17..=19 => format!("dix-{}", UNITS[(n - 10) as usize]),
        20..=69 => {
            let (t, u) = (n / 10, n % 10);
            match u {
                0 => TENS[t as usize].to_string(),
                1 => format!("{}-et-un", TENS[t as usize]),
                _ => format!("{}-{}", TENS[t as usize], UNITS[u as usize]),
            }
        }
        70..=79 => match n - 60 {
            11 => "soixante-et-onze".to_string(),
            r => format!("soixante-{}", below_100(r, false)),
        },
        80 => if terminal { "quatre-vingts".into() } else { "quatre-vingt".into() },
        _ => format!("quatre-vingt-{}", below_100(n - 80, false)), // 81..=99 (91 → onze, sans « et »)
    }
}

/// 0..=999. « cents » prend son s seulement s'il termine le nombre.
fn below_1000(n: u64, terminal: bool) -> String {
    let (h, r) = (n / 100, n % 100);
    if h == 0 {
        return below_100(r, terminal);
    }
    let mut out = if h == 1 { "cent".to_string() } else { format!("{} cent", UNITS[h as usize]) };
    if r == 0 {
        if h > 1 && terminal {
            out.push('s');
        }
    } else {
        out.push(' ');
        out.push_str(&below_100(r, terminal));
    }
    out
}

/// 0..=999 999 999 en toutes lettres.
pub fn number_in_words(n: u64) -> String {
    if n == 0 {
        return "zéro".into();
    }
    let mut parts: Vec<String> = Vec::new();
    let (millions, rest) = (n / 1_000_000, n % 1_000_000);
    let (thousands, units) = (rest / 1000, rest % 1000);
    if millions > 0 {
        parts.push(format!("{} million{}", below_1000(millions, false), if millions > 1 { "s" } else { "" }));
    }
    if thousands > 0 {
        parts.push(if thousands == 1 { "mille".into() } else { format!("{} mille", below_1000(thousands, false)) });
    }
    if units > 0 {
        parts.push(below_1000(units, true));
    }
    parts.join(" ")
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    c.next().map_or_else(String::new, |f| f.to_uppercase().collect::<String>() + c.as_str())
}

/// « Deux cent cinquante dirhams et cinquante centimes ». Négatif : « Moins … ».
pub fn amount_in_words(cents: i64) -> String {
    let abs = cents.unsigned_abs();
    let (dh, ct) = (abs / 100, abs % 100);
    let mut out = format!("{} {}", number_in_words(dh), if dh > 1 && dh % 1_000_000 == 0 { "de dirhams" } else if dh > 1 { "dirhams" } else { "dirham" });
    if ct > 0 {
        out.push_str(&format!(" et {} centime{}", number_in_words(ct), if ct > 1 { "s" } else { "" }));
    }
    if cents < 0 {
        out = format!("moins {out}");
    }
    capitalize(&out)
}

// ─── Chaînage ────────────────────────────────────────────────────────────────

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

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Ajoute l'empreinte (à appeler une fois tous les champs renseignés).
pub fn seal(mut e: Entry, prev: &[Entry]) -> Entry {
    e.prev_hash = prev.last().map_or(String::new(), |p| p.hash.clone());
    e.hash = compute_hash(&e);
    e
}

// ─── Lecture / écriture du registre ──────────────────────────────────────────

pub fn load(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Vec<Entry>, String> {
    match read_enc_json_in(dir, key, REGISTRY_FILE)? {
        None => Ok(Vec::new()),
        Some(v) => serde_json::from_value(v).map_err(|_| "Registre des reçus illisible.".to_string()),
    }
}

fn save(dir: &Path, key: &[u8; KEY_LEN], entries: &[Entry]) -> Result<(), String> {
    write_enc_json_in(dir, key, REGISTRY_FILE, &serde_json::to_value(entries).map_err(|e| e.to_string())?)
}

fn load_counter(dir: &Path, key: &[u8; KEY_LEN]) -> Counter {
    read_enc_json_in(dir, key, COUNTER_FILE).ok().flatten().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

fn save_counter(dir: &Path, key: &[u8; KEY_LEN], c: &Counter) -> Result<(), String> {
    write_enc_json_in(dir, key, COUNTER_FILE, &serde_json::to_value(c).map_err(|e| e.to_string())?)
}

/// Dernier numéro attribué pour `year` : max(compteur, registre).
fn last_seq(entries: &[Entry], counter: &Counter, year: u32) -> u64 {
    let in_registry = entries.iter().filter(|e| e.kind != "duplicate" && e.year == year).map(|e| e.seq).max().unwrap_or(0);
    in_registry.max(if counter.year == year { counter.last } else { 0 })
}

pub fn format_number(year: u32, seq: u64) -> String {
    format!("REC-{year}-{seq:05}")
}

/// Date du dernier reçu / reçu d'annulation (une horloge en arrière est refusée).
fn last_date(entries: &[Entry]) -> Option<&str> {
    entries.iter().rev().find(|e| e.kind != "duplicate").map(|e| e.date.as_str())
}

/// Attribue le prochain numéro et ajoute `build(number, seq, year)` au registre. Sous verrou.
/// Registre d'abord, compteur ensuite.
pub fn append_numbered(dir: &Path, key: &[u8; KEY_LEN], today: &str, build: impl FnOnce(&[Entry], String, u64, u32) -> Result<Entry, String>) -> Result<Entry, String> {
    let mut entries = load(dir, key)?;
    let year: u32 = today.get(..4).and_then(|y| y.parse().ok()).ok_or("Date système invalide.")?;
    if let Some(prev) = last_date(&entries) {
        if today < prev {
            return Err("La date du système est antérieure au dernier reçu émis : corrigez l'horloge avant d'émettre un reçu.".into());
        }
    }
    let counter = load_counter(dir, key);
    let seq = last_seq(&entries, &counter, year) + 1;
    let number = format_number(year, seq);
    let entry = build(&entries, number, seq, year)?;
    let entry = seal(entry, &entries);
    entries.push(entry.clone());
    save(dir, key, &entries)?;
    save_counter(dir, key, &Counter { year, last: seq })?;
    Ok(entry)
}

// ─── Données de la note ──────────────────────────────────────────────────────

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

fn read_list(dir: &Path, key: &[u8; KEY_LEN], file: &str) -> Vec<Value> {
    match read_enc_json_in(dir, key, file) {
        Ok(Some(Value::Array(a))) => a,
        _ => Vec::new(),
    }
}

fn clean(v: Option<&Value>, max: usize) -> Option<String> {
    let t: String = v?.as_str()?.chars().filter(|c| !c.is_control()).collect();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    (!t.is_empty()).then(|| t.chars().take(max).collect())
}

/// Mentions légales saisies dans Paramètres › Cabinet (champs `legal*` de la fiche cabinet).
pub fn legal_from_info(info: &Value) -> Legal {
    Legal {
        inpe: clean(info.get("legalInpe"), MAX_LEGAL_CHARS),
        tax_id: clean(info.get("legalIf"), MAX_LEGAL_CHARS),
        ice: clean(info.get("legalIce"), MAX_LEGAL_CHARS),
        professional_tax: clean(info.get("legalTp"), MAX_LEGAL_CHARS),
        order_number: clean(info.get("legalOrder"), MAX_LEGAL_CHARS),
        vat_note: clean(info.get("legalVatNote"), MAX_VAT_CHARS),
    }
}

fn note_paid_total(note: &Value) -> (f64, f64) {
    let total = note.get("totalAmount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let paid = match s(note, "status") {
        "PAID" => total,
        "PARTIAL" => note.get("amountPaid").and_then(|v| v.as_f64()).unwrap_or(0.0),
        _ => 0.0,
    };
    (total, paid)
}

/// Libellé de la prestation : « Consultation » (défaut) ou, sur demande du médecin, les noms des
/// prestations cochées de la note. Jamais un texte venant d'une consultation ou d'une ordonnance.
fn label_for(note: &Value, detail: bool) -> String {
    if !detail {
        return DEFAULT_LABEL.into();
    }
    let names: Vec<String> = note
        .get("services")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter(|x| x.get("checked").and_then(|c| c.as_bool()).unwrap_or(true)).filter_map(|x| clean(x.get("name"), 80)).collect())
        .unwrap_or_default();
    if names.is_empty() {
        return DEFAULT_LABEL.into();
    }
    names.join(", ").chars().take(MAX_LABEL_CHARS).collect()
}

/// Reçus valides = reçus non annulés par un reçu d'annulation.
pub fn is_cancelled(entries: &[Entry], number: &str) -> bool {
    entries.iter().any(|e| e.kind == "cancellation" && e.cancels_number.as_deref() == Some(number))
}

fn covered_cents(entries: &[Entry], note_id: &str) -> i64 {
    entries.iter().filter(|e| e.kind == "receipt" && e.note_id == note_id && !is_cancelled(entries, &e.number)).map(|e| e.amount_cents).sum()
}

// ─── Émission ────────────────────────────────────────────────────────────────

/// Émet le reçu du versement non encore couvert par un reçu valide.
/// L'assistante : notes du jour seulement, libellé par défaut seulement.
pub fn issue(dir: &Path, key: &[u8; KEY_LEN], note_id: &str, detail: bool, who: &Actor, now_iso: &str, today: &str) -> Result<Entry, String> {
    let _g = lock();
    let notes = read_list(dir, key, NOTES_FILE);
    let note = notes.iter().find(|n| s(n, "id") == note_id).ok_or("Encaissement introuvable.")?;
    if who.role == Role::Assistant {
        if s(note, "date") != today {
            return Err("Seuls les reçus des encaissements du jour peuvent être émis.".into());
        }
        if detail {
            return Err("Le détail des actes est réservé au médecin.".into());
        }
    }
    let patient_id = s(note, "patientId");
    let patients = read_list(dir, key, PATIENTS_FILE);
    let patient = patients.iter().find(|p| s(p, "id") == patient_id).ok_or("Patient introuvable.")?;
    let (total, paid) = note_paid_total(note);
    if paid <= 0.0 {
        return Err("Aucun versement à reçuer pour cette note.".into());
    }
    let paid_cents = to_cents(paid)?;
    let total_cents = to_cents(total.max(paid))?;
    let label = label_for(note, detail);
    let mode = s(note, "paymentMode").to_string();
    let legal = read_enc_json_in(dir, key, DOCTOR_INFO_FILE).ok().flatten().map(|i| legal_from_info(&i)).unwrap_or_default();
    let patient_name = s(patient, "name").to_string();
    let (issued_by, date) = (who.name.clone(), today.to_string());
    let (note_id, patient_id, now) = (note_id.to_string(), patient_id.to_string(), now_iso.to_string());
    append_numbered(dir, key, today, move |entries, number, seq, year| {
        let amount = paid_cents - covered_cents(entries, &note_id);
        if amount <= 0 {
            return Err("Aucun versement à reçuer pour cette note : tous les paiements ont déjà un reçu.".into());
        }
        Ok(Entry {
            kind: "receipt".into(),
            number,
            seq,
            year,
            date,
            issued_at: now,
            issued_by,
            note_id,
            patient_id,
            patient_name,
            amount_cents: amount,
            amount_in_words: amount_in_words(amount),
            payment_mode: mode,
            label,
            balance_due_cents: (total_cents - paid_cents).max(0),
            legal,
            cancels_number: None,
            reason: None,
            rank: None,
            prev_hash: String::new(),
            hash: String::new(),
        })
    })
}

// ─── Vérification ────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VerifyReport {
    pub ok: bool,
    pub count: usize,
    pub last_number: Option<String>,
    pub problems: Vec<String>,
}

/// Chaîne d'empreintes, suite continue (sans trou ni doublon) par année, références valides,
/// compteur au moins égal au dernier numéro.
pub fn verify(dir: &Path, key: &[u8; KEY_LEN]) -> Result<VerifyReport, String> {
    let entries = load(dir, key)?;
    let mut problems = Vec::new();
    let mut prev = String::new();
    let mut year_seq: std::collections::BTreeMap<u32, u64> = Default::default();
    for (i, e) in entries.iter().enumerate() {
        if e.prev_hash != prev {
            problems.push(format!("Entrée {} ({}) : chaîne rompue (entrée retirée ou insérée).", i + 1, e.number));
        }
        if compute_hash(e) != e.hash {
            problems.push(format!("Entrée {} ({}) : contenu modifié.", i + 1, e.number));
        }
        prev = e.hash.clone();
        if e.kind == "duplicate" {
            if !entries[..i].iter().any(|r| r.kind != "duplicate" && r.number == e.number) {
                problems.push(format!("Duplicata d'un reçu inconnu : {}.", e.number));
            }
            continue;
        }
        let expected = year_seq.get(&e.year).copied().unwrap_or(0) + 1;
        if e.seq != expected {
            problems.push(format!("Suite interrompue en {} : attendu {}, trouvé {}.", e.year, format_number(e.year, expected), e.number));
        }
        if e.number != format_number(e.year, e.seq) {
            problems.push(format!("Numéro incohérent : {}.", e.number));
        }
        year_seq.insert(e.year, e.seq);
        if e.kind == "cancellation" {
            let target = e.cancels_number.as_deref().unwrap_or("");
            if !entries[..i].iter().any(|r| r.kind == "receipt" && r.number == target) {
                problems.push(format!("{} annule un reçu inconnu ({target}).", e.number));
            }
        }
    }
    let counter = load_counter(dir, key);
    let in_registry = entries.iter().filter(|e| e.kind != "duplicate" && e.year == counter.year).map(|e| e.seq).max().unwrap_or(0);
    if counter.last > in_registry {
        problems.push(format!("Le registre s'arrête avant le dernier numéro attribué ({}) : reçu retiré ou registre restauré plus ancien.", format_number(counter.year, counter.last)));
    }
    if let Some(last) = entries.iter().rev().find(|e| e.kind != "duplicate") {
        if counter.year == last.year && counter.last < last.seq {
            problems.push("Le compteur est en retard sur le registre.".into());
        }
    }
    Ok(VerifyReport {
        ok: problems.is_empty(),
        count: entries.len(),
        last_number: entries.iter().rev().find(|e| e.kind != "duplicate").map(|e| e.number.clone()),
        problems,
    })
}

#[cfg(test)]
#[path = "receipts_tests.rs"]
mod tests;
