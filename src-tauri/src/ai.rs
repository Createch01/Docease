//! Appels Gemini côté Rust : la clé API ne quitte jamais ce module.
//!
//! - La clé et l'interrupteur « Fonctions IA » sont stockés dans `meddoc_ai.bin`,
//!   chiffré en AES-256-GCM avec la clé de données (même mécanisme que les JSON
//!   patients). Sans déverrouillage, rien n'est lisible.
//! - Le frontend ne reçoit que l'état (activé, clé présente, 4 derniers caractères).
//! - Les textes libres sont minimisés avant envoi (voir `scrub`). Aucun contenu
//!   patient n'est écrit dans les logs : ce module ne journalise rien.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Manager;

use super::access::gate;
use super::{decrypt, encrypt, AppState, KEY_LEN};

const AI_FILE: &str = "meddoc_ai.bin";
const MODEL: &str = "gemini-2.0-flash";
const ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT: Duration = Duration::from_secs(30);
const MAX_DOC_BYTES: usize = 15 * 1024 * 1024; // base64 ~ 20 Mo max côté API

const MSG_LOCKED: &str = "DocEase est verrouillé.";
const MSG_DISABLED: &str = "Les fonctions IA sont désactivées. Activez-les dans Paramètres › Sécurité.";
const MSG_NO_KEY: &str = "Aucune clé API Gemini enregistrée. Ajoutez-la dans Paramètres › Sécurité.";
const MSG_INVALID_KEY: &str = "Clé API Gemini invalide ou expirée. Vérifiez-la dans Paramètres › Sécurité.";
const MSG_QUOTA: &str = "Quota ou limite de requêtes Gemini dépassé. Réessayez plus tard.";
const MSG_NETWORK: &str = "Impossible de joindre le service IA. Vérifiez votre connexion internet.";
const MSG_TIMEOUT: &str = "Le service IA n'a pas répondu à temps (30 s). Réessayez.";

#[derive(Serialize, Deserialize, Default)]
struct AiConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    api_key: Option<String>,
}

#[derive(Serialize)]
pub struct AiStatus {
    enabled: bool,
    has_key: bool,
    /// 4 derniers caractères seulement, jamais la clé.
    key_suffix: Option<String>,
    /// Clé fournie par .env.local (builds de développement uniquement).
    from_dev: bool,
}

#[derive(Deserialize)]
pub struct PatientContext {
    age: Option<f64>,
    sex: Option<String>,
    weight: Option<f64>,
}

// ─── Stockage chiffré ────────────────────────────────────────────────────────

fn ai_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let mut p = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    p.push(AI_FILE);
    Ok(p)
}

fn data_key(state: &tauri::State<AppState>) -> Result<[u8; KEY_LEN], String> {
    state.key.lock().map_err(|e| e.to_string())?
        .ok_or_else(|| MSG_LOCKED.to_string())
}

fn load_cfg<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &[u8; KEY_LEN]) -> Result<AiConfig, String> {
    let path = ai_path(app)?;
    if !path.exists() {
        return Ok(AiConfig::default());
    }
    let encrypted = fs::read(path).map_err(|e| e.to_string())?;
    let plain = decrypt(key, &encrypted)?;
    serde_json::from_slice(&plain).map_err(|e| e.to_string())
}

fn save_cfg<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &[u8; KEY_LEN], cfg: &AiConfig) -> Result<(), String> {
    let json = serde_json::to_vec(cfg).map_err(|e| e.to_string())?;
    super::users::write_atomic(&ai_path(app)?, &encrypt(key, &json)?)
}

/// Développement uniquement : lit DEV_GEMINI_API_KEY dans .env.local. Compilé hors
/// des builds release, donc ni le chemin ni le nom de la variable n'y figurent.
#[cfg(debug_assertions)]
fn dev_key() -> Option<String> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../.env.local");
    let content = fs::read_to_string(path).ok()?;
    content.lines().find_map(|line| {
        let v = line.trim().strip_prefix("DEV_GEMINI_API_KEY=")?;
        let v = v.trim().trim_matches('"').trim_matches('\'');
        (!v.is_empty()).then(|| v.to_string())
    })
}

#[cfg(not(debug_assertions))]
fn dev_key() -> Option<String> {
    None
}

fn effective_key(cfg: &AiConfig) -> Option<(String, bool)> {
    match cfg.api_key.as_deref().filter(|k| !k.is_empty()) {
        Some(k) => Some((k.to_string(), false)),
        None => dev_key().map(|k| (k, true)),
    }
}

fn status_of(cfg: &AiConfig) -> AiStatus {
    let eff = effective_key(cfg);
    AiStatus {
        enabled: cfg.enabled,
        has_key: eff.is_some(),
        key_suffix: eff.as_ref().map(|(k, _)| {
            let chars: Vec<char> = k.chars().collect();
            chars[chars.len().saturating_sub(4)..].iter().collect()
        }),
        from_dev: eff.map(|(_, d)| d).unwrap_or(false),
    }
}

/// Garde commune de tous les appels qui envoient des données : verrou ouvert,
/// interrupteur activé, clé présente.
fn require_ready<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &tauri::State<AppState>) -> Result<String, String> {
    let dk = data_key(state)?;
    let cfg = load_cfg(app, &dk)?;
    if !cfg.enabled {
        return Err(MSG_DISABLED.to_string());
    }
    effective_key(&cfg).map(|(k, _)| k).ok_or_else(|| MSG_NO_KEY.to_string())
}

// ─── Minimisation des données ────────────────────────────────────────────────

/// Retire des textes libres ce qui identifie le patient : termes connus (nom,
/// prénom, téléphone, CIN, adresse, n° de dossier), e-mails, suites de ≥ 6
/// chiffres (téléphone, CIN, n° de dossier, dates complètes) et CIN (1-2 lettres
/// + ≥ 5 chiffres).
fn scrub(text: &str, terms: &[String]) -> String {
    let mut out = text.to_string();
    for term in terms.iter().map(|t| t.trim()).filter(|t| t.chars().count() >= 3) {
        out = replace_ci(&out, term, "[…]");
    }
    let chars: Vec<char> = out.chars().collect();
    let mut res = String::with_capacity(out.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_digit() || (c == '+' && chars.get(i + 1).map_or(false, |n| n.is_ascii_digit())) {
            // Suite de chiffres tolérant des séparateurs simples (espace . - /).
            let (mut j, mut digits, mut end) = (i, 0, i);
            while j < chars.len() {
                if chars[j].is_ascii_digit() {
                    digits += 1;
                    j += 1;
                    end = j;
                } else if matches!(chars[j], ' ' | '.' | '-' | '/' | '+')
                    && chars.get(j + 1).map_or(false, |n| n.is_ascii_digit())
                {
                    j += 1;
                } else {
                    break;
                }
            }
            if digits >= 6 {
                res.push_str("[…]");
            } else {
                res.extend(&chars[i..end]);
            }
            i = end.max(i + 1);
            continue;
        }
        res.push(c);
        i += 1;
    }
    // Mots : e-mails et CIN (lettres + chiffres).
    res.split_inclusive(char::is_whitespace)
        .map(|tok| {
            let core = tok.trim_matches(|c: char| !c.is_alphanumeric() && c != '@');
            let letters = core.chars().take_while(|c| c.is_ascii_alphabetic()).count();
            let rest = &core[letters..];
            let is_cin = (1..=2).contains(&letters)
                && rest.len() >= 5
                && rest.chars().all(|c| c.is_ascii_digit());
            if core.contains('@') || is_cin {
                tok.replacen(core, "[…]", 1)
            } else {
                tok.to_string()
            }
        })
        .collect()
}

fn replace_ci(haystack: &str, needle: &str, with: &str) -> String {
    let (h, n) = (haystack.to_lowercase(), needle.to_lowercase());
    // La casse peut changer la longueur en octets pour certains caractères : dans
    // ce cas on évite de découper à tort et on masque tout le texte par prudence.
    if h.len() != haystack.len() {
        return haystack.replace(needle, with);
    }
    let mut out = String::new();
    let mut last = 0;
    for (idx, _) in h.match_indices(&n) {
        if idx < last {
            continue;
        }
        out.push_str(&haystack[last..idx]);
        out.push_str(with);
        last = idx + n.len();
    }
    out.push_str(&haystack[last..]);
    out
}

fn patient_line(p: &PatientContext) -> String {
    let mut parts = Vec::new();
    if let Some(a) = p.age {
        parts.push(format!("Âge : {} ans", a.round() as i64));
    }
    match p.sex.as_deref() {
        Some("M") => parts.push("Sexe : masculin".to_string()),
        Some("F") => parts.push("Sexe : féminin".to_string()),
        _ => {}
    }
    if let Some(w) = p.weight.filter(|w| *w > 0.0) {
        parts.push(format!("Poids : {} kg", w));
    }
    if parts.is_empty() { "Non précisé".to_string() } else { parts.join(" ; ") }
}

// ─── Appel Gemini ────────────────────────────────────────────────────────────

fn map_net_error(e: reqwest::Error) -> String {
    if e.is_timeout() { MSG_TIMEOUT } else { MSG_NETWORK }.to_string()
}

async fn map_status(resp: reqwest::Response) -> String {
    let code = resp.status().as_u16();
    match code {
        401 | 403 => MSG_INVALID_KEY.to_string(),
        429 => MSG_QUOTA.to_string(),
        400 => {
            let body = resp.text().await.unwrap_or_default();
            if body.contains("API_KEY_INVALID") || body.contains("API key not valid") {
                MSG_INVALID_KEY.to_string()
            } else {
                "Requête refusée par le service IA (400).".to_string()
            }
        }
        _ => format!("Le service IA est indisponible (erreur {code}). Réessayez plus tard."),
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| MSG_NETWORK.to_string())
}

async fn generate(key: &str, parts: Vec<Value>) -> Result<Value, String> {
    let body = json!({
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": { "responseMimeType": "application/json", "temperature": 0.2 }
    });
    let resp = client()?
        .post(format!("{ENDPOINT}/models/{MODEL}:generateContent"))
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .await
        .map_err(map_net_error)?;
    if !resp.status().is_success() {
        return Err(map_status(resp).await);
    }
    let v: Value = resp.json().await.map_err(|e| map_net_error(e))?;
    let text = v
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(Value::as_str)
        .ok_or("Réponse vide ou bloquée par le service IA.")?;
    let cleaned = text.replace("```json", "").replace("```", "");
    serde_json::from_str(cleaned.trim()).map_err(|_| "Réponse du service IA illisible.".to_string())
}

// ─── Commandes ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn ai_status<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<AiStatus, String> {
    gate(&app, &state, "ai_status")?;
    let dk = data_key(&state)?;
    Ok(status_of(&load_cfg(&app, &dk)?))
}

#[tauri::command]
pub fn ai_set_enabled<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, enabled: bool) -> Result<AiStatus, String> {
    gate(&app, &state, "ai_set_enabled")?;
    let dk = data_key(&state)?;
    let mut cfg = load_cfg(&app, &dk)?;
    cfg.enabled = enabled;
    save_cfg(&app, &dk, &cfg)?;
    Ok(status_of(&cfg))
}

#[tauri::command]
pub fn ai_save_key<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>, api_key: String) -> Result<AiStatus, String> {
    gate(&app, &state, "ai_save_key")?;
    let k = api_key.trim();
    if k.len() < 20 || k.chars().any(char::is_whitespace) {
        return Err("Cette clé ne ressemble pas à une clé API Gemini.".to_string());
    }
    let dk = data_key(&state)?;
    let mut cfg = load_cfg(&app, &dk)?;
    cfg.api_key = Some(k.to_string());
    save_cfg(&app, &dk, &cfg)?;
    Ok(status_of(&cfg))
}

#[tauri::command]
pub fn ai_delete_key<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<AppState>) -> Result<AiStatus, String> {
    gate(&app, &state, "ai_delete_key")?;
    let dk = data_key(&state)?;
    let mut cfg = load_cfg(&app, &dk)?;
    cfg.api_key = None;
    save_cfg(&app, &dk, &cfg)?;
    Ok(status_of(&cfg))
}

/// Teste la clé enregistrée (ou celle de .env.local en dev) sans envoyer aucune
/// donnée médicale : simple lecture de la liste des modèles. Fonctionne même
/// quand l'interrupteur est désactivé.
#[tauri::command]
pub async fn ai_test_key<R: tauri::Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    gate(&app, &state, "ai_test_key")?;
    let dk = data_key(&state)?;
    let cfg = load_cfg(&app, &dk)?;
    let (key, _) = effective_key(&cfg).ok_or_else(|| MSG_NO_KEY.to_string())?;
    let resp = client()?
        .get(format!("{ENDPOINT}/models?pageSize=1"))
        .header("x-goog-api-key", key)
        .send()
        .await
        .map_err(map_net_error)?;
    if resp.status().is_success() { Ok(()) } else { Err(map_status(resp).await) }
}

#[tauri::command]
pub async fn ai_parse_prescription<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    text: String,
    patient: PatientContext,
    redact: Vec<String>,
) -> Result<Value, String> {
    let session = gate(&app, &state, "ai_parse_prescription")?;
    super::audit::log(&app, session.as_ref(), "ai_parse_prescription", "", true);
    let key = require_ready(&app, &state)?;
    let prompt = format!(
        r#"TON RÔLE :
Tu es un expert en pharmacologie pédiatrique et clinique. Transforme une prescription tapée en données structurées JSON.

CONTEXTE PATIENT : {patient}

TEXTE DE L'ORDONNANCE :
"""
{text}
"""

INSTRUCTIONS D'EXTRACTION :
1. Extrais chaque médicament (un objet par médicament).
2. Pour chacun : medicineName (nom commercial complet), dosage (ex: 500mg, 1 sachet), frequency (ex: 3 fois par jour), duration (ex: 7 jours), instructions (conseil de prise), timing parmi "Avant repas", "Pendant repas", "Après repas", "Indifférent".

ANALYSE DE SÉCURITÉ PÉDIATRIQUE :
- Si le patient a moins de 15 ans, vérifie la cohérence de chaque dose avec l'âge et le poids.
- Si une dose semble élevée ou dangereuse, ajoute une alerte courte et précise dans "pediatricWarnings".
- Si des informations manquent pour valider la dose (poids absent), mentionne-le.

RETOURNE EXCLUSIVEMENT UN OBJET JSON :
{{"items":[{{"medicineName":"...","dosage":"...","frequency":"...","duration":"...","instructions":"...","timing":"..."}}],"analysis":"bref résumé","pediatricWarnings":["..."]}}

LANGUE : français (arabe accepté si le texte source est en arabe)."#,
        patient = patient_line(&patient),
        text = scrub(&text, &redact),
    );
    generate(&key, vec![json!({ "text": prompt })]).await
}

#[tauri::command]
pub async fn ai_analyze_consultation<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    symptoms: String,
    clinical_exam: String,
    patient: Option<PatientContext>,
    redact: Vec<String>,
) -> Result<Value, String> {
    let session = gate(&app, &state, "ai_analyze_consultation")?;
    super::audit::log(&app, session.as_ref(), "ai_analyze_consultation", "", true);
    let key = require_ready(&app, &state)?;
    let ctx = patient.as_ref().map(patient_line).unwrap_or_else(|| "Non précisé".to_string());
    let prompt = format!(
        r#"Tu es un assistant médical senior aidant un médecin généraliste en consultation.

CONTEXTE CLINIQUE :
- PATIENT : {ctx}
- SYMPTÔMES : "{symptoms}"
- EXAMEN CLINIQUE : "{exam}"

Analyse ces données et fournis une aide à la décision structurée, précise et concise.

FORMAT DE RÉPONSE (JSON) :
{{"differentialDiagnosis":[{{"condition":"...","probability":"High/Medium/Low","reasoning":"..."}}],"recommendedExams":[{{"name":"...","justification":"..."}}],"treatmentPlan":[{{"category":"Médicament/Conseil","detail":"..."}}],"redFlags":["..."]}}"#,
        symptoms = scrub(&symptoms, &redact),
        exam = scrub(&clinical_exam, &redact),
    );
    generate(&key, vec![json!({ "text": prompt })]).await
}

/// Le document est envoyé tel quel (image/PDF) : il ne peut pas être minimisé
/// côté Rust. L'interface avertit le médecin. Le nom du patient n'est pas demandé.
#[tauri::command]
pub async fn ai_analyze_document<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    data_base64: String,
    mime_type: String,
) -> Result<Value, String> {
    let session = gate(&app, &state, "ai_analyze_document")?;
    super::audit::log(&app, session.as_ref(), "ai_analyze_document", "", true);
    let key = require_ready(&app, &state)?;
    if !matches!(mime_type.as_str(), "application/pdf" | "image/png" | "image/jpeg" | "image/webp") {
        return Err("Format non pris en charge (PDF, PNG, JPEG ou WebP).".to_string());
    }
    if data_base64.len() > MAX_DOC_BYTES * 4 / 3 {
        return Err("Document trop volumineux (15 Mo maximum).".to_string());
    }
    let prompt = r#"Tu es un assistant médical expert en analyse de documents cliniques (comptes-rendus, bilans, lettres de sortie).

ANALYSE CE DOCUMENT ET EXTRAIS :
1. Un résumé concis de la situation (2-3 phrases), SANS aucune donnée d'identité (nom, adresse, téléphone, numéros).
2. La date du document si visible.
3. Des points clés : OBSERVATION (faits cliniques, diagnostics), ALERT (résultats anormaux, allergies, risques), ACTION (traitements, examens, suivi).
4. Des actions suggérées pour le médecin.

FORMAT DE RÉPONSE (JSON) :
{"summary":"...","date":"YYYY-MM-DD","items":[{"type":"OBSERVATION|ALERT|ACTION","content":"...","confidence":"HIGH|MEDIUM|LOW"}],"suggestedActions":["..."]}

Si le document est illisible ou non médical, indique-le dans le résumé avec un item de type ALERT."#;
    generate(
        &key,
        vec![
            json!({ "text": prompt }),
            json!({ "inlineData": { "mimeType": mime_type, "data": data_base64 } }),
        ],
    )
    .await
}

#[tauri::command]
pub async fn ai_classify_priority<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    note: String,
    redact: Vec<String>,
) -> Result<Value, String> {
    let session = gate(&app, &state, "ai_classify_priority")?;
    super::audit::log(&app, session.as_ref(), "ai_classify_priority", "", true);
    let key = require_ready(&app, &state)?;
    let prompt = format!(
        r#"Analyse ce motif de rendez-vous médical et détermine la priorité.
Motif : "{note}"

Priorités possibles :
- URGENT : menace vitale, douleur intense, détresse respiratoire, etc.
- INITIAL : premier rendez-vous ou nouveau problème.
- ROUTINE : suivi, renouvellement, contrôle.

Réponds en JSON strict : {{"priority":"URGENT|INITIAL|ROUTINE","reason":"bref raisonnement en français"}}"#,
        note = scrub(&note, &redact),
    );
    generate(&key, vec![json!({ "text": prompt })]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrub_removes_identifiers_but_keeps_clinical_values() {
        let text = "Mme Alaoui Fatima, tél 06 12 34 56 78, CIN AB123456, mail f.a@mail.ma, \
                    TA 120/80, paracétamol 1000 mg 3 fois par jour pendant 7 jours, glycémie 1.20 g/l";
        let out = scrub(text, &["Alaoui".to_string(), "fatima".to_string()]);
        for leaked in ["Alaoui", "Fatima", "06 12", "AB123456", "f.a@mail.ma"] {
            assert!(!out.contains(leaked), "fuite : {leaked} dans {out}");
        }
        for kept in ["TA 120/80", "paracétamol 1000 mg 3 fois par jour pendant 7 jours", "1.20 g/l"] {
            assert!(out.contains(kept), "valeur clinique perdue : {kept} dans {out}");
        }
    }

    #[test]
    fn status_never_exposes_more_than_four_chars() {
        let cfg = AiConfig { enabled: true, api_key: Some("AIzaSyEXEMPLE1234567890abcd".into()) };
        let s = status_of(&cfg);
        assert_eq!(s.key_suffix.as_deref(), Some("abcd"));
    }

    #[test]
    fn config_roundtrips_through_data_key_encryption() {
        let key = [7u8; KEY_LEN];
        let cfg = AiConfig { enabled: true, api_key: Some("secret-test-key-0123456789".into()) };
        let blob = encrypt(&key, &serde_json::to_vec(&cfg).unwrap()).unwrap();
        assert!(!String::from_utf8_lossy(&blob).contains("secret-test-key"));
        let back: AiConfig = serde_json::from_slice(&decrypt(&key, &blob).unwrap()).unwrap();
        assert_eq!(back.api_key, cfg.api_key);
        assert!(decrypt(&[8u8; KEY_LEN], &blob).is_err());
    }
}
