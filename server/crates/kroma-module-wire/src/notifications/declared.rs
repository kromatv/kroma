//! A kind of notification a module declares in its `module.json`.

use serde::{Deserialize, Serialize};

use super::event::NotificationCategory;

/// One kind of notification a module sends, as its `module.json` declares it.
///
/// `name` is namespaced to the module (`tv.kroma.torrents/download.completed`)
/// and the keys name entries in the module's own `locales/<code>.json`, which
/// the server renders in each reader's language. `push` is what a reader's
/// devices get while that reader has not chosen for the type, and defaults to
/// true. The label is what a reader's settings call the type, and falls back to
/// the title, which suits a title with no `{param}` in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationType {
    #[serde(rename = "type")]
    pub name: String,
    pub category: NotificationCategory,
    #[serde(default = "pushes")]
    pub push: bool,
    pub title_key: String,
    pub body_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
}

fn pushes() -> bool {
    true
}

impl NotificationType {
    /// The module the type belongs to, read off its namespace.
    pub fn module(&self) -> Option<&str> {
        self.name.split_once('/').map(|(module, _)| module)
    }

    /// The key a reader's settings name the type by.
    pub fn label(&self) -> &str {
        self.label_key.as_deref().unwrap_or(&self.title_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_declaration_that_says_nothing_about_push_pushes_and_is_labelled_by_its_title() {
        let declared: NotificationType = serde_json::from_str(
            r#"{ "type": "tv.kroma.torrents/download.completed", "category": "downloads",
                 "titleKey": "notifications.completed.title",
                 "bodyKey": "notifications.completed.body" }"#,
        )
        .unwrap();

        assert!(declared.push);
        assert_eq!(declared.label(), "notifications.completed.title");
        assert_eq!(declared.module(), Some("tv.kroma.torrents"));
        assert_eq!(declared.category, NotificationCategory::Downloads);
    }

    #[test]
    fn a_label_key_and_a_quiet_push_round_trip() {
        let declared: NotificationType = serde_json::from_str(
            r#"{ "type": "tv.kroma.torrents/download.completed", "category": "downloads",
                 "push": false, "labelKey": "notifications.completed.label",
                 "titleKey": "notifications.completed.title",
                 "bodyKey": "notifications.completed.body" }"#,
        )
        .unwrap();

        let back: NotificationType =
            serde_json::from_value(serde_json::to_value(&declared).unwrap()).unwrap();

        assert!(!back.push);
        assert_eq!(back.label(), "notifications.completed.label");
        assert_eq!(back, declared);
    }

    #[test]
    fn a_name_without_a_namespace_names_no_module() {
        let declared = NotificationType {
            name: "download.completed".into(),
            category: NotificationCategory::Downloads,
            push: true,
            title_key: "t".into(),
            body_key: "b".into(),
            label_key: None,
        };

        assert_eq!(declared.module(), None);
    }
}
