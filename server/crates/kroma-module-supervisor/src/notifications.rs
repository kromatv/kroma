//! The notification types installed modules declare, and the catalogs their
//! keys are rendered from.

use std::path::Path;
use std::sync::Arc;

use kroma_module_host::ModuleNotifications;

use super::{Supervisor, LOCALES_DIR};

const MAX_CATALOG_BYTES: u64 = 256 * 1024;

impl Supervisor {
    /// Every installed module that declares notification types, with the
    /// catalogs its bundle ships. Cached with the manifests and dropped with
    /// them, so the core can ask once per render.
    pub fn notification_types(&self) -> Arc<Vec<ModuleNotifications>> {
        if let Some(cached) = self.notifications_cache.read().unwrap().clone() {
            return cached;
        }
        let declared: Arc<Vec<ModuleNotifications>> = Arc::new(
            self.installed_manifests()
                .into_iter()
                .filter(|m| !m.notifications.is_empty())
                .map(|m| ModuleNotifications {
                    catalogs: catalogs_in(&self.dir(&m.id).join(LOCALES_DIR)),
                    module_id: m.id,
                    types: m.notifications,
                })
                .collect(),
        );
        *self.notifications_cache.write().unwrap() = Some(declared.clone());
        declared
    }

    /// Whether `module`'s manifest declares the notification type `name`.
    pub fn declares_notification(&self, module: &str, name: &str) -> bool {
        self.installed_manifests()
            .iter()
            .filter(|m| m.id == module)
            .flat_map(|m| &m.notifications)
            .any(|declared| declared.name == name)
    }
}

fn catalogs_in(dir: &Path) -> Vec<(String, String)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut catalogs: Vec<(String, String)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| catalog(&entry.path()))
        .collect();
    catalogs.sort();
    catalogs
}

fn catalog(path: &Path) -> Option<(String, String)> {
    if path.extension()? != "json" {
        return None;
    }
    let code = path.file_stem()?.to_str()?.to_string();
    if std::fs::metadata(path).ok()?.len() > MAX_CATALOG_BYTES {
        tracing::warn!(path = %path.display(), "a module catalog past {MAX_CATALOG_BYTES} bytes is not read");
        return None;
    }
    Some((code, std::fs::read_to_string(path).ok()?))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::super::{Supervisor, SupervisorConfig};

    fn supervisor(dir: &std::path::Path) -> Arc<Supervisor> {
        Supervisor::new(SupervisorConfig {
            modules_dir: dir.to_path_buf(),
            core_url: "http://127.0.0.1:0".into(),
            host_token: "fabric".into(),
            db_path: dir.join("db.sqlite"),
            data_dir: dir.to_path_buf(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: None,
        })
    }

    fn install(dir: &std::path::Path, id: &str, notifications: &str, catalogs: &[(&str, &str)]) {
        let module = dir.join(id);
        std::fs::create_dir_all(module.join("locales")).unwrap();
        std::fs::write(
            module.join("module.json"),
            format!(
                r#"{{ "schemaVersion": {}, "id": "{id}", "name": "M", "version": "1.0.0",
                      "notifications": {notifications} }}"#,
                kroma_module_manifest::MODULE_SCHEMA_VERSION
            ),
        )
        .unwrap();
        for (code, json) in catalogs {
            std::fs::write(module.join("locales").join(format!("{code}.json")), json).unwrap();
        }
    }

    const COMPLETED: &str = r#"[{ "type": "com.example.dl/done", "category": "downloads",
        "titleKey": "done.title", "bodyKey": "done.body" }]"#;

    #[test]
    fn a_module_declaring_types_hands_over_its_types_and_every_catalog_it_ships() {
        let dir = kroma_testing::temp_dir("notification-types");
        install(
            dir.path(),
            "com.example.dl",
            COMPLETED,
            &[
                ("fr", r#"{ "done.title": "Fini" }"#),
                ("en", r#"{ "done.title": "Done" }"#),
            ],
        );
        install(dir.path(), "com.example.quiet", "[]", &[]);
        let sup = supervisor(dir.path());

        let declared = sup.notification_types();

        assert_eq!(declared.len(), 1);
        assert_eq!(declared[0].module_id, "com.example.dl");
        assert_eq!(declared[0].types[0].name, "com.example.dl/done");
        let codes: Vec<&str> = declared[0]
            .catalogs
            .iter()
            .map(|(code, _)| code.as_str())
            .collect();
        assert_eq!(codes, ["en", "fr"]);
    }

    #[test]
    fn the_declared_types_are_read_again_once_the_manifests_are_dropped() {
        let dir = kroma_testing::temp_dir("notification-types-cache");
        let sup = supervisor(dir.path());
        assert!(sup.notification_types().is_empty());

        install(dir.path(), "com.example.dl", COMPLETED, &[]);
        assert!(sup.notification_types().is_empty(), "still cached");
        sup.invalidate_manifests();

        assert_eq!(sup.notification_types().len(), 1);
    }

    #[test]
    fn a_module_declares_only_the_types_its_own_manifest_lists() {
        let dir = kroma_testing::temp_dir("notification-declares");
        install(dir.path(), "com.example.dl", COMPLETED, &[]);
        install(dir.path(), "com.example.other", "[]", &[]);
        let sup = supervisor(dir.path());

        assert!(sup.declares_notification("com.example.dl", "com.example.dl/done"));
        assert!(!sup.declares_notification("com.example.dl", "com.example.dl/other"));
        assert!(!sup.declares_notification("com.example.other", "com.example.dl/done"));
    }
}
