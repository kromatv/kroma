use anyhow::Result;
use rusqlite::{params, Connection, Row};

use super::Pool;

/// A stored download-client row (full, including the secret; internal only).
#[derive(Debug, Clone)]
pub struct DownloadClientRow {
    pub id: String,
    // `rqbit` | `transmission` | `qbittorrent`.
    pub kind: String,
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub enabled: bool,
    pub priority: i32,
    pub created_at: i64,
}

const CLIENT_COLS: &str = "id, kind, name, url, username, password, enabled, priority, created_at";

fn row_to_client(r: &Row) -> rusqlite::Result<DownloadClientRow> {
    Ok(DownloadClientRow {
        id: r.get(0)?,
        kind: r.get(1)?,
        name: r.get(2)?,
        url: r.get(3)?,
        username: r.get(4)?,
        password: r.get(5)?,
        enabled: r.get::<_, i64>(6)? != 0,
        priority: r.get(7)?,
        created_at: r.get(8)?,
    })
}

pub fn list_download_clients(conn: &Connection) -> rusqlite::Result<Vec<DownloadClientRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CLIENT_COLS} FROM download_clients ORDER BY priority DESC, created_at"
    ))?;
    let rows = stmt.query_map([], row_to_client)?;
    rows.collect()
}

pub fn get_download_client(conn: &Connection, id: &str) -> rusqlite::Result<Option<DownloadClientRow>> {
    let mut stmt = conn.prepare(&format!("SELECT {CLIENT_COLS} FROM download_clients WHERE id = ?1"))?;
    let mut rows = stmt.query_map(params![id], row_to_client)?;
    rows.next().transpose()
}

/// The engine a new grab goes to: first enabled by priority.
pub fn preferred_download_client(conn: &Connection) -> rusqlite::Result<Option<DownloadClientRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CLIENT_COLS} FROM download_clients WHERE enabled = 1 \
         ORDER BY priority DESC, created_at LIMIT 1"
    ))?;
    let mut rows = stmt.query_map([], row_to_client)?;
    rows.next().transpose()
}

pub fn insert_download_client(pool: &Pool, row: &DownloadClientRow) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO download_clients (id, kind, name, url, username, password, enabled, priority, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![row.id, row.kind, row.name, row.url, row.username, row.password, row.enabled as i64, row.priority, row.created_at],
    )?;
    Ok(())
}

/// Partial update; `password = None` keeps the stored secret.
#[allow(clippy::too_many_arguments)]
pub fn update_download_client(
    pool: &Pool,
    id: &str,
    name: Option<&str>,
    url: Option<&str>,
    username: Option<&str>,
    password: Option<&str>,
    enabled: Option<bool>,
    priority: Option<i32>,
) -> Result<bool> {
    let conn = pool.get()?;
    let n = conn.execute(
        "UPDATE download_clients SET \
            name = COALESCE(?2, name), \
            url = COALESCE(?3, url), \
            username = COALESCE(?4, username), \
            password = COALESCE(?5, password), \
            enabled = COALESCE(?6, enabled), \
            priority = COALESCE(?7, priority) \
         WHERE id = ?1",
        params![id, name, url, username, password, enabled.map(|e| e as i64), priority],
    )?;
    Ok(n > 0)
}

pub fn delete_download_client(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM download_clients WHERE id = ?1", params![id])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::test_support::{client, test_db};

    #[test]
    fn download_clients_crud_and_ordering() {
        let pool = test_db();
        {
            let conn = pool.get().unwrap();
            // Empty DB: nothing to list / find / prefer.
            assert!(list_download_clients(&conn).unwrap().is_empty());
            assert!(get_download_client(&conn, "c1").unwrap().is_none());
            assert!(preferred_download_client(&conn).unwrap().is_none());
        }

        insert_download_client(&pool, &client("c1", 10, true, 100)).unwrap();
        insert_download_client(&pool, &client("c2", 20, true, 200)).unwrap();
        insert_download_client(&pool, &client("c3", 20, false, 150)).unwrap();

        {
            let conn = pool.get().unwrap();
            // ORDER BY priority DESC, created_at ASC: c3 (20,150), c2 (20,200), c1 (10).
            let ids: Vec<String> =
                list_download_clients(&conn).unwrap().into_iter().map(|c| c.id).collect();
            assert_eq!(ids, vec!["c3".to_string(), "c2".to_string(), "c1".to_string()]);

            let c2 = get_download_client(&conn, "c2").unwrap().unwrap();
            assert_eq!(c2.name, "Client c2");
            assert_eq!(c2.password, "secret");
            assert!(get_download_client(&conn, "missing").unwrap().is_none());

            // Preferred = first ENABLED by priority (disabled c3 is skipped).
            assert_eq!(preferred_download_client(&conn).unwrap().unwrap().id, "c2");
        }

        // INSERT OR IGNORE: re-inserting an existing id keeps the original row.
        insert_download_client(&pool, &client("c1", 99, false, 999)).unwrap();
        {
            let conn = pool.get().unwrap();
            let c1 = get_download_client(&conn, "c1").unwrap().unwrap();
            assert_eq!(c1.priority, 10);
            assert_eq!(c1.name, "Client c1");
        }

        // Partial update: name/enabled/priority change; password None keeps the secret.
        assert!(update_download_client(
            &pool,
            "c1",
            Some("Renamed"),
            None,
            None,
            None,
            Some(false),
            Some(50),
        )
        .unwrap());
        {
            let conn = pool.get().unwrap();
            let c1 = get_download_client(&conn, "c1").unwrap().unwrap();
            assert_eq!(c1.name, "Renamed");
            assert!(!c1.enabled);
            assert_eq!(c1.priority, 50);
            assert_eq!(c1.password, "secret"); // unchanged
            assert_eq!(c1.url, "http://host"); // unchanged
        }
        // Password can be updated when Some is passed.
        assert!(update_download_client(&pool, "c1", None, None, None, Some("newpass"), None, None)
            .unwrap());
        {
            let conn = pool.get().unwrap();
            assert_eq!(get_download_client(&conn, "c1").unwrap().unwrap().password, "newpass");
        }
        // Updating an unknown id affects no rows.
        assert!(!update_download_client(&pool, "missing", Some("x"), None, None, None, None, None)
            .unwrap());

        assert!(delete_download_client(&pool, "c1").unwrap());
        assert!(!delete_download_client(&pool, "c1").unwrap()); // already gone
        {
            let conn = pool.get().unwrap();
            assert!(get_download_client(&conn, "c1").unwrap().is_none());
        }
    }

    #[test]
    fn a_client_update_the_database_refuses_surfaces_instead_of_reading_as_no_such_row() {
        let pool = test_db();
        insert_download_client(&pool, &client("a", 0, true, 100)).unwrap();
        pool.get()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER refuse_client BEFORE UPDATE ON download_clients \
                 BEGIN SELECT RAISE(ABORT, 'read only'); END",
            )
            .unwrap();

        let err = update_download_client(&pool, "a", Some("x"), None, None, None, None, None)
            .unwrap_err()
            .to_string();

        assert!(err.contains("read only"), "{err}");
    }
}
