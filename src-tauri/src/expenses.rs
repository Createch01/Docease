//! Dépenses professionnelles — registre en ajout seul, chaîné par empreintes, écrit uniquement par Rust.
//!
//! - Registre `meddoc_expenses.json` (chiffré, sauvegardé, réservé : ni `load_json` ni `save_json`).
//!   Une dépense est une entrée `expense` (`DEP-AAAA-NNNNN`, compteur Rust) ; une annulation est une entrée
//!   `cancellation` qui référence la dépense (motif obligatoire) : l'originale reste visible, barrée. Jamais de
//!   modification : « corriger » = annuler + recréer, dans une seule écriture (`correct`).
//! - Montants en centimes entiers ; TVA informative. Date de la dépense choisie (au plus aujourd'hui, hors mois
//!   clôturé), date de saisie posée par Rust. Catégorie validée par Rust (liste modifiable ; une catégorie
//!   utilisée se désactive, jamais ne se supprime). La catégorie « à amortir » est enregistrée comme telle dans
//!   l'entrée : listée, exclue du résultat.
//! - Justificatifs : pièces jointes chiffrées (propriétaire réservé « cabinet »), uniquement des identifiants
//!   existants.
//! - Rôles : le médecin fait tout ; l'assistante saisit une dépense courante DU JOUR (hors « à amortir ») et ne
//!   voit que celles du jour. Pas d'annulation, de correction, de catégories ni de clôture pour elle.
//! - Reprise : l'ancien fichier (liste simple, justificatif en base64) est converti une fois ; copie de
//!   l'original conservée (`meddoc_expenses.legacy.json`), justificatifs convertis en pièces jointes.
//! - Ordre d'écriture : registre d'abord, compteur ensuite (max(compteur, registre) + 1 : jamais de trou ni de
//!   retour en arrière, y compris après restauration).

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::access::Role;
use super::{periods, read_enc_json_in, write_enc_json_in, KEY_LEN};

pub const REGISTRY_FILE: &str = "meddoc_expenses.json";
pub const COUNTER_FILE: &str = "meddoc_expense_counter.json";
pub const CATEGORIES_FILE: &str = "meddoc_expense_categories.json";
pub const LEGACY_COPY: &str = "meddoc_expenses.legacy.json";
pub const MODES: [&str; 5] = ["CASH", "CHEQUE", "TRANSFER", "CARD", "DEBIT"];
const MAX_CENTS: i64 = 1_000_000_000;
const MIN_REASON_CHARS: usize = 3;
const MAX_REASON_CHARS: usize = 200;
const MAX_RECEIPTS: usize = 10;

static LOCK: Mutex<()> = Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub seq: u64,
    /// `expense` · `cancellation`
    pub kind: String,
    /// `DEP-AAAA-NNNNN` (vide pour une annulation).
    #[serde(default)]
    pub id: String,
    /// Jour de la dépense (choisi) ; pour une annulation, le jour de l'annulation.
    pub date_expense: String,
    /// Jour de saisie (posé par Rust).
    pub date_entry: String,
    pub at: String,
    #[serde(default)]
    pub category: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_category: Option<String>,
    #[serde(default)]
    pub supplier: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supplier_invoice: Option<String>,
    #[serde(default)]
    pub label: String,
    /// TTC en centimes (0 pour une annulation).
    #[serde(default)]
    pub amount_cents: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vat_cents: Option<i64>,
    #[serde(default)]
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cheque_number: Option<String>,
    #[serde(default)]
    pub receipt_ids: Vec<String>,
    /// Catégorie « à amortir » à l'écriture : listée, exclue du résultat.
    #[serde(default)]
    pub amortizable: bool,
    pub by: String,
    /// Annulation : identifiant de la dépense annulée.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancels: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Reprise de l'ancien fichier.
    #[serde(default)]
    pub migrated: bool,
    pub prev_hash: String,
    pub hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub name: String,
    pub active: bool,
    pub amortizable: bool,
    pub builtin: bool,
}

pub const AMORTIZABLE_CATEGORY: &str = "Achat de matériel (à amortir)";
const DEFAULT_CATEGORIES: [&str; 20] = [
    "Loyer & charges locatives",
    "Salaires",
    "CNSS / AMO employeur",
    "Eau & électricité",
    "Téléphone & internet",
    "Consommables médicaux",
    "Médicaments & vaccins (stock cabinet)",
    "Fournitures de bureau",
    "Entretien & ménage",
    "Maintenance matériel",
    "Logiciels & abonnements",
    "Honoraires (comptable, avocat)",
    "Assurances (RCP, local)",
    "Impôts & taxes (taxe professionnelle, TSC…)",
    "Cotisation Ordre / syndicat",
    "Formation & congrès",
    "Déplacements & carburant",
    "Frais bancaires",
    AMORTIZABLE_CATEGORY,
    "Divers",
];

pub fn default_categories() -> Vec<Category> {
    DEFAULT_CATEGORIES.iter().map(|n| Category { name: n.to_string(), active: true, amortizable: *n == AMORTIZABLE_CATEGORY, builtin: true }).collect()
}

/// Saisie d'une dépense (ce que l'interface envoie ; tout est revalidé).
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewExpense {
    pub date_expense: String,
    pub category: String,
    #[serde(default)]
    pub sub_category: Option<String>,
    #[serde(default)]
    pub supplier: String,
    #[serde(default)]
    pub supplier_invoice: Option<String>,
    pub label: String,
    pub amount_cents: i64,
    #[serde(default)]
    pub vat_cents: Option<i64>,
    pub mode: String,
    #[serde(default)]
    pub cheque_number: Option<String>,
    #[serde(default)]
    pub receipt_ids: Vec<String>,
}

// ─── Chaînage ────────────────────────────────────────────────────────────────

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

fn push_sealed(entries: &mut Vec<Entry>, mut e: Entry) -> Entry {
    e.seq = entries.last().map_or(1, |p| p.seq + 1);
    e.prev_hash = entries.last().map_or(String::new(), |p| p.hash.clone());
    e.hash = compute_hash(&e);
    entries.push(e.clone());
    e
}

// ─── Lecture / écriture ──────────────────────────────────────────────────────

fn is_legacy(v: &Value) -> bool {
    matches!(v, Value::Array(a) if a.iter().any(|x| x.get("hash").is_none()))
}

/// Registre strict : l'ancien format doit d'abord être repris (`ensure_migrated`).
pub fn load(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Vec<Entry>, String> {
    match read_enc_json_in(dir, key, REGISTRY_FILE)? {
        None => Ok(Vec::new()),
        Some(v) if is_legacy(&v) => Err("Les anciennes dépenses n'ont pas encore été reprises : rouvrez la session.".into()),
        Some(v) => serde_json::from_value(v).map_err(|_| "Registre des dépenses illisible.".to_string()),
    }
}

fn save(dir: &Path, key: &[u8; KEY_LEN], entries: &[Entry]) -> Result<(), String> {
    write_enc_json_in(dir, key, REGISTRY_FILE, &serde_json::to_value(entries).map_err(|e| e.to_string())?)
}

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
struct Counter {
    #[serde(default)]
    years: BTreeMap<String, u64>,
}

fn load_counter(dir: &Path, key: &[u8; KEY_LEN]) -> Counter {
    read_enc_json_in(dir, key, COUNTER_FILE).ok().flatten().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

fn save_counter(dir: &Path, key: &[u8; KEY_LEN], c: &Counter) -> Result<(), String> {
    write_enc_json_in(dir, key, COUNTER_FILE, &serde_json::to_value(c).map_err(|e| e.to_string())?)
}

/// `DEP-AAAA-NNNNN` → (année, rang).
pub fn parse_id(id: &str) -> Option<(u32, u64)> {
    let rest = id.strip_prefix("DEP-")?;
    let (y, n) = rest.split_once('-')?;
    if y.len() != 4 || n.len() < 5 || !y.bytes().all(|b| b.is_ascii_digit()) || !n.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((y.parse().ok()?, n.parse().ok()?))
}

fn format_id(year: u32, n: u64) -> String {
    format!("DEP-{year}-{n:05}")
}

/// Rang suivant de l'année : max(compteur, registre) + 1.
fn next_rank(entries: &[Entry], counter: &Counter, year: u32) -> u64 {
    let in_registry = entries.iter().filter_map(|e| parse_id(&e.id)).filter(|(y, _)| *y == year).map(|(_, n)| n).max().unwrap_or(0);
    in_registry.max(counter.years.get(&year.to_string()).copied().unwrap_or(0)) + 1
}

pub fn load_categories(dir: &Path, key: &[u8; KEY_LEN]) -> Vec<Category> {
    let stored: Vec<Category> = read_enc_json_in(dir, key, CATEGORIES_FILE).ok().flatten().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
    if stored.is_empty() {
        default_categories()
    } else {
        stored
    }
}

fn save_categories(dir: &Path, key: &[u8; KEY_LEN], c: &[Category]) -> Result<(), String> {
    write_enc_json_in(dir, key, CATEGORIES_FILE, &serde_json::to_value(c).map_err(|e| e.to_string())?)
}

// ─── Validation ──────────────────────────────────────────────────────────────

fn clean(s: &str, max: usize, what: &str, required: bool) -> Result<String, String> {
    let c: String = s.chars().filter(|c| !c.is_control()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    if required && c.is_empty() {
        return Err(format!("{what} : obligatoire."));
    }
    if c.chars().count() > max {
        return Err(format!("{what} : {max} caractères au plus."));
    }
    Ok(c)
}

fn clean_opt(s: &Option<String>, max: usize, what: &str) -> Result<Option<String>, String> {
    match s {
        None => Ok(None),
        Some(v) => {
            let c = clean(v, max, what, false)?;
            Ok(if c.is_empty() { None } else { Some(c) })
        }
    }
}

fn clean_reason(reason: &str) -> Result<String, String> {
    let c = clean(reason, MAX_REASON_CHARS, "Motif", false)?;
    if c.chars().count() < MIN_REASON_CHARS {
        return Err("Le motif est obligatoire.".into());
    }
    Ok(c)
}

/// Contrôles communs à la saisie et à la correction. Renvoie l'entrée (sans rang ni empreinte).
fn build(dir: &Path, key: &[u8; KEY_LEN], role: Role, n: &NewExpense, by: &str, today: &str, migrated: bool) -> Result<Entry, String> {
    if super::accounting::parse_day(&n.date_expense).is_none() {
        return Err("Date de la dépense invalide.".into());
    }
    if n.date_expense.as_str() > today {
        return Err("La date de la dépense ne peut pas être dans le futur.".into());
    }
    if role == Role::Assistant && n.date_expense != today {
        return Err("L'assistante ne saisit que les dépenses du jour.".into());
    }
    periods::ensure_open(dir, key, &n.date_expense)?;
    let cats = load_categories(dir, key);
    let cat = cats.iter().find(|c| c.name == n.category).ok_or("Catégorie inconnue.")?;
    if !cat.active && !migrated {
        return Err("Cette catégorie est désactivée.".into());
    }
    if role == Role::Assistant && cat.amortizable {
        return Err("Un achat de matériel (à amortir) est saisi par le médecin.".into());
    }
    if n.amount_cents <= 0 || n.amount_cents > MAX_CENTS {
        return Err("Montant invalide.".into());
    }
    if let Some(v) = n.vat_cents {
        if v < 0 || v > n.amount_cents {
            return Err("TVA invalide (entre 0 et le montant TTC).".into());
        }
    }
    if !MODES.contains(&n.mode.as_str()) {
        return Err("Mode de paiement invalide.".into());
    }
    let cheque = clean_opt(&n.cheque_number, 30, "N° de chèque")?;
    if cheque.is_some() && n.mode != "CHEQUE" {
        return Err("Un n° de chèque n'a de sens que pour un paiement par chèque.".into());
    }
    if n.receipt_ids.len() > MAX_RECEIPTS {
        return Err(format!("{MAX_RECEIPTS} justificatifs au plus."));
    }
    if role == Role::Assistant && !n.receipt_ids.is_empty() {
        return Err("L'assistante ne joint pas de justificatif : le médecin le fera.".into());
    }
    if !n.receipt_ids.is_empty() {
        let index = super::attachments::load_index(dir, key)?;
        for id in &n.receipt_ids {
            if !index.iter().any(|m| &m.id == id && m.patient_id == super::attachments::CABINET_OWNER) {
                return Err("Justificatif introuvable.".into());
            }
        }
    }
    Ok(Entry {
        kind: "expense".into(),
        date_expense: n.date_expense.clone(),
        date_entry: today.into(),
        at: super::util::now_iso(),
        category: n.category.clone(),
        sub_category: clean_opt(&n.sub_category, 80, "Sous-catégorie")?,
        supplier: clean(&n.supplier, 120, "Fournisseur", false)?,
        supplier_invoice: clean_opt(&n.supplier_invoice, 60, "N° de facture")?,
        label: clean(&n.label, 200, "Libellé", true)?,
        amount_cents: n.amount_cents,
        vat_cents: n.vat_cents,
        mode: n.mode.clone(),
        cheque_number: cheque,
        receipt_ids: n.receipt_ids.clone(),
        amortizable: cat.amortizable,
        by: by.into(),
        migrated,
        ..Default::default()
    })
}

fn assign_id(entries: &[Entry], counter: &mut Counter, mut e: Entry, today: &str) -> Result<Entry, String> {
    let year: u32 = today.get(..4).and_then(|y| y.parse().ok()).ok_or("Date système invalide.")?;
    let rank = next_rank(entries, counter, year);
    counter.years.insert(year.to_string(), rank);
    e.id = format_id(year, rank);
    Ok(e)
}

// ─── Opérations ──────────────────────────────────────────────────────────────

pub fn add(dir: &Path, key: &[u8; KEY_LEN], role: Role, n: &NewExpense, by: &str, today: &str) -> Result<Entry, String> {
    ensure_migrated(dir, key, today)?;
    let _g = lock();
    let mut entries = load(dir, key)?;
    let mut counter = load_counter(dir, key);
    let e = build(dir, key, role, n, by, today, false)?;
    let e = assign_id(&entries, &mut counter, e, today)?;
    let done = push_sealed(&mut entries, e);
    save(dir, key, &entries)?;
    save_counter(dir, key, &counter)?;
    Ok(done)
}

fn active_of<'a>(entries: &'a [Entry], id: &str) -> Result<&'a Entry, String> {
    let e = entries.iter().find(|e| e.kind == "expense" && e.id == id).ok_or("Dépense introuvable.")?;
    if entries.iter().any(|c| c.kind == "cancellation" && c.cancels.as_deref() == Some(id)) {
        return Err("Cette dépense est déjà annulée.".into());
    }
    Ok(e)
}

fn cancellation(id: &str, reason: String, by: &str, today: &str) -> Entry {
    Entry { kind: "cancellation".into(), date_expense: today.into(), date_entry: today.into(), at: super::util::now_iso(), by: by.into(), cancels: Some(id.into()), reason: Some(reason), ..Default::default() }
}

/// Annulation (médecin) : motif obligatoire ; refusée si la dépense date d'un mois clôturé.
pub fn cancel(dir: &Path, key: &[u8; KEY_LEN], role: Role, id: &str, reason: &str, by: &str, today: &str) -> Result<Entry, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin peut annuler une dépense.".into());
    }
    let reason = clean_reason(reason)?;
    ensure_migrated(dir, key, today)?;
    let _g = lock();
    let mut entries = load(dir, key)?;
    let original = active_of(&entries, id)?.clone();
    periods::ensure_open(dir, key, &original.date_expense)?;
    let done = push_sealed(&mut entries, cancellation(id, reason, by, today));
    save(dir, key, &entries)?;
    Ok(done)
}

/// « Corriger » : annulation de l'originale + nouvelle dépense, écrites ensemble (tout ou rien).
pub fn correct(dir: &Path, key: &[u8; KEY_LEN], role: Role, id: &str, reason: &str, n: &NewExpense, by: &str, today: &str) -> Result<(Entry, Entry), String> {
    if role != Role::Medecin {
        return Err("Seul le médecin peut corriger une dépense.".into());
    }
    let reason = clean_reason(reason)?;
    ensure_migrated(dir, key, today)?;
    let _g = lock();
    let mut entries = load(dir, key)?;
    let original = active_of(&entries, id)?.clone();
    periods::ensure_open(dir, key, &original.date_expense)?;
    let mut counter = load_counter(dir, key);
    let fresh = build(dir, key, role, n, by, today, false)?;
    let cancelled = push_sealed(&mut entries, cancellation(id, reason, by, today));
    let fresh = assign_id(&entries, &mut counter, fresh, today)?;
    let created = push_sealed(&mut entries, fresh);
    save(dir, key, &entries)?;
    save_counter(dir, key, &counter)?;
    Ok((cancelled, created))
}

pub fn add_category(dir: &Path, key: &[u8; KEY_LEN], role: Role, name: &str) -> Result<Vec<Category>, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin gère les catégories.".into());
    }
    let name = clean(name, 60, "Nom de la catégorie", true)?;
    let _g = lock();
    let mut cats = load_categories(dir, key);
    if cats.iter().any(|c| c.name.to_lowercase() == name.to_lowercase()) {
        return Err("Cette catégorie existe déjà.".into());
    }
    cats.push(Category { name, active: true, amortizable: false, builtin: false });
    save_categories(dir, key, &cats)?;
    Ok(cats)
}

/// Une catégorie ne se supprime jamais (des dépenses peuvent l'utiliser) : elle se désactive.
pub fn set_category_active(dir: &Path, key: &[u8; KEY_LEN], role: Role, name: &str, active: bool) -> Result<Vec<Category>, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin gère les catégories.".into());
    }
    let _g = lock();
    let mut cats = load_categories(dir, key);
    let c = cats.iter_mut().find(|c| c.name == name).ok_or("Catégorie inconnue.")?;
    c.active = active;
    save_categories(dir, key, &cats)?;
    Ok(cats)
}

// ─── Reprise de l'ancien fichier ─────────────────────────────────────────────

fn legacy_category(old: &str) -> (&'static str, Option<String>) {
    match old {
        "Loyer & charges du local" => ("Loyer & charges locatives", None),
        "Salaires & charges sociales (CNSS)" => ("Salaires", None),
        "Fournitures médicales & consommables" => ("Consommables médicaux", None),
        "Équipement médical & amortissement" => (AMORTIZABLE_CATEGORY, None),
        "Assurance professionnelle (RC médicale)" => ("Assurances (RCP, local)", None),
        "Taxe professionnelle (patente)" => ("Impôts & taxes (taxe professionnelle, TSC…)", None),
        "Frais comptable/juridique" => ("Honoraires (comptable, avocat)", None),
        "Formation continue" => ("Formation & congrès", None),
        "Électricité/eau/téléphone/internet" => ("Eau & électricité", Some("Électricité/eau/téléphone/internet".into())),
        _ => ("Divers", Some(old.to_string())),
    }
}

fn data_url_bytes(url: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let (_, payload) = url.split_once(";base64,")?;
    base64::engine::general_purpose::STANDARD.decode(payload.trim()).ok()
}

/// Convertit l'ancien fichier (liste simple) en registre chaîné. Idempotent ; l'original est conservé.
pub fn ensure_migrated(dir: &Path, key: &[u8; KEY_LEN], today: &str) -> Result<usize, String> {
    match read_enc_json_in(dir, key, REGISTRY_FILE)? {
        Some(v) if is_legacy(&v) => {
            let _g = lock();
            let Some(Value::Array(old)) = read_enc_json_in(dir, key, REGISTRY_FILE)? else { return Ok(0) };
            if !old.iter().any(|x| x.get("hash").is_none()) {
                return Ok(0);
            }
            write_enc_json_in(dir, key, LEGACY_COPY, &Value::Array(old.clone()))?;
            let mut sorted: Vec<&Value> = old.iter().collect();
            sorted.sort_by(|a, b| a.get("date").and_then(|d| d.as_str()).unwrap_or("").cmp(b.get("date").and_then(|d| d.as_str()).unwrap_or("")));
            let mut entries: Vec<Entry> = Vec::new();
            let mut counter = load_counter(dir, key);
            for x in sorted {
                let s = |k: &str| x.get(k).and_then(|v| v.as_str()).unwrap_or("");
                let date = if super::accounting::parse_day(s("date")).is_some() && s("date") <= today { s("date").to_string() } else { today.to_string() };
                let (cat, sub) = legacy_category(s("category"));
                let detail = if s("categoryDetail").is_empty() { sub } else { Some(s("categoryDetail").to_string()) };
                let cents = (x.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0) * 100.0).round() as i64;
                if cents <= 0 {
                    continue;
                }
                let mut receipts = Vec::new();
                if let Some(raw) = x.get("receiptDataUrl").and_then(|v| v.as_str()).and_then(data_url_bytes) {
                    let input = super::attachments::AddInput {
                        patient_id: super::attachments::CABINET_OWNER.into(),
                        title: clean(s("label"), 100, "Libellé", false).unwrap_or_default().chars().take(100).collect::<String>().trim().to_string(),
                        category: "autre".into(),
                        exam_date: date.clone(),
                        ..Default::default()
                    };
                    let input = super::attachments::AddInput { title: if input.title.is_empty() { "Justificatif".into() } else { input.title }, ..input };
                    if let Ok(meta) = super::attachments::add(dir, key, input, raw, "migration", &super::util::now_iso(), today) {
                        receipts.push(meta.id);
                    }
                }
                let e = Entry {
                    kind: "expense".into(),
                    date_expense: date,
                    date_entry: today.into(),
                    at: super::util::now_iso(),
                    category: cat.into(),
                    sub_category: detail,
                    supplier: String::new(),
                    label: clean(s("label"), 200, "Libellé", false).unwrap_or_default(),
                    amount_cents: cents.min(MAX_CENTS),
                    mode: "CASH".into(),
                    receipt_ids: receipts,
                    amortizable: cat == AMORTIZABLE_CATEGORY,
                    by: "migration".into(),
                    migrated: true,
                    ..Default::default()
                };
                let e = assign_id(&entries, &mut counter, e, &s("date").get(..4).map(|y| format!("{y}-01-01")).filter(|d| super::accounting::parse_day(d).is_some()).unwrap_or_else(|| today.to_string()))?;
                push_sealed(&mut entries, e);
            }
            save(dir, key, &entries)?;
            save_counter(dir, key, &counter)?;
            Ok(entries.len())
        }
        _ => Ok(0),
    }
}

// ─── Vues et agrégats (purs) ─────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct View {
    #[serde(flatten)]
    pub entry: Entry,
    /// `active` · `cancelled`
    pub status: String,
    pub cancelled_reason: Option<String>,
    pub cancelled_on: Option<String>,
    pub cancelled_by: Option<String>,
    pub has_receipt: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub category: String,
    pub cents: i64,
    pub count: usize,
    pub amortizable: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModeAmount {
    pub mode: String,
    pub cents: i64,
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    /// Dépenses actives hors « à amortir » : ce qui vient en déduction du résultat.
    pub expenses_cents: i64,
    pub amortizable_cents: i64,
    pub count: usize,
    pub without_receipt: usize,
    pub by_category: Vec<CategoryTotal>,
    pub by_mode: Vec<ModeAmount>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListResult {
    pub rows: Vec<View>,
    pub totals: Totals,
}

fn cancelled_ids(entries: &[Entry]) -> BTreeMap<&str, &Entry> {
    entries.iter().filter(|e| e.kind == "cancellation").filter_map(|e| e.cancels.as_deref().map(|id| (id, e))).collect()
}

pub fn is_active(entries: &[Entry], e: &Entry) -> bool {
    e.kind == "expense" && !entries.iter().any(|c| c.kind == "cancellation" && c.cancels.as_deref() == Some(e.id.as_str()))
}

pub fn totals_of<'a>(rows: impl Iterator<Item = &'a Entry>) -> Totals {
    let mut t = Totals::default();
    let mut cats: BTreeMap<String, CategoryTotal> = BTreeMap::new();
    let mut modes: BTreeMap<String, i64> = BTreeMap::new();
    for e in rows {
        t.count += 1;
        if e.receipt_ids.is_empty() {
            t.without_receipt += 1;
        }
        if e.amortizable {
            t.amortizable_cents += e.amount_cents;
        } else {
            t.expenses_cents += e.amount_cents;
        }
        let c = cats.entry(e.category.clone()).or_insert_with(|| CategoryTotal { category: e.category.clone(), cents: 0, count: 0, amortizable: e.amortizable });
        c.cents += e.amount_cents;
        c.count += 1;
        *modes.entry(e.mode.clone()).or_insert(0) += e.amount_cents;
    }
    let mut by_category: Vec<CategoryTotal> = cats.into_values().collect();
    by_category.sort_by(|a, b| b.cents.cmp(&a.cents).then(a.category.cmp(&b.category)));
    t.by_category = by_category;
    t.by_mode = modes.into_iter().map(|(mode, cents)| ModeAmount { mode, cents }).collect();
    t
}

/// `from`/`to` : jours de la dépense. `receipt` : Some(true) avec justificatif, Some(false) sans.
pub fn list(entries: &[Entry], from: &str, to: &str, category: Option<&str>, mode: Option<&str>, receipt: Option<bool>, today_only: Option<&str>) -> ListResult {
    let cancelled = cancelled_ids(entries);
    let mut rows = Vec::new();
    for e in entries.iter().filter(|e| e.kind == "expense") {
        if e.date_expense.as_str() < from || e.date_expense.as_str() > to {
            continue;
        }
        if category.map_or(false, |c| c != e.category) || mode.map_or(false, |m| m != e.mode) || receipt.map_or(false, |r| r != !e.receipt_ids.is_empty()) {
            continue;
        }
        if today_only.map_or(false, |t| e.date_entry != t) {
            continue;
        }
        let c = cancelled.get(e.id.as_str());
        rows.push(View {
            entry: e.clone(),
            status: if c.is_some() { "cancelled".into() } else { "active".into() },
            cancelled_reason: c.and_then(|c| c.reason.clone()),
            cancelled_on: c.map(|c| c.date_entry.clone()),
            cancelled_by: c.map(|c| c.by.clone()),
            has_receipt: !e.receipt_ids.is_empty(),
        });
    }
    rows.sort_by(|a, b| (b.entry.date_expense.as_str(), b.entry.seq).cmp(&(a.entry.date_expense.as_str(), a.entry.seq)));
    let totals = totals_of(rows.iter().filter(|r| r.status == "active").map(|r| &r.entry));
    ListResult { rows, totals }
}

pub fn suppliers(entries: &[Entry]) -> Vec<String> {
    let set: BTreeSet<String> = entries.iter().filter(|e| e.kind == "expense" && !e.supplier.is_empty()).map(|e| e.supplier.clone()).collect();
    set.into_iter().collect()
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VerifyReport {
    pub ok: bool,
    pub count: usize,
    pub expenses: usize,
    pub cancellations: usize,
    pub problems: Vec<String>,
}

pub fn verify_entries(entries: &[Entry], counter_ok: bool) -> VerifyReport {
    let mut problems = Vec::new();
    let mut prev = String::new();
    let mut seen: BTreeMap<u32, Vec<u64>> = BTreeMap::new();
    for (i, e) in entries.iter().enumerate() {
        if e.seq != i as u64 + 1 || e.prev_hash != prev || compute_hash(e) != e.hash {
            problems.push(format!("Entrée {} : empreinte invalide (registre modifié).", e.seq));
        }
        prev = e.hash.clone();
        match e.kind.as_str() {
            "expense" => match parse_id(&e.id) {
                Some((y, n)) => seen.entry(y).or_default().push(n),
                None => problems.push(format!("Entrée {} : identifiant invalide.", e.seq)),
            },
            "cancellation" => {
                if e.reason.as_deref().map_or(true, |r| r.chars().count() < MIN_REASON_CHARS) || !entries.iter().any(|x| x.kind == "expense" && Some(x.id.as_str()) == e.cancels.as_deref()) {
                    problems.push(format!("Entrée {} : annulation sans motif ou sans dépense.", e.seq));
                }
            }
            _ => problems.push(format!("Entrée {} : type inconnu.", e.seq)),
        }
    }
    for (y, ns) in &seen {
        let mut sorted = ns.clone();
        sorted.sort();
        if sorted.iter().enumerate().any(|(i, n)| *n != i as u64 + 1) {
            problems.push(format!("Suite des numéros DEP-{y} : trou ou doublon."));
        }
    }
    if !counter_ok {
        problems.push("Compteur des dépenses en retard sur le registre.".into());
    }
    VerifyReport {
        ok: problems.is_empty(),
        count: entries.len(),
        expenses: entries.iter().filter(|e| e.kind == "expense").count(),
        cancellations: entries.iter().filter(|e| e.kind == "cancellation").count(),
        problems,
    }
}

// ─── Restauration ────────────────────────────────────────────────────────────

/// Le registre et le compteur ne reculent JAMAIS à la restauration (un numéro DEP déjà donné ne se réutilise pas).
pub fn merge_for_restore(dir: &Path, key: &[u8; KEY_LEN], files: &mut BTreeMap<String, Value>) {
    let current = match read_enc_json_in(dir, key, REGISTRY_FILE).ok().flatten() {
        Some(v) if !is_legacy(&v) => serde_json::from_value::<Vec<Entry>>(v).unwrap_or_default(),
        _ => Vec::new(),
    };
    let restored: Vec<Entry> = files.get(REGISTRY_FILE).filter(|v| !is_legacy(v)).and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    let is_prefix = restored.len() <= current.len() && restored.iter().zip(&current).all(|(a, b)| a.hash == b.hash);
    if current.len() > restored.len() && is_prefix {
        if let Ok(v) = serde_json::to_value(&current) {
            files.insert(REGISTRY_FILE.to_string(), v);
        }
    }
    let mut best = load_counter(dir, key);
    if let Some(r) = files.get(COUNTER_FILE).and_then(|v| serde_json::from_value::<Counter>(v.clone()).ok()) {
        for (y, n) in r.years {
            let e = best.years.entry(y).or_insert(0);
            *e = (*e).max(n);
        }
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

/// Journal : identifiant et montant seulement (jamais libellé, fournisseur ni motif).
#[tauri::command]
pub fn expense_add<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, expense: NewExpense) -> Result<Entry, String> {
    let session = require_session(gate(&app, &state, "expense_add")?)?;
    let key = data_key_of(&state)?;
    let r = add(&data_dir(&app)?, &key, session.role, &expense, &session.name, &util::today_local());
    audit::log(&app, Some(&session), "expense_add", &match &r { Ok(e) => format!("{} {}", e.id, e.amount_cents), Err(_) => "refusé".into() }, r.is_ok());
    r
}

#[tauri::command]
pub fn expense_cancel<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, reason: String) -> Result<Entry, String> {
    let session = require_session(gate(&app, &state, "expense_cancel")?)?;
    let key = data_key_of(&state)?;
    let r = cancel(&data_dir(&app)?, &key, session.role, &id, &reason, &session.name, &util::today_local());
    audit::log(&app, Some(&session), "expense_cancel", if r.is_ok() { &id } else { "refusé" }, r.is_ok());
    r
}

#[tauri::command]
pub fn expense_correct<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, reason: String, expense: NewExpense) -> Result<Entry, String> {
    let session = require_session(gate(&app, &state, "expense_correct")?)?;
    let key = data_key_of(&state)?;
    let r = correct(&data_dir(&app)?, &key, session.role, &id, &reason, &expense, &session.name, &util::today_local());
    audit::log(&app, Some(&session), "expense_correct", &match &r { Ok((_, e)) => format!("{id} → {}", e.id), Err(_) => "refusé".into() }, r.is_ok());
    r.map(|(_, e)| e)
}

#[tauri::command]
pub fn expense_list<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, from: String, to: String, category: Option<String>, mode: Option<String>, receipt: Option<bool>) -> Result<ListResult, String> {
    gate(&app, &state, "expense_list")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    ensure_migrated(&dir, &key, &util::today_local())?;
    Ok(list(&load(&dir, &key)?, &from, &to, category.as_deref(), mode.as_deref(), receipt, None))
}

/// Dépenses SAISIES aujourd'hui (assistante comprise) : rien d'autre.
#[tauri::command]
pub fn expenses_today<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<ListResult, String> {
    require_session(gate(&app, &state, "expenses_today")?)?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let today = util::today_local();
    ensure_migrated(&dir, &key, &today)?;
    Ok(list(&load(&dir, &key)?, "0000-01-01", "9999-12-31", None, None, None, Some(&today)))
}

#[tauri::command]
pub fn expense_suppliers<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    gate(&app, &state, "expense_suppliers")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    ensure_migrated(&dir, &key, &util::today_local())?;
    Ok(suppliers(&load(&dir, &key)?))
}

#[tauri::command]
pub fn expense_categories<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Vec<Category>, String> {
    gate(&app, &state, "expense_categories")?;
    let key = data_key_of(&state)?;
    Ok(load_categories(&data_dir(&app)?, &key))
}

#[tauri::command]
pub fn expense_category_add<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, name: String) -> Result<Vec<Category>, String> {
    let session = require_session(gate(&app, &state, "expense_category_add")?)?;
    let key = data_key_of(&state)?;
    let r = add_category(&data_dir(&app)?, &key, session.role, &name);
    audit::log(&app, Some(&session), "expense_category_add", if r.is_ok() { "ok" } else { "refusé" }, r.is_ok());
    r
}

#[tauri::command]
pub fn expense_category_set_active<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, name: String, active: bool) -> Result<Vec<Category>, String> {
    let session = require_session(gate(&app, &state, "expense_category_set_active")?)?;
    let key = data_key_of(&state)?;
    let r = set_category_active(&data_dir(&app)?, &key, session.role, &name, active);
    audit::log(&app, Some(&session), "expense_category_set_active", if r.is_ok() { "ok" } else { "refusé" }, r.is_ok());
    r
}

/// Reprise de l'ancien fichier de dépenses (médecin) : lancée à l'ouverture de sa session.
#[tauri::command]
pub fn expenses_migrate<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<usize, String> {
    let session = require_session(gate(&app, &state, "expenses_migrate")?)?;
    let key = data_key_of(&state)?;
    let r = ensure_migrated(&data_dir(&app)?, &key, &util::today_local());
    if let Ok(n) = &r {
        if *n > 0 {
            audit::log(&app, Some(&session), "expenses_migrate", &format!("{n} dépense(s) reprise(s)"), true);
        }
    }
    r
}

#[tauri::command]
pub fn expenses_verify<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<VerifyReport, String> {
    gate(&app, &state, "expenses_verify")?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    ensure_migrated(&dir, &key, &util::today_local())?;
    let entries = load(&dir, &key)?;
    let counter = load_counter(&dir, &key);
    let counter_ok = entries.iter().filter_map(|e| parse_id(&e.id)).all(|(y, n)| counter.years.get(&y.to_string()).copied().unwrap_or(0) >= n);
    Ok(verify_entries(&entries, counter_ok))
}

#[cfg(test)]
#[path = "expenses_tests.rs"]
mod tests;
