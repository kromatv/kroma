use std::collections::HashSet;

use crate::ModuleManifest;

impl ModuleManifest {
    /// The first unusable notification type this manifest declares, worded for
    /// its author, or `None`. A type must sit in the module's own namespace,
    /// which is what keeps two authors' types apart in a reader's settings.
    pub fn notifications_problem(&self) -> Option<String> {
        let mut seen = HashSet::new();
        for declared in &self.notifications {
            let name = declared.name.as_str();
            let local = name
                .strip_prefix(self.id.as_str())
                .and_then(|rest| rest.strip_prefix('/'));
            let Some(local) = local else {
                return Some(format!(
                    "notifications: \"{name}\" is not in this module's namespace (write {}/<name>)",
                    self.id
                ));
            };
            if !is_local_name(local) {
                return Some(format!(
                    "notifications: \"{name}\" needs a name after the slash (a-z, 0-9, ., -, _)"
                ));
            }
            if !seen.insert(name) {
                return Some(format!("notifications: \"{name}\" is declared twice"));
            }
            let keys = [
                Some(declared.title_key.as_str()),
                Some(declared.body_key.as_str()),
                declared.label_key.as_deref(),
            ];
            if keys.into_iter().flatten().any(str::is_empty) {
                return Some(format!("notifications: \"{name}\" names an empty key"));
            }
        }
        None
    }
}

fn is_local_name(local: &str) -> bool {
    local.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
        && local
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '-' | '_'))
}

#[cfg(test)]
mod tests {
    use crate::ModuleManifest;

    fn declaring(notifications: serde_json::Value) -> ModuleManifest {
        serde_json::from_value(serde_json::json!({
            "id": "tv.kroma.torrents", "name": "Torrents", "version": "1.0.0",
            "notifications": notifications,
        }))
        .unwrap()
    }

    fn completed(name: &str) -> serde_json::Value {
        serde_json::json!({
            "type": name, "category": "downloads",
            "titleKey": "notifications.completed.title",
            "bodyKey": "notifications.completed.body",
        })
    }

    #[test]
    fn a_manifest_declaring_nothing_has_no_problem_and_serializes_no_section() {
        let plain = ModuleManifest::new("a", "A", "1.0.0");

        assert_eq!(plain.notifications_problem(), None);
        assert!(serde_json::to_value(&plain)
            .unwrap()
            .get("notifications")
            .is_none());
    }

    #[test]
    fn a_type_in_the_modules_own_namespace_is_accepted() {
        let manifest = declaring(serde_json::json!([completed(
            "tv.kroma.torrents/download.completed"
        )]));

        assert_eq!(manifest.notifications_problem(), None);
        assert_eq!(manifest.notifications.len(), 1);
    }

    #[test]
    fn a_type_in_another_modules_namespace_is_refused() {
        let manifest = declaring(serde_json::json!([completed(
            "tv.kroma.acquisition/import.done"
        )]));

        let problem = manifest.notifications_problem().unwrap();

        assert!(problem.contains("tv.kroma.torrents/<name>"), "{problem}");
    }

    #[test]
    fn a_namespace_that_only_starts_like_the_modules_id_is_refused() {
        let manifest = declaring(serde_json::json!([completed(
            "tv.kroma.torrentsx/download.completed"
        )]));

        assert!(manifest.notifications_problem().is_some());
    }

    #[test]
    fn a_type_with_nothing_after_the_slash_is_refused() {
        let manifest = declaring(serde_json::json!([completed("tv.kroma.torrents/")]));

        let problem = manifest.notifications_problem().unwrap();

        assert!(problem.contains("needs a name"), "{problem}");
    }

    #[test]
    fn a_type_declared_twice_is_refused() {
        let manifest = declaring(serde_json::json!([
            completed("tv.kroma.torrents/download.completed"),
            completed("tv.kroma.torrents/download.completed"),
        ]));

        let problem = manifest.notifications_problem().unwrap();

        assert!(problem.contains("declared twice"), "{problem}");
    }

    #[test]
    fn a_type_naming_an_empty_key_is_refused() {
        let manifest = declaring(serde_json::json!([{
            "type": "tv.kroma.torrents/download.completed", "category": "downloads",
            "titleKey": "", "bodyKey": "notifications.completed.body",
        }]));

        let problem = manifest.notifications_problem().unwrap();

        assert!(problem.contains("empty key"), "{problem}");
    }

    #[test]
    fn a_category_the_server_does_not_know_does_not_parse() {
        let parsed = serde_json::from_value::<ModuleManifest>(serde_json::json!({
            "id": "tv.kroma.torrents", "name": "Torrents", "version": "1.0.0",
            "notifications": [{
                "type": "tv.kroma.torrents/download.completed", "category": "weather",
                "titleKey": "t", "bodyKey": "b",
            }],
        }));

        assert!(parsed.unwrap_err().to_string().contains("weather"));
    }
}
