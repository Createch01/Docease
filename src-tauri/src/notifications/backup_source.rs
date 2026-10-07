//! Source : sauvegarde. Seule source « critique » avec les alertes de sécurité.

use super::Item;
use crate::backup::Status;

fn item(id: &str, severity: &str, title: String, lines: Vec<String>, action: &str, fingerprint: String, dismissible: bool) -> Item {
    Item {
        id: id.into(),
        kind: "backup".into(),
        severity: severity.into(),
        patient_id: None,
        patient_name: None,
        title,
        lines,
        count: 1,
        action: action.into(),
        fingerprint,
        dismissible,
    }
}

pub fn items(s: &Status) -> Vec<Item> {
    let mut out = Vec::new();
    match s.level {
        "alert" => {
            let reason = s.reason.clone().unwrap_or_else(|| "Sauvegarde en retard.".into());
            // Emplacement inaccessible ou non configurée : réglages ; sinon on relance la sauvegarde.
            let action = if !s.configured || s.destinations.iter().any(|d| !d.accessible) { "open_backup_settings" } else { "backup_now" };
            out.push(item("backup:late", "critical", reason.clone(), s.last_error.iter().cloned().collect(), action, format!("alert:{reason}"), false));
        }
        "warning" => out.push(item("backup:late", "todo", "Dernière sauvegarde de plus de 24 h".into(), vec![], "backup_now", "warning".into(), true)),
        _ => {}
    }
    // Pièce jointe locale altérée : exclue de la sauvegarde, alerte rouge jusqu'à résolution.
    // Identifiant de la pièce et patient seulement, jamais de contenu.
    for a in &s.altered_attachments {
        let who = a.patient_name.clone().unwrap_or_else(|| "patient inconnu".into());
        out.push(item(
            &format!("backup:altered:{}", a.id),
            "critical",
            format!("Pièce jointe altérée, non sauvegardée — {who}"),
            vec![format!("Pièce {}", a.id), "Supprimez-la ou restaurez-la ; le reste de la sauvegarde a été effectué.".into()],
            "open_backup_settings",
            format!("altered:{}", a.id),
            false,
        ));
    }
    if let Some(r) = s.redundancy {
        let title = if r == "same_disk" { "Les deux sauvegardes sont sur le même disque" } else { "Aucun second emplacement de sauvegarde" };
        out.push(item("backup:redundancy", "todo", title.into(), vec![], "open_backup_settings", r.into(), true));
    }
    out
}
