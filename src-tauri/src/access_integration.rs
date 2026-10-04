//! Test d'intégration du contrôle d'accès : de vraies sessions (Assistant, verrouillée,
//! Médecin en témoin) sur une application Tauri simulée (`tauri::test::mock_app`), qui
//! appellent CHAQUE commande enregistrée avec des arguments valides.
//!
//! - Assistant : toute commande réservée au médecin renvoie un refus ; `load_json` /
//!   `save_json` refusent tous les fichiers sauf `meddoc_appointments` (lecture/écriture)
//!   et `meddoc_appointment_settings` (lecture) ; aucune commande n'élève le rôle.
//! - Session verrouillée : aucune commande de données ne passe.
//! - Médecin : les mêmes appels ne sont PAS refusés (preuve que le refus vient du rôle).
//!
//! Le dossier de données est un dossier temporaire (`TEST_DATA_DIR`) : aucun fichier réel
//! n'est lu ni écrit.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::json;
use tauri::test::MockRuntime;
use tauri::{AppHandle, Manager};

use super::access::{rule_for, Role, Rule, Session};
use super::{ai, audit, notifications, scoped, settings, users, AppState, TEST_DATA_DIR};

type H = AppHandle<MockRuntime>;

fn is_denial(e: &str) -> bool {
    e.starts_with("Accès refusé") || e.starts_with("Session requise")
}

fn registered_commands() -> Vec<String> {
    let lib = include_str!("lib.rs");
    let start = lib.find("generate_handler![").unwrap() + "generate_handler![".len();
    let end = start + lib[start..].find(']').unwrap();
    lib[start..end]
        .split(',')
        .map(|s| s.trim().rsplit("::").next().unwrap().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn open(h: &H, role: Option<Role>) {
    let state = h.state::<AppState>();
    *state.key.lock().unwrap() = role.map(|_| [7u8; 32]);
    *state.session.lock().unwrap() = role.map(|r| Session {
        user_id: "test".into(),
        name: "Testeuse".into(),
        role: r,
        must_change_password: false,
    });
    *state.last_activity.lock().unwrap() = crate::util::now_secs();
}

fn role_now(h: &H) -> Option<Role> {
    h.state::<AppState>().session.lock().unwrap().as_ref().map(|s| s.role)
}

fn done<T>(r: Result<T, String>) -> Result<(), String> {
    r.map(|_| ())
}

/// Appelle la commande `name` avec des arguments valides. `file` : nom de fichier pour
/// `load_json` / `save_json`.
fn call(name: &str, h: &H, file: &str) -> Result<(), String> {
    macro_rules! st {
        () => {
            h.state::<AppState>()
        };
    }
    let a = || h.clone();
    let patient = || serde_json::from_value(json!({"age": 40.0, "sex": "F", "weight": 60.0})).unwrap();
    match name {
        // Verrouillage / comptes
        "security_status" => {
            super::security_status(a(), st!());
            Ok(())
        }
        "setup_pin" => done(users::setup_pin(a(), st!(), "un-mot-de-passe-valide".into(), Some("Dr Test".into()))),
        "list_profiles" => done(users::list_profiles(a(), st!())),
        "unlock" => done(users::unlock(a(), st!(), Some("inconnu".into()), "n'importe-quoi".into())),
        "lock" => done(users::lock(a(), st!())),
        "current_session" => done(users::current_session(a(), st!())),
        "recover_with_phrase" => done(users::recover_with_phrase(a(), st!(), "mot ".repeat(24), "un-mot-de-passe-valide".into(), None)),
        "migrate_to_recovery" => done(super::migrate_to_recovery(a(), st!(), "un-mot-de-passe-valide".into())),
        "regenerate_recovery" => done(super::regenerate_recovery(a(), st!(), "un-mot-de-passe-valide".into())),
        "change_own_password" => done(users::change_own_password(a(), st!(), "ancien-mot-de-passe".into(), "nouveau-mot-de-passe".into())),
        "verify_password" => done(users::verify_password(a(), st!(), "un-mot-de-passe".into())),
        "list_users" => done(users::list_users(a(), st!())),
        "create_user" => done(users::create_user(a(), st!(), "Nouvelle".into(), Role::Assistant, "motdepasse1".into())),
        "delete_user" => done(users::delete_user(a(), st!(), "u-inconnu".into())),
        "set_user_role" => done(users::set_user_role(a(), st!(), "u-inconnu".into(), Role::Medecin)),
        "reset_user_password" => done(users::reset_user_password(a(), st!(), "u-inconnu".into(), "motdepasse1".into())),
        // Fichiers génériques
        "load_json" => done(super::load_json(a(), st!(), file.into())),
        "save_json" => done(super::save_json(a(), st!(), file.into(), json!([{"id": "x"}]))),
        "scan_json_files" => done(super::scan_json_files(a(), st!())),
        // Commandes typées
        "patients_list_identity" => done(scoped::patients_list_identity(a(), st!())),
        "patients_save_identity" => done(scoped::patients_save_identity(a(), st!(), vec![json!({"id": "p1", "name": "DUPONT Jean", "phone": "0600000000"})])),
        "queue_list_identity" => done(scoped::queue_list_identity(a(), st!())),
        "queue_save_identity" => done(scoped::queue_save_identity(a(), st!(), vec![json!({"id": "p1", "name": "DUPONT Jean"})])),
        "billing_today_list" => done(scoped::billing_today_list(a(), st!())),
        "billing_today_save" => done(scoped::billing_today_save(a(), st!(), json!({"patientId": "p1", "totalAmount": 300, "amountPaid": 0, "paymentMode": "CASH", "status": "UNPAID"}))),
        "clinic_public_info" => done(scoped::clinic_public_info(a(), st!())),
        "kiosk_queue" => done(scoped::kiosk_queue(a(), st!())),
        "notifications_list" => done(notifications::notifications_list(a(), st!(), None)),
        "notifications_set_state" => done(notifications::notifications_set_state(a(), st!(), "appointments_changed:p1".into(), "fp".into(), "dismiss".into())),
        // Journal, réglages
        "audit_log_list" => done(audit::audit_log_list(a(), st!(), Some(1000))),
        "get_security_settings" => done(settings::get_security_settings(a(), st!())),
        "set_inactivity_minutes" => done(settings::set_inactivity_minutes(a(), st!(), 15)),
        "session_touch" => done(settings::session_touch(a(), st!())),
        // Sauvegarde (asynchrones, médecin)
        "backup_status" => done(tauri::async_runtime::block_on(super::backup::backup_status(a(), st!()))),
        "backup_set_passphrase" => done(tauri::async_runtime::block_on(super::backup::backup_set_passphrase(a(), st!(), "une phrase de passe solide".into()))),
        "backup_change_passphrase" => done(tauri::async_runtime::block_on(super::backup::backup_change_passphrase(a(), st!(), "une phrase de passe solide".into(), "une autre phrase solide".into()))),
        "backup_set_destinations" => done(tauri::async_runtime::block_on(super::backup::backup_set_destinations(a(), st!(), Some("relatif".into()), None))),
        "backup_run_now" => done(tauri::async_runtime::block_on(super::backup::backup_run_now(a(), st!()))),
        "backup_run_if_due" => done(tauri::async_runtime::block_on(super::backup::backup_run_if_due(a(), st!()))),
        "backup_list" => done(tauri::async_runtime::block_on(super::backup::backup_list(a(), st!()))),
        "backup_inspect" => done(tauri::async_runtime::block_on(super::backup::backup_inspect(a(), st!(), "absent.dcb".into(), "une phrase de passe solide".into()))),
        "backup_restore" => done(tauri::async_runtime::block_on(super::backup::backup_restore(a(), st!(), "absent.dcb".into(), "une phrase de passe solide".into()))),
        // IA (asynchrones)
        "ai_status" => done(ai::ai_status(a(), st!())),
        "ai_set_enabled" => done(ai::ai_set_enabled(a(), st!(), true)),
        "ai_save_key" => done(ai::ai_save_key(a(), st!(), "cle-de-test-0123456789".into())),
        "ai_delete_key" => done(ai::ai_delete_key(a(), st!())),
        "ai_test_key" => done(tauri::async_runtime::block_on(ai::ai_test_key(a(), st!()))),
        "ai_parse_prescription" => done(tauri::async_runtime::block_on(ai::ai_parse_prescription(a(), st!(), "Doliprane 1g x3/j".into(), patient(), vec![]))),
        "ai_analyze_consultation" => done(tauri::async_runtime::block_on(ai::ai_analyze_consultation(a(), st!(), "toux".into(), "RAS".into(), Some(patient()), vec![]))),
        "ai_analyze_document" => done(tauri::async_runtime::block_on(ai::ai_analyze_document(a(), st!(), "AAAA".into(), "application/pdf".into()))),
        "ai_classify_priority" => done(tauri::async_runtime::block_on(ai::ai_classify_priority(a(), st!(), "douleur thoracique".into(), vec![]))),
        other => panic!("commande `{other}` enregistrée mais absente du test d'intégration : ajoutez-la à `call`"),
    }
}

/// Tous les fichiers de données de l'application + quelques noms hostiles.
fn all_files() -> Vec<String> {
    let mut v: Vec<String> = [
        "doctor_info", "patients", "prescriptions", "daily_reports", "medicines", "today_queue", "tasks",
        "appointments", "capacities", "appointment_settings", "expenses", "last_backup", "medical_resources",
        "consultations", "lab_requests", "medical_results", "honorary_notes", "honorary_master_services",
        "medical_certificates", "notification_state",
    ]
    .iter()
    .map(|k| format!("meddoc_{k}.json"))
    .collect();
    v.extend(
        [
            "backups/meddoc_patients_2026.json", "users_meta.json", "security_meta.json", "app_settings.json", "backup_meta.json",
            "audit_log.jsonl", "audit_log.json", "../hors_dossier.json", "backups/../meddoc_patients.json",
            "/etc/passwd", "C:\\Windows\\win.ini", "meddoc_patients.json\\..\\x", "inconnu.json", "",
        ]
        .map(String::from),
    );
    v
}

#[test]
fn every_command_enforces_roles_for_assistant_locked_and_medecin_sessions() {
    let dir: PathBuf = std::env::temp_dir().join(format!("docease-integration-{}-{}", std::process::id(), crate::util::now_secs()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    // Installation « déjà configurée » (aucun compte) : setup_pin et la récupération échouent sans rien créer.
    fs::write(dir.join(super::SECURITY_FILE), "{}").unwrap();
    *TEST_DATA_DIR.lock().unwrap() = Some(dir.clone());

    let app = tauri::test::mock_app();
    app.manage(AppState {
        key: Mutex::new(None),
        session: Mutex::new(None),
        throttle: Mutex::new(users::Throttle::default()),
        last_activity: Mutex::new(0),
        inactivity_minutes: Mutex::new(10),
    });
    let h: H = app.handle().clone();
    let commands = registered_commands();
    assert!(commands.len() >= 40, "liste de commandes suspecte : {commands:?}");

    // ── 1. Session ASSISTANTE ────────────────────────────────────────────────
    for name in &commands {
        open(&h, Some(Role::Assistant));
        // load_json / save_json : fichier autorisé ; les autres sont testés plus bas.
        let file = if name == "save_json" { "meddoc_appointments.json" } else { "meddoc_appointment_settings.json" };
        let result = call(name, &h, file);
        match rule_for(name).unwrap_or_else(|| panic!("`{name}` sans règle")) {
            Rule::Medecin => {
                let e = result.expect_err(&format!("`{name}` doit être refusée à l'assistante"));
                assert!(is_denial(&e), "`{name}` : refus attendu, obtenu « {e} »");
                assert_eq!(role_now(&h), Some(Role::Assistant), "`{name}` ne doit pas changer la session");
            }
            Rule::Public | Rule::AnySession => {
                if let Err(e) = &result {
                    assert!(!is_denial(e), "`{name}` ne doit pas être refusée à l'assistante : {e}");
                }
                if name != "lock" {
                    assert_eq!(role_now(&h), Some(Role::Assistant), "`{name}` ne doit jamais élever ni fermer le rôle");
                }
            }
        }
    }

    // ── 2. Assistante : load_json / save_json, fichier par fichier ───────────
    for file in all_files() {
        let read_ok = file == "meddoc_appointments.json" || file == "meddoc_appointment_settings.json";
        let write_ok = file == "meddoc_appointments.json";
        open(&h, Some(Role::Assistant));
        let r = call("load_json", &h, &file);
        match (read_ok, r) {
            (true, Err(e)) => assert!(!is_denial(&e), "lecture de {file} doit être autorisée : {e}"),
            (true, Ok(())) => {}
            (false, r) => assert!(r.as_ref().err().map_or(false, |e| is_denial(e)), "lecture de « {file} » doit être refusée, obtenu {r:?}"),
        }
        open(&h, Some(Role::Assistant));
        let w = call("save_json", &h, &file);
        match (write_ok, w) {
            (true, w) => assert!(w.is_ok(), "écriture de {file} doit être autorisée : {w:?}"),
            (false, w) => assert!(w.as_ref().err().map_or(false, |e| is_denial(e)), "écriture de « {file} » doit être refusée, obtenu {w:?}"),
        }
    }
    // Seuls ont été écrits : les fichiers des commandes typées autorisées (patients, salle
    // d'attente, encaissement — filtrés par Rust), les rendez-vous, le journal et le fichier
    // de sécurité de départ. Aucun fichier médical, de comptes ou interne.
    let allowed_written = [
        "meddoc_appointments.json", "meddoc_patients.json", "meddoc_today_queue.json", "meddoc_honorary_notes.json", notifications::STATE_FILE,
        super::SECURITY_FILE, audit::AUDIT_FILE,
    ];
    for f in fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()) {
        assert!(allowed_written.contains(&f.as_str()) || f.ends_with(".tmp"), "fichier inattendu écrit par l'assistante : {f}");
    }
    for forbidden in ["meddoc_consultations.json", "meddoc_prescriptions.json", "meddoc_medical_certificates.json", "meddoc_doctor_info.json", "users_meta.json", "app_settings.json", "backup_meta.json"] {
        assert!(!dir.join(forbidden).exists(), "{forbidden} ne doit pas exister");
    }

    // Assistante : ni liste médicale ni état sur un élément médical.
    open(&h, Some(Role::Assistant));
    let e = notifications::notifications_set_state(h.clone(), h.state::<AppState>(), "results:p1".into(), "fp".into(), "dismiss".into()).unwrap_err();
    assert!(is_denial(&e), "{e}");
    let e = notifications::notifications_set_state(h.clone(), h.state::<AppState>(), "vaccines:p1".into(), "fp".into(), "snooze".into()).unwrap_err();
    assert!(is_denial(&e), "{e}");

    // ── 3. Session VERROUILLÉE : aucune commande de données ne passe ─────────
    for name in &commands {
        open(&h, None);
        let result = call(name, &h, "meddoc_appointments.json");
        if rule_for(name) == Some(Rule::Public) {
            // Écran de verrouillage : ces commandes répondent mais n'ouvrent jamais de session.
            assert!(role_now(&h).is_none(), "`{name}` ne doit pas ouvrir de session sans mot de passe valide");
            if name == "unlock" {
                assert!(matches!(result, Ok(())), "unlock répond « refusé » sans erreur");
            }
        } else {
            let e = result.expect_err(&format!("`{name}` doit être refusée en session verrouillée"));
            assert!(is_denial(&e), "`{name}` : refus attendu, obtenu « {e} »");
        }
    }
    for file in all_files() {
        open(&h, None);
        for cmd in ["load_json", "save_json"] {
            let e = call(cmd, &h, &file).expect_err("fichier refusé en session verrouillée");
            assert!(is_denial(&e), "{cmd} {file} : {e}");
        }
    }

    // ── 4. Témoin : le MÉDECIN n'est pas refusé sur les mêmes appels ─────────
    for (cmd, file) in [
        ("list_users", ""), ("scan_json_files", ""), ("audit_log_list", ""), ("set_inactivity_minutes", ""),
        ("backup_status", ""), ("backup_list", ""), ("backup_run_if_due", ""), ("notifications_list", ""),
        ("load_json", "meddoc_patients.json"), ("save_json", "meddoc_patients.json"), ("load_json", "meddoc_consultations.json"),
    ] {
        open(&h, Some(Role::Medecin));
        if let Err(e) = call(cmd, &h, file) {
            assert!(!is_denial(&e), "le médecin ne doit pas être refusé sur `{cmd}` {file} : {e}");
        }
    }
    // …sauf sur les fichiers internes et les chemins hostiles, refusés à tous.
    for file in ["users_meta.json", "security_meta.json", "../x.json", "/etc/passwd"] {
        open(&h, Some(Role::Medecin));
        let e = call("save_json", &h, file).expect_err("fichier interne");
        assert!(is_denial(&e), "{file}");
    }

    // ── 5. Les refus ont été journalisés (qui, quoi) ─────────────────────────
    let entries = audit::read_entries(&dir, 5000);
    let denied: Vec<_> = entries.iter().filter(|e| e.action == "access_denied" && !e.ok).collect();
    assert!(denied.iter().any(|e| e.user == "Testeuse" && e.role.as_deref() == Some("Assistant") && e.detail == "create_user"));
    assert!(denied.iter().any(|e| e.detail.contains("meddoc_patients.json")), "refus de fichier journalisé");
    assert!(denied.iter().any(|e| e.user == "(non connecté)"), "refus en session verrouillée journalisé");

    // ── 6. Sauvegarde de bout en bout par les commandes (médecin) ────────────
    {
        use super::backup;
        *backup::TEST_KDF.lock().unwrap() = Some((256, 1, 1));
        macro_rules! block {
            ($f:expr) => {
                tauri::async_runtime::block_on($f)
            };
        }
        let dest = std::env::temp_dir().join(format!("docease-integration-dest-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dest);
        fs::create_dir_all(&dest).unwrap();
        open(&h, Some(Role::Medecin));
        super::write_enc_json_in(&dir, &[7u8; 32], "meddoc_patients.json", &json!([{"id": "p1"}, {"id": "p2"}])).unwrap();
        block!(backup::backup_set_passphrase(h.clone(), h.state::<AppState>(), "une phrase de passe solide".into())).unwrap();
        block!(backup::backup_set_destinations(h.clone(), h.state::<AppState>(), Some(dest.display().to_string()), None)).unwrap();
        let rep = block!(backup::backup_run_now(h.clone(), h.state::<AppState>())).unwrap();
        assert!(rep.files >= 1);
        let entries = block!(backup::backup_list(h.clone(), h.state::<AppState>())).unwrap();
        assert_eq!(entries.len(), 1);
        let preview = block!(backup::backup_inspect(h.clone(), h.state::<AppState>(), entries[0].path.clone(), "une phrase de passe solide".into())).unwrap();
        assert_eq!(preview.patients, 2);
        let bad = block!(backup::backup_inspect(h.clone(), h.state::<AppState>(), entries[0].path.clone(), "mauvaise phrase de passe".into())).unwrap_err();
        assert!(bad.starts_with("WRONG_PASSPHRASE|"), "{bad}");
        super::write_enc_json_in(&dir, &[7u8; 32], "meddoc_patients.json", &json!([])).unwrap();
        block!(backup::backup_restore(h.clone(), h.state::<AppState>(), entries[0].path.clone(), "une phrase de passe solide".into())).unwrap();
        let back = super::read_enc_json_in(&dir, &[7u8; 32], "meddoc_patients.json").unwrap().unwrap();
        assert_eq!(back.as_array().unwrap().len(), 2);
        // L'assistante, elle, reste refusée sur le même enchaînement.
        open(&h, Some(Role::Assistant));
        for r in [
            block!(backup::backup_status(h.clone(), h.state::<AppState>())).map(|_| ()),
            block!(backup::backup_run_now(h.clone(), h.state::<AppState>())).map(|_| ()),
            block!(backup::backup_restore(h.clone(), h.state::<AppState>(), entries[0].path.clone(), "une phrase de passe solide".into())).map(|_| ()),
        ] {
            assert!(is_denial(&r.unwrap_err()));
        }
        // Journal : sauvegarde et restauration tracées, sans contenu.
        let log = audit::read_entries(&dir, 5000);
        assert!(log.iter().any(|e| e.action == "backup_run" && e.ok));
        assert!(log.iter().any(|e| e.action == "backup_restore" && e.ok));
        assert!(log.iter().all(|e| !e.detail.contains("p1")));
        *backup::TEST_KDF.lock().unwrap() = None;
        let _ = fs::remove_dir_all(&dest);
    }

    *TEST_DATA_DIR.lock().unwrap() = None;
    let _ = fs::remove_dir_all(&dir);
}
