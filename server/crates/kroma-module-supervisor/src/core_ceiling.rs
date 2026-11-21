//! The slice of the core database a module the official registry did not ship
//! may never reach, whatever its operator accepted.

use kroma_module_manifest::ModuleManifest;

const ACCOUNTS: &str = "users";
const PASSWORD: &str = "password_hash";
const CREDENTIALS: [&str; 9] = [
    "sessions",
    "access_tokens",
    "passkeys",
    "identities",
    "invites",
    "credential_resets",
    "email_verifications",
    "reset_requests",
    "settings",
];

/// Refuses a module that names, in `storage.core`, a table that holds a
/// credential, the accounts whole or their password hash, or any write on the
/// accounts. Only a module the official registry ships may.
pub(crate) fn within_third_party_ceiling(
    id: &str,
    manifest: &ModuleManifest,
) -> anyhow::Result<()> {
    let Some(storage) = &manifest.storage else {
        return Ok(());
    };
    let core = &storage.core;
    let refused = core
        .read
        .iter()
        .find(|entry| keeps_credentials(entry))
        .or_else(|| {
            core.write
                .iter()
                .find(|entry| keeps_credentials(entry) || on_accounts(entry))
        });
    match refused {
        Some(entry) => anyhow::bail!(
            "'{id}' does not come from the official registry, so it may not reach '{}' of the core database",
            entry.trim()
        ),
        None => Ok(()),
    }
}

/// A `storage.core` entry as the authorizer reads it: the table and, for a
/// column entry, the column, each trimmed and lower-cased. `None` for a blank
/// entry, which grants nothing.
pub(crate) fn core_entry(entry: &str) -> Option<(String, Option<String>)> {
    let entry = entry.trim();
    if entry.is_empty() {
        return None;
    }
    let lower = |part: &str| part.trim().to_ascii_lowercase();
    Some(match entry.split_once('.') {
        Some((table, column)) => (lower(table), Some(lower(column))),
        None => (lower(entry), None),
    })
}

fn keeps_credentials(entry: &str) -> bool {
    core_entry(entry).is_some_and(|(table, column)| {
        CREDENTIALS.contains(&table.as_str())
            || (table == ACCOUNTS && column.is_none_or(|column| column == PASSWORD))
    })
}

fn on_accounts(entry: &str) -> bool {
    core_entry(entry).is_some_and(|(table, _)| table == ACCOUNTS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reaching(core: &str) -> ModuleManifest {
        serde_json::from_str(&format!(
            r#"{{ "id": "com.example.x", "name": "X", "version": "1.0.0", "storage": {{ "core": {core} }} }}"#
        ))
        .unwrap()
    }

    fn refuses(core: &str) -> bool {
        within_third_party_ceiling("com.example.x", &reaching(core)).is_err()
    }

    #[test]
    fn a_table_that_holds_a_credential_is_refused_whatever_its_case() {
        assert!(refuses(r#"{ "read": [" Access_Tokens "] }"#));
        assert!(refuses(r#"{ "write": ["settings"] }"#));
        assert!(refuses(r#"{ "read": ["identities.subject"] }"#));
    }

    #[test]
    fn the_accounts_whole_or_their_password_hash_are_refused() {
        assert!(refuses(r#"{ "read": ["users"] }"#));
        assert!(refuses(r#"{ "read": ["users . Password_Hash"] }"#));
    }

    #[test]
    fn a_write_on_any_account_column_is_refused() {
        assert!(refuses(r#"{ "write": ["users.language"] }"#));
    }

    #[test]
    fn the_account_columns_an_official_module_reads_are_admitted() {
        assert!(!refuses(
            r#"{ "read": ["users.id", "users.email", "users.permissions", "users.pin_hash"], "write": ["requests"] }"#
        ));
    }

    #[test]
    fn a_module_with_no_storage_or_a_blank_entry_is_admitted() {
        let none: ModuleManifest =
            serde_json::from_str(r#"{ "id": "com.example.x", "name": "X", "version": "1.0.0" }"#)
                .unwrap();

        assert!(within_third_party_ceiling("com.example.x", &none).is_ok());
        assert!(!refuses(r#"{ "read": ["  "] }"#));
    }
}
