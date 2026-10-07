use super::*;
use crate::attachments::{self, AddInput};
use crate::backup::{self, BackupError};
use crate::media_clean::tests::{plain_jpeg, plain_png};
use crate::{util, write_enc_json_in};
use serde_json::json;

const KEY_A: [u8; KEY_LEN] = [3u8; KEY_LEN];
const KEY_B: [u8; KEY_LEN] = [4u8; KEY_LEN]; // autre poste : autre clé de données
const PASS: &str = "une phrase de passe de test";
const T0: u64 = 1_790_000_000;
const NOW: &str = "2026-10-07T10:00:00Z";
const TODAY: &str = "2026-10-07";

fn fast_kdf() {
    *backup::TEST_KDF.lock().unwrap() = Some((256, 1, 1));
}

fn tmp(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let d = std::env::temp_dir().join(format!("docease-bkpj-{tag}-{}-{}-{}", std::process::id(), util::now_secs(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

/// Poste : dossier de données avec un patient (et une consultation).
fn station(tag: &str, key: &[u8; KEY_LEN]) -> PathBuf {
    let d = tmp(tag);
    write_enc_json_in(&d, key, "meddoc_patients.json", &json!([{"id": "p1", "name": "A"}])).unwrap();
    write_enc_json_in(&d, key, "meddoc_consultations.json", &json!([{"id": "c1", "patientId": "p1"}])).unwrap();
    d
}

fn configure(dir: &Path, key: &[u8; KEY_LEN], with_second: bool) -> (PathBuf, PathBuf) {
    let (a, b) = (tmp("destA"), tmp("destB"));
    backup::set_passphrase(dir, key, PASS).unwrap();
    backup::set_destinations(dir, Some(a.to_str().unwrap()), with_second.then(|| b.to_str().unwrap())).unwrap();
    (a, b)
}

fn attach(dir: &Path, key: &[u8; KEY_LEN], title: &str, raw: Vec<u8>) -> attachments::Meta {
    let input = AddInput { patient_id: "p1".into(), title: title.into(), category: "ECG".into(), exam_date: "2026-10-01".into(), ..Default::default() };
    attachments::add(dir, key, input, raw, "Dr", NOW, TODAY).unwrap()
}

fn pdf(tag: &str) -> Vec<u8> {
    format!("%PDF-1.4\n% SECRET-{tag}\n%%EOF").into_bytes()
}

fn dcb_files(dest: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dest.join(BACKUP_SUBDIR)).unwrap().flatten().map(|e| e.path()).filter(|p| p.extension().map_or(false, |x| x == "dcb")).collect();
    v.sort();
    v
}

fn blob_files(dest: &Path) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(blobs_dir(dest)).map(|r| r.flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect()).unwrap_or_default();
    v.sort();
    v
}

#[test]
fn pieces_are_copied_once_and_never_inside_the_dcb() {
    fast_kdf();
    let d = station("copy", &KEY_A);
    let (a, b) = configure(&d, &KEY_A, true);
    let m1 = attach(&d, &KEY_A, "Un", pdf("UN"));
    let m2 = attach(&d, &KEY_A, "Deux", plain_png(8, 8));

    let r1 = backup::run_backup(&d, &KEY_A, T0).unwrap();
    assert_eq!((r1.attachments, r1.attachments_copied, r1.attachments_missing), (2, 2, 0));
    for dest in [&a, &b] {
        assert_eq!(blob_files(dest).len(), 2);
        assert!(dest.join(BACKUP_SUBDIR).join(format!("{}.pj", r1.file_name.trim_end_matches(".dcb"))).is_file(), "liste .pj à côté du .dcb");
        // Le contenu n'est ni dans le .dcb ni lisible dans les copies.
        let dcb = fs::read(dcb_files(dest)[0].clone()).unwrap();
        assert!(!dcb.windows(9).any(|w| w == b"SECRET-UN") && dcb.len() < 20_000, "pièces absentes du .dcb ({} octets)", dcb.len());
        for f in blob_files(dest) {
            let bytes = fs::read(blobs_dir(dest).join(f)).unwrap();
            assert!(!bytes.windows(9).any(|w| w == b"SECRET-UN"));
        }
    }
    // Les copies ne se déchiffrent pas avec la clé de données, mais avec la clé de sauvegarde du .dcb.
    let opened = backup::open(&fs::read(dcb_files(&a)[0].clone()).unwrap(), PASS).unwrap();
    let bundle = opened.attachments.clone().expect("champ attachments");
    assert_eq!(bundle.items.len(), 2);
    let blob = fs::read(blobs_dir(&a).join(format!("{}.dcp", m1.id))).unwrap();
    assert!(open_aad(&KEY_A, m1.id.as_bytes(), &blob).is_err());
    assert_eq!(open_aad(&bundle.key, m1.id.as_bytes(), &blob).unwrap(), pdf("UN"));
    assert!(open_aad(&bundle.key, m2.id.as_bytes(), &blob).is_err(), "AAD = identifiant");

    // 2e sauvegarde : rien n'est recopié (octets inchangés).
    let before: Vec<_> = blob_files(&a).iter().map(|f| fs::read(blobs_dir(&a).join(f)).unwrap()).collect();
    let r2 = backup::run_backup(&d, &KEY_A, T0 + 86_400).unwrap();
    assert_eq!((r2.attachments, r2.attachments_copied), (2, 0));
    let after: Vec<_> = blob_files(&a).iter().map(|f| fs::read(blobs_dir(&a).join(f)).unwrap()).collect();
    assert_eq!(before, after);
    // 3e : une nouvelle pièce seulement.
    attach(&d, &KEY_A, "Trois", plain_jpeg(8, 8));
    let r3 = backup::run_backup(&d, &KEY_A, T0 + 2 * 86_400).unwrap();
    assert_eq!((r3.attachments, r3.attachments_copied), (3, 1));
    assert_eq!(blob_files(&a).len(), 3);
    // Aperçu : nombre de pièces, aucune introuvable.
    let p = backup::inspect(&dcb_files(&a)[2], PASS).unwrap();
    assert_eq!((p.attachments, p.attachments_missing), (3, 0));
    // État du poste : nombre et taille.
    let st = backup::status(&d, T0 + 2 * 86_400).unwrap();
    assert_eq!(st.attachments_count, 3);
    assert_eq!(st.attachments_level, "ok");
    for x in [&d, &a, &b] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn restore_on_a_fresh_station_with_another_data_key() {
    fast_kdf();
    let d = station("src", &KEY_A);
    let (a, _b) = configure(&d, &KEY_A, false);
    let m1 = attach(&d, &KEY_A, "Un", pdf("UN"));
    let m2 = attach(&d, &KEY_A, "Deux", plain_png(8, 8));
    backup::run_backup(&d, &KEY_A, T0).unwrap();
    let dcb = dcb_files(&a)[0].clone();

    // Poste neuf : autre clé de données, un autre patient, et une ancienne pièce locale.
    let n = station("fresh", &KEY_B);
    let old = attachments::add(&n, &KEY_B, AddInput { patient_id: "p1".into(), title: "Ancienne".into(), category: "autre".into(), exam_date: "2026-10-01".into(), ..Default::default() }, pdf("ANCIENNE"), "Dr", NOW, TODAY).unwrap();
    let r = backup::restore(&n, &KEY_B, &dcb, PASS, T0 + 10).unwrap();
    assert_eq!((r.attachments_restored, r.attachments_missing), (2, 0));
    // Lecture avec la clé de données du NOUVEAU poste, contenu identique, index restauré.
    let (meta, bytes) = attachments::read(&n, &KEY_B, &m1.id).unwrap();
    assert_eq!(bytes, pdf("UN"));
    assert_eq!(meta.title, "Un");
    assert_eq!(attachments::read(&n, &KEY_B, &m2.id).unwrap().1, attachments::read(&d, &KEY_A, &m2.id).unwrap().1);
    // État exact : l'ancienne pièce a disparu du poste mais reste dans la copie de sécurité.
    assert!(attachments::read(&n, &KEY_B, &old.id).is_err());
    let safety = PathBuf::from(r.safety_copy.clone().expect("copie de sécurité"));
    assert!(safety.join(attachments::DIR).join(format!("{}.dcp", old.id)).is_file(), "ancien dossier déplacé dans la copie de sécurité");
    assert!(!n.join(format!("{}.old", attachments::DIR)).exists() && !staging_dir(&n).exists());
    // La clé de sauvegarde est reprise : une sauvegarde du nouveau poste vers le même emplacement ne recopie rien.
    backup::set_passphrase(&n, &KEY_B, PASS).unwrap();
    backup::set_destinations(&n, Some(a.to_str().unwrap()), None).unwrap();
    let r2 = backup::run_backup(&n, &KEY_B, T0 + 86_400).unwrap();
    assert_eq!((r2.attachments, r2.attachments_copied), (2, 0));
    // …et on peut en restaurer encore une sur un 3e poste avec la phrase seule.
    let third = station("third", &[5u8; KEY_LEN]);
    let latest = dcb_files(&a).last().unwrap().clone();
    let r3 = backup::restore(&third, &[5u8; KEY_LEN], &latest, PASS, T0 + 20).unwrap();
    assert_eq!(r3.attachments_restored, 2);
    assert_eq!(attachments::read(&third, &[5u8; KEY_LEN], &m1.id).unwrap().1, pdf("UN"));
    for x in [&d, &a, &n, &third] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn missing_or_altered_pieces_are_reported_and_data_is_still_restored() {
    fast_kdf();
    let d = station("miss", &KEY_A);
    let (a, _b) = configure(&d, &KEY_A, false);
    let keep = attach(&d, &KEY_A, "Garde", pdf("GARDE"));
    let lost = attach(&d, &KEY_A, "Perdue", pdf("PERDUE"));
    let hurt = attach(&d, &KEY_A, "Abîmée", plain_png(8, 8));
    backup::run_backup(&d, &KEY_A, T0).unwrap();
    let dcb = dcb_files(&a)[0].clone();
    fs::remove_file(blobs_dir(&a).join(format!("{}.dcp", lost.id))).unwrap();
    let p = blobs_dir(&a).join(format!("{}.dcp", hurt.id));
    let mut bytes = fs::read(&p).unwrap();
    let n = bytes.len() - 5;
    bytes[n] ^= 0x55; // même taille, contenu altéré
    fs::write(&p, &bytes).unwrap();

    // Aperçu : la taille ne détecte que l'absence ; le détail est donné à la restauration.
    let preview = backup::inspect(&dcb, PASS).unwrap();
    assert_eq!((preview.attachments, preview.attachments_missing), (3, 1));
    let n2 = station("miss-fresh", &KEY_B);
    let r = backup::restore(&n2, &KEY_B, &dcb, PASS, T0 + 5).unwrap();
    assert_eq!((r.attachments_restored, r.attachments_missing), (1, 2));
    assert!(r.restored >= 3, "les données sont bien restaurées");
    assert_eq!(attachments::read(&n2, &KEY_B, &keep.id).unwrap().1, pdf("GARDE"));
    // Les deux autres restent dans l'index, marquées « fichier manquant ».
    let listed = attachments::list(&n2, &KEY_B, "p1").unwrap();
    assert_eq!(listed.len(), 3);
    for v in &listed {
        assert_eq!(v.missing, v.meta.id != keep.id, "{}", v.meta.title);
    }
    assert_eq!(attachments::status(&n2, &KEY_B).unwrap().missing, 2);
    for x in [&d, &a, &n2] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn no_attachments_means_no_key_no_folder_no_sidecar() {
    fast_kdf();
    let d = station("none", &KEY_A);
    let (a, _b) = configure(&d, &KEY_A, false);
    let r = backup::run_backup(&d, &KEY_A, T0).unwrap();
    assert_eq!((r.attachments, r.attachments_copied, r.attachments_missing), (0, 0, 0));
    assert!(!blobs_dir(&a).exists());
    assert!(fs::read_dir(a.join(BACKUP_SUBDIR)).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".pj")));
    assert!(backup::load_meta(&d).unwrap().wrapped_att_key.is_none());
    let opened = backup::open(&fs::read(dcb_files(&a)[0].clone()).unwrap(), PASS).unwrap();
    assert!(opened.attachments.is_none());
    // Restaurer une sauvegarde sans pièces vide le dossier local (état exact), sans erreur.
    let n = station("none-fresh", &KEY_B);
    attach(&n, &KEY_B, "Locale", pdf("LOCALE"));
    let rr = backup::restore(&n, &KEY_B, &dcb_files(&a)[0].clone(), PASS, T0 + 1).unwrap();
    assert_eq!((rr.attachments_restored, rr.attachments_missing), (0, 0));
    assert_eq!(attachments::status(&n, &KEY_B).unwrap().count, 0);
    for x in [&d, &a, &n] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn locally_missing_piece_is_skipped_and_reported_but_altered_one_stops_the_backup() {
    fast_kdf();
    let d = station("local", &KEY_A);
    let (a, _b) = configure(&d, &KEY_A, false);
    let ok = attach(&d, &KEY_A, "Ok", pdf("OK"));
    let gone = attach(&d, &KEY_A, "Disparue", pdf("DISPARUE"));
    fs::remove_file(attachments::blob_path(&d, &gone.id)).unwrap();
    let r = backup::run_backup(&d, &KEY_A, T0).unwrap();
    assert_eq!((r.attachments, r.attachments_missing), (1, 1));
    assert_eq!(blob_files(&a), vec![format!("{}.dcp", ok.id)]);
    // Nouvelle pièce locale altérée : la sauvegarde échoue clairement (jamais incomplète en silence), rien n'est laissé.
    let bad = attach(&d, &KEY_A, "Abîmée", pdf("ABIMEE"));
    let p = attachments::blob_path(&d, &bad.id);
    let mut bytes = fs::read(&p).unwrap();
    let n = bytes.len() - 3;
    bytes[n] ^= 1;
    fs::write(&p, &bytes).unwrap();
    let before = dcb_files(&a).len();
    let err = backup::run_backup(&d, &KEY_A, T0 + 86_400).unwrap_err();
    assert!(err.message().contains("altérée"), "{}", err.message());
    assert_eq!(dcb_files(&a).len(), before, "aucun .dcb écrit");
    assert_eq!(fs::read_dir(a.join(BACKUP_SUBDIR)).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".pj")).count(), 1, "aucun .pj de l'échec");
    assert_eq!(blob_files(&a), vec![format!("{}.dcp", ok.id)], "aucune copie partielle de la pièce altérée");
    for x in [&d, &a] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn a_failing_second_destination_does_not_block_the_first() {
    fast_kdf();
    let d = station("second", &KEY_A);
    let (a, b) = configure(&d, &KEY_A, true);
    attach(&d, &KEY_A, "Un", pdf("UN"));
    fs::remove_dir_all(&b).unwrap(); // clé USB débranchée
    let r = backup::run_backup(&d, &KEY_A, T0).unwrap();
    assert!(r.destinations[0].ok && !r.destinations[1].ok);
    assert!(!b.exists(), "l'emplacement absent n'est pas recréé en silence");
    assert_eq!(blob_files(&a).len(), 1);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&a);
}

#[test]
fn rotation_removes_pieces_no_retained_backup_references() {
    fast_kdf();
    let d = station("rotate", &KEY_A);
    let (a, _b) = configure(&d, &KEY_A, false);
    let first = attach(&d, &KEY_A, "Première", pdf("PREMIERE"));
    backup::run_backup(&d, &KEY_A, T0).unwrap();
    // La pièce est supprimée du dossier, une autre arrive : l'ancienne sauvegarde la référence encore.
    attachments::delete(&d, &KEY_A, &first.id).unwrap();
    let second = attach(&d, &KEY_A, "Seconde", pdf("SECONDE"));
    backup::run_backup(&d, &KEY_A, T0 + 86_400).unwrap();
    assert!(blobs_dir(&a).join(format!("{}.dcp", first.id)).is_file(), "encore référencée par la sauvegarde la plus ancienne");
    assert!(blobs_dir(&a).join(format!("{}.dcp", second.id)).is_file());
    // Treize mois de sauvegardes mensuelles : la plus ancienne sort de la rotation.
    for k in 2..16u64 {
        backup::run_backup(&d, &KEY_A, T0 + k * 31 * 86_400).unwrap();
    }
    let names: Vec<String> = dcb_files(&a).iter().map(|p| p.file_name().unwrap().to_string_lossy().to_string()).collect();
    assert!(!names.contains(&backup::file_name(T0)), "la plus ancienne a été supprimée : {names:?}");
    assert!(!blobs_dir(&a).join(format!("{}.dcp", first.id)).exists(), "pièce non référencée supprimée");
    assert!(blobs_dir(&a).join(format!("{}.dcp", second.id)).is_file(), "pièce encore référencée conservée");
    // Chaque .pj correspond à un .dcb conservé.
    let pjs: Vec<String> = fs::read_dir(a.join(BACKUP_SUBDIR)).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.ends_with(".pj")).collect();
    assert_eq!(pjs.len(), names.len());
    for x in [&d, &a] {
        let _ = fs::remove_dir_all(x);
    }
}

#[test]
fn gc_never_deletes_when_a_sidecar_is_unreadable() {
    let a = tmp("gc");
    let folder = a.join(BACKUP_SUBDIR);
    fs::create_dir_all(folder.join(SUBDIR)).unwrap();
    let ours = folder.join(SUBDIR).join("pj-aaaaaaaaaaaaaaaa.dcp");
    fs::write(&ours, b"x").unwrap();
    fs::write(folder.join("docease-20261007-100000.dcb"), b"{}").unwrap();
    fs::write(folder.join("docease-20261007-100000.pj"), b"pas du json").unwrap();
    assert_eq!(gc(&a), 0);
    assert!(ours.exists());
    fs::write(folder.join("docease-20261007-100000.pj"), br#"{"ids":["pj-bbbbbbbbbbbbbbbb"]}"#).unwrap();
    assert_eq!(gc(&a), 1, "non référencée : supprimée");
    assert!(!ours.exists());
    // Fichiers étrangers ou noms invalides : jamais touchés.
    let foreign = folder.join(SUBDIR).join("notes.txt");
    fs::write(&foreign, b"x").unwrap();
    assert_eq!(gc(&a), 0);
    assert!(foreign.exists());
    let _ = fs::remove_dir_all(&a);
}

#[test]
fn space_check_and_bundle_parsing() {
    let err = space_verdict(500 * 1024 * 1024, Some(100 * 1024 * 1024), "D:\\Sauvegardes").unwrap_err();
    assert!(matches!(err, BackupError::InsufficientSpace(_)));
    assert_eq!(err.code(), "INSUFFICIENT_SPACE");
    assert!(err.message().contains("D:\\Sauvegardes") && err.message().contains("500 Mo") && err.message().contains("100 Mo"), "{}", err.message());
    assert!(space_verdict(10, Some(10), "x").is_ok());
    assert!(space_verdict(10, None, "x").is_ok(), "volume inconnu : pas de blocage");
    #[cfg(windows)]
    assert!(free_space(&std::env::temp_dir()).map_or(false, |f| f > 0));

    let good = json!({"key": B64.encode([1u8; 32]), "items": [{"id": "pj-0123456789abcdef", "size": 10, "sha256": "0".repeat(64)}]});
    assert!(Bundle::from_json(&good).is_some());
    for bad in [
        json!({"key": "AAAA", "items": []}),
        json!({"key": B64.encode([1u8; 32]), "items": [{"id": "../x", "size": 1, "sha256": "0".repeat(64)}]}),
        json!({"key": B64.encode([1u8; 32]), "items": [{"id": "pj-0123456789abcdef", "size": 999_999_999, "sha256": "0".repeat(64)}]}),
        json!({"key": B64.encode([1u8; 32]), "items": [{"id": "pj-0123456789abcdef", "size": 1, "sha256": "court"}]}),
        json!({"items": []}),
        json!(null),
    ] {
        assert!(Bundle::from_json(&bad).is_none(), "{bad}");
    }
}

#[test]
fn bit_rot_on_a_backup_copy_is_detected_and_healed_from_the_station() {
    fast_kdf();
    let d = station("rot", &KEY_A);
    let (a, _b) = configure(&d, &KEY_A, false);
    let m = attach(&d, &KEY_A, "Un", pdf("UN"));
    backup::run_backup(&d, &KEY_A, T0).unwrap();
    let p = blobs_dir(&a).join(format!("{}.dcp", m.id));
    let good = fs::read(&p).unwrap();
    let mut rotten = good.clone();
    let n = rotten.len() - 4;
    rotten[n] ^= 0xFF; // même taille : la vérification par taille ne la voit pas
    fs::write(&p, &rotten).unwrap();
    let r = backup::run_backup(&d, &KEY_A, T0 + 86_400).unwrap();
    assert_eq!(r.attachments_copied, 1, "copie altérée recopiée depuis le poste");
    let healed = fs::read(&p).unwrap();
    assert_eq!(healed.len(), good.len());
    let opened = backup::open(&fs::read(dcb_files(&a).last().unwrap()).unwrap(), PASS).unwrap();
    assert_eq!(open_aad(&opened.attachments.unwrap().key, m.id.as_bytes(), &healed).unwrap(), pdf("UN"));
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&a);
}
