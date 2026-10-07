use super::*;
use crate::media_clean::tests::{jpeg_with_metadata, plain_jpeg, plain_png};
use serde_json::json;

const KEY: [u8; KEY_LEN] = [9u8; KEY_LEN];
const NOW: &str = "2026-10-07T10:00:00Z";
const TODAY: &str = "2026-10-07";

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("docease-pj-{tag}-{}-{}", std::process::id(), util::now_secs()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}, {"id": "p2", "name": "B"}])).unwrap();
    write_enc_json_in(&d, &KEY, "meddoc_consultations.json", &json!([{"id": "c1", "patientId": "p1"}])).unwrap();
    write_enc_json_in(&d, &KEY, "meddoc_medical_results.json", &json!([{"id": "r2", "patientId": "p2"}])).unwrap();
    d
}

fn input(patient: &str) -> AddInput {
    AddInput { patient_id: patient.into(), title: "ECG de repos".into(), category: "ECG".into(), exam_date: "2026-10-01".into(), ..Default::default() }
}

fn pdf() -> Vec<u8> {
    b"%PDF-1.4\n1 0 obj<</Title(SECRET-PDF)>>endobj\n%%EOF".to_vec()
}

fn add_ok(d: &Path, patient: &str, raw: Vec<u8>) -> Meta {
    add(d, &KEY, input(patient), raw, "Dr Test", NOW, TODAY).unwrap()
}

#[test]
fn roundtrip_and_nothing_readable_on_disk() {
    let d = tmp("roundtrip");
    let m = add_ok(&d, "p1", pdf());
    assert!(valid_id(&m.id) && m.mime == "application/pdf" && m.size == pdf().len() as u64);
    assert_eq!(m.created_by, "Dr Test");
    let on_disk = fs::read(blob_path(&d, &m.id)).unwrap();
    assert!(!on_disk.windows(5).any(|w| w == b"%PDF-") && !on_disk.windows(10).any(|w| w == b"SECRET-PDF"), "jamais en clair");
    let (meta, bytes) = read(&d, &KEY, &m.id).unwrap();
    assert_eq!(bytes, pdf());
    assert_eq!(meta.sha256, sha256_hex(&pdf()));
    // L'index est lui aussi chiffré, et seules les pièces de ce patient sont listées.
    let idx = fs::read(d.join(INDEX_FILE)).unwrap();
    assert!(!idx.windows(9).any(|w| w == b"patientId"));
    assert_eq!(list(&d, &KEY, "p1").unwrap().len(), 1);
    assert_eq!(list(&d, &KEY, "p2").unwrap().len(), 0);
    // Aucun fichier temporaire ne reste.
    assert!(fs::read_dir(store_dir(&d)).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".tmp")));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn file_is_bound_to_its_id_and_tampering_is_detected() {
    let d = tmp("aad");
    let a = add_ok(&d, "p1", pdf());
    let b = add_ok(&d, "p1", plain_png(8, 8));
    // Échange de deux fichiers : refusé (AAD = identifiant).
    let (pa, pb) = (blob_path(&d, &a.id), blob_path(&d, &b.id));
    let (ba, bb) = (fs::read(&pa).unwrap(), fs::read(&pb).unwrap());
    fs::write(&pa, &bb).unwrap();
    fs::write(&pb, &ba).unwrap();
    assert!(read(&d, &KEY, &a.id).is_err() && read(&d, &KEY, &b.id).is_err());
    fs::write(&pa, &ba).unwrap();
    fs::write(&pb, &bb).unwrap();
    assert!(read(&d, &KEY, &a.id).is_ok());
    // Octet modifié.
    let mut bad = ba.clone();
    let n = bad.len() - 3;
    bad[n] ^= 1;
    fs::write(&pa, &bad).unwrap();
    assert!(read(&d, &KEY, &a.id).is_err());
    // Mauvaise clé.
    fs::write(&pa, &ba).unwrap();
    assert!(read(&d, &[1u8; KEY_LEN], &a.id).is_err());
    // Empreinte de l'index différente du contenu : refusé.
    let mut idx = load_index(&d, &KEY).unwrap();
    idx[0].sha256 = "0".repeat(64);
    save_index(&d, &KEY, &idx).unwrap();
    assert!(read(&d, &KEY, &a.id).unwrap_err().contains("altéré"));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn photo_with_gps_has_none_after_import_and_hash_is_of_the_cleaned_file() {
    let d = tmp("gps");
    let dirty = jpeg_with_metadata(&plain_jpeg(16, 8), 1);
    assert!(dirty.windows(4).any(|w| w == b"Exif"));
    let m = add_ok(&d, "p1", dirty.clone());
    let (_, stored) = read(&d, &KEY, &m.id).unwrap();
    for marker in [&b"Exif"[..], b"MARQUEAPPARE", b"MARQUEXMP", b"MARQUEIPTC", b"MARQUECOMMENTAIRE", b"MARQUEFINALE"] {
        assert!(!stored.windows(marker.len()).any(|w| w == marker), "{:?}", String::from_utf8_lossy(marker));
    }
    assert_eq!(m.sha256, sha256_hex(&stored), "empreinte calculée APRÈS nettoyage");
    assert_ne!(m.sha256, sha256_hex(&dirty));
    assert_eq!(m.size, stored.len() as u64);
    // Avec orientation : remise à l'endroit.
    let m2 = add_ok(&d, "p1", jpeg_with_metadata(&plain_jpeg(16, 8), 6));
    let (_, rotated) = read(&d, &KEY, &m2.id).unwrap();
    let img = image::load_from_memory(&rotated).unwrap();
    assert_eq!((img.width(), img.height()), (8, 16));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn invalid_inputs_are_refused() {
    let d = tmp("invalid");
    let go = |i: AddInput, raw: Vec<u8>| add(&d, &KEY, i, raw, "Dr", NOW, TODAY);
    assert!(go(input("p1"), vec![]).is_err(), "vide");
    assert!(go(input("p1"), b"MZ\x90\x00 programme".to_vec()).unwrap_err().contains("PDF, JPG ou PNG"));
    assert!(go(input("p1"), b"GIF89a....".to_vec()).is_err());
    let mut big = b"%PDF-".to_vec();
    big.resize(MAX_FILE_BYTES + 1, b'x');
    assert!(go(input("p1"), big).unwrap_err().contains("20 Mo"));
    let mut ok_max = b"%PDF-".to_vec();
    ok_max.resize(MAX_FILE_BYTES, b'x');
    assert!(go(input("p1"), ok_max).is_ok(), "exactement 20 Mo");
    assert!(go(input("zz"), pdf()).unwrap_err().contains("Patient"));
    assert!(go(AddInput { title: "  ".into(), ..input("p1") }, pdf()).is_err());
    assert!(go(AddInput { title: "x".repeat(121), ..input("p1") }, pdf()).is_err());
    assert!(go(AddInput { title: "a\u{0}b".into(), ..input("p1") }, pdf()).is_err());
    assert!(go(AddInput { category: "radio".into(), ..input("p1") }, pdf()).is_err());
    for bad in ["2026-13-01", "2026-02-30", "26-10-01", "2026-10-1", "", "2026/10/01", "2026-10-08"] {
        assert!(go(AddInput { exam_date: bad.into(), ..input("p1") }, pdf()).is_err(), "{bad}");
    }
    assert!(go(AddInput { exam_date: TODAY.into(), ..input("p1") }, pdf()).is_ok(), "aujourd'hui accepté");
    assert!(go(AddInput { thumb: Some("data:text/html;base64,AAAA".into()), ..input("p1") }, pdf()).is_err());
    assert!(go(AddInput { thumb: Some("data:image/jpeg;base64,@@@".into()), ..input("p1") }, pdf()).is_err());
    assert!(go(AddInput { thumb: Some(format!("data:image/jpeg;base64,{}", "A".repeat(MAX_THUMB_BYTES))), ..input("p1") }, pdf()).is_err());
    assert!(go(AddInput { thumb: Some("data:image/jpeg;base64,/9j/4AAQ".into()), ..input("p1") }, pdf()).is_ok());
    // Liens : l'élément doit exister POUR CE patient.
    let link = |t: &str, i: &str| AddInput { linked_type: Some(t.into()), linked_id: Some(i.into()), ..input("p1") };
    assert!(go(link("consultation", "c1"), pdf()).is_ok());
    assert!(go(link("consultation", "absent"), pdf()).is_err());
    assert!(go(link("result", "r2"), pdf()).is_err(), "résultat d'un autre patient");
    assert!(go(link("autre", "c1"), pdf()).is_err());
    assert!(go(AddInput { linked_type: Some("consultation".into()), ..input("p1") }, pdf()).is_err(), "lien incomplet");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn failed_index_write_leaves_no_file_and_no_entry() {
    let d = tmp("atomic");
    // Un dossier à la place de l'index fait échouer l'écriture de l'index.
    fs::create_dir_all(d.join(INDEX_FILE)).unwrap();
    assert!(add(&d, &KEY, input("p1"), pdf(), "Dr", NOW, TODAY).is_err());
    let left: Vec<_> = fs::read_dir(store_dir(&d)).map(|r| r.flatten().collect()).unwrap_or_default();
    assert!(left.is_empty(), "aucun fichier orphelin après un échec d'index");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn update_and_delete() {
    let d = tmp("update");
    let m = add_ok(&d, "p1", pdf());
    let patch = UpdateInput {
        title: Some("Nouveau titre".into()),
        category: Some("courrier".into()),
        exam_date: Some("2026-09-30".into()),
        linked_type: Some("consultation".into()),
        linked_id: Some("c1".into()),
        ..Default::default()
    };
    let u = update(&d, &KEY, &m.id, patch, "t2", TODAY).unwrap();
    assert_eq!((u.title.as_str(), u.category.as_str(), u.exam_date.as_str()), ("Nouveau titre", "courrier", "2026-09-30"));
    assert_eq!(u.updated_at.as_deref(), Some("t2"));
    assert_eq!((u.sha256.clone(), u.size), (m.sha256.clone(), m.size), "le contenu ne change pas");
    let bad_link = UpdateInput { linked_type: Some("result".into()), linked_id: Some("r2".into()), ..Default::default() };
    assert!(update(&d, &KEY, &m.id, bad_link, "t3", TODAY).is_err());
    let cleared = update(&d, &KEY, &m.id, UpdateInput { clear_link: true, ..Default::default() }, "t4", TODAY).unwrap();
    assert!(cleared.linked_type.is_none() && cleared.linked_id.is_none());
    assert!(update(&d, &KEY, "pj-0000000000000000", UpdateInput::default(), "t", TODAY).is_err());
    assert!(update(&d, &KEY, "../../x", UpdateInput::default(), "t", TODAY).is_err());
    // Suppression : index puis fichier.
    delete(&d, &KEY, &m.id).unwrap();
    assert!(!blob_path(&d, &m.id).exists());
    assert!(load_index(&d, &KEY).unwrap().is_empty());
    assert!(delete(&d, &KEY, &m.id).is_err());
    assert!(read(&d, &KEY, &m.id).is_err());
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn hostile_ids_never_touch_the_filesystem() {
    let d = tmp("ids");
    for bad in ["../x", "pj-../../../etc", "pj-ABCDEF0123456789", "pj-0123", "", "pj-0123456789abcdeg", "C:\\x", "pj-0123456789abcdef.dcp"] {
        assert!(!valid_id(bad), "{bad}");
        assert!(read(&d, &KEY, bad).is_err() && delete(&d, &KEY, bad).is_err());
    }
    assert!(valid_id(&new_id()));
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn status_reports_missing_orphans_and_sweeps_old_orphan_files() {
    let d = tmp("status");
    let a = add_ok(&d, "p1", pdf());
    let b = add_ok(&d, "p1", plain_png(4, 4));
    let s = status(&d, &KEY).unwrap();
    assert_eq!((s.count, s.missing, s.orphan_records, s.swept, s.level), (2, 0, 0, 0, "ok"));
    assert_eq!(s.bytes, a.size + b.size);
    // Fichier manquant.
    fs::remove_file(blob_path(&d, &a.id)).unwrap();
    assert_eq!(status(&d, &KEY).unwrap().missing, 1);
    assert!(list(&d, &KEY, "p1").unwrap().iter().any(|v| v.missing && v.meta.id == a.id));
    assert!(read(&d, &KEY, &a.id).unwrap_err().contains("manquant"));
    // Orphelin récent : conservé (envoi possible en cours) ; ancien : balayé.
    let recent = blob_path(&d, "pj-1111111111111111");
    let old = blob_path(&d, "pj-2222222222222222");
    fs::write(&recent, b"x").unwrap();
    fs::write(&old, b"x").unwrap();
    fs::File::options().write(true).open(&old).unwrap().set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(2 * 3600)).unwrap();
    let s = status(&d, &KEY).unwrap();
    assert_eq!(s.swept, 1);
    assert!(recent.exists() && !old.exists());
    // Patient disparu.
    write_enc_json_in(&d, &KEY, "meddoc_patients.json", &json!([])).unwrap();
    assert_eq!(status(&d, &KEY).unwrap().orphan_records, 2);
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn heavy_level_starts_above_one_gigabyte() {
    assert_eq!(level_for(0), "ok");
    assert_eq!(level_for(HEAVY_BYTES), "ok");
    assert_eq!(level_for(HEAVY_BYTES + 1), "heavy");
}

#[test]
fn date_validation() {
    for ok in ["2026-10-07", "2024-02-29", "1999-12-31"] {
        assert!(valid_date(ok), "{ok}");
    }
    for bad in ["2025-02-29", "2026-04-31", "2026-00-10", "2026-10-00", "abcd-ef-gh", "2026-1-01", "20261001"] {
        assert!(!valid_date(bad), "{bad}");
    }
}
