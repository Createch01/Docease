//! Motifs d'annulation, de correction et de remboursement : liste fermée, validée côté Rust.
//!
//! Format stocké : `Libellé` ou `Libellé — précision`. « Autre » exige une précision d'au moins
//! 10 caractères. Les motifs déjà enregistrés (texte libre d'avant) ne sont ni relus ni modifiés :
//! seule la saisie d'un NOUVEAU motif passe par `validate`, dans les commandes.

pub const LABELS: [&str; 6] = [
    "Doublon",
    "Erreur de montant",
    "Erreur de patient",
    "Erreur de mode de paiement",
    "Demande du patient",
    "Autre",
];
pub const OTHER: &str = "Autre";
pub const OTHER_MIN_CHARS: usize = 10;
pub const MAX_CHARS: usize = 200;
const SEP: &str = " — ";

/// Texte normalisé (espaces, caractères de contrôle) ou refus avec un message affichable.
pub fn validate(raw: &str) -> Result<String, String> {
    let text: String = raw.chars().filter(|c| !c.is_control()).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    let (head, detail) = match text.split_once(SEP) {
        Some((h, d)) => (h.trim(), d.trim()),
        None => (text.trim(), ""),
    };
    if !LABELS.contains(&head) {
        return Err("Motif non reconnu : choisissez un motif dans la liste.".into());
    }
    if head == OTHER && detail.chars().count() < OTHER_MIN_CHARS {
        return Err(format!("Motif « Autre » : précisez-le (au moins {OTHER_MIN_CHARS} caractères)."));
    }
    let out = if detail.is_empty() { head.to_string() } else { format!("{head}{SEP}{detail}") };
    if out.chars().count() > MAX_CHARS {
        return Err(format!("Motif trop long ({MAX_CHARS} caractères au plus)."));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_listed_reason_is_accepted_except_other_without_detail() {
        for l in LABELS.iter().filter(|l| **l != OTHER) {
            assert_eq!(validate(l).unwrap(), *l);
            assert_eq!(validate(&format!("{l} — précision")).unwrap(), format!("{l} — précision"));
        }
        assert!(validate("Autre").is_err());
        assert!(validate("Autre — court").is_err(), "moins de 10 caractères");
        assert!(validate("Autre — 123456789").is_err(), "9 caractères");
        assert_eq!(validate("Autre — 1234567890").unwrap(), "Autre — 1234567890");
        assert!(validate("Autre —           ").is_err(), "des espaces ne comptent pas");
    }

    #[test]
    fn free_text_and_unknown_labels_are_refused() {
        for bad in ["", "   ", "erreur de saisie", "doublon", "Doublonn", "Autre chose — 1234567890", "x — Doublon"] {
            assert!(validate(bad).is_err(), "{bad:?}");
        }
        assert!(validate(&format!("Doublon — {}", "x".repeat(MAX_CHARS))).is_err(), "trop long");
    }

    #[test]
    fn whitespace_is_normalised() {
        assert_eq!(validate("  Erreur   de montant \n —  trois  mots ").unwrap(), "Erreur de montant — trois mots");
    }
}
