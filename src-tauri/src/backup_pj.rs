//! Pièces jointes dans la sauvegarde.
//!
//! Le `.dcb` (JSON chiffré par la phrase de passe) ne contient PAS les fichiers : il porte la liste
//! des pièces et la clé de sauvegarde `att_key` (champ `attachments`, à l'intérieur du texte
//! chiffré). Les pièces sont copiées UNE SEULE FOIS à côté, dans
//! `DocEase-Sauvegardes/pieces-jointes/<id>.dcp` (AES-256-GCM avec `att_key`, AAD = id) : la durée et
//! l'espace d'une sauvegarde quotidienne ne dépendent que des nouvelles pièces, et un seul fichier
//! est en mémoire à la fois. Chaque `.dcb` a un petit `.pj` (liste des ids) : la rotation supprime
//! le `.pj` avec son `.dcb`, puis les pièces que plus aucun `.pj` conservé ne référence.
//!
//! `att_key` est indépendante de la phrase de passe (changer la phrase ne réécrit aucune pièce) et
//! de la clé de données du poste (une restauration sur un poste neuf, avec une autre clé de données,
//! fonctionne avec la seule phrase de passe).

use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::attachments::{self, blob_path, open_aad, seal_aad, sha256_hex, valid_id, MAX_FILE_BYTES};
use super::backup::{BackupError, Meta, Res, SUBDIR as BACKUP_SUBDIR};
use super::{KEY_LEN, NONCE_LEN};

pub const SUBDIR: &str = "pieces-jointes";
pub const SIDECAR_EXT: &str = "pj";
/// Nonce + étiquette GCM.
pub const OVERHEAD: u64 = (NONCE_LEN + 16) as u64;
const SPACE_MARGIN: u64 = 16 * 1024 * 1024;
const MAX_ITEMS: usize = 200_000;
const STRAY_SIDECAR_GRACE_SECS: u64 = 3600;

fn io<E: std::fmt::Display>(e: E) -> BackupError {
    BackupError::Io(e.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Item {
    pub id: String,
    /// Taille du contenu en clair.
    pub size: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Bundle {
    pub key: [u8; KEY_LEN],
    pub items: Vec<Item>,
}

impl Bundle {
    pub fn to_json(&self) -> Value {
        json!({ "key": B64.encode(self.key), "items": self.items })
    }

    /// Champ `attachments` d'un contenu de sauvegarde. Invalide → `None` (jamais de panique).
    pub fn from_json(v: &Value) -> Option<Bundle> {
        let key: [u8; KEY_LEN] = B64.decode(v.get("key")?.as_str()?).ok()?.try_into().ok()?;
        let items: Vec<Item> = serde_json::from_value(v.get("items")?.clone()).ok()?;
        let ok = items.len() <= MAX_ITEMS && items.iter().all(|i| valid_id(&i.id) && i.size as usize <= MAX_FILE_BYTES && i.sha256.len() == 64);
        ok.then_some(Bundle { key, items })
    }
}

// ─── Clé de sauvegarde ───────────────────────────────────────────────────────

fn unwrap_att_key(meta: &Meta, data_key: &[u8; KEY_LEN]) -> Res<Option<[u8; KEY_LEN]>> {
    let Some(w) = &meta.wrapped_att_key else { return Ok(None) };
    let bytes = B64.decode(w).map_err(|_| BackupError::Io("Clé des pièces jointes illisible.".into()))?;
    let plain = super::decrypt(data_key, &bytes).map_err(|_| BackupError::Io("Clé des pièces jointes illisible.".into()))?;
    plain.try_into().map(Some).map_err(|_| BackupError::Io("Clé des pièces jointes invalide.".into()))
}

fn wrap_att_key(data_key: &[u8; KEY_LEN], att_key: &[u8; KEY_LEN]) -> Res<String> {
    Ok(B64.encode(super::encrypt(data_key, att_key).map_err(BackupError::Io)?))
}

/// Clé existante, ou création + enregistrement immédiat (sans quoi une sauvegarde interrompue
/// pourrait laisser des pièces chiffrées avec une clé perdue).
fn ensure_att_key(dir: &Path, meta: &mut Meta, data_key: &[u8; KEY_LEN]) -> Res<[u8; KEY_LEN]> {
    if let Some(k) = unwrap_att_key(meta, data_key)? {
        return Ok(k);
    }
    let mut k = [0u8; KEY_LEN];
    rand::rngs::OsRng.fill_bytes(&mut k);
    meta.wrapped_att_key = Some(wrap_att_key(data_key, &k)?);
    super::backup::save_meta(dir, meta)?;
    Ok(k)
}

/// Après une restauration : la clé de la sauvegarde devient celle du poste, pour que les pièces déjà
/// présentes à côté des sauvegardes restent lisibles par les sauvegardes suivantes.
pub fn adopt_key(dir: &Path, data_key: &[u8; KEY_LEN], bundle: &Bundle) -> Res<()> {
    let mut meta = super::backup::load_meta(dir)?;
    meta.wrapped_att_key = Some(wrap_att_key(data_key, &bundle.key)?);
    super::backup::save_meta(dir, &meta)
}

// ─── Préparation d'une sauvegarde ────────────────────────────────────────────

pub struct Prepared {
    pub bundle: Bundle,
    /// Entrées d'index dont le fichier chiffré manque sur ce poste (non sauvegardées, signalées).
    pub missing_local: usize,
    /// Pièce → patient (identifiants seulement), pour signaler une pièce locale altérée.
    pub patient_of: std::collections::HashMap<String, String>,
}

/// Pièce locale altérée (ou disparue entre-temps) : exclue de la sauvegarde et signalée jusqu'à
/// résolution. Enregistrée dans `backup_meta.json` (en clair) : identifiants seulement, jamais de
/// contenu ni de nom ; `patient_name` n'est renseigné qu'à la lecture, pour l'affichage.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Altered {
    pub id: String,
    pub patient_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patient_name: Option<String>,
}

/// `None` s'il n'y a aucune pièce jointe (aucune clé créée).
pub fn prepare(dir: &Path, data_key: &[u8; KEY_LEN], meta: &mut Meta) -> Res<Option<Prepared>> {
    let index = attachments::load_index(dir, data_key).map_err(BackupError::Io)?;
    if index.is_empty() {
        return Ok(None);
    }
    let key = ensure_att_key(dir, meta, data_key)?;
    let mut items = Vec::new();
    let mut missing_local = 0;
    let mut patient_of = std::collections::HashMap::new();
    for m in index {
        if blob_path(dir, &m.id).is_file() {
            patient_of.insert(m.id.clone(), m.patient_id.clone());
            items.push(Item { id: m.id, size: m.size, sha256: m.sha256 });
        } else {
            missing_local += 1;
        }
    }
    Ok(Some(Prepared { bundle: Bundle { key, items }, missing_local, patient_of }))
}

// ─── Espace libre ────────────────────────────────────────────────────────────

/// Octets disponibles sur le volume de `path` (Windows ; `None` ailleurs : pas de contrôle).
pub fn free_space(path: &Path) -> Option<u64> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        extern "system" {
            fn GetDiskFreeSpaceExW(dir: *const u16, avail: *mut u64, total: *mut u64, free: *mut u64) -> i32;
        }
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let (mut avail, mut total, mut free) = (0u64, 0u64, 0u64);
        // SAFETY : chaîne terminée par un zéro, pointeurs vers des entiers locaux valides.
        let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut avail, &mut total, &mut free) };
        (ok != 0).then_some(avail)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

fn mb(n: u64) -> String {
    format!("{} Mo", n.div_ceil(1024 * 1024))
}

/// Ce que `check_space` doit comparer, séparé pour pouvoir être testé sans disque plein.
pub fn space_verdict(need: u64, free: Option<u64>, dest: &str) -> Res<()> {
    match free {
        Some(f) if f < need => Err(BackupError::InsufficientSpace(format!("{dest} : {} nécessaires, {} disponibles", mb(need), mb(f)))),
        _ => Ok(()),
    }
}

// ─── Copie vers un emplacement ───────────────────────────────────────────────

pub fn blobs_dir(dest: &Path) -> PathBuf {
    dest.join(BACKUP_SUBDIR).join(SUBDIR)
}

fn blob_ok(pj: &Path, it: &Item) -> bool {
    fs::metadata(pj.join(format!("{}.{}", it.id, attachments::EXT))).map_or(false, |m| m.is_file() && m.len() == it.size + OVERHEAD)
}

/// Résultat de la copie vers un emplacement.
#[derive(Default, Debug)]
pub struct Synced {
    pub copied: usize,
    /// Pièces dont l'original local est altéré ou introuvable : NON copiées, le reste continue.
    pub altered: Vec<String>,
    /// Parmi elles, celles dont cet emplacement n'a aucune bonne copie (rien à conserver).
    pub no_good_copy: std::collections::HashSet<String>,
}

/// Espace libre (pièces à copier + sauvegarde × 1,2 + marge), puis copie des pièces absentes.
/// `recheck` : pièces déjà signalées altérées, revérifiées à chaque sauvegarde même si l'emplacement
/// en a une bonne copie (sans quoi l'alerte disparaîtrait sans que rien ne soit résolu).
/// Une pièce locale altérée n'interrompt pas la sauvegarde : elle est écartée et signalée, et la
/// dernière bonne copie déjà présente est laissée intacte.
pub fn sync_dest(dir: &Path, data_key: &[u8; KEY_LEN], bundle: &Bundle, dest: &Path, dcb_len: u64, now: u64, recheck: &std::collections::HashSet<String>) -> Res<Synced> {
    // Même règle que l'écriture du .dcb : un emplacement absent n'est jamais recréé en silence.
    super::backup::check_dir(dest)?;
    let pj = blobs_dir(dest);
    let corrupt = deep_check(&pj, bundle, now);
    let todo: Vec<&Item> = bundle.items.iter().filter(|i| !blob_ok(&pj, i) || corrupt.contains(&i.id) || recheck.contains(&i.id)).collect();
    let need = todo.iter().map(|i| i.size + OVERHEAD).sum::<u64>() + dcb_len + dcb_len / 5 + SPACE_MARGIN;
    space_verdict(need, free_space(dest), &dest.display().to_string())?;
    let mut out = Synced::default();
    if todo.is_empty() {
        return Ok(out);
    }
    fs::create_dir_all(&pj).map_err(io)?;
    for it in &todo {
        match read_local(dir, data_key, it) {
            Ok(plain) => {
                copy_one(&bundle.key, &pj, it, &plain)?;
                out.copied += 1;
            }
            Err(_) => {
                out.altered.push(it.id.clone());
                if !blob_ok(&pj, it) || corrupt.contains(&it.id) {
                    out.no_good_copy.insert(it.id.clone());
                }
            }
        }
    }
    Ok(out)
}

/// Budget de vérification approfondie par sauvegarde et par emplacement (lecture + déchiffrement).
const DEEP_CHECK_BYTES: u64 = 64 * 1024 * 1024;

/// Détecte une copie altérée sans changer de taille (usure du support) : un lot tournant de pièces
/// est déchiffré et comparé à son empreinte à chaque sauvegarde, de sorte que tout le contenu est
/// revérifié au fil des jours. Une copie altérée est recopiée depuis le poste (source de vérité).
fn deep_check(pj: &Path, bundle: &Bundle, now: u64) -> std::collections::HashSet<String> {
    let mut bad = std::collections::HashSet::new();
    let n = bundle.items.len();
    if n == 0 {
        return bad;
    }
    let start = ((now / 86_400) as usize) % n;
    let mut spent = 0u64;
    for k in 0..n {
        let it = &bundle.items[(start + k) % n];
        if !blob_ok(pj, it) {
            continue; // absente : déjà recopiée
        }
        if spent + it.size > DEEP_CHECK_BYTES && spent > 0 {
            break;
        }
        spent += it.size;
        let good = fs::read(pj.join(format!("{}.{}", it.id, attachments::EXT)))
            .ok()
            .and_then(|b| open_aad(&bundle.key, it.id.as_bytes(), &b).ok())
            .map_or(false, |p| sha256_hex(&p) == it.sha256);
        if !good {
            bad.insert(it.id.clone());
        }
    }
    bad
}

/// Contenu en clair de l'original local, vérifié (déchiffrement + taille + empreinte).
fn read_local(dir: &Path, data_key: &[u8; KEY_LEN], it: &Item) -> Result<Vec<u8>, String> {
    let sealed = fs::read(blob_path(dir, &it.id)).map_err(|_| format!("pièce jointe {} introuvable sur ce poste", it.id))?;
    let plain = open_aad(data_key, it.id.as_bytes(), &sealed).map_err(|_| format!("pièce jointe {} altérée sur ce poste", it.id))?;
    if sha256_hex(&plain) != it.sha256 || plain.len() as u64 != it.size {
        return Err(format!("pièce jointe {} altérée sur ce poste", it.id));
    }
    Ok(plain)
}

/// Même principe que `deep_check`, côté poste : un lot tournant d'originaux locaux est relu et
/// vérifié à chaque sauvegarde, pour repérer une pièce abîmée APRÈS sa première bonne copie.
pub fn local_check(dir: &Path, data_key: &[u8; KEY_LEN], bundle: &Bundle, now: u64) -> std::collections::HashSet<String> {
    let mut bad = std::collections::HashSet::new();
    let n = bundle.items.len();
    if n == 0 {
        return bad;
    }
    let start = ((now / 86_400) as usize) % n;
    let mut spent = 0u64;
    for k in 0..n {
        let it = &bundle.items[(start + k) % n];
        if spent + it.size > DEEP_CHECK_BYTES && spent > 0 {
            break;
        }
        spent += it.size;
        if read_local(dir, data_key, it).is_err() {
            bad.insert(it.id.clone());
        }
    }
    bad
}

fn copy_one(att_key: &[u8; KEY_LEN], pj: &Path, it: &Item, plain: &[u8]) -> Res<()> {
    let out = seal_aad(att_key, it.id.as_bytes(), plain).map_err(BackupError::Io)?;
    let path = pj.join(format!("{}.{}", it.id, attachments::EXT));
    super::users::write_atomic(&path, &out).map_err(BackupError::Io)?;
    // Contrôle : relu, déchiffré, empreinte identique.
    let back = fs::read(&path).map_err(io)?;
    let again = open_aad(att_key, it.id.as_bytes(), &back).map_err(|e| BackupError::Verification(format!("pièce {} : {e}", it.id)))?;
    if sha256_hex(&again) != it.sha256 {
        let _ = fs::remove_file(&path);
        return Err(BackupError::Verification(format!("pièce {} : copie différente de l'original", it.id)));
    }
    Ok(())
}

// ─── Fichiers .pj et nettoyage ───────────────────────────────────────────────

fn sidecar_path(dest: &Path, dcb_name: &str) -> PathBuf {
    let stem = dcb_name.strip_suffix(&format!(".{}", super::backup::EXT)).unwrap_or(dcb_name);
    dest.join(BACKUP_SUBDIR).join(format!("{stem}.{SIDECAR_EXT}"))
}

pub fn write_sidecar(dest: &Path, dcb_name: &str, ids: &[String]) -> Res<()> {
    let bytes = serde_json::to_vec(&json!({ "ids": ids })).map_err(io)?;
    super::users::write_atomic(&sidecar_path(dest, dcb_name), &bytes).map_err(BackupError::Io)
}

pub fn remove_sidecar(dest: &Path, dcb_name: &str) {
    let _ = fs::remove_file(sidecar_path(dest, dcb_name));
}

/// Supprime les pièces que plus aucun `.pj` ne référence, et les `.pj` sans `.dcb` (anciens).
/// Un `.pj` illisible interrompt le nettoyage (on ne supprime jamais dans le doute).
pub fn gc(dest: &Path) -> usize {
    let folder = dest.join(BACKUP_SUBDIR);
    let Ok(rd) = fs::read_dir(&folder) else { return 0 };
    let mut referenced: std::collections::HashSet<String> = std::collections::HashSet::new();
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let Some(stem) = name.strip_suffix(&format!(".{SIDECAR_EXT}")) else { continue };
        let dcb = folder.join(format!("{stem}.{}", super::backup::EXT));
        if !dcb.exists() {
            let age = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).map_or(0, |d| d.as_secs());
            if age >= STRAY_SIDECAR_GRACE_SECS {
                let _ = fs::remove_file(e.path());
                continue;
            }
        }
        let ids: Option<Vec<String>> = fs::read(e.path()).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).and_then(|v| serde_json::from_value(v.get("ids")?.clone()).ok());
        match ids {
            Some(list) => referenced.extend(list),
            None => return 0,
        }
    }
    let mut removed = 0;
    if let Ok(rd) = fs::read_dir(folder.join(SUBDIR)) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let Some(id) = name.strip_suffix(&format!(".{}", attachments::EXT)) else { continue };
            if valid_id(id) && !referenced.contains(id) && fs::remove_file(e.path()).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

// ─── Restauration ────────────────────────────────────────────────────────────

/// Dossier des pièces à côté d'un `.dcb`.
pub fn blobs_next_to(backup_path: &Path) -> PathBuf {
    backup_path.parent().map(|p| p.join(SUBDIR)).unwrap_or_else(|| PathBuf::from(SUBDIR))
}

/// Pièces référencées mais absentes (ou de taille inattendue) à côté de la sauvegarde.
pub fn count_missing(backup_path: &Path, bundle: &Bundle) -> usize {
    let pj = blobs_next_to(backup_path);
    bundle.items.iter().filter(|i| !blob_ok(&pj, i)).count()
}

pub struct Staged {
    pub dir: PathBuf,
    pub restored: usize,
    pub missing: usize,
}

pub fn staging_dir(data: &Path) -> PathBuf {
    data.join(format!("{}.restore.tmp", attachments::DIR))
}

/// Déchiffre chaque pièce avec `att_key`, vérifie son empreinte, la rechiffre avec la clé de données
/// du poste dans un dossier de préparation. Une pièce absente ou altérée est comptée « manquante » :
/// la restauration des données reste possible.
pub fn stage_restore(data: &Path, data_key: &[u8; KEY_LEN], backup_path: &Path, bundle: Option<&Bundle>) -> Res<Staged> {
    let staging = staging_dir(data);
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(io)?;
    let (mut restored, mut missing) = (0, 0);
    if let Some(b) = bundle {
        let src = blobs_next_to(backup_path);
        for it in &b.items {
            let result = fs::read(src.join(format!("{}.{}", it.id, attachments::EXT)))
                .ok()
                .and_then(|bytes| open_aad(&b.key, it.id.as_bytes(), &bytes).ok())
                .filter(|plain| sha256_hex(plain) == it.sha256 && plain.len() as u64 == it.size)
                .and_then(|plain| seal_aad(data_key, it.id.as_bytes(), &plain).ok())
                .and_then(|sealed| super::users::write_atomic(&staging.join(format!("{}.{}", it.id, attachments::EXT)), &sealed).ok());
            if result.is_some() {
                restored += 1;
            } else {
                missing += 1;
            }
        }
    }
    Ok(Staged { dir: staging, restored, missing })
}

#[cfg(test)]
#[path = "backup_pj_tests.rs"]
mod tests;

/// Taille et nombre de pièces stockées localement (liste du dossier : ne demande aucune clé).
pub fn local_usage(data: &Path) -> (usize, u64) {
    let Ok(rd) = fs::read_dir(attachments::store_dir(data)) else { return (0, 0) };
    rd.flatten()
        .filter(|e| e.file_name().to_string_lossy().ends_with(&format!(".{}", attachments::EXT)))
        .filter_map(|e| e.metadata().ok())
        .fold((0, 0), |(n, b), m| (n + 1, b + m.len().saturating_sub(OVERHEAD)))
}
