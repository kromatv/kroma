use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};

use kroma_sqlite::{Change, Run, Schema};
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::Connection;
use serde_json::json;

use super::shape::{describe, Column, Table};
use super::{CORE, CORE_TABLE_VERSIONS};

type CodeSteps = [(&'static str, &'static [&'static str])];

// Run on an empty database, a code step prepares none of the writes it makes.
const CODE_STEP_TABLES: &CodeSteps = &[
    ("0013_stored_tokens", &["access_tokens", "sessions"]),
    ("0020_waiting_accounts", &["users"]),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Versions {
    changed: u32,
    broke: u32,
    dropped: bool,
}

impl Versions {
    fn created(version: u32) -> Self {
        Self {
            changed: version,
            broke: version,
            dropped: false,
        }
    }
}

struct Touch {
    table: String,
    updated: Option<String>,
}

fn touched_table(action: AuthAction<'_>) -> Option<(&str, Option<&str>)> {
    match action {
        AuthAction::CreateTable { table_name }
        | AuthAction::DropTable { table_name }
        | AuthAction::AlterTable { table_name, .. }
        | AuthAction::CreateIndex { table_name, .. }
        | AuthAction::DropIndex { table_name, .. }
        | AuthAction::CreateTrigger { table_name, .. }
        | AuthAction::DropTrigger { table_name, .. }
        | AuthAction::Insert { table_name }
        | AuthAction::Delete { table_name } => Some((table_name, None)),
        AuthAction::Update {
            table_name,
            column_name,
        } => Some((table_name, Some(column_name))),
        _ => None,
    }
}

fn run_watched(conn: &Connection, step: &kroma_sqlite::Step) -> Vec<Touch> {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = seen.clone();
    conn.authorizer(Some(move |ctx: AuthContext<'_>| {
        if let Some((table, updated)) = touched_table(ctx.action) {
            sink.lock().unwrap().push(Touch {
                table: table.to_ascii_lowercase(),
                updated: updated.map(str::to_ascii_lowercase),
            });
        }
        Authorization::Allow
    }))
    .unwrap();
    apply_as_the_runner_does(conn, step);
    conn.authorizer(None::<fn(AuthContext<'_>) -> Authorization>)
        .unwrap();
    Arc::try_unwrap(seen).ok().unwrap().into_inner().unwrap()
}

fn apply_as_the_runner_does(conn: &Connection, step: &kroma_sqlite::Step) {
    if step.rebuilds {
        conn.execute_batch("PRAGMA foreign_keys = OFF").unwrap();
    }
    step.apply(conn).unwrap();
    if step.rebuilds {
        conn.execute_batch("PRAGMA foreign_keys = ON").unwrap();
    }
}

fn required_without_default(column: &Column) -> bool {
    let (_, _, not_null, default, pk) = column;
    *not_null && default.is_none() && *pk == 0
}

fn breaks(before: &Table, after: &Table) -> bool {
    !before.columns.is_subset(&after.columns)
        || !before.indexes.is_subset(&after.indexes)
        || !before.foreign_keys.is_subset(&after.foreign_keys)
        || !before.triggers.is_subset(&after.triggers)
        || after
            .columns
            .difference(&before.columns)
            .any(required_without_default)
}

fn had_column(table: Option<&Table>, column: &str) -> bool {
    table.is_some_and(|t| {
        t.columns
            .iter()
            .any(|(name, ..)| name.eq_ignore_ascii_case(column))
    })
}

fn changes(
    before: &BTreeMap<String, Table>,
    after: &BTreeMap<String, Table>,
    touches: &[Touch],
    rewritten: &[&str],
) -> BTreeMap<String, bool> {
    let mut out = BTreeMap::new();
    let names: BTreeSet<String> = before.keys().chain(after.keys()).cloned().collect();
    for name in &names {
        match (before.get(name), after.get(name)) {
            (Some(b), Some(a)) if b == a => {}
            (Some(b), Some(a)) => {
                out.insert(name.clone(), breaks(b, a));
            }
            _ => {
                out.insert(name.clone(), true);
            }
        }
    }
    for touch in touches.iter().filter(|t| names.contains(&t.table)) {
        let rewrites = touch
            .updated
            .as_deref()
            .is_some_and(|column| had_column(before.get(&touch.table), column));
        *out.entry(touch.table.clone()).or_default() |= rewrites;
    }
    for table in rewritten {
        out.insert((*table).to_string(), true);
    }
    out
}

fn rewritten_by(code_steps: &CodeSteps, step: &str) -> &'static [&'static str] {
    let declared = code_steps.iter().find(|(name, _)| *name == step);
    declared.map_or(&[], |(_, tables)| *tables)
}

fn derive(schema: &Schema<'_>, code_steps: &CodeSteps) -> BTreeMap<String, Versions> {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(schema.baseline).unwrap();
    let base = schema.baseline_version;
    let mut versions: BTreeMap<String, Versions> = describe(&conn)
        .into_keys()
        .map(|table| (table, Versions::created(base)))
        .collect();
    for (at, step) in schema.steps.iter().enumerate() {
        let version = base + at as u32 + 1;
        let before = describe(&conn);
        let touches = run_watched(&conn, step);
        let after = describe(&conn);
        let rewritten = rewritten_by(code_steps, step.name);
        for (table, broke) in changes(&before, &after, &touches, rewritten) {
            let entry = versions
                .entry(table.clone())
                .or_insert(Versions::created(version));
            entry.changed = version;
            if broke {
                entry.broke = version;
            }
            entry.dropped = !after.contains_key(&table);
        }
    }
    versions
}

fn artifact(schema: &Schema<'_>, versions: &BTreeMap<String, Versions>) -> String {
    let tables: serde_json::Map<String, serde_json::Value> = versions
        .iter()
        .map(|(table, v)| {
            let mut row = json!({ "changed": v.changed, "broke": v.broke });
            if v.dropped {
                row["dropped"] = json!(true);
            }
            (table.clone(), row)
        })
        .collect();
    let document = json!({ "version": schema.latest(), "tables": tables });
    format!("{}\n", serde_json::to_string_pretty(&document).unwrap())
}

#[test]
fn table_versions_json_is_what_the_core_schema_steps_derive() {
    let derived = artifact(&CORE, &derive(&CORE, CODE_STEP_TABLES));

    if std::env::var_os("KROMA_BLESS_SCHEMA").is_some() {
        std::fs::write(
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/src/schema/table_versions.json"
            ),
            &derived,
        )
        .unwrap();
        return;
    }
    assert!(
        derived == CORE_TABLE_VERSIONS,
        "schema/table_versions.json is stale; regenerate it with \
         KROMA_BLESS_SCHEMA=1 cargo test -p kroma-db table_versions"
    );
}

#[test]
fn every_code_step_names_the_tables_it_rewrites() {
    let code_steps = CORE
        .steps
        .iter()
        .filter(|step| matches!(step.run, Run::Code(_)));

    for step in code_steps {
        assert!(
            CODE_STEP_TABLES.iter().any(|(name, _)| *name == step.name),
            "{} is a Run::Code step: add the tables it rewrites to CODE_STEP_TABLES",
            step.name
        );
    }
}

mod tests;
