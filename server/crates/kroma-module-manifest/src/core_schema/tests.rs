use std::collections::BTreeMap;

use crate::{CoreSchema, CoreScope, EngineRefusal, Storage, TableVersions};

fn schema() -> CoreSchema {
    let table = |changed, broke| TableVersions {
        changed,
        broke,
        dropped: false,
    };
    CoreSchema {
        version: 19,
        tables: BTreeMap::from([
            ("downloads".to_string(), table(19, 1)),
            ("items".to_string(), table(5, 5)),
            ("users".to_string(), table(1, 1)),
        ]),
    }
}

fn reaching(read: &[&str]) -> Storage {
    Storage {
        core: CoreScope {
            read: read.iter().map(|t| (*t).to_string()).collect(),
            write: Vec::new(),
        },
        adopt: Vec::new(),
    }
}

#[test]
fn a_module_built_against_this_schema_runs_on_it() {
    let grant = reaching(&["downloads", "users.username"]);

    let verdict = schema().runs("19", Some(&grant));

    assert_eq!(verdict, Ok(()));
}

#[test]
fn a_module_that_needs_a_newer_schema_is_refused_with_both_versions() {
    let grant = reaching(&["downloads"]);

    let verdict = schema().runs("20", Some(&grant));

    assert_eq!(
        verdict,
        Err(EngineRefusal::CoreSchema {
            needs: "20".into(),
            has: 19,
        })
    );
}

#[test]
fn a_value_that_is_no_schema_version_is_refused_rather_than_ignored() {
    let verdict = schema().runs("latest", None);

    assert_eq!(
        verdict,
        Err(EngineRefusal::CoreSchema {
            needs: "latest".into(),
            has: 19,
        })
    );
}

#[test]
fn a_table_this_schema_broke_after_the_module_was_built_is_named() {
    let grant = reaching(&["users.username", "Items.title"]);

    let verdict = schema().runs("4", Some(&grant));

    assert_eq!(
        verdict,
        Err(EngineRefusal::CoreTable {
            table: "items".into(),
            built: 4,
            changed: 5,
        })
    );
}

#[test]
fn a_table_changed_without_breaking_since_the_module_was_built_still_runs() {
    let grant = reaching(&["downloads", "users"]);

    let verdict = schema().runs("1", Some(&grant));

    assert_eq!(verdict, Ok(()));
}

#[test]
fn a_table_this_schema_does_not_know_is_left_to_the_grant() {
    let grant = reaching(&["future_table"]);

    let verdict = schema().runs("19", Some(&grant));

    assert_eq!(verdict, Ok(()));
}

#[test]
fn the_refusals_say_what_to_do_about_them() {
    let newer = EngineRefusal::CoreSchema {
        needs: "20".into(),
        has: 19,
    };
    let older = EngineRefusal::CoreTable {
        table: "items".into(),
        built: 4,
        changed: 5,
    };

    let said = [newer.to_string(), older.to_string()];

    assert_eq!(
        said,
        [
            "requires core schema 20 (this server's is 19)",
            "reads items as core schema 4 had it, and this server changed that table at 5: it needs rebuilding",
        ]
    );
}

#[test]
fn the_history_reads_the_json_the_core_derives() {
    let json = r#"{ "tables": { "downloads": { "broke": 1, "changed": 19 } }, "version": 19 }"#;

    let parsed: CoreSchema = serde_json::from_str(json).unwrap();

    assert_eq!(parsed.tables["downloads"].changed, 19);
    assert!(!parsed.tables["downloads"].dropped);
}
