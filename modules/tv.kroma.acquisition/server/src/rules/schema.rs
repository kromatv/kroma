use kroma_module_sdk::db::{Run, Step};

/// The tables this module keeps in its own database, applied at boot.
pub const MIGRATIONS: &str = "
    -- The quality profiles, custom formats and size limits the admin edits.
    -- Bodies are the JSON the rules engine reads, so the editor and the
    -- decision speak one shape.
    CREATE TABLE IF NOT EXISTS quality_profiles (
        id         TEXT PRIMARY KEY,
        body       TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_formats (
        id         TEXT PRIMARY KEY,
        body       TEXT NOT NULL,
        position   INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    -- `sizes`, `default_profile`, and `seeded` once the defaults were written,
    -- so emptying a list never brings the defaults back.
    CREATE TABLE IF NOT EXISTS rule_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    -- A title judged by another profile than the default.
    CREATE TABLE IF NOT EXISTS title_profiles (
        kind       TEXT NOT NULL,
        tmdb_id    INTEGER NOT NULL,
        profile_id TEXT NOT NULL,
        PRIMARY KEY (kind, tmdb_id)
    );
    -- The release name an import placed a file under, which says what its own
    -- name no longer does (source, group, languages).
    CREATE TABLE IF NOT EXISTS file_releases (
        abs_path      TEXT PRIMARY KEY,
        release_title TEXT NOT NULL,
        imported_at   INTEGER NOT NULL
    );
    -- A grab that adds a copy beside what is on disk rather than replacing it.
    CREATE TABLE IF NOT EXISTS beside_grabs (
        download_id TEXT PRIMARY KEY
    );
    -- Releases a title must not be grabbed again from: their download failed.
    CREATE TABLE IF NOT EXISTS blocklist (
        id            TEXT PRIMARY KEY,
        kind          TEXT NOT NULL,
        tmdb_id       INTEGER NOT NULL,
        release_title TEXT NOT NULL,
        info_hash     TEXT,
        indexer_id    TEXT,
        reason        TEXT NOT NULL,
        added_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_blocklist_title ON blocklist(kind, tmdb_id);
    -- How far along a download was when a failure pass last looked, and when
    -- that number last moved: a stall is no progress for the limit, not a
    -- long download.
    CREATE TABLE IF NOT EXISTS download_progress (
        download_id TEXT PRIMARY KEY,
        progress    REAL NOT NULL,
        changed_at  INTEGER NOT NULL
    );
    -- What a page asked an on-demand search for, until the job that answers
    -- it runs: a job takes no arguments, so the title rides here.
    CREATE TABLE IF NOT EXISTS search_queue (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        kind      TEXT NOT NULL,
        tmdb_id   INTEGER NOT NULL,
        units     TEXT NOT NULL,
        queued_at INTEGER NOT NULL,
        UNIQUE (kind, tmdb_id, units)
    );
    -- Failed downloads already blocklisted and put back, so a pass handles each once.
    CREATE TABLE IF NOT EXISTS handled_failures (
        download_id TEXT PRIMARY KEY,
        handled_at  INTEGER NOT NULL
    );
    -- When each title was last searched for an upgrade, and how many of those
    -- searches found nothing, so upgrades back off like missing rows do.
    CREATE TABLE IF NOT EXISTS upgrade_searches (
        kind      TEXT NOT NULL,
        tmdb_id   INTEGER NOT NULL,
        last_at   INTEGER NOT NULL,
        attempts  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (kind, tmdb_id)
    );
";

/// Every change to this module's database since [`MIGRATIONS`], oldest first.
pub const STEPS: &[Step] = &[Step {
    name: "what every instance of the module shares",
    run: Run::Sql(
        "
        CREATE TABLE IF NOT EXISTS search_results (
            key         TEXT PRIMARY KEY,
            releases    TEXT NOT NULL,
            searched_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS run_leases (
            name       TEXT PRIMARY KEY,
            holder     TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );
        ",
    ),
    rebuilds: false,
}];

#[cfg(test)]
pub(crate) fn install(store: &kroma_module_sdk::db::Pool) {
    let conn = store.get().unwrap();
    kroma_module_sdk::db::apply_migrations(&conn, MIGRATIONS).unwrap();
    for step in STEPS {
        if let Run::Sql(sql) = step.run {
            conn.execute_batch(sql).unwrap();
        }
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::db::{migrate_store, open};

    use super::*;

    fn tables(store: &kroma_module_sdk::db::Pool) -> Vec<String> {
        let conn = store.get().unwrap();
        let mut rows = conn
            .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
            .unwrap();
        rows.query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    #[test]
    fn a_new_file_has_the_tables_every_instance_shares() {
        let scratch = kroma_module_sdk::testing::temp_dir("acq-schema-new");
        let store = open(&scratch.path().join("module.sqlite")).unwrap();

        migrate_store(&store, "tv.kroma.acquisition", MIGRATIONS, STEPS).unwrap();

        let found = tables(&store);
        assert!(found.contains(&"search_results".to_string()), "{found:?}");
        assert!(found.contains(&"run_leases".to_string()), "{found:?}");
    }

    #[test]
    fn a_file_from_before_the_step_keeps_its_rows_and_gains_the_tables() {
        let scratch = kroma_module_sdk::testing::temp_dir("acq-schema-old");
        let store = open(&scratch.path().join("module.sqlite")).unwrap();
        migrate_store(&store, "tv.kroma.acquisition", MIGRATIONS, &[]).unwrap();
        store
            .get()
            .unwrap()
            .execute("INSERT INTO rule_settings (key, value) VALUES ('kept', '1')", [])
            .unwrap();

        migrate_store(&store, "tv.kroma.acquisition", MIGRATIONS, STEPS).unwrap();

        let conn = store.get().unwrap();
        let kept: String = conn
            .query_row("SELECT value FROM rule_settings WHERE key = 'kept'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "1");
        assert!(tables(&store).contains(&"run_leases".to_string()));
    }

    #[test]
    fn two_instances_reaching_the_step_together_both_start() {
        let scratch = kroma_module_sdk::testing::temp_dir("acq-schema-race");
        let store = open(&scratch.path().join("module.sqlite")).unwrap();
        migrate_store(&store, "tv.kroma.acquisition", MIGRATIONS, &[]).unwrap();
        store.get().unwrap().execute_batch("CREATE TABLE search_results (key TEXT PRIMARY KEY, releases TEXT NOT NULL, searched_at INTEGER NOT NULL)").unwrap();

        migrate_store(&store, "tv.kroma.acquisition", MIGRATIONS, STEPS).unwrap();

        assert!(tables(&store).contains(&"run_leases".to_string()));
    }
}
