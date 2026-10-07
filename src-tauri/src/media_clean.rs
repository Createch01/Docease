//! Détection du type réel (par le contenu) et nettoyage des métadonnées des images importées.
//!
//! - PDF : reconnu par `%PDF-`, jamais modifié.
//! - JPEG : les métadonnées (EXIF dont GPS / appareil / date, XMP, IPTC, commentaires, vignette
//!   JFIF, MPF…) sont retirées. Sans orientation EXIF (ou orientation 1), les segments sont retirés
//!   au niveau des octets : aucune recompression, aucune perte. Avec une orientation ≠ 1, l'image est
//!   décodée, pivotée / retournée pour rester à l'endroit, puis réencodée (qualité 95) sans métadonnées.
//!   Le profil ICC et les marqueurs nécessaires au décodage (Adobe) sont conservés ; tout octet après
//!   la fin de l'image est supprimé.
//! - PNG : seuls les blocs d'image et de couleur sont conservés (tEXt / zTXt / iTXt / eXIf / tIME et
//!   tout bloc inconnu sont retirés). Orientation `eXIf` ≠ 1 : image pivotée puis réencodée sans perte.

use std::io::Cursor;

use image::{DynamicImage, ImageFormat};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Pdf,
    Jpeg,
    Png,
}

impl Kind {
    pub fn mime(self) -> &'static str {
        match self {
            Kind::Pdf => "application/pdf",
            Kind::Jpeg => "image/jpeg",
            Kind::Png => "image/png",
        }
    }
}

const PNG_SIG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
/// Garde-fou contre les images « bombes » avant tout décodage.
const MAX_PIXELS: u64 = 120_000_000;

/// Type réel d'après les premiers octets (jamais d'après le nom ni le type annoncé).
pub fn detect(bytes: &[u8]) -> Option<Kind> {
    if bytes.starts_with(b"%PDF-") {
        Some(Kind::Pdf)
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(Kind::Jpeg)
    } else if bytes.starts_with(&PNG_SIG) {
        Some(Kind::Png)
    } else {
        None
    }
}

/// Octets à stocker : PDF inchangé, images sans métadonnées.
pub fn clean(kind: Kind, bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    match kind {
        Kind::Pdf => Ok(bytes),
        Kind::Jpeg => clean_jpeg(&bytes),
        Kind::Png => clean_png(&bytes),
    }
}

// ─── Orientation EXIF ────────────────────────────────────────────────────────

fn rd16(b: &[u8], at: usize, le: bool) -> Option<u16> {
    let s = b.get(at..at + 2)?;
    Some(if le { u16::from_le_bytes([s[0], s[1]]) } else { u16::from_be_bytes([s[0], s[1]]) })
}

fn rd32(b: &[u8], at: usize, le: bool) -> Option<u32> {
    let s = b.get(at..at + 4)?;
    Some(if le { u32::from_le_bytes([s[0], s[1], s[2], s[3]]) } else { u32::from_be_bytes([s[0], s[1], s[2], s[3]]) })
}

/// Orientation (1–8) lue dans un bloc TIFF (`II*\0` / `MM\0*`), si présente et valide.
pub fn exif_orientation(tiff: &[u8]) -> Option<u8> {
    let le = match tiff.get(0..2)? {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    if rd16(tiff, 2, le)? != 42 {
        return None;
    }
    let ifd = rd32(tiff, 4, le)? as usize;
    let count = rd16(tiff, ifd, le)? as usize;
    for i in 0..count.min(512) {
        let e = ifd + 2 + i * 12;
        if rd16(tiff, e, le)? == 0x0112 {
            let v = rd16(tiff, e + 8, le)?;
            return (1..=8).contains(&v).then_some(v as u8);
        }
    }
    None
}

fn apply_orientation(img: DynamicImage, o: u8) -> DynamicImage {
    match o {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.fliph().rotate270(),
        6 => img.rotate90(),
        7 => img.fliph().rotate90(),
        8 => img.rotate270(),
        _ => img,
    }
}

// ─── JPEG ────────────────────────────────────────────────────────────────────

fn jpeg_dims(seg: &[u8]) -> Option<(u64, u64)> {
    // Charge utile d'un SOFn : précision (1), hauteur (2), largeur (2)…
    Some((rd16(seg, 3, false)? as u64, rd16(seg, 1, false)? as u64))
}

fn clean_jpeg(src: &[u8]) -> Result<Vec<u8>, String> {
    let bad = || "JPEG invalide ou tronqué.".to_string();
    let mut out: Vec<u8> = vec![0xFF, 0xD8];
    let mut i = 2usize;
    let mut orientation = 1u8;
    let mut saw_scan = false;
    let mut saw_sof = false;
    let mut finished = false;
    let mut pixels = 0u64;
    while i < src.len() {
        // Marqueur : 0xFF (éventuellement répété) puis un code.
        if src[i] != 0xFF {
            return Err(bad());
        }
        while i < src.len() && src[i] == 0xFF {
            i += 1;
        }
        let code = *src.get(i).ok_or_else(bad)?;
        i += 1;
        match code {
            0xD9 => {
                out.extend_from_slice(&[0xFF, 0xD9]);
                finished = true;
                break; // tout octet après la fin de l'image est supprimé
            }
            0x01 | 0xD0..=0xD7 | 0xD8 => {
                out.extend_from_slice(&[0xFF, code]);
                continue;
            }
            _ => {}
        }
        let len = rd16(src, i, false).ok_or_else(bad)? as usize;
        if len < 2 || i + len > src.len() {
            return Err(bad());
        }
        let payload = &src[i + 2..i + len];
        let seg = &src[i..i + len];
        i += len;
        let keep = match code {
            0xE0 => {
                // JFIF : on garde l'en-tête mais pas la vignette intégrée ; JFXX (extension) retiré.
                if payload.starts_with(b"JFIF\0") && payload.len() >= 14 {
                    out.extend_from_slice(&[0xFF, 0xE0, 0x00, 0x10]);
                    out.extend_from_slice(&payload[..12]);
                    out.extend_from_slice(&[0, 0]);
                }
                false
            }
            0xE1 => {
                if let Some(tiff) = payload.strip_prefix(b"Exif\0\0") {
                    if let Some(o) = exif_orientation(tiff) {
                        orientation = o;
                    }
                }
                false
            }
            0xE2 => payload.starts_with(b"ICC_PROFILE\0"),
            0xEE => payload.starts_with(b"Adobe"),
            0xE3..=0xED | 0xEF | 0xFE => false,
            _ => true, // DQT, DHT, SOFn, SOS, DRI, … : nécessaires au décodage
        };
        if matches!(code, 0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF) {
            saw_sof = true;
            let (w, h) = jpeg_dims(payload).ok_or_else(bad)?;
            pixels = w * h;
            if pixels == 0 || pixels > MAX_PIXELS {
                return Err("Image trop grande ou invalide.".into());
            }
        }
        if keep {
            out.extend_from_slice(&[0xFF, code]);
            out.extend_from_slice(seg);
        }
        if code == 0xDA {
            // Données entropiques jusqu'au prochain vrai marqueur (hors 0x00 bourré et RSTn).
            saw_scan = true;
            let start = i;
            while i < src.len() {
                if src[i] == 0xFF {
                    match src.get(i + 1) {
                        Some(0x00) | Some(0xD0..=0xD7) => i += 2,
                        Some(0xFF) => i += 1,
                        Some(_) => break,
                        None => return Err(bad()),
                    }
                } else {
                    i += 1;
                }
            }
            out.extend_from_slice(&src[start..i]);
        }
    }
    if !finished || !saw_scan || !saw_sof {
        return Err(bad());
    }
    let _ = pixels;
    if orientation == 1 {
        return Ok(out);
    }
    // Orientation ≠ 1 : pixels remis à l'endroit, réencodage sans aucune métadonnée.
    let img = image::load_from_memory_with_format(&out, ImageFormat::Jpeg).map_err(|e| format!("JPEG non pris en charge : {e}"))?;
    let rgb = apply_orientation(img, orientation).to_rgb8();
    let mut enc = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut enc, 95)
        .encode_image(&rgb)
        .map_err(|e| format!("Réencodage JPEG impossible : {e}"))?;
    Ok(enc)
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

/// Blocs conservés : image, palette, transparence, couleur et animation. Tout le reste est retiré.
const PNG_KEEP: &[&[u8; 4]] = &[
    b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP", b"sBIT", b"bKGD", b"hIST", b"pHYs", b"cICP", b"acTL", b"fcTL", b"fdAT",
];

fn clean_png(src: &[u8]) -> Result<Vec<u8>, String> {
    let bad = || "PNG invalide ou tronqué.".to_string();
    let mut out = PNG_SIG.to_vec();
    let mut i = 8usize;
    let mut orientation = 1u8;
    let (mut saw_ihdr, mut saw_idat, mut finished) = (false, false, false);
    while i + 12 <= src.len() {
        let len = rd32(src, i, false).ok_or_else(bad)? as usize;
        let ty: [u8; 4] = src[i + 4..i + 8].try_into().map_err(|_| bad())?;
        let end = i.checked_add(12).and_then(|v| v.checked_add(len)).ok_or_else(bad)?;
        if end > src.len() {
            return Err(bad());
        }
        let data = &src[i + 8..i + 8 + len];
        if !saw_ihdr {
            if &ty != b"IHDR" || len != 13 {
                return Err(bad());
            }
            saw_ihdr = true;
            let (w, h) = (rd32(data, 0, false).ok_or_else(bad)? as u64, rd32(data, 4, false).ok_or_else(bad)? as u64);
            if w == 0 || h == 0 || w * h > MAX_PIXELS {
                return Err("Image trop grande ou invalide.".into());
            }
        }
        if &ty == b"eXIf" {
            if let Some(o) = exif_orientation(data) {
                orientation = o;
            }
        }
        if &ty == b"IDAT" {
            saw_idat = true;
        }
        if PNG_KEEP.iter().any(|k| **k == ty) {
            out.extend_from_slice(&src[i..end]);
        }
        i = end;
        if &ty == b"IEND" {
            finished = true;
            break; // octets après IEND supprimés
        }
    }
    if !saw_ihdr || !saw_idat || !finished {
        return Err(bad());
    }
    if orientation == 1 {
        return Ok(out);
    }
    let img = image::load_from_memory_with_format(&out, ImageFormat::Png).map_err(|e| format!("PNG non pris en charge : {e}"))?;
    let mut enc = Vec::new();
    apply_orientation(img, orientation)
        .write_to(&mut Cursor::new(&mut enc), ImageFormat::Png)
        .map_err(|e| format!("Réencodage PNG impossible : {e}"))?;
    Ok(enc)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn pixel_image(w: u32, h: u32) -> DynamicImage {
        // Dégradé : chaque pixel est unique, pour vérifier la rotation.
        DynamicImage::ImageRgb8(image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x * 40) as u8, (y * 60) as u8, 128])))
    }

    pub fn plain_jpeg(w: u32, h: u32) -> Vec<u8> {
        let mut out = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 90).encode_image(&pixel_image(w, h).to_rgb8()).unwrap();
        out
    }

    pub fn plain_png(w: u32, h: u32) -> Vec<u8> {
        let mut out = Vec::new();
        pixel_image(w, h).write_to(&mut Cursor::new(&mut out), ImageFormat::Png).unwrap();
        out
    }

    /// TIFF little-endian : IFD0 {Make, Orientation, GPSInfo→IFD GPS {lat/lon/ref}}.
    pub fn tiff_with_gps(orientation: u16) -> Vec<u8> {
        let mut t: Vec<u8> = b"II*\0".to_vec();
        t.extend_from_slice(&8u32.to_le_bytes()); // IFD0 en 8
        // IFD0 : 3 entrées
        t.extend_from_slice(&3u16.to_le_bytes());
        // Make (0x010F, ASCII, 12 octets → hors ligne en 8+2+36+4 = 50)
        t.extend_from_slice(&0x010Fu16.to_le_bytes());
        t.extend_from_slice(&2u16.to_le_bytes());
        t.extend_from_slice(&12u32.to_le_bytes());
        t.extend_from_slice(&50u32.to_le_bytes());
        // Orientation (0x0112, SHORT)
        t.extend_from_slice(&0x0112u16.to_le_bytes());
        t.extend_from_slice(&3u16.to_le_bytes());
        t.extend_from_slice(&1u32.to_le_bytes());
        t.extend_from_slice(&orientation.to_le_bytes());
        t.extend_from_slice(&[0, 0]);
        // GPSInfo (0x8825, LONG) → IFD GPS en 62
        t.extend_from_slice(&0x8825u16.to_le_bytes());
        t.extend_from_slice(&4u16.to_le_bytes());
        t.extend_from_slice(&1u32.to_le_bytes());
        t.extend_from_slice(&62u32.to_le_bytes());
        t.extend_from_slice(&0u32.to_le_bytes()); // fin d'IFD0
        assert_eq!(t.len(), 50);
        t.extend_from_slice(b"MARQUEAPPAREIL\0"[..12].as_ref()); // « MARQUEAPPARE » (12 octets)
        // IFD GPS en 62 : 1 entrée (GPSLatitudeRef 'N')
        t.extend_from_slice(&1u16.to_le_bytes());
        t.extend_from_slice(&0x0001u16.to_le_bytes());
        t.extend_from_slice(&2u16.to_le_bytes());
        t.extend_from_slice(&2u32.to_le_bytes());
        t.extend_from_slice(b"N\0\0\0");
        t.extend_from_slice(&0u32.to_le_bytes());
        t
    }

    fn segment(code: u8, payload: &[u8]) -> Vec<u8> {
        let mut s = vec![0xFF, code];
        s.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        s.extend_from_slice(payload);
        s
    }

    /// Insère des métadonnées après SOI : EXIF (GPS + orientation), XMP, commentaire, IPTC, + octets finaux parasites.
    pub fn jpeg_with_metadata(base: &[u8], orientation: u16) -> Vec<u8> {
        let mut exif = b"Exif\0\0".to_vec();
        exif.extend_from_slice(&tiff_with_gps(orientation));
        let mut out = vec![0xFF, 0xD8];
        out.extend(segment(0xE1, &exif));
        out.extend(segment(0xE1, b"http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>MARQUEXMP</x:xmpmeta>"));
        out.extend(segment(0xED, b"Photoshop 3.0\0MARQUEIPTC"));
        out.extend(segment(0xFE, b"MARQUECOMMENTAIRE"));
        out.extend_from_slice(&base[2..]);
        out.extend_from_slice(b"MARQUEFINALE");
        out
    }

    fn contains(hay: &[u8], needle: &[u8]) -> bool {
        hay.windows(needle.len()).any(|w| w == needle)
    }

    #[test]
    fn detects_by_content_not_by_name() {
        assert_eq!(detect(b"%PDF-1.7 ..."), Some(Kind::Pdf));
        assert_eq!(detect(&plain_jpeg(4, 4)), Some(Kind::Jpeg));
        assert_eq!(detect(&plain_png(4, 4)), Some(Kind::Png));
        for bad in [&b"MZ\x90\x00"[..], b"GIF89a", b"<html>", b"", b"%PD", b"PK\x03\x04"] {
            assert_eq!(detect(bad), None);
        }
    }

    #[test]
    fn exif_orientation_parser() {
        assert_eq!(exif_orientation(&tiff_with_gps(6)), Some(6));
        assert_eq!(exif_orientation(&tiff_with_gps(1)), Some(1));
        assert_eq!(exif_orientation(&tiff_with_gps(9)), None);
        assert_eq!(exif_orientation(b"junk"), None);
        assert_eq!(exif_orientation(&[]), None);
        let mut cut = tiff_with_gps(6);
        cut.truncate(15);
        assert_eq!(exif_orientation(&cut), None, "bloc tronqué : pas de panique");
    }

    #[test]
    fn jpeg_with_gps_has_no_metadata_after_import_and_is_not_recompressed() {
        let base = plain_jpeg(16, 8);
        let dirty = jpeg_with_metadata(&base, 1);
        for m in [&b"Exif"[..], b"MARQUEAPPARE", b"MARQUEXMP", b"xmpmeta", b"MARQUEIPTC", b"MARQUECOMMENTAIRE", b"MARQUEFINALE"] {
            assert!(contains(&dirty, m), "le jeu d'essai contient {:?}", String::from_utf8_lossy(m));
        }
        let cleaned = clean(Kind::Jpeg, dirty).unwrap();
        for m in [&b"Exif"[..], b"MARQUEAPPARE", b"MARQUEXMP", b"xmpmeta", b"MARQUEIPTC", b"MARQUECOMMENTAIRE", b"MARQUEFINALE", b"Photoshop"] {
            assert!(!contains(&cleaned, m), "{:?} ne doit plus apparaître", String::from_utf8_lossy(m));
        }
        // Les segments d'origine de l'image sont conservés tels quels : mêmes pixels décodés.
        let a = image::load_from_memory(&base).unwrap().to_rgb8();
        let b = image::load_from_memory(&cleaned).unwrap().to_rgb8();
        assert_eq!(a, b, "orientation 1 : aucune recompression");
        assert_eq!(cleaned, clean(Kind::Jpeg, cleaned.clone()).unwrap(), "idempotent");
    }

    #[test]
    fn jpeg_orientation_is_applied_then_metadata_removed() {
        let base = plain_jpeg(16, 8);
        let dirty = jpeg_with_metadata(&base, 6); // à pivoter de 90° horaire
        let cleaned = clean(Kind::Jpeg, dirty).unwrap();
        for m in [&b"Exif"[..], b"MARQUEAPPARE", b"MARQUEXMP", b"MARQUECOMMENTAIRE"] {
            assert!(!contains(&cleaned, m));
        }
        let img = image::load_from_memory(&cleaned).unwrap();
        assert_eq!((img.width(), img.height()), (8, 16), "dimensions échangées : image remise à l'endroit");
        // Le coin haut-gauche d'origine se retrouve en haut-droite après une rotation de 90° horaire.
        let before = image::load_from_memory(&base).unwrap().to_rgb8();
        let after = img.to_rgb8();
        let (p, q) = (before.get_pixel(0, 0), after.get_pixel(7, 0));
        assert!((p[0] as i32 - q[0] as i32).abs() < 40 && (p[1] as i32 - q[1] as i32).abs() < 40, "{p:?} vs {q:?}");
        // Pas d'orientation résiduelle.
        assert!(!contains(&cleaned, b"Exif"));
    }

    #[test]
    fn every_exif_orientation_gives_expected_dimensions() {
        for (o, swapped) in [(1u16, false), (2, false), (3, false), (4, false), (5, true), (6, true), (7, true), (8, true)] {
            let c = clean(Kind::Jpeg, jpeg_with_metadata(&plain_jpeg(16, 8), o)).unwrap();
            let img = image::load_from_memory(&c).unwrap();
            assert_eq!((img.width(), img.height()), if swapped { (8, 16) } else { (16, 8) }, "orientation {o}");
        }
    }

    #[test]
    fn jpeg_thumbnail_in_jfif_and_trailing_data_are_removed() {
        let base = plain_jpeg(8, 8);
        // JFIF + vignette 2×2 (12 octets d'entête + 2 + 12 octets RGB) puis JFXX.
        let mut jfif = b"JFIF\0\x01\x01\x00\x00\x01\x00\x01".to_vec();
        jfif.extend_from_slice(&[2, 2]);
        jfif.extend_from_slice(b"MARQUEVIGNETTE");
        let mut dirty = vec![0xFF, 0xD8];
        dirty.extend(segment(0xE0, &jfif));
        dirty.extend(segment(0xE0, b"JFXX\0\x10MARQUEJFXX"));
        let rest = if base[2] == 0xFF && base[3] == 0xE0 { let l = u16::from_be_bytes([base[4], base[5]]) as usize; &base[4 + l..] } else { &base[2..] };
        dirty.extend_from_slice(rest);
        let c = clean(Kind::Jpeg, dirty).unwrap();
        assert!(!contains(&c, b"MARQUEVIGNETTE") && !contains(&c, b"MARQUEJFXX"));
        assert!(image::load_from_memory(&c).is_ok());
    }

    #[test]
    fn broken_or_hostile_jpeg_is_refused_without_panic() {
        let good = plain_jpeg(8, 8);
        assert!(clean(Kind::Jpeg, good[..good.len() / 2].to_vec()).is_err(), "tronqué");
        assert!(clean(Kind::Jpeg, vec![0xFF, 0xD8, 0xFF]).is_err());
        assert!(clean(Kind::Jpeg, vec![0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF]).is_err(), "longueur démesurée");
        assert!(clean(Kind::Jpeg, vec![0xFF, 0xD8, 0x12, 0x34]).is_err());
        // Dimensions démesurées dans le SOF.
        let mut huge = good.clone();
        if let Some(p) = huge.windows(2).position(|w| w == [0xFF, 0xC0]) {
            huge[p + 5..p + 7].copy_from_slice(&0xFFFFu16.to_be_bytes());
            huge[p + 7..p + 9].copy_from_slice(&0xFFFFu16.to_be_bytes());
            assert!(clean(Kind::Jpeg, huge).is_err());
        }
    }

    fn png_with_chunks(base: &[u8], extra: &[(&[u8; 4], Vec<u8>)], orientation: Option<u16>) -> Vec<u8> {
        // Insère des blocs avant IDAT ; le CRC n'est pas vérifié par notre filtre (conservé tel quel pour les blocs gardés).
        let first_idat = base.windows(4).position(|w| w == b"IDAT").unwrap() - 4;
        let mut out = base[..first_idat].to_vec();
        for (ty, data) in extra {
            out.extend_from_slice(&(data.len() as u32).to_be_bytes());
            out.extend_from_slice(*ty);
            out.extend_from_slice(data);
            out.extend_from_slice(&[0, 0, 0, 0]);
        }
        if let Some(o) = orientation {
            let mut t: Vec<u8> = b"MM\0*".to_vec();
            t.extend_from_slice(&8u32.to_be_bytes());
            t.extend_from_slice(&1u16.to_be_bytes());
            t.extend_from_slice(&0x0112u16.to_be_bytes());
            t.extend_from_slice(&3u16.to_be_bytes());
            t.extend_from_slice(&1u32.to_be_bytes());
            t.extend_from_slice(&o.to_be_bytes());
            t.extend_from_slice(&[0, 0]);
            t.extend_from_slice(&0u32.to_be_bytes());
            out.extend_from_slice(&(t.len() as u32).to_be_bytes());
            out.extend_from_slice(b"eXIf");
            out.extend_from_slice(&t);
            out.extend_from_slice(&[0, 0, 0, 0]);
        }
        out.extend_from_slice(&base[first_idat..]);
        out.extend_from_slice(b"MARQUEFINALE");
        out
    }

    #[test]
    fn png_text_chunks_are_removed_image_data_kept() {
        let base = plain_png(8, 8);
        let dirty = png_with_chunks(
            &base,
            &[(b"tEXt", b"Author\0MARQUEAUTEUR".to_vec()), (b"iTXt", b"XML:com.adobe.xmp\0MARQUEXMP".to_vec()), (b"zTXt", b"Comment\0\0MARQUEZ".to_vec()), (b"tIME", vec![7, 234, 10, 7, 12, 0, 0]), (b"zzZz", b"MARQUEINCONNU".to_vec())],
            None,
        );
        let cleaned = clean(Kind::Png, dirty).unwrap();
        for m in [&b"MARQUEAUTEUR"[..], b"MARQUEXMP", b"MARQUEZ", b"MARQUEINCONNU", b"MARQUEFINALE", b"tEXt", b"iTXt", b"zTXt", b"tIME"] {
            assert!(!contains(&cleaned, m), "{:?}", String::from_utf8_lossy(m));
        }
        assert_eq!(image::load_from_memory(&base).unwrap().to_rgb8(), image::load_from_memory(&cleaned).unwrap().to_rgb8());
    }

    #[test]
    fn png_exif_orientation_is_applied() {
        let base = plain_png(16, 8);
        let cleaned = clean(Kind::Png, png_with_chunks(&base, &[(b"tEXt", b"GPS\0MARQUEGPS".to_vec())], Some(6))).unwrap();
        assert!(!contains(&cleaned, b"MARQUEGPS") && !contains(&cleaned, b"eXIf"));
        let img = image::load_from_memory(&cleaned).unwrap();
        assert_eq!((img.width(), img.height()), (8, 16));
    }

    #[test]
    fn broken_png_is_refused() {
        let good = plain_png(8, 8);
        assert!(clean(Kind::Png, good[..good.len() - 20].to_vec()).is_err());
        assert!(clean(Kind::Png, PNG_SIG.to_vec()).is_err());
        let mut no_ihdr = PNG_SIG.to_vec();
        no_ihdr.extend_from_slice(&[0, 0, 0, 0]);
        no_ihdr.extend_from_slice(b"IEND");
        no_ihdr.extend_from_slice(&[0xAE, 0x42, 0x60, 0x82]);
        assert!(clean(Kind::Png, no_ihdr).is_err());
    }

    #[test]
    fn pdf_is_never_modified() {
        let pdf = b"%PDF-1.4\n1 0 obj<</Producer(MARQUE)>>endobj\n%%EOF".to_vec();
        assert_eq!(clean(Kind::Pdf, pdf.clone()).unwrap(), pdf);
    }
}
