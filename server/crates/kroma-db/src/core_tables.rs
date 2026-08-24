//! Which tables belong to the core schema.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use crate::schema::{MIGRATIONS, SCHEMA};

static OWNED: LazyLock<BTreeSet<String>> = LazyLock::new(|| {
    let schema = without_comments(SCHEMA);
    schema
        .split(';')
        .filter_map(created_table)
        .chain(MIGRATIONS.iter().copied().filter_map(created_table))
        .collect()
});

/// Whether `name` is a table the core creates, compared the way SQLite compares
/// identifiers: trimmed and ASCII case-insensitive.
///
/// Read off the DDL itself rather than a second list beside it, so a table added
/// to the schema is covered the day it lands. The module supervisor consults
/// this before moving a table out of the core database: a table the core owns is
/// never a module's to take, whatever its manifest declares.
pub fn is_core_table(name: &str) -> bool {
    OWNED.contains(name.trim().to_ascii_lowercase().as_str())
}

// Runs before the split on `;`: a comment holding one would otherwise cut a
// statement away from its own `CREATE`.
fn without_comments(sql: &str) -> String {
    sql.lines()
        .map(|line| line.split("--").next().unwrap_or_default())
        .collect::<Vec<_>>()
        .join(" ")
}

fn created_table(statement: &str) -> Option<String> {
    let rest = strip_prefix_ci(statement.trim(), "CREATE TABLE ")?;
    let rest = strip_prefix_ci(rest.trim_start(), "IF NOT EXISTS ").unwrap_or(rest);
    let name = rest
        .trim_start()
        .split(['(', ' ', '\t'])
        .find(|word| !word.is_empty())?;
    Some(name.trim_matches('"').to_ascii_lowercase())
}

fn strip_prefix_ci<'a>(sql: &'a str, prefix: &str) -> Option<&'a str> {
    let head = sql.get(..prefix.len())?;
    head.eq_ignore_ascii_case(prefix)
        .then(|| &sql[prefix.len()..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_table_a_fresh_database_holds_is_known_to_be_the_cores() {
        let pool = crate::testing::temp_pool("core-tables-fresh");
        let conn = pool.get().unwrap();

        let held: Vec<String> = conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();

        assert!(held.len() > 20, "{held:?}");
        for name in &held {
            assert!(
                is_core_table(name),
                "'{name}' is in the schema but not derived from it"
            );
        }
    }

    #[test]
    fn a_table_created_by_a_migration_counts_as_the_cores() {
        assert!(is_core_table("passkeys"));
        assert!(is_core_table("file_segments"));
    }

    #[test]
    fn an_identifier_matches_whatever_case_and_padding_it_arrives_in() {
        assert!(is_core_table("USERS"));
        assert!(is_core_table("  Sessions  "));
    }

    #[test]
    fn a_table_the_core_never_creates_is_not_its_own() {
        assert!(!is_core_table("indexers"));
        assert!(!is_core_table("download_clients"));
        assert!(!is_core_table(""));
    }
}
