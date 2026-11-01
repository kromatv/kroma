//! What a finished download tells the people who run the library.

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{Audience, NotificationSpec, NotificationSubject};

use crate::db::DownloadRow;

pub(super) const COMPLETED: &str = "tv.kroma.torrents/download.completed";

const SUBJECT: &str = "tv.kroma.torrents/download";

pub(super) fn audience() -> Audience {
    Audience::permission(Permission::LibraryManage)
}

pub(super) fn completed(row: &DownloadRow) -> NotificationSpec {
    NotificationSpec::declared(COMPLETED)
        .param("title", &row.release_title)
        .subject(NotificationSubject::new(SUBJECT, &row.id))
        .dedupe_key(format!("{COMPLETED}:{}", row.id))
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::Module;

    use super::*;
    use crate::db::test_support::download;

    const EN: &str = include_str!("../../../../locales/en.json");
    const FR: &str = include_str!("../../../../locales/fr.json");

    #[test]
    fn a_finished_download_names_its_release_once_and_what_it_is_about() {
        let mut row = download("d1", "completed", 0);
        row.release_title = "Dune.2021.2160p".into();

        let json = serde_json::to_value(completed(&row)).unwrap();

        assert_eq!(json["type"], COMPLETED);
        assert_eq!(json["params"]["title"]["value"], "Dune.2021.2160p");
        assert_eq!(
            json["subject"],
            serde_json::json!({ "kind": SUBJECT, "id": "d1" })
        );
        assert_eq!(json["dedupeKey"], "tv.kroma.torrents/download.completed:d1");
        assert!(json.get("titleKey").is_none_or(|key| key == ""));
    }

    #[test]
    fn the_type_it_sends_is_declared_with_wording_in_every_catalog() {
        let manifest = crate::MODULE.manifest();
        let declared = manifest
            .notifications
            .iter()
            .find(|t| t.name == COMPLETED)
            .expect("module.json declares it");

        for catalog in [EN, FR] {
            let entries: serde_json::Value = serde_json::from_str(catalog).unwrap();
            for key in [&declared.title_key, &declared.body_key, declared.label()] {
                assert!(entries.get(key).is_some(), "{key} is missing");
            }
        }
        assert_eq!(manifest.notifications_problem(), None);
    }
}
