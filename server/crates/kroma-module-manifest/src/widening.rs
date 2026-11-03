//! Whether a version asks for more than the installed one was granted.

use crate::{CoreScope, ModuleManifest, Permissions, SettingsScope, Storage};

/// What a version declares it may do and reach, read off a catalog row or a
/// bundle's manifest. A part left `None` is one the declaration does not state.
#[derive(Debug, Clone, Copy, Default)]
pub struct Declared<'a> {
    pub permissions: Option<&'a Permissions>,
    pub storage: Option<&'a Storage>,
    pub settings: Option<&'a SettingsScope>,
}

impl<'a> Declared<'a> {
    pub fn of(manifest: &'a ModuleManifest) -> Self {
        Self {
            permissions: manifest.permissions.as_ref(),
            storage: manifest.storage.as_ref(),
            settings: manifest.settings.as_ref(),
        }
    }

    /// Whether this asks for anything `installed` was not granted: a permission,
    /// a table or column of the core database, or a core setting to write. A
    /// part this declaration does not state widens nothing. An installed module
    /// with no `storage` reached none of the core database and one with no
    /// `settings` writes none, while one with no `permissions` predates the
    /// field and is not compared.
    pub fn widens(&self, installed: &ModuleManifest) -> bool {
        let permissions = matches!(
            (self.permissions, installed.permissions.as_ref()),
            (Some(offered), Some(granted)) if offered.widens(granted)
        );
        let no_core = CoreScope::default();
        let granted_core = installed.storage.as_ref().map_or(&no_core, |s| &s.core);
        let core = self
            .storage
            .is_some_and(|offered| core_widens(&offered.core, granted_core));
        let settings = self
            .settings
            .is_some_and(|offered| offered.writes_beyond(installed.settings.as_ref()));
        permissions || core || settings
    }
}

fn core_widens(offered: &CoreScope, granted: &CoreScope) -> bool {
    let covered = |grants: &[String], entry: &str| {
        grants.iter().any(|grant| grant == entry)
            || entry
                .split_once('.')
                .is_some_and(|(table, _)| grants.iter().any(|grant| grant == table))
    };
    offered
        .read
        .iter()
        .any(|entry| !covered(&granted.read, entry))
        || offered
            .write
            .iter()
            .any(|entry| !covered(&granted.write, entry))
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;

    fn manifest(extra: Value) -> ModuleManifest {
        let mut base = json!({ "id": "tv.kroma.x", "name": "X", "version": "1.0.0" });
        base.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        serde_json::from_value(base).unwrap()
    }

    fn acquisition() -> ModuleManifest {
        manifest(json!({
            "permissions": { "fs": { "read": ["media"] } },
            "storage": { "core": { "read": ["requests", "users.username"], "write": ["requests"] } },
            "settings": { "read": ["namingCase"] }
        }))
    }

    #[test]
    fn the_same_declaration_widens_nothing() {
        let installed = acquisition();

        assert!(!Declared::of(&installed).widens(&installed));
    }

    #[test]
    fn reading_a_new_account_column_widens_the_declaration() {
        let offered = manifest(json!({
            "storage": { "core": { "read": ["requests", "users.username", "users.email"] } }
        }));

        assert!(Declared::of(&offered).widens(&acquisition()));
    }

    #[test]
    fn a_column_of_a_table_already_read_whole_is_covered() {
        let installed = manifest(json!({ "storage": { "core": { "read": ["users"] } } }));
        let offered = manifest(json!({ "storage": { "core": { "read": ["users.email"] } } }));

        assert!(!Declared::of(&offered).widens(&installed));
    }

    #[test]
    fn a_new_table_write_widens_the_declaration() {
        let offered = manifest(json!({
            "storage": { "core": { "read": ["requests"], "write": ["requests", "downloads"] } }
        }));

        assert!(Declared::of(&offered).widens(&acquisition()));
    }

    #[test]
    fn reaching_the_core_database_widens_a_module_that_had_no_storage() {
        let installed = manifest(json!({}));
        let offered = manifest(json!({ "storage": { "core": { "read": ["users.email"] } } }));

        assert!(Declared::of(&offered).widens(&installed));
        assert!(!Declared::of(&manifest(json!({ "storage": {} }))).widens(&installed));
    }

    #[test]
    fn a_new_setting_widens_a_module_that_declared_its_settings() {
        let offered =
            manifest(json!({ "settings": { "read": ["namingCase"], "write": ["namingCase"] } }));

        assert!(Declared::of(&offered).widens(&acquisition()));
    }

    #[test]
    fn reading_a_new_setting_widens_nothing() {
        let offered = manifest(json!({ "settings": { "read": ["namingCase", "libraries"] } }));

        assert!(!Declared::of(&offered).widens(&acquisition()));
    }

    #[test]
    fn a_row_that_does_not_say_widens_nothing() {
        assert!(!Declared::default().widens(&acquisition()));
    }
}
