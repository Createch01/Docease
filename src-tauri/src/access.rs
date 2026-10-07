//! Contrôle d'accès côté Rust : rôles, session, règles par commande et par fichier.
//!
//! Principe : LISTE BLANCHE, refus par défaut. Chaque commande Tauri doit figurer dans
//! `COMMAND_RULES` et commencer par `gate(&app, &state, "<nom>")`. Une commande absente
//! de la table est refusée ; un test vérifie que toutes les commandes enregistrées
//! dans `generate_handler!` ont une règle et appellent bien `gate`.
//!
//! Le rôle vient exclusivement de la session tenue en mémoire par Rust (posée au
//! déverrouillage depuis `users_meta.json`) : le frontend ne peut pas le choisir.

use serde::{Deserialize, Serialize};

use super::AppState;

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Role {
    Medecin,
    Assistant,
}

impl Role {
    pub fn label(&self) -> &'static str {
        match self {
            Role::Medecin => "Medecin",
            Role::Assistant => "Assistant",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Session {
    pub user_id: String,
    pub name: String,
    pub role: Role,
    pub must_change_password: bool,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Rule {
    /// Utilisable sans session (écran de verrouillage).
    Public,
    /// Toute session ouverte ; la commande filtre elle-même ses données selon le rôle.
    AnySession,
    /// Médecin uniquement.
    Medecin,
}

pub const COMMAND_RULES: &[(&str, Rule)] = &[
    // Verrouillage / comptes
    ("security_status", Rule::Public),
    ("setup_pin", Rule::Public),
    ("list_profiles", Rule::Public),
    ("unlock", Rule::Public),
    ("lock", Rule::Public),
    ("current_session", Rule::Public),
    ("recover_with_phrase", Rule::Public),
    ("migrate_to_recovery", Rule::Medecin),
    ("regenerate_recovery", Rule::Medecin),
    ("change_own_password", Rule::AnySession),
    ("verify_password", Rule::AnySession),
    ("list_users", Rule::Medecin),
    ("create_user", Rule::Medecin),
    ("delete_user", Rule::Medecin),
    ("set_user_role", Rule::Medecin),
    ("reset_user_password", Rule::Medecin),
    // Fichiers génériques (liste blanche par rôle dans `file_allowed`)
    ("load_json", Rule::AnySession),
    ("save_json", Rule::AnySession),
    ("scan_json_files", Rule::Medecin),
    // Commandes typées accessibles à l'assistante (filtrées côté Rust)
    ("patients_list_identity", Rule::AnySession),
    ("patients_save_identity", Rule::AnySession),
    ("queue_list_identity", Rule::AnySession),
    ("queue_save_identity", Rule::AnySession),
    ("billing_today_list", Rule::AnySession),
    ("billing_today_save", Rule::AnySession),
    ("clinic_public_info", Rule::AnySession),
    ("kiosk_queue", Rule::AnySession),
    // Panneau « À faire » : éléments filtrés par rôle côté Rust (assistante : RDV uniquement)
    ("notifications_list", Rule::AnySession),
    ("attachment_add", Rule::Medecin),
    ("attachment_list", Rule::Medecin),
    ("attachment_update", Rule::Medecin),
    ("attachment_read", Rule::Medecin),
    ("attachment_delete", Rule::Medecin),
    ("attachments_status", Rule::Medecin),
    ("appointment_mark_sent", Rule::AnySession),
    ("whatsapp_open", Rule::AnySession),
    ("notifications_set_state", Rule::AnySession),
    // Verrouillage automatique
    ("get_security_settings", Rule::AnySession),
    ("set_inactivity_minutes", Rule::Medecin),
    ("session_touch", Rule::AnySession),
    // Journal d'accès : médecin uniquement
    ("audit_log_list", Rule::Medecin),
    // Sauvegarde / restauration : médecin uniquement
    ("backup_status", Rule::Medecin),
    ("backup_set_passphrase", Rule::Medecin),
    ("backup_change_passphrase", Rule::Medecin),
    ("backup_set_destinations", Rule::Medecin),
    ("backup_run_now", Rule::Medecin),
    ("backup_run_if_due", Rule::Medecin),
    ("backup_list", Rule::Medecin),
    ("backup_inspect", Rule::Medecin),
    ("backup_restore", Rule::Medecin),
    // IA : médecin uniquement
    ("ai_status", Rule::Medecin),
    ("ai_set_enabled", Rule::Medecin),
    ("ai_save_key", Rule::Medecin),
    ("ai_delete_key", Rule::Medecin),
    ("ai_test_key", Rule::Medecin),
    ("ai_parse_prescription", Rule::Medecin),
    ("ai_analyze_consultation", Rule::Medecin),
    ("ai_analyze_document", Rule::Medecin),
    ("ai_classify_priority", Rule::Medecin),
];

pub fn rule_for(command: &str) -> Option<Rule> {
    COMMAND_RULES.iter().find(|(n, _)| *n == command).map(|(_, r)| *r)
}

#[derive(Debug, PartialEq, Eq)]
pub enum Denial {
    /// Commande sans règle explicite : refusée par défaut.
    NoRule,
    NoSession,
    WrongRole,
}

pub fn denial_message(d: &Denial) -> &'static str {
    match d {
        Denial::NoRule => "Accès refusé : commande non autorisée.",
        Denial::NoSession => "Session requise : déverrouillez DocEase.",
        Denial::WrongRole => "Accès refusé : cette action n'est pas autorisée pour votre rôle.",
    }
}

/// Décision pure (testable sans Tauri).
pub fn check(rule: Option<Rule>, role: Option<Role>) -> Result<(), Denial> {
    match rule {
        None => Err(Denial::NoRule),
        Some(Rule::Public) => Ok(()),
        Some(Rule::AnySession) => role.map(|_| ()).ok_or(Denial::NoSession),
        Some(Rule::Medecin) => match role {
            Some(Role::Medecin) => Ok(()),
            Some(Role::Assistant) => Err(Denial::WrongRole),
            None => Err(Denial::NoSession),
        },
    }
}

/// Point d'entrée obligatoire de chaque commande. Renvoie la session courante
/// (None pour une commande publique appelée sans session).
pub fn gate<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &AppState, command: &str) -> Result<Option<Session>, String> {
    // Inactivité : une session trop longtemps inactive est fermée côté Rust (clé et rôle
    // effacés), même si l'interface ne le fait pas.
    let had_session = state.session.lock().map_err(|e| e.to_string())?.is_some();
    if had_session && super::settings::expire_if_idle(state) {
        super::audit::log_as(app, "(session)", None, "auto_lock", "inactivité", true);
    }
    let session = state.session.lock().map_err(|e| e.to_string())?.clone();
    if session.is_some() && command == "session_touch" {
        super::settings::touch(state);
    }
    match check(rule_for(command), session.as_ref().map(|s| s.role)) {
        Ok(()) => Ok(session),
        Err(d) => {
            // Tout refus est journalisé (qui, quelle commande).
            super::audit::log(app, session.as_ref(), "access_denied", command, false);
            Err(denial_message(&d).to_string())
        }
    }
}

/// Refus d'un fichier hors liste blanche (journalisé).
pub fn deny_file<R: tauri::Runtime>(app: &tauri::AppHandle<R>, session: &Session, filename: &str, mode: FileMode) -> String {
    let m = if mode == FileMode::Write { "écriture" } else { "lecture" };
    super::audit::log(app, Some(session), "access_denied", &format!("{m} de {filename}"), false);
    denial_message(&Denial::WrongRole).to_string()
}

/// Session obligatoire (commandes non publiques).
pub fn require_session(session: Option<Session>) -> Result<Session, String> {
    session.ok_or_else(|| denial_message(&Denial::NoSession).to_string())
}

// ─── Fichiers ────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FileMode {
    Read,
    Write,
}

/// Fichiers internes que `load_json`/`save_json` ne doivent jamais toucher, quel que
/// soit le rôle (comptes, métadonnées de sécurité).
const RESERVED_STEMS: &[&str] = &["users_meta", "security_meta", "audit_log", "app_settings", "backup_meta", "meddoc_attachments"];

/// Fichiers lisibles/écrivables par l'assistante via `load_json`/`save_json`.
/// Tout le reste (patients, file d'attente, honoraires, fiche cabinet…) passe par des
/// commandes typées qui filtrent les champs.
const ASSISTANT_FILES: &[(&str, bool)] = &[
    ("meddoc_appointments.json", true),
    ("meddoc_appointment_settings.json", false),
];

pub fn is_safe_filename(name: &str) -> bool {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') || name.contains(':') || name.contains('\0') {
        return false;
    }
    !name.split('/').any(|part| part.is_empty() || part == "." || part == "..")
}

fn is_reserved(name: &str) -> bool {
    let lower = name.to_lowercase();
    RESERVED_STEMS.iter().any(|stem| lower == format!("{stem}.json") || lower.starts_with(&format!("{stem}.")))
}

pub fn file_allowed(role: Role, filename: &str, mode: FileMode) -> bool {
    if !is_safe_filename(filename) || is_reserved(filename) {
        return false;
    }
    match role {
        Role::Medecin => true,
        Role::Assistant => ASSISTANT_FILES
            .iter()
            .any(|(n, writable)| *n == filename.to_lowercase() && (mode == FileMode::Read || *writable)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MEDECIN_ONLY: &[&str] = &[
        "migrate_to_recovery", "regenerate_recovery", "list_users", "create_user", "delete_user",
        "set_user_role", "reset_user_password", "scan_json_files", "audit_log_list", "set_inactivity_minutes", "ai_status", "ai_set_enabled",
        "ai_save_key", "ai_delete_key", "ai_test_key", "ai_parse_prescription",
        "ai_analyze_consultation", "ai_analyze_document", "ai_classify_priority",
        "backup_status", "backup_set_passphrase", "backup_change_passphrase", "backup_set_destinations", "backup_run_now",
        "backup_run_if_due", "backup_list", "backup_inspect", "backup_restore",
        "attachment_add", "attachment_list", "attachment_update", "attachment_read", "attachment_delete", "attachments_status",
    ];

    #[test]
    fn assistant_is_refused_on_every_medecin_only_command() {
        for cmd in MEDECIN_ONLY {
            assert_eq!(rule_for(cmd), Some(Rule::Medecin), "{cmd} doit être réservée au médecin");
            assert_eq!(check(rule_for(cmd), Some(Role::Assistant)), Err(Denial::WrongRole), "{cmd}");
            assert_eq!(check(rule_for(cmd), None), Err(Denial::NoSession), "{cmd} sans session");
            assert_eq!(check(rule_for(cmd), Some(Role::Medecin)), Ok(()), "{cmd}");
        }
    }

    #[test]
    fn every_non_public_command_requires_a_session() {
        for (cmd, rule) in COMMAND_RULES {
            if *rule != Rule::Public {
                assert_eq!(check(Some(*rule), None), Err(Denial::NoSession), "{cmd}");
            }
        }
    }

    #[test]
    fn unknown_command_is_denied_by_default() {
        assert_eq!(check(rule_for("commande_inconnue"), Some(Role::Medecin)), Err(Denial::NoRule));
    }

    #[test]
    fn assistant_file_whitelist() {
        let a = Role::Assistant;
        // Autorisés
        assert!(file_allowed(a, "meddoc_appointments.json", FileMode::Read));
        assert!(file_allowed(a, "meddoc_appointments.json", FileMode::Write));
        assert!(file_allowed(a, "meddoc_appointment_settings.json", FileMode::Read));
        // Lecture seule
        assert!(!file_allowed(a, "meddoc_appointment_settings.json", FileMode::Write));
        // Interdits : tout le médical, financier, patients bruts, fiche cabinet
        for f in [
            "meddoc_consultations.json", "meddoc_prescriptions.json", "meddoc_medical_certificates.json",
            "meddoc_lab_requests.json", "meddoc_medical_results.json", "meddoc_medical_resources.json",
            "meddoc_patients.json", "meddoc_today_queue.json", "meddoc_honorary_notes.json",
            "meddoc_honorary_master_services.json", "meddoc_expenses.json", "meddoc_daily_reports.json",
            "meddoc_doctor_info.json", "meddoc_tasks.json", "meddoc_medicines.json",
            "meddoc_vaccinations.json", "meddoc_last_backup.json", "backups/meddoc_patients_2026.json", "fichier_inconnu.json",
        ] {
            assert!(!file_allowed(a, f, FileMode::Read), "lecture de {f} doit être refusée");
            assert!(!file_allowed(a, f, FileMode::Write), "écriture de {f} doit être refusée");
        }
    }

    #[test]
    fn nobody_touches_reserved_or_traversing_paths() {
        for role in [Role::Medecin, Role::Assistant] {
            for f in [
                "users_meta.json", "security_meta.json", "USERS_META.json", "audit_log.bin",
                "app_settings.json", "../secret.json", "a/../../b.json", "/etc/passwd",
                "C:\\Windows\\x.json", "a\\b.json", "", "dir//x.json",
            ] {
                assert!(!file_allowed(role, f, FileMode::Read), "{role:?} lecture {f}");
                assert!(!file_allowed(role, f, FileMode::Write), "{role:?} écriture {f}");
            }
        }
    }

    #[test]
    fn medecin_keeps_full_access_to_data_files() {
        assert!(file_allowed(Role::Medecin, "meddoc_patients.json", FileMode::Write));
        assert!(file_allowed(Role::Medecin, "backups/meddoc_patients_2026.json", FileMode::Write));
    }

    /// Chaque commande enregistrée dans `generate_handler!` doit avoir une règle
    /// explicite, et chaque commande doit appeler `gate` avec son propre nom.
    #[test]
    fn every_registered_command_has_a_rule_and_calls_gate() {
        let lib = include_str!("lib.rs");
        let start = lib.find("generate_handler![").expect("generate_handler introuvable") + "generate_handler![".len();
        let end = start + lib[start..].find(']').unwrap();
        let registered: Vec<String> = lib[start..end]
            .split(',')
            .map(|s| s.trim().split("::<").next().unwrap().rsplit("::").next().unwrap().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        assert!(registered.len() > 20, "liste de commandes suspecte : {registered:?}");

        for name in &registered {
            assert!(rule_for(name).is_some(), "la commande `{name}` n'a pas de règle de rôle explicite");
        }
        for (name, _) in COMMAND_RULES {
            assert!(registered.iter().any(|r| r == name), "règle `{name}` sans commande enregistrée");
        }

        let sources = [
            include_str!("lib.rs"),
            include_str!("ai.rs"),
            include_str!("users.rs"),
            include_str!("audit.rs"),
            include_str!("settings.rs"),
            include_str!("scoped.rs"),
            include_str!("backup.rs"),
            include_str!("messaging.rs"),
            include_str!("attachments.rs"),
            include_str!("notifications/mod.rs"),
        ];
        let mut seen = Vec::new();
        for src in sources {
            for chunk in src.split("#[tauri::command]").skip(1) {
                let after = chunk.split("fn ").nth(1).expect("fn après #[tauri::command]");
                let name: String = after.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
                let call = format!("gate(&app, &state, \"{name}\")");
                assert!(chunk.contains(&call), "la commande `{name}` doit commencer par {call}");
                seen.push(name);
            }
        }
        for name in &registered {
            assert!(seen.contains(name), "commande `{name}` introuvable dans les sources");
        }
    }
}
