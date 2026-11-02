//! What installing a version asks for beyond the one installed, which an update
//! nobody is looking at may not take.

use crate::ModuleManifest;

impl ModuleManifest {
    /// Whether installing this over `installed` asks for more than it was
    /// granted: a wider `permissions` block, or a key in `settings.write` it did
    /// not declare. An installed module that declared no `permissions` has none
    /// to widen.
    pub fn asks_more_than(&self, installed: &ModuleManifest) -> bool {
        let wider_permissions = match (&self.permissions, &installed.permissions) {
            (Some(offered), Some(granted)) => offered.widens(granted),
            _ => false,
        };
        wider_permissions
            || self
                .settings
                .as_ref()
                .is_some_and(|offered| offered.writes_beyond(installed.settings.as_ref()))
    }
}

#[cfg(test)]
mod tests {
    use crate::ModuleManifest;

    fn manifest(extra: &str) -> ModuleManifest {
        serde_json::from_str(&format!(
            r#"{{ "id": "a", "name": "A", "version": "1.0.0"{extra} }}"#
        ))
        .unwrap()
    }

    const NARROW: &str =
        r#", "permissions": { "net": { "connect": [{ "purpose": "a", "to": ["api.example"] }] } }"#;
    const WIDE: &str =
        r#", "permissions": { "net": { "connect": [{ "purpose": "a", "to": ["public"] }] } }"#;

    #[test]
    fn a_wider_permissions_block_asks_for_more() {
        assert!(manifest(WIDE).asks_more_than(&manifest(NARROW)));
    }

    #[test]
    fn a_new_key_in_settings_write_asks_for_more() {
        let installed = manifest(r#", "settings": { "write": ["acqEnabled"] }"#);
        let offered = manifest(r#", "settings": { "write": ["acqEnabled", "rqbitDownKbps"] }"#);

        assert!(offered.asks_more_than(&installed));
        assert!(!installed.asks_more_than(&offered));
    }

    #[test]
    fn writing_a_setting_asks_for_more_than_a_module_that_declared_none() {
        let offered = manifest(r#", "settings": { "write": ["acqEnabled"] }"#);

        assert!(offered.asks_more_than(&manifest("")));
    }

    #[test]
    fn reading_one_more_setting_does_not_ask_for_more() {
        let installed = manifest(r#", "settings": { "read": ["acqEnabled"] }"#);
        let offered = manifest(r#", "settings": { "read": ["acqEnabled", "smtpHost"] }"#);

        assert!(!offered.asks_more_than(&installed));
    }

    #[test]
    fn the_same_manifest_asks_for_nothing_more() {
        let same = manifest(&format!(
            r#"{NARROW}, "settings": {{ "write": ["acqEnabled"] }}"#
        ));

        assert!(!same.asks_more_than(&same.clone()));
    }
}
