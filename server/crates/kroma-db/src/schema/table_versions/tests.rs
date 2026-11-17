use kroma_sqlite::{Run, Schema, Step};

use super::{derive, Versions};

const BASELINE: &str = "
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL);
    CREATE TABLE downloads (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), title TEXT);
    CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT NOT NULL, v_codec TEXT);
";

fn sql(name: &'static str, sql: &'static str) -> Step {
    Step {
        name,
        run: Run::Sql(sql),
        rebuilds: false,
    }
}

fn history(steps: &[Step]) -> std::collections::BTreeMap<String, Versions> {
    let schema = Schema {
        name: "a test database",
        baseline: BASELINE,
        baseline_version: 1,
        steps,
        legacy: None,
    };
    derive(&schema, &[("0002_rewrite_titles", &["items"])])
}

const fn at(changed: u32, broke: u32) -> Versions {
    Versions {
        changed,
        broke,
        dropped: false,
    }
}

fn rewrite_titles(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch("SELECT title FROM items")
}

#[test]
fn every_baseline_table_starts_at_the_baseline_version() {
    let versions = history(&[]);

    assert_eq!(versions["users"], at(1, 1));
    assert_eq!(versions.len(), 3);
}

#[test]
fn a_step_that_alters_downloads_raises_downloads_only() {
    let steps = [sql(
        "0002_downloads_protocol",
        "ALTER TABLE downloads ADD COLUMN protocol TEXT NOT NULL DEFAULT 'torrent'",
    )];

    let versions = history(&steps);

    assert_eq!(versions["downloads"], at(2, 1));
    assert_eq!(versions["users"], at(1, 1));
    assert_eq!(versions["items"], at(1, 1));
}

#[test]
fn a_dropped_column_breaks_its_table() {
    let steps = [sql(
        "0002_drop_codec",
        "ALTER TABLE items DROP COLUMN v_codec",
    )];

    let versions = history(&steps);

    assert_eq!(versions["items"], at(2, 2));
}

#[test]
fn an_index_changes_a_table_without_breaking_it() {
    let steps = [sql(
        "0002_title_index",
        "CREATE INDEX idx_items_title ON items(title)",
    )];

    let versions = history(&steps);

    assert_eq!(versions["items"], at(2, 1));
}

#[test]
fn rewriting_a_column_that_was_there_breaks_its_table() {
    let steps = [sql(
        "0002_upper_titles",
        "UPDATE items SET title = upper(title)",
    )];

    let versions = history(&steps);

    assert_eq!(versions["items"], at(2, 2));
}

#[test]
fn filling_a_column_the_same_step_adds_only_changes_its_table() {
    let steps = [sql(
        "0002_items_sort",
        "ALTER TABLE items ADD COLUMN sort_title TEXT; UPDATE items SET sort_title = lower(title);",
    )];

    let versions = history(&steps);

    assert_eq!(versions["items"], at(2, 1));
}

#[test]
fn a_table_a_backfill_only_reads_is_left_as_it_was() {
    let steps = [sql(
        "0002_titles",
        "CREATE TABLE titles (id TEXT PRIMARY KEY, title TEXT);\
         INSERT INTO titles SELECT id, title FROM items;",
    )];

    let versions = history(&steps);

    assert_eq!(versions["titles"], at(2, 2));
    assert_eq!(versions["items"], at(1, 1));
}

#[test]
fn a_dropped_table_is_kept_and_marked_dropped() {
    let steps = [sql("0002_drop_downloads", "DROP TABLE downloads")];

    let versions = history(&steps);

    assert_eq!(
        versions["downloads"],
        Versions {
            changed: 2,
            broke: 2,
            dropped: true
        }
    );
}

#[test]
fn a_table_rebuilt_without_its_not_null_breaks() {
    let steps = [sql(
        "0002_optional_username",
        "CREATE TABLE users_new (id TEXT PRIMARY KEY, username TEXT);\
         INSERT INTO users_new SELECT id, username FROM users;\
         DROP TABLE users;\
         ALTER TABLE users_new RENAME TO users;",
    )];

    let versions = history(&steps);

    assert_eq!(versions["users"], at(2, 2));
    assert!(!versions.contains_key("users_new"));
}

#[test]
fn a_code_step_breaks_the_tables_it_names() {
    let steps = [Step {
        name: "0002_rewrite_titles",
        run: Run::Code(rewrite_titles),
        rebuilds: false,
    }];

    let versions = history(&steps);

    assert_eq!(versions["items"], at(2, 2));
    assert_eq!(versions["users"], at(1, 1));
}
