use std::collections::{BTreeMap, BTreeSet};

use rusqlite::Connection;

use super::shape::{describe, Table};
use super::{legacy, BASELINE, CORE};

const RELEASES: &[(&str, &str)] = &[
    ("v0.1.30", include_str!("fixtures/v0.1.30.sql")),
    ("v0.1.38", include_str!("fixtures/v0.1.38.sql")),
];

fn fresh() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    kroma_sqlite::migrate(&mut conn, &CORE, None).unwrap();
    conn
}

fn dump(conn: &Connection) -> String {
    conn.prepare(
        "SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
    )
    .unwrap()
    .query_map([], |r| r.get::<_, String>(0))
    .unwrap()
    .map(|sql| format!("{};\n", sql.unwrap()))
    .collect()
}

fn mismatches(expected: &BTreeMap<String, Table>, found: &BTreeMap<String, Table>) -> Vec<String> {
    let names: BTreeSet<&String> = expected.keys().chain(found.keys()).collect();
    names
        .into_iter()
        .filter(|name| expected.get(*name) != found.get(*name))
        .map(|name| {
            format!(
                "{name}: expected {:#?}\nfound {:#?}",
                expected.get(name),
                found.get(name)
            )
        })
        .collect()
}

#[test]
fn the_baseline_is_the_schema_the_legacy_migrations_build() {
    let conn = Connection::open_in_memory().unwrap();
    legacy::adopt(&conn).unwrap();

    let built = dump(&conn);

    if std::env::var_os("KROMA_BLESS_SCHEMA").is_some() {
        std::fs::write(
            concat!(env!("CARGO_MANIFEST_DIR"), "/src/schema/baseline.sql"),
            &built,
        )
        .unwrap();
        return;
    }
    assert!(
        built == BASELINE,
        "schema/baseline.sql is stale; regenerate it with \
         KROMA_BLESS_SCHEMA=1 cargo test -p kroma-db the_baseline_is"
    );
}

#[test]
fn a_database_adopted_from_the_legacy_schema_matches_a_fresh_one() {
    let mut adopted = Connection::open_in_memory().unwrap();
    legacy::adopt(&adopted).unwrap();
    adopted
        .pragma_update(None, "user_version", CORE.baseline_version)
        .unwrap();

    kroma_sqlite::migrate(&mut adopted, &CORE, None).unwrap();

    assert_eq!(
        mismatches(&describe(&fresh()), &describe(&adopted)),
        Vec::<String>::new()
    );
}

#[test]
fn every_release_since_v0_1_30_upgrades_to_the_schema_a_fresh_install_gets() {
    let expected = describe(&fresh());

    for (release, schema) in RELEASES {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(schema).unwrap();

        kroma_sqlite::migrate(&mut conn, &CORE, None).unwrap();

        assert_eq!(
            mismatches(&expected, &describe(&conn)),
            Vec::<String>::new(),
            "{release}"
        );
        assert_eq!(
            kroma_sqlite::user_version(&conn).unwrap(),
            CORE.latest(),
            "{release}"
        );
    }
}

#[test]
fn every_step_has_a_unique_name_that_starts_with_its_version() {
    let names: Vec<&str> = CORE.steps.iter().map(|step| step.name).collect();

    for (at, name) in names.iter().enumerate() {
        let version = CORE.baseline_version as usize + at + 1;
        assert!(
            name.starts_with(&format!("{version:04}_")),
            "{name} should start with {version:04}_"
        );
    }
    assert_eq!(names.iter().collect::<BTreeSet<_>>().len(), names.len());
}
