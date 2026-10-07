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

/// Inverse de `civil_from_days` : (année, mois, jour) → jours depuis 1970-01-01.
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m as i64 + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
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

/// Décalage du fuseau du poste par rapport à UTC, en secondes (Africa/Casablanca : +3600, ou 0
/// pendant le Ramadan ; lu dans le système, jamais codé en dur).
pub fn local_offset_secs() -> i64 {
    chrono::Local::now().offset().local_minus_utc() as i64
}

/// Date (AAAA-MM-JJ) à l'instant UTC `secs` pour un fuseau de décalage `offset_secs`.
pub fn date_local_at(secs: u64, offset_secs: i64) -> String {
    date_utc((secs as i64 + offset_secs).max(0) as u64)
}

/// Aujourd'hui, en heure LOCALE du poste : c'est la date que voit le cabinet (agenda, panneau « À faire »).
pub fn today_local() -> String {
    date_local_at(now_secs(), local_offset_secs())
}

/// Lendemain d'une date AAAA-MM-JJ (arithmétique de calendrier, sans heure d'été).
pub fn next_day(day: &str) -> Option<String> {
    let mut it = day.split('-');
    let (y, m, d) = (it.next()?.parse::<i64>().ok()?, it.next()?.parse::<u32>().ok()?, it.next()?.parse::<u32>().ok()?);
    let secs = days_from_civil(y, m, d) * 86_400 + 86_400;
    u64::try_from(secs).ok().map(date_utc)
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
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2000, 2, 29), 11_016);
        assert_eq!(days_from_civil(2026, 10, 4), 20_730);
    }

    /// 2026-10-06T23:30:00Z.
    fn t(h: u64, m: u64) -> u64 {
        days_from_civil(2026, 10, 6) as u64 * 86_400 + h * 3_600 + m * 60
    }

    #[test]
    fn local_date_changes_at_local_midnight_not_utc_midnight() {
        // Casablanca (+01:00) : 23:30 UTC = 00:30 le lendemain, heure locale.
        assert_eq!(date_local_at(t(23, 30), 3_600), "2026-10-07");
        assert_eq!(date_local_at(t(23, 30), 0), "2026-10-06", "Ramadan (+00:00) : même jour qu'en UTC");
        assert_eq!(date_local_at(t(22, 59), 3_600), "2026-10-06");
        assert_eq!(date_local_at(t(23, 0), 3_600), "2026-10-07");
        // Fuseau à l'ouest : le jour local peut précéder le jour UTC.
        assert_eq!(date_local_at(t(0, 30), -3_600), "2026-10-05");
        // Passage de mois / d'année.
        assert_eq!(date_local_at(days_from_civil(2026, 12, 31) as u64 * 86_400 + 23 * 3_600 + 1_800, 3_600), "2027-01-01");
        assert_eq!(next_day("2026-12-31").as_deref(), Some("2027-01-01"));
    }

    #[test]
    fn today_local_matches_the_system_clock() {
        let off = local_offset_secs();
        assert!(off.abs() <= 14 * 3_600);
        assert_eq!(today_local(), date_local_at(now_secs(), off));
    }

}
