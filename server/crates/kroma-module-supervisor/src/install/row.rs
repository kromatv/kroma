//! Whether a bundle declares what its catalog row showed the operator.

use std::collections::{BTreeMap, BTreeSet};

use kroma_module_manifest::{Declared, Helper, ModuleManifest, Permissions};

use crate::core_ceiling::core_entry;

type Entries = BTreeSet<(String, Option<String>)>;

pub(super) fn says_what_its_row_showed(
    id: &str,
    manifest: &ModuleManifest,
    shown: Declared<'_>,
) -> anyhow::Result<()> {
    let bundle = Declared::of(manifest);
    let differs = [
        ("permissions", permissions(bundle) != permissions(shown)),
        ("core tables", core(bundle) != core(shown)),
        ("settings", settings(bundle) != settings(shown)),
        ("helpers", helpers(bundle) != helpers(shown)),
    ];
    match differs.iter().find(|(_, differs)| *differs) {
        Some((part, _)) => {
            anyhow::bail!("the bundle for '{id}' declares other {part} than its catalog row says")
        }
        None => Ok(()),
    }
}

fn permissions(declared: Declared<'_>) -> Permissions {
    declared.permissions.cloned().unwrap_or_default()
}

fn core(declared: Declared<'_>) -> (Entries, Entries) {
    declared.storage.map_or_else(Default::default, |storage| {
        (entries(&storage.core.read), entries(&storage.core.write))
    })
}

fn entries(list: &[String]) -> Entries {
    list.iter().filter_map(|entry| core_entry(entry)).collect()
}

fn settings<'a>(declared: Declared<'a>) -> (BTreeSet<&'a str>, BTreeSet<&'a str>) {
    declared.settings.map_or_else(Default::default, |settings| {
        (keys(&settings.read), keys(&settings.write))
    })
}

fn keys(list: &[String]) -> BTreeSet<&str> {
    list.iter().map(String::as_str).collect()
}

fn helpers<'a>(declared: Declared<'a>) -> Option<&'a BTreeMap<String, Helper>> {
    declared.helpers.filter(|helpers| !helpers.is_empty())
}

#[cfg(test)]
mod tests {
    use kroma_module_manifest::SettingsScope;

    use super::*;

    fn bundle(declares: &str) -> ModuleManifest {
        serde_json::from_str(&format!(
            r#"{{ "id": "com.example.x", "name": "X", "version": "1.0.0"{declares} }}"#
        ))
        .unwrap()
    }

    fn refusal(declares: &str, shown: Declared<'_>) -> String {
        says_what_its_row_showed("com.example.x", &bundle(declares), shown)
            .unwrap_err()
            .to_string()
    }

    #[test]
    fn a_row_that_leaves_a_part_out_admits_a_bundle_that_leaves_it_empty() {
        let empty = bundle(r#", "permissions": {}, "storage": {}, "settings": {}, "helpers": {}"#);

        let said = says_what_its_row_showed("com.example.x", &empty, Declared::default());

        assert!(said.is_ok(), "{said:?}");
    }

    #[test]
    fn a_setting_the_row_did_not_show_is_refused() {
        let shown = SettingsScope {
            read: vec!["namingCase".into()],
            write: Vec::new(),
        };
        let row = Declared {
            settings: Some(&shown),
            ..Declared::default()
        };

        let refused = refusal(
            r#", "settings": { "read": ["namingCase"], "write": ["namingCase"] }"#,
            row,
        );

        assert!(refused.contains("other settings"), "{refused}");
    }

    #[test]
    fn a_helper_the_row_did_not_show_is_refused() {
        let refused = refusal(
            r#", "helpers": { "tool": { "assets": { "linux-x86_64": { "url": "https://x/t", "sha256": "00" } } } }"#,
            Declared::default(),
        );

        assert!(refused.contains("other helpers"), "{refused}");
    }

    #[test]
    fn a_column_the_row_did_not_show_is_refused() {
        let storage = serde_json::from_str(r#"{ "core": { "read": ["users.email"] } }"#).unwrap();
        let row = Declared {
            storage: Some(&storage),
            ..Declared::default()
        };

        let refused = refusal(
            r#", "storage": { "core": { "read": ["users.email", "users.username"] } }"#,
            row,
        );

        assert!(refused.contains("other core tables"), "{refused}");
    }
}
