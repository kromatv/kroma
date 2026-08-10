//! The Indexers module's own persistence: the `indexers` table, registered via
//! `ServerModule::migrations`. Secrets (`api_key`, per-indexer passwords in
//! `settings`) never leave this layer: the routes expose only a has-secret flag.

use anyhow::Result;
use rusqlite::{params, Connection, Row};

use kroma_module_sdk::db::Pool;

// `IF NOT EXISTS` DDL only: it runs on every boot.
pub const MIGRATIONS: &str = "
    -- Torznab indexers (Jackett / Prowlarr endpoints). `categories` is a comma
    -- list; `priority` is a flat score tiebreak in the decision engine.
    -- `kind` is 'torznab' (external Jackett/Prowlarr endpoint; url+api_key) or
    -- 'builtin' (native Cardigann engine: `definition_id` names the definition,
    -- `settings` is a JSON map of the admin-entered per-indexer config incl.
    -- credentials, and `url` is the chosen base link).
    CREATE TABLE IF NOT EXISTS indexers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        url           TEXT NOT NULL,
        api_key       TEXT NOT NULL DEFAULT '',
        categories    TEXT NOT NULL DEFAULT '2000,5000',
        enabled       INTEGER NOT NULL DEFAULT 1,
        priority      INTEGER NOT NULL DEFAULT 0,
        kind          TEXT NOT NULL DEFAULT 'torznab',
        definition_id TEXT,
        settings      TEXT NOT NULL DEFAULT '{}',
        last_ok_at    INTEGER,
        last_error    TEXT,
        created_at    INTEGER NOT NULL
    );
";

pub use kroma_module_sdk::ports::IndexerRow;

const INDEXER_COLS: &str = "id, name, url, api_key, categories, enabled, priority, \
    kind, definition_id, settings, last_ok_at, last_error, created_at";

fn row_to_indexer(r: &Row) -> rusqlite::Result<IndexerRow> {
    let cats: String = r.get(4)?;
    Ok(IndexerRow {
        id: r.get(0)?,
        name: r.get(1)?,
        url: r.get(2)?,
        api_key: r.get(3)?,
        categories: cats
            .split(',')
            .filter_map(|c| c.trim().parse().ok())
            .collect(),
        enabled: r.get::<_, i64>(5)? != 0,
        priority: r.get(6)?,
        kind: r.get(7)?,
        definition_id: r.get(8)?,
        settings: r.get(9)?,
        last_ok_at: r.get(10)?,
        last_error: r.get(11)?,
        created_at: r.get(12)?,
    })
}

pub fn list_indexers(conn: &Connection) -> rusqlite::Result<Vec<IndexerRow>> {
    let mut stmt =
        conn.prepare(&format!("SELECT {INDEXER_COLS} FROM indexers ORDER BY created_at"))?;
    let rows = stmt.query_map([], row_to_indexer)?;
    rows.collect()
}

pub fn enabled_indexers(conn: &Connection) -> rusqlite::Result<Vec<IndexerRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {INDEXER_COLS} FROM indexers WHERE enabled = 1 ORDER BY priority DESC, created_at"
    ))?;
    let rows = stmt.query_map([], row_to_indexer)?;
    rows.collect()
}

pub fn get_indexer(conn: &Connection, id: &str) -> rusqlite::Result<Option<IndexerRow>> {
    let mut stmt = conn.prepare(&format!("SELECT {INDEXER_COLS} FROM indexers WHERE id = ?1"))?;
    let mut rows = stmt.query_map(params![id], row_to_indexer)?;
    rows.next().transpose()
}

pub fn insert_indexer(pool: &Pool, row: &IndexerRow) -> Result<()> {
    let conn = pool.get()?;
    let cats = row.categories.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
    conn.execute(
        "INSERT INTO indexers \
            (id, name, url, api_key, categories, enabled, priority, kind, definition_id, settings, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            row.id, row.name, row.url, row.api_key, cats, row.enabled as i64, row.priority,
            row.kind, row.definition_id, row.settings, row.created_at
        ],
    )?;
    Ok(())
}

/// Partial update; `api_key = None` keeps the stored secret.
#[allow(clippy::too_many_arguments)]
pub fn update_indexer(
    pool: &Pool,
    id: &str,
    name: Option<&str>,
    url: Option<&str>,
    api_key: Option<&str>,
    categories: Option<&[u32]>,
    enabled: Option<bool>,
    priority: Option<i32>,
    settings: Option<&str>,
) -> Result<bool> {
    let conn = pool.get()?;
    let cats = categories.map(|c| c.iter().map(u32::to_string).collect::<Vec<_>>().join(","));
    let n = conn.execute(
        "UPDATE indexers SET \
            name = COALESCE(?2, name), \
            url = COALESCE(?3, url), \
            api_key = COALESCE(?4, api_key), \
            categories = COALESCE(?5, categories), \
            enabled = COALESCE(?6, enabled), \
            priority = COALESCE(?7, priority), \
            settings = COALESCE(?8, settings) \
         WHERE id = ?1",
        params![id, name, url, api_key, cats, enabled.map(|e| e as i64), priority, settings],
    )?;
    Ok(n > 0)
}

pub fn delete_indexer(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM indexers WHERE id = ?1", params![id])? > 0)
}

pub fn note_indexer_result(pool: &Pool, id: &str, ok: bool, error: Option<&str>, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    if ok {
        conn.execute(
            "UPDATE indexers SET last_ok_at = ?2, last_error = NULL WHERE id = ?1",
            params![id, now_ms],
        )?;
    } else {
        conn.execute("UPDATE indexers SET last_error = ?2 WHERE id = ?1", params![id, error])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::db::testing::TempPool;

    fn test_pool() -> TempPool {
        let pool = kroma_module_sdk::db::testing::temp_pool("indexer-db-test");
        {
            let conn = pool.get().unwrap();
            kroma_module_sdk::db::apply_migrations(&conn, MIGRATIONS).expect("indexers schema");
        }
        pool
    }

    fn row(id: &str, created_at: i64) -> IndexerRow {
        IndexerRow {
            id: id.into(),
            name: format!("Indexer {id}"),
            url: "http://tracker.example".into(),
            api_key: "secret".into(),
            categories: vec![2000, 5000],
            enabled: true,
            priority: 0,
            kind: "torznab".into(),
            definition_id: None,
            settings: "{}".into(),
            last_ok_at: None,
            last_error: None,
            created_at,
        }
    }

    #[test]
    fn insert_then_get_round_trips_all_fields() {
        let pool = test_pool();
        let mut r = row("a", 100);
        r.categories = vec![2040, 5030];
        r.priority = 7;
        r.kind = "builtin".into();
        r.definition_id = Some("thepiratebay".into());
        r.settings = r#"{"user":"bob"}"#.into();
        insert_indexer(&pool, &r).unwrap();

        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().expect("row present");
        assert_eq!(got.id, "a");
        assert_eq!(got.name, "Indexer a");
        assert_eq!(got.categories, vec![2040, 5030]);
        assert_eq!(got.priority, 7);
        assert!(got.enabled);
        assert_eq!(got.kind, "builtin");
        assert_eq!(got.definition_id.as_deref(), Some("thepiratebay"));
        assert_eq!(got.settings, r#"{"user":"bob"}"#);
        assert!(got.last_ok_at.is_none() && got.last_error.is_none());
    }

    #[test]
    fn get_missing_returns_none() {
        let pool = test_pool();
        let conn = pool.get().unwrap();
        assert!(get_indexer(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn list_is_ordered_by_created_at() {
        let pool = test_pool();
        insert_indexer(&pool, &row("late", 300)).unwrap();
        insert_indexer(&pool, &row("early", 100)).unwrap();
        insert_indexer(&pool, &row("mid", 200)).unwrap();
        let conn = pool.get().unwrap();
        let ids: Vec<String> = list_indexers(&conn).unwrap().into_iter().map(|r| r.id).collect();
        assert_eq!(ids, vec!["early", "mid", "late"]);
    }

    #[test]
    fn enabled_filters_disabled_and_orders_by_priority_desc() {
        let pool = test_pool();
        let mut hi = row("hi", 100);
        hi.priority = 10;
        let mut lo = row("lo", 200);
        lo.priority = 1;
        let mut off = row("off", 50);
        off.enabled = false;
        off.priority = 99;
        insert_indexer(&pool, &lo).unwrap();
        insert_indexer(&pool, &hi).unwrap();
        insert_indexer(&pool, &off).unwrap();

        let conn = pool.get().unwrap();
        let ids: Vec<String> =
            enabled_indexers(&conn).unwrap().into_iter().map(|r| r.id).collect();
        assert_eq!(ids, vec!["hi", "lo"]);
    }

    #[test]
    fn update_is_partial_and_keeps_unspecified_fields() {
        let pool = test_pool();
        insert_indexer(&pool, &row("a", 100)).unwrap();

        let changed = update_indexer(
            &pool,
            "a",
            Some("Renamed"),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        assert!(changed);

        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().unwrap();
        assert_eq!(got.name, "Renamed");
        assert_eq!(got.api_key, "secret");
        assert_eq!(got.categories, vec![2000, 5000]);
        drop(conn);

        update_indexer(
            &pool,
            "a",
            None,
            Some("http://new.example"),
            Some("newkey"),
            Some(&[100, 200]),
            Some(false),
            Some(5),
            Some(r#"{"x":1}"#),
        )
        .unwrap();
        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().unwrap();
        assert_eq!(got.url, "http://new.example");
        assert_eq!(got.api_key, "newkey");
        assert_eq!(got.categories, vec![100, 200]);
        assert!(!got.enabled);
        assert_eq!(got.priority, 5);
        assert_eq!(got.settings, r#"{"x":1}"#);
    }

    #[test]
    fn update_missing_row_returns_false() {
        let pool = test_pool();
        let changed =
            update_indexer(&pool, "ghost", Some("x"), None, None, None, None, None, None).unwrap();
        assert!(!changed);
    }

    #[test]
    fn delete_removes_row_and_reports_hit_or_miss() {
        let pool = test_pool();
        insert_indexer(&pool, &row("a", 100)).unwrap();
        assert!(delete_indexer(&pool, "a").unwrap());
        assert!(!delete_indexer(&pool, "a").unwrap());
        let conn = pool.get().unwrap();
        assert!(get_indexer(&conn, "a").unwrap().is_none());
    }

    #[test]
    fn note_result_sets_ok_then_error_independently() {
        let pool = test_pool();
        insert_indexer(&pool, &row("a", 100)).unwrap();

        note_indexer_result(&pool, "a", true, None, 1234).unwrap();
        {
            let conn = pool.get().unwrap();
            let got = get_indexer(&conn, "a").unwrap().unwrap();
            assert_eq!(got.last_ok_at, Some(1234));
            assert!(got.last_error.is_none());
        }

        note_indexer_result(&pool, "a", false, Some("timeout"), 9999).unwrap();
        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().unwrap();
        assert_eq!(got.last_ok_at, Some(1234));
        assert_eq!(got.last_error.as_deref(), Some("timeout"));
    }

    #[test]
    fn categories_parsing_drops_blank_and_unparseable_entries() {
        let pool = test_pool();
        insert_indexer(&pool, &row("a", 100)).unwrap();
        {
            let conn = pool.get().unwrap();
            conn.execute(
                "UPDATE indexers SET categories = '2000, 5000 , junk, ' WHERE id = 'a'",
                [],
            )
            .unwrap();
        }
        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().unwrap();
        assert_eq!(got.categories, vec![2000, 5000]);
    }

    #[test]
    fn empty_categories_round_trip_to_empty_vec() {
        let pool = test_pool();
        let mut r = row("a", 100);
        r.categories = vec![];
        insert_indexer(&pool, &r).unwrap();
        let conn = pool.get().unwrap();
        let got = get_indexer(&conn, "a").unwrap().unwrap();
        assert!(got.categories.is_empty());
    }
}
