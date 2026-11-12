use kroma_domain::{NotificationCategory, NotificationType};
use kroma_module_host::ModuleNotifications;

use super::NotificationTypes;

pub(crate) const MODULE: &str = "tv.kroma.torrents";
pub(crate) const COMPLETED: &str = "tv.kroma.torrents/download.completed";

const EN: &str = r#"{
  "notifications.completed.title": "Download finished",
  "notifications.completed.body": "{title} finished downloading.",
  "notifications.completed.label": "Finished downloads",
  "notifications.completed.size": "{size} on disk"
}"#;

const FR: &str = r#"{
  "notifications.completed.title": "Téléchargement terminé",
  "notifications.completed.body": "{title} a fini de télécharger."
}"#;

pub(crate) fn completed() -> NotificationType {
    NotificationType {
        name: COMPLETED.into(),
        category: NotificationCategory::Downloads,
        push: false,
        title_key: "notifications.completed.title".into(),
        body_key: "notifications.completed.body".into(),
        label_key: Some("notifications.completed.label".into()),
    }
}

pub(crate) fn torrents() -> ModuleNotifications {
    ModuleNotifications {
        module_id: MODULE.into(),
        types: vec![completed()],
        catalogs: vec![("en".into(), EN.into()), ("fr".into(), FR.into())],
    }
}

pub(crate) fn declaring_torrents() -> NotificationTypes {
    NotificationTypes::from_modules(&[torrents()])
}
