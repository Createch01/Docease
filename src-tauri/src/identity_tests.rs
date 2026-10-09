use super::*;
use crate::media_clean::tests::{jpeg_with_metadata, plain_jpeg};
use serde_json::json;
use std::fs;
use std::path::PathBuf;

const KEY: [u8; KEY_LEN] = [5u8; KEY_LEN];
const NOW: &str = "2026-10-08T09:00:00Z";
const TODAY: &str = "2026-10-08";

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-id-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn save(d: &Path, stored: Option<&Value>, incoming: Value) -> Result<Value, String> {
    on_save(d, &KEY, stored, incoming)
}

#[test]
fn an_invalid_ice_is_refused_and_a_valid_one_is_normalised() {
    let d = tmp("ice");
    for bad in ["12345", "00123456789012", "0012345678901234", "ABCDEFGHIJKLMNO", "00123456789012A"] {
        let e = save(&d, None, json!({"nameFr": "Alami", "ice": bad})).unwrap_err();
        assert!(e.contains("ICE"), "{bad} : {e}");
    }
    let ok = save(&d, None, json!({"ice": "001 234 567 000 087"})).unwrap();
    assert_eq!(ok["ice"], "001234567000087");
    assert_eq!(save(&d, None, json!({"ice": ""})).unwrap()["ice"], "", "facultatif");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn inpe_if_and_tp_accept_digits_only_with_no_imposed_length() {
    let d = tmp("digits");
    for (field, label) in [("inpe", "INPE"), ("taxId", "IF"), ("patente", "TP")] {
        let e = save(&d, None, json!({ field: "12AB" })).unwrap_err();
        assert!(e.contains(label) || e.contains("fiscal") || e.contains("Taxe"), "{field} : {e}");
        assert_eq!(save(&d, None, json!({ field: "1" })).unwrap()[field], "1", "pas de longueur imposée");
        assert_eq!(save(&d, None, json!({ field: "12 345 6789012" })).unwrap()[field], "123456789012");
    }
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn an_unchanged_old_value_never_blocks_an_unrelated_save() {
    let d = tmp("legacy");
    let stored = json!({"ice": "ABC", "inpe": "x1", "phone": "0500"});
    // Une autre page enregistre le logo : la fiche renvoie l'ancienne valeur invalide, sans la modifier.
    let out = save(&d, Some(&stored), json!({"ice": "ABC", "inpe": "x1", "phone": "0500", "logoUrl": "data:image/png;base64,AA"})).unwrap();
    assert_eq!(out["ice"], "ABC");
    // Dès qu'elle est modifiée, elle est contrôlée.
    assert!(save(&d, Some(&stored), json!({"ice": "ABCD"})).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn the_stamp_can_only_designate_an_existing_cabinet_piece() {
    let d = tmp("stampid");
    assert!(save(&d, None, json!({"stampAttachmentId": "pj-0123456789abcdef"})).unwrap_err().contains("Cachet"));
    assert!(save(&d, None, json!({"stampAttachmentId": "../../x"})).is_err());
    let id = stamp_set(&d, &KEY, Role::Medecin, plain_jpeg(32, 16), "Dr", NOW, TODAY).unwrap();
    let stored = read_enc_json_in(&d, &KEY, DOCTOR_INFO_FILE).unwrap().unwrap();
    assert_eq!(stored["stampAttachmentId"], json!(id));
    // Réécrire la fiche avec ce même identifiant (cas normal d'un enregistrement ailleurs) passe.
    assert!(save(&d, Some(&stored), json!({"stampAttachmentId": id, "phone": "1"})).is_ok());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn missing_identity_flags_inpe_and_if_only() {
    assert_eq!(missing(&json!({})), vec!["inpe", "taxId"]);
    assert_eq!(missing(&json!({"inpe": "123"})), vec!["taxId"]);
    assert_eq!(missing(&json!({"inpe": "1", "taxId": "2"})), Vec::<&str>::new());
    assert_eq!(missing(&json!({"inpe": "  ", "taxId": "-"})), vec!["inpe", "taxId"], "blancs = manquants");
    // ICE, TP, RIB… facultatifs : pas dans le bandeau.
    assert_eq!(missing(&json!({"inpe": "1", "taxId": "2", "ice": ""})).len(), 0);
}

#[test]
fn stamp_is_an_encrypted_image_without_metadata_and_only_the_doctor_sets_it() {
    let d = tmp("stamp");
    assert!(stamp_set(&d, &KEY, Role::Assistant, plain_jpeg(8, 8), "Sara", NOW, TODAY).unwrap_err().contains("médecin"));
    assert!(stamp_set(&d, &KEY, Role::Medecin, b"%PDF-1.4\n%%EOF".to_vec(), "Dr", NOW, TODAY).unwrap_err().contains("image"));
    assert!(stamp_set(&d, &KEY, Role::Medecin, b"MZ\x90\x00 exe".to_vec(), "Dr", NOW, TODAY).is_err());
    assert!(stamp_set(&d, &KEY, Role::Medecin, vec![0xFF; MAX_STAMP_BYTES + 1], "Dr", NOW, TODAY).unwrap_err().contains("2 Mo"));
    assert_eq!(stamp_read(&d, &KEY).unwrap(), None);

    let dirty = jpeg_with_metadata(&plain_jpeg(16, 8), 1);
    assert!(dirty.windows(4).any(|w| w == b"Exif"));
    let id = stamp_set(&d, &KEY, Role::Medecin, dirty, "Dr", NOW, TODAY).unwrap();
    // Sur le disque : chiffré (pas d'octets JPEG en clair), EXIF absent après déchiffrement.
    let on_disk = fs::read(super::super::attachments::blob_path(&d, &id)).unwrap();
    assert!(!on_disk.windows(3).any(|w| w == [0xFF, 0xD8, 0xFF]));
    let (meta, stored) = super::super::attachments::read(&d, &KEY, &id).unwrap();
    assert_eq!(meta.patient_id, super::super::attachments::CABINET_OWNER);
    for marker in [&b"Exif"[..], b"MARQUEAPPARE", b"MARQUEXMP", b"MARQUEIPTC"] {
        assert!(!stored.windows(marker.len()).any(|w| w == marker), "{:?}", String::from_utf8_lossy(marker));
    }
    // Lecture pour l'impression : même résultat quel que soit le rôle (la commande n'exige qu'une session).
    let v = stamp_read(&d, &KEY).unwrap().unwrap();
    assert_eq!((v.id, v.mime.as_str()), (id, "image/jpeg"));
    assert!(!v.data_base64.is_empty());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn the_assistant_cannot_write_the_clinic_file_and_reads_identity_but_not_rib() {
    use crate::access::{file_allowed, FileMode};
    assert!(!file_allowed(Role::Assistant, DOCTOR_INFO_FILE, FileMode::Write));
    assert!(!file_allowed(Role::Assistant, DOCTOR_INFO_FILE, FileMode::Read));
    let info = json!({"nameFr": "Alami", "inpe": "123", "taxId": "456", "patente": "7", "ice": "001234567000087", "ordreNumber": "99",
        "rib": "RIB-SECRET", "cnssEmployer": "777", "stampUrl": "data:x", "stampAttachmentId": "pj-0123456789abcdef", "standardConsultationFee": 300});
    let public = crate::scoped::clinic_public(&info);
    let keys: Vec<&str> = public.as_object().unwrap().keys().map(|k| k.as_str()).collect();
    for k in ["nameFr", "inpe", "taxId", "patente", "ice", "ordreNumber"] {
        assert!(keys.contains(&k), "{k} lisible par l'assistante");
    }
    for k in ["rib", "cnssEmployer", "stampUrl", "stampAttachmentId", "standardConsultationFee"] {
        assert!(!keys.contains(&k), "{k} ne doit pas être exposé");
    }
}
