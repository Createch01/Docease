//! Petits utilitaires de date (UTC), sans dépendance supplémentaire.

use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Algorithme « civil from days » (H. Hinnant) : jours depuis 1970-01-01 → (année, mois, jour).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn date_utc(secs: u64) -> String {
    let (y, m, d) = civil_from_days((secs / 86_400) as i64);
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn iso_utc(secs: u64) -> String {
    let rem = secs % 86_400;
    format!("{}T{:02}:{:02}:{:02}Z", date_utc(secs), rem / 3_600, (rem % 3_600) / 60, rem % 60)
}

/// `20261001-123456`, utilisable dans un nom de dossier.
pub fn stamp_utc(secs: u64) -> String {
    let rem = secs % 86_400;
    format!("{}-{:02}{:02}{:02}", date_utc(secs).replace('-', ""), rem / 3_600, (rem % 3_600) / 60, rem % 60)
}

pub fn now_iso() -> String {
    iso_utc(now_secs())
}

pub fn today_utc() -> String {
    date_utc(now_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_known_instants() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_utc(951_782_400), "2000-02-29T00:00:00Z"); // année bissextile
        assert_eq!(iso_utc(1_790_000_000 - 1_790_000_000 % 86_400 + 3_661), "2026-09-21T01:01:01Z");
        assert_eq!(stamp_utc(1_000_000_000), "20010909-014640");
    }
}
