//! Grille tarifaire, lignes de note, remises et gratuités — décidées et calculées par Rust.
//!
//! - Grille : `meddoc_tariffs.json` (chiffré, sauvegardé, réservé dans `access.rs` : ni `load_json` ni
//!   `save_json`). Un acte ne se supprime jamais : il se désactive. Changer un prix ajoute une entrée à
//!   l'historique ; les notes déjà émises gardent leur instantané.
//! - Montants en centimes (`i64`). Une remise est en % (entier), en montant ou en gratuité totale ; l'arrondi
//!   d'un pourcentage est « demi vers le haut » au centime.
//! - Une ligne de grille prend son libellé, son code et son prix DANS LA GRILLE : un prix reçu différent est
//!   refusé (« prix inférieur au tarif = remise obligatoirement »). La ligne libre est réservée au médecin.
//! - Motif de remise obligatoire (liste fermée, texte pour « Autre ») ; auteur et date sont posés ici.
//! - Assistante : remises cumulées ≤ plafond (% du brut, défaut 0 %) ; gratuité totale seulement pour le motif
//!   « Contrôle gratuit », si le patient a une consultation payée dans le délai réglé par le médecin.
//! - Une note émise garde ses lignes figées (`prepare_notes` les réimpose à chaque écriture) et un instantané
//!   de l'identité professionnelle (`issuer`).
//! - Migration : chaque note sans `lines` devient une ligne libre « Honoraires » au montant actuel
//!   (`wrap_legacy`) ; contrôle somme avant = somme après, sauvegarde préalable, idempotente.

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use super::access::Role;
use super::numbering;
use super::payments;
use super::receipts;
use super::{read_enc_json_in, write_enc_json_in, KEY_LEN};

pub const FILE: &str = "meddoc_tariffs.json";
pub const CATEGORIES: [&str; 5] = ["CONSULTATION", "EXPLORATION", "CONTROLE", "CERTIFICAT", "AUTRE"];
pub const REASONS: [&str; 6] = ["CONFRERE", "FAMILLE", "SOCIAL", "CONTROLE_GRATUIT", "GESTE", "AUTRE"];
pub const FREE_CONTROL_REASON: &str = "CONTROLE_GRATUIT";
pub const LEGACY_LABEL: &str = "Honoraires";
const MAX_CENTS: i64 = receipts::MAX_CENTS;
const MAX_QTY: u32 = 99;
const MAX_CHARS_REASON_TEXT: usize = 120;
const MIN_CHARS_REASON_TEXT: usize = 3;

/// Champs calculés et figés d'une note émise : réimposés à chaque écriture, jamais acceptés de l'interface.
pub const FROZEN_FIELDS: [&str; 13] = [
    "lines", "noteDiscount", "grossCents", "lineDiscountsCents", "noteDiscountCents", "discountCents", "netCents",
    "totalAmount", "totalInWords", "services", "issuer", "pricing", "legacyLine",
];

static LOCK: Mutex<()> = Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

// ─── Grille ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PricePoint {
    pub price_cents: Option<i64>,
    /// Jour d'effet (AAAA-MM-JJ).
    pub from: String,
    pub by: String,
    pub at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Act {
    pub id: String,
    pub code: String,
    pub label: String,
    pub category: String,
    /// `None` : prix non renseigné → acte non utilisable.
    pub price_cents: Option<i64>,
    /// Informatifs : vides par défaut, jamais déduits.
    #[serde(default)]
    pub ngap_letter: Option<String>,
    #[serde(default)]
    pub ngap_coefficient: Option<String>,
    pub active: bool,
    pub order: u32,
    #[serde(default)]
    pub price_history: Vec<PricePoint>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub created_by: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Plafond de remise de l'assistante, en % du brut de la note (0 = aucune remise).
    #[serde(default)]
    pub assistant_discount_cap_pct: u32,
    /// Délai du contrôle gratuit, en jours (0 = désactivé).
    #[serde(default)]
    pub free_control_days: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Grid {
    pub version: u32,
    #[serde(default)]
    pub settings: Settings,
    pub acts: Vec<Act>,
}

/// Actes préchargés : libellés seulement, PRIX VIDES, aucune lettre clé inventée.
pub fn default_grid() -> Grid {
    const DEFAULTS: [(&str, &str, &str, &str); 8] = [
        ("act-consultation", "CS", "Consultation", "CONSULTATION"),
        ("act-controle", "CTRL", "Consultation de contrôle", "CONTROLE"),
        ("act-ecg", "ECG", "ECG", "EXPLORATION"),
        ("act-echo", "ECHO", "Échocardiographie", "EXPLORATION"),
        ("act-holter", "HOLT", "Holter ECG 24 h", "EXPLORATION"),
        ("act-mapa", "MAPA", "MAPA", "EXPLORATION"),
        ("act-effort", "EFF", "Épreuve d'effort", "EXPLORATION"),
        ("act-certificat", "CERT", "Certificat médical", "CERTIFICAT"),
    ];
    Grid {
        version: 1,
        settings: Settings::default(),
        acts: DEFAULTS
            .iter()
            .enumerate()
            .map(|(i, (id, code, label, cat))| Act {
                id: (*id).into(),
                code: (*code).into(),
                label: (*label).into(),
                category: (*cat).into(),
                price_cents: None,
                ngap_letter: None,
                ngap_coefficient: None,
                active: true,
                order: i as u32 + 1,
                price_history: Vec::new(),
                created_at: String::new(),
                created_by: String::new(),
            })
            .collect(),
    }
}

pub fn load(dir: &Path, key: &[u8; KEY_LEN]) -> Result<Grid, String> {
    match read_enc_json_in(dir, key, FILE)? {
        None => Ok(default_grid()),
        Some(v) => serde_json::from_value(v).map_err(|_| "Grille tarifaire illisible.".to_string()),
    }
}

fn save(dir: &Path, key: &[u8; KEY_LEN], g: &Grid) -> Result<(), String> {
    write_enc_json_in(dir, key, FILE, &serde_json::to_value(g).map_err(|e| e.to_string())?)
}

impl Grid {
    pub fn find(&self, id: &str) -> Option<&Act> {
        self.acts.iter().find(|a| a.id == id)
    }
    /// Au moins un acte actif avec prix : sinon l'interface affiche « Complétez vos tarifs ».
    pub fn is_usable(&self) -> bool {
        self.acts.iter().any(|a| a.active && a.price_cents.map_or(false, |p| p > 0))
    }
}

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

fn random_act_id() -> String {
    use rand::RngCore;
    let mut b = [0u8; 4];
    argon2::password_hash::rand_core::OsRng.fill_bytes(&mut b);
    format!("act-{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>())
}

#[derive(Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActInput {
    #[serde(default)]
    pub id: Option<String>,
    pub code: String,
    pub label: String,
    pub category: String,
    #[serde(default)]
    pub price_cents: Option<i64>,
    #[serde(default)]
    pub ngap_letter: Option<String>,
    #[serde(default)]
    pub ngap_coefficient: Option<String>,
    #[serde(default)]
    pub order: Option<u32>,
}

/// Lettre clé NGAP : 1 à 6 lettres majuscules (informatif).
fn check_letter(s: &Option<String>) -> Result<Option<String>, String> {
    let Some(v) = s else { return Ok(None) };
    let t = clean(v, 10, "Lettre clé", false)?.to_uppercase();
    if t.is_empty() {
        return Ok(None);
    }
    if t.chars().count() > 6 || !t.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Lettre clé : 1 à 6 lettres.".into());
    }
    Ok(Some(t))
}

/// Coefficient : nombre décimal positif (virgule ou point), 2 décimales au plus (informatif).
fn check_coefficient(s: &Option<String>) -> Result<Option<String>, String> {
    let Some(v) = s else { return Ok(None) };
    let t = clean(v, 10, "Coefficient", false)?.replace(',', ".");
    if t.is_empty() {
        return Ok(None);
    }
    let ok = {
        let mut parts = t.splitn(2, '.');
        let (a, b) = (parts.next().unwrap_or(""), parts.next());
        !a.is_empty() && a.len() <= 3 && a.bytes().all(|c| c.is_ascii_digit()) && b.map_or(true, |d| !d.is_empty() && d.len() <= 2 && d.bytes().all(|c| c.is_ascii_digit()))
    };
    if !ok || t.parse::<f64>().map_or(true, |x| x <= 0.0) {
        return Err("Coefficient : nombre positif, deux décimales au plus.".into());
    }
    Ok(Some(t))
}

/// Création ou modification d'un acte (médecin seulement). Un changement de prix s'ajoute à l'historique.
pub fn save_act(dir: &Path, key: &[u8; KEY_LEN], role: Role, input: &ActInput, by: &str, now: &str, today: &str) -> Result<Grid, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin modifie la grille tarifaire.".into());
    }
    let code = clean(&input.code, 12, "Code", true)?;
    let label = clean(&input.label, 80, "Libellé", true)?;
    if !CATEGORIES.contains(&input.category.as_str()) {
        return Err("Catégorie d'acte inconnue.".into());
    }
    if let Some(p) = input.price_cents {
        if p <= 0 || p > MAX_CENTS {
            return Err("Prix invalide (supérieur à 0, 10 000 000 DH au plus).".into());
        }
    }
    let letter = check_letter(&input.ngap_letter)?;
    let coeff = check_coefficient(&input.ngap_coefficient)?;
    let _g = lock();
    let mut grid = load(dir, key)?;
    let same_id = |a: &Act| input.id.as_deref() == Some(a.id.as_str());
    if grid.acts.iter().any(|a| !same_id(a) && a.code.to_lowercase() == code.to_lowercase()) {
        return Err("Ce code est déjà utilisé par un autre acte.".into());
    }
    if grid.acts.iter().any(|a| !same_id(a) && a.label.to_lowercase() == label.to_lowercase()) {
        return Err("Ce libellé est déjà utilisé par un autre acte.".into());
    }
    match &input.id {
        Some(id) => {
            let a = grid.acts.iter_mut().find(|a| &a.id == id).ok_or("Acte introuvable.")?;
            if a.price_cents != input.price_cents {
                a.price_history.push(PricePoint { price_cents: input.price_cents, from: today.into(), by: by.into(), at: now.into() });
            }
            a.code = code;
            a.label = label;
            a.category = input.category.clone();
            a.price_cents = input.price_cents;
            a.ngap_letter = letter;
            a.ngap_coefficient = coeff;
            if let Some(o) = input.order {
                a.order = o;
            }
        }
        None => {
            let order = input.order.unwrap_or_else(|| grid.acts.iter().map(|a| a.order).max().unwrap_or(0) + 1);
            let mut act = Act {
                id: random_act_id(),
                code,
                label,
                category: input.category.clone(),
                price_cents: input.price_cents,
                ngap_letter: letter,
                ngap_coefficient: coeff,
                active: true,
                order,
                price_history: Vec::new(),
                created_at: now.into(),
                created_by: by.into(),
            };
            if input.price_cents.is_some() {
                act.price_history.push(PricePoint { price_cents: input.price_cents, from: today.into(), by: by.into(), at: now.into() });
            }
            grid.acts.push(act);
        }
    }
    save(dir, key, &grid)?;
    Ok(grid)
}

/// Un acte ne se supprime jamais : il se désactive (il reste lisible sur les anciennes notes).
pub fn set_active(dir: &Path, key: &[u8; KEY_LEN], role: Role, id: &str, active: bool) -> Result<Grid, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin modifie la grille tarifaire.".into());
    }
    let _g = lock();
    let mut grid = load(dir, key)?;
    grid.acts.iter_mut().find(|a| a.id == id).ok_or("Acte introuvable.")?.active = active;
    save(dir, key, &grid)?;
    Ok(grid)
}

pub fn save_settings(dir: &Path, key: &[u8; KEY_LEN], role: Role, cap_pct: u32, free_days: u32) -> Result<Grid, String> {
    if role != Role::Medecin {
        return Err("Seul le médecin règle les remises.".into());
    }
    if cap_pct > 100 {
        return Err("Plafond de remise : entre 0 et 100 %.".into());
    }
    if free_days > 365 {
        return Err("Délai de contrôle gratuit : 365 jours au plus.".into());
    }
    let _g = lock();
    let mut grid = load(dir, key)?;
    grid.settings = Settings { assistant_discount_cap_pct: cap_pct, free_control_days: free_days };
    save(dir, key, &grid)?;
    Ok(grid)
}

// ─── Lignes et remises ───────────────────────────────────────────────────────

#[derive(Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscountInput {
    /// `PERCENT` · `AMOUNT` · `FREE`
    pub kind: String,
    #[serde(default)]
    pub percent: Option<u32>,
    #[serde(default)]
    pub amount_cents: Option<i64>,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub reason_text: Option<String>,
}

#[derive(Deserialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LineInput {
    #[serde(default)]
    pub act_id: Option<String>,
    /// Ligne libre seulement.
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub quantity: Option<u32>,
    /// Ligne libre : prix saisi. Ligne de grille : doit être absent ou égal au tarif.
    #[serde(default)]
    pub unit_price_cents: Option<i64>,
    #[serde(default)]
    pub discount: Option<DiscountInput>,
}

/// Contexte de calcul (jamais construit par l'interface).
pub struct Pricing<'a> {
    pub grid: &'a Grid,
    pub role: Role,
    pub by: &'a str,
    pub now: &'a str,
    pub today: &'a str,
    /// Le patient a une consultation payée dans le délai du contrôle gratuit (calculé par Rust).
    pub free_control_eligible: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Computed {
    pub lines: Vec<Value>,
    pub note_discount: Option<Value>,
    pub gross: i64,
    pub line_discounts: i64,
    pub note_discount_cents: i64,
    pub net: i64,
}

impl Computed {
    pub fn discount_total(&self) -> i64 {
        self.line_discounts + self.note_discount_cents
    }
}

/// Remise sur `base` centimes : motif validé, montant calculé, auteur et date posés ici.
fn apply_discount(base: i64, d: &DiscountInput, p: &Pricing) -> Result<(Value, i64), String> {
    if !REASONS.contains(&d.reason.as_str()) {
        return Err("Motif de remise obligatoire : choisissez un motif dans la liste.".into());
    }
    let text = if d.reason == "AUTRE" {
        let t = clean(d.reason_text.as_deref().unwrap_or(""), MAX_CHARS_REASON_TEXT, "Précision du motif", true)?;
        if t.chars().count() < MIN_CHARS_REASON_TEXT {
            return Err("Précision du motif : 3 caractères au moins.".into());
        }
        Some(t)
    } else {
        None
    };
    if base <= 0 {
        return Err("Aucun montant sur lequel appliquer une remise.".into());
    }
    let cents = match d.kind.as_str() {
        "PERCENT" => {
            let pct = d.percent.ok_or("Pourcentage de remise obligatoire.")?;
            if !(1..=100).contains(&pct) {
                return Err("Pourcentage de remise : entre 1 et 100.".into());
            }
            (base * pct as i64 + 50) / 100
        }
        "AMOUNT" => {
            let a = d.amount_cents.ok_or("Montant de remise obligatoire.")?;
            if a <= 0 || a > base {
                return Err("Montant de remise : supérieur à 0 et au plus égal au montant remisé.".into());
            }
            a
        }
        "FREE" => base,
        _ => return Err("Type de remise inconnu.".into()),
    };
    if p.role == Role::Assistant {
        if d.kind == "FREE" {
            if d.reason != FREE_CONTROL_REASON {
                return Err("Gratuité réservée au médecin (sauf contrôle gratuit).".into());
            }
            if !p.free_control_eligible {
                return Err("Contrôle gratuit refusé : aucune consultation payée dans le délai réglé par le médecin.".into());
            }
        } else if p.grid.settings.assistant_discount_cap_pct == 0 {
            return Err("Remise réservée au médecin.".into());
        }
    }
    let mut v = json!({
        "kind": d.kind,
        "reason": d.reason,
        "cents": cents,
        "by": p.by,
        "at": p.now,
        "date": p.today,
    });
    let o = v.as_object_mut().expect("objet");
    if d.kind == "PERCENT" {
        o.insert("percent".into(), json!(d.percent));
    }
    if d.kind == "AMOUNT" {
        o.insert("amountCents".into(), json!(d.amount_cents));
    }
    if let Some(t) = text {
        o.insert("reasonText".into(), json!(t));
    }
    Ok((v, cents))
}

fn line_json(act: Option<&Act>, label: &str, qty: u32, unit: i64, gross: i64, discount: Option<Value>, discount_cents: i64) -> Value {
    let mut o = Map::new();
    if let Some(a) = act {
        o.insert("actId".into(), json!(a.id));
        o.insert("code".into(), json!(a.code));
        o.insert("category".into(), json!(a.category));
        if let Some(l) = &a.ngap_letter {
            o.insert("ngapLetter".into(), json!(l));
        }
        if let Some(c) = &a.ngap_coefficient {
            o.insert("ngapCoefficient".into(), json!(c));
        }
        o.insert("tariffUnitCents".into(), json!(unit));
    }
    o.insert("label".into(), json!(label));
    o.insert("quantity".into(), json!(qty));
    o.insert("unitPriceCents".into(), json!(unit));
    o.insert("grossCents".into(), json!(gross));
    if let Some(d) = discount {
        o.insert("discount".into(), d);
    }
    o.insert("discountCents".into(), json!(discount_cents));
    o.insert("netCents".into(), json!(gross - discount_cents));
    Value::Object(o)
}

/// Calcule les lignes d'une note (pur, testable). Le brut est toujours « au tarif ».
pub fn compute(inputs: &[LineInput], note_discount: Option<&DiscountInput>, p: &Pricing) -> Result<Computed, String> {
    if inputs.is_empty() {
        return Err("Une note comporte au moins une ligne.".into());
    }
    if inputs.len() > 30 {
        return Err("30 lignes au plus par note.".into());
    }
    let mut lines = Vec::with_capacity(inputs.len());
    let (mut gross, mut line_discounts) = (0i64, 0i64);
    let mut capped_discounts = 0i64; // remises hors gratuité « contrôle » : soumises au plafond de l'assistante
    for li in inputs {
        let qty = li.quantity.unwrap_or(1);
        if !(1..=MAX_QTY).contains(&qty) {
            return Err(format!("Quantité : entre 1 et {MAX_QTY}."));
        }
        let (act, label, unit) = match li.act_id.as_deref() {
            Some(id) => {
                let a = p.grid.find(id).ok_or("Acte inconnu.")?;
                if !a.active {
                    return Err(format!("L'acte « {} » est désactivé.", a.label));
                }
                let price = a.price_cents.filter(|x| *x > 0).ok_or_else(|| format!("L'acte « {} » n'a pas de prix : complétez la grille tarifaire.", a.label))?;
                if let Some(sent) = li.unit_price_cents {
                    if sent != price {
                        return Err(format!("Le prix de « {} » vient de la grille ({} ≠ {}) : appliquez une remise avec motif.", a.label, sent, price));
                    }
                }
                (Some(a), a.label.clone(), price)
            }
            None => {
                if p.role != Role::Medecin {
                    return Err("Ligne libre réservée au médecin : choisissez un acte de la grille.".into());
                }
                let label = clean(li.label.as_deref().unwrap_or(""), 120, "Libellé de la ligne", true)?;
                let price = li.unit_price_cents.ok_or("Prix de la ligne obligatoire.")?;
                if price <= 0 || price > MAX_CENTS {
                    return Err("Prix de la ligne invalide.".into());
                }
                (None, label, price)
            }
        };
        let g = unit.checked_mul(qty as i64).filter(|x| *x <= MAX_CENTS).ok_or("Montant de la ligne trop élevé.")?;
        let (dv, dc) = match &li.discount {
            Some(d) => {
                let (v, c) = apply_discount(g, d, p)?;
                if d.kind != "FREE" {
                    capped_discounts += c;
                }
                (Some(v), c)
            }
            None => (None, 0),
        };
        gross += g;
        line_discounts += dc;
        lines.push(line_json(act, &label, qty, unit, g, dv, dc));
    }
    let base = gross - line_discounts;
    let (note_v, note_c) = match note_discount {
        Some(d) => {
            let (v, c) = apply_discount(base, d, p)?;
            if d.kind != "FREE" {
                capped_discounts += c;
            }
            (Some(v), c)
        }
        None => (None, 0),
    };
    if p.role == Role::Assistant && capped_discounts * 100 > p.grid.settings.assistant_discount_cap_pct as i64 * gross {
        return Err(format!("Remise réservée au médecin : au-delà de {} % du montant de la note.", p.grid.settings.assistant_discount_cap_pct));
    }
    Ok(Computed { lines, note_discount: note_v, gross, line_discounts, note_discount_cents: note_c, net: gross - line_discounts - note_c })
}

fn amount_json(cents: i64) -> Value {
    payments::amount_json(cents)
}

/// Écrit dans la note les champs calculés (lignes, remises, totaux, services dérivés, montant en lettres).
pub fn write_into_note(obj: &mut Map<String, Value>, c: &Computed, issuer: Option<Value>) {
    for f in FROZEN_FIELDS {
        obj.remove(f);
    }
    obj.insert("lines".into(), Value::Array(c.lines.clone()));
    if let Some(d) = &c.note_discount {
        obj.insert("noteDiscount".into(), d.clone());
    }
    obj.insert("grossCents".into(), json!(c.gross));
    obj.insert("lineDiscountsCents".into(), json!(c.line_discounts));
    obj.insert("noteDiscountCents".into(), json!(c.note_discount_cents));
    obj.insert("discountCents".into(), json!(c.discount_total()));
    obj.insert("netCents".into(), json!(c.net));
    obj.insert("totalAmount".into(), amount_json(c.net));
    obj.insert("totalInWords".into(), json!(receipts::amount_in_words(c.net)));
    // Copie dérivée pour le code qui lit encore `services` : prix = net de la ligne, en dirhams.
    let services: Vec<Value> = c
        .lines
        .iter()
        .map(|l| {
            let q = l.get("quantity").and_then(|v| v.as_u64()).unwrap_or(1);
            let label = l.get("label").and_then(|v| v.as_str()).unwrap_or("");
            json!({"name": if q > 1 { format!("{label} × {q}") } else { label.to_string() }, "price": amount_json(l.get("netCents").and_then(|v| v.as_i64()).unwrap_or(0)), "checked": true})
        })
        .collect();
    obj.insert("services".into(), Value::Array(services));
    if let Some(i) = issuer {
        obj.insert("issuer".into(), i);
    }
    obj.insert("pricing".into(), json!(1));
}

/// Note sans `lines` : une ligne libre « Honoraires » au montant actuel. Aucun montant, statut ni champ de
/// paiement n'est touché ; `services` d'origine est conservé ; le montant en lettres n'est posé que s'il manque.
pub fn wrap_legacy(obj: &mut Map<String, Value>) {
    let total = payments::cents_of(obj.get("totalAmount").and_then(|v| v.as_f64()).unwrap_or(0.0)).max(0);
    let line = line_json(None, LEGACY_LABEL, 1, total, total, None, 0);
    obj.insert("lines".into(), Value::Array(vec![line]));
    obj.insert("grossCents".into(), json!(total));
    obj.insert("lineDiscountsCents".into(), json!(0));
    obj.insert("noteDiscountCents".into(), json!(0));
    obj.insert("discountCents".into(), json!(0));
    obj.insert("netCents".into(), json!(total));
    obj.insert("legacyLine".into(), json!(true));
    obj.insert("pricing".into(), json!(1));
    let words_missing = obj.get("totalInWords").and_then(|v| v.as_str()).map_or(true, |s| s.trim().is_empty());
    if words_missing {
        obj.insert("totalInWords".into(), json!(receipts::amount_in_words(total)));
    }
}

pub fn has_lines(n: &Value) -> bool {
    n.get("lines").map_or(false, |l| l.is_array())
}

/// Instantané de l'identité professionnelle, figé dans la note à l'émission.
pub fn issuer_snapshot(info: &Value) -> Value {
    let g = |k: &str| -> Option<String> {
        let t: String = info.get(k)?.as_str()?.chars().filter(|c| !c.is_control()).collect();
        let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
        (!t.is_empty()).then(|| t.chars().take(300).collect())
    };
    let name = g("nameFr").or_else(|| g("name"));
    let mut o = Map::new();
    for (k, v) in [
        ("name", name),
        ("cabinetName", g("cabinetName")),
        ("specialty", g("specialtyFr")),
        ("ordreNumber", g("ordreNumber")),
        ("inpe", g("inpe")),
        ("ifNumber", g("taxId")),
        ("tp", g("patente")),
        ("ice", g("ice")),
        ("cnss", g("cnssEmployer")),
        ("address", g("addressFr")),
        ("phone", g("phone")),
        ("email", g("email")),
        ("rib", g("rib")),
    ] {
        if let Some(v) = v {
            o.insert(k.into(), json!(v));
        }
    }
    o.insert("hasStamp".into(), json!(g("stampAttachmentId").is_some()));
    Value::Object(o)
}

fn id_of(n: &Value) -> &str {
    n.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

/// Crochet de l'écriture complète des notes par le médecin (`numbering::on_save`), AVANT la numérotation :
/// - note déjà émise avec lignes : champs figés réimposés (l'interface ne peut ni les changer ni les forger) ;
/// - note héritée sans lignes : champs calculés retirés de ce que l'interface envoie (jamais acceptés tels quels) ;
/// - note nouvelle : lignes calculées par Rust depuis la grille (ou, sans lignes, enveloppe « Honoraires »),
///   instantané de l'identité figé.
pub fn prepare_notes(dir: &Path, key: &[u8; KEY_LEN], stored: &[Value], incoming: &mut [Value], role: Role, by: &str, now: &str, today: &str) -> Result<(), String> {
    let mut grid: Option<Grid> = None;
    let mut issuer: Option<Value> = None;
    for n in incoming.iter_mut() {
        let id = id_of(n).to_string();
        let prev = if id.is_empty() { None } else { stored.iter().find(|s| id_of(s) == id) };
        let Some(obj) = n.as_object_mut() else { continue };
        match prev {
            Some(p) if numbering::is_cancelled(p) => continue,
            Some(p) if has_lines(p) => {
                for f in FROZEN_FIELDS {
                    match p.get(f) {
                        Some(v) => obj.insert(f.into(), v.clone()),
                        None => obj.remove(f),
                    };
                }
            }
            Some(_) => {
                for f in FROZEN_FIELDS.iter().filter(|f| **f != "totalAmount" && **f != "totalInWords" && **f != "services") {
                    obj.remove(*f);
                }
            }
            None => {
                let lines = obj.get("lines").cloned();
                let nd = obj.get("noteDiscount").cloned();
                if issuer.is_none() {
                    let info = read_enc_json_in(dir, key, super::receipts::DOCTOR_INFO_FILE)?.unwrap_or_else(|| json!({}));
                    issuer = Some(issuer_snapshot(&info));
                }
                match lines {
                    Some(Value::Array(arr)) => {
                        if grid.is_none() {
                            grid = Some(load(dir, key)?);
                        }
                        let inputs: Vec<LineInput> = serde_json::from_value(Value::Array(arr)).map_err(|_| "Lignes de la note invalides.".to_string())?;
                        let nd: Option<DiscountInput> = match nd {
                            Some(Value::Null) | None => None,
                            Some(v) => Some(serde_json::from_value(v).map_err(|_| "Remise de la note invalide.".to_string())?),
                        };
                        let p = Pricing { grid: grid.as_ref().expect("grille"), role, by, now, today, free_control_eligible: false };
                        let c = compute(&inputs, nd.as_ref(), &p)?;
                        write_into_note(obj, &c, issuer.clone());
                    }
                    _ => {
                        for f in FROZEN_FIELDS.iter().filter(|f| **f != "totalAmount" && **f != "totalInWords" && **f != "services") {
                            obj.remove(*f);
                        }
                        wrap_legacy(obj);
                        if let Some(i) = issuer.clone() {
                            obj.insert("issuer".into(), i);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

// ─── Contrôle gratuit ────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ControlOffer {
    pub note_id: String,
    pub note_number: String,
    pub date: String,
    pub days: u32,
}

/// Consultation payée du patient dans le délai (jours calendaires, jour même compris). Le contrôle gratuit se
/// PROPOSE, il n'est jamais appliqué d'office. `None` : désactivé (0 jour) ou aucune consultation éligible.
pub fn free_control_offer(notes: &[Value], entries: &[payments::Entry], patient_id: &str, today: &str, days: u32) -> Option<ControlOffer> {
    if days == 0 || patient_id.is_empty() {
        return None;
    }
    let t = super::accounting::parse_day(today)?;
    let mut best: Option<(&str, &Value)> = None;
    for n in notes {
        if n.get("patientId").and_then(|v| v.as_str()) != Some(patient_id) || numbering::is_cancelled(n) {
            continue;
        }
        let date = n.get("date").and_then(|v| v.as_str()).unwrap_or("").get(..10).unwrap_or("");
        let Some(d) = super::accounting::parse_day(date) else { continue };
        if d > t || t - d > days as i64 {
            continue;
        }
        let paid_consult = n.get("lines").and_then(|l| l.as_array()).map_or(false, |ls| {
            ls.iter().any(|l| l.get("category").and_then(|c| c.as_str()) == Some("CONSULTATION") && l.get("netCents").and_then(|c| c.as_i64()).unwrap_or(0) > 0)
        });
        if paid_consult && payments::net_cents(entries, id_of(n)) > 0 && best.map_or(true, |(bd, _)| date > bd) {
            best = Some((date, n));
        }
    }
    best.map(|(date, n)| ControlOffer { note_id: id_of(n).to_string(), note_number: numbering::number_of(n).to_string(), date: date.to_string(), days })
}

// ─── Migration ───────────────────────────────────────────────────────────────

fn statuses(notes: &[Value]) -> Vec<(String, Option<String>, Option<f64>, Option<f64>)> {
    notes
        .iter()
        .map(|n| {
            (
                id_of(n).to_string(),
                n.get("status").and_then(|v| v.as_str()).map(String::from),
                n.get("amountPaid").and_then(|v| v.as_f64()),
                n.get("totalAmount").and_then(|v| v.as_f64()),
            )
        })
        .collect()
}

/// Résultat d'une migration (testable).
#[derive(Debug, PartialEq)]
pub struct MigrationReport {
    pub migrated: usize,
    pub total_before_cents: i64,
    pub total_after_cents: i64,
}

/// Migration explicite (médecin) : toute note stockée sans `lines` reçoit sa ligne « Honoraires ». Sauvegarde
/// préalable de `migration_backups/` ; si la somme des montants ou un statut change, rien n'est écrit.
pub fn migrate_notes(dir: &Path, key: &[u8; KEY_LEN]) -> Result<MigrationReport, String> {
    let (pending, mut notes) = numbering::begin(dir, key, true)?;
    let todo: Vec<usize> = notes.iter().enumerate().filter(|(_, n)| !has_lines(n)).map(|(i, _)| i).collect();
    let sum = |ns: &[Value]| -> i64 { ns.iter().map(payments::total_cents).sum() };
    if todo.is_empty() {
        return Ok(MigrationReport { migrated: 0, total_before_cents: sum(&notes), total_after_cents: sum(&notes) });
    }
    let before_total = sum(&notes);
    let before_status = statuses(&notes);
    super::users::backup_data_dir(dir)?;
    for i in &todo {
        if let Some(o) = notes[*i].as_object_mut() {
            wrap_legacy(o);
        }
    }
    let after_total = sum(&notes);
    if after_total != before_total || statuses(&notes) != before_status {
        return Err("Migration annulée : un montant ou un statut aurait changé (aucune écriture).".into());
    }
    write_enc_json_in(dir, key, numbering::NOTES_FILE, &Value::Array(notes))?;
    pending.commit()?;
    Ok(MigrationReport { migrated: todo.len(), total_before_cents: before_total, total_after_cents: after_total })
}

// ─── Commandes ───────────────────────────────────────────────────────────────

use super::access::{gate, require_session};
use super::audit;
use super::users::data_key_of;
use super::{data_dir, util, AppState};

/// Grille et réglages : lecture + utilisation pour toute session.
#[tauri::command]
pub fn tariff_grid<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<Grid, String> {
    require_session(gate(&app, &state, "tariff_grid")?)?;
    let key = data_key_of(&state)?;
    load(&data_dir(&app)?, &key)
}

/// Contrôle gratuit à proposer pour ce patient (consultation payée dans le délai), sinon `None`.
#[tauri::command]
pub fn tariff_free_control_offer<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, patient_id: String) -> Result<Option<ControlOffer>, String> {
    require_session(gate(&app, &state, "tariff_free_control_offer")?)?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let grid = load(&dir, &key)?;
    let notes = numbering::read_notes(&dir, &key);
    let entries = payments::load(&dir, &key)?;
    Ok(free_control_offer(&notes, &entries, &patient_id, &util::today_local(), grid.settings.free_control_days))
}

/// Journal : identifiant de l'acte seulement (jamais le prix).
#[tauri::command]
pub fn tariff_act_save<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, act: ActInput) -> Result<Grid, String> {
    let session = require_session(gate(&app, &state, "tariff_act_save")?)?;
    let key = data_key_of(&state)?;
    let r = save_act(&data_dir(&app)?, &key, session.role, &act, &session.name, &util::now_iso(), &util::today_local());
    audit::log(&app, Some(&session), "tariff_act_save", &match &r { Ok(_) => act.id.clone().unwrap_or_else(|| "nouvel acte".into()), Err(_) => "refusé".into() }, r.is_ok());
    r
}

#[tauri::command]
pub fn tariff_act_set_active<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, id: String, active: bool) -> Result<Grid, String> {
    let session = require_session(gate(&app, &state, "tariff_act_set_active")?)?;
    let key = data_key_of(&state)?;
    let r = set_active(&data_dir(&app)?, &key, session.role, &id, active);
    audit::log(&app, Some(&session), "tariff_act_set_active", if r.is_ok() { &id } else { "refusé" }, r.is_ok());
    r
}

#[tauri::command]
pub fn tariff_settings_save<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, assistant_discount_cap_pct: u32, free_control_days: u32) -> Result<Grid, String> {
    let session = require_session(gate(&app, &state, "tariff_settings_save")?)?;
    let key = data_key_of(&state)?;
    let r = save_settings(&data_dir(&app)?, &key, session.role, assistant_discount_cap_pct, free_control_days);
    audit::log(&app, Some(&session), "tariff_settings_save", &format!("plafond {assistant_discount_cap_pct} % · contrôle {free_control_days} j"), r.is_ok());
    r
}

/// Aperçu d'une note en cours de saisie (aucune écriture) : lignes, remises et totaux CALCULÉS par Rust avec
/// les droits de la session. L'interface n'additionne jamais de montants : elle affiche ce résultat.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub lines: Vec<Value>,
    pub note_discount: Option<Value>,
    pub gross_cents: i64,
    pub line_discounts_cents: i64,
    pub note_discount_cents: i64,
    pub discount_cents: i64,
    pub net_cents: i64,
    pub in_words: String,
}

pub fn preview(inputs: &[LineInput], note_discount: Option<&DiscountInput>, p: &Pricing) -> Result<Preview, String> {
    let c = compute(inputs, note_discount, p)?;
    Ok(Preview {
        discount_cents: c.discount_total(),
        in_words: receipts::amount_in_words(c.net),
        lines: c.lines,
        note_discount: c.note_discount,
        gross_cents: c.gross,
        line_discounts_cents: c.line_discounts,
        note_discount_cents: c.note_discount_cents,
        net_cents: c.net,
    })
}

/// Aperçu pour l'écran de note (médecin) ou d'encaissement (assistante).
#[tauri::command]
pub fn tariff_preview<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<AppState>,
    lines: Vec<LineInput>,
    note_discount: Option<DiscountInput>,
    patient_id: Option<String>,
) -> Result<Preview, String> {
    let session = require_session(gate(&app, &state, "tariff_preview")?)?;
    let key = data_key_of(&state)?;
    let dir = data_dir(&app)?;
    let grid = load(&dir, &key)?;
    let today = util::today_local();
    let eligible = match patient_id.as_deref() {
        Some(p) if !p.is_empty() => free_control_offer(&numbering::read_notes(&dir, &key), &payments::load(&dir, &key)?, p, &today, grid.settings.free_control_days).is_some(),
        _ => false,
    };
    let now = util::now_iso();
    let p = Pricing { grid: &grid, role: session.role, by: &session.name, now: &now, today: &today, free_control_eligible: eligible };
    preview(&lines, note_discount.as_ref(), &p)
}

/// Reprise des notes sans lignes (médecin) : lancée à l'ouverture de sa session ; relançable sans effet.
#[tauri::command]
pub fn tariffs_migrate<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<usize, String> {
    let session = require_session(gate(&app, &state, "tariffs_migrate")?)?;
    let key = data_key_of(&state)?;
    let r = migrate_notes(&data_dir(&app)?, &key);
    if let Ok(m) = &r {
        if m.migrated > 0 {
            audit::log(&app, Some(&session), "tariffs_migrate", &format!("{} note(s) reprise(s)", m.migrated), true);
        }
    }
    r.map(|m| m.migrated)
}

#[cfg(test)]
#[path = "tariff_tests.rs"]
mod tests;
