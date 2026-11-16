use std::collections::BTreeMap;

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
    pub settings: BTreeMap<String, String>,
    pub enabled: bool,
    pub priority: i32,
    pub created_at: i64,
}

const CLIENT_COLS: &str =
    "id, kind, name, url, username, password, enabled, priority, created_at, settings";

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
        settings: serde_json::from_str(&r.get::<_, String>(9)?).unwrap_or_default(),
    })
}

pub fn list_download_clients(conn: &Connection) -> rusqlite::Result<Vec<DownloadClientRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CLIENT_COLS} FROM download_clients ORDER BY priority DESC, created_at"
    ))?;
    let rows = stmt.query_map([], row_to_client)?;
    rows.collect()
}

pub fn get_download_client(
    conn: &Connection,
    id: &str,
) -> rusqlite::Result<Option<DownloadClientRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CLIENT_COLS} FROM download_clients WHERE id = ?1"
    ))?;
    let mut rows = stmt.query_map(params![id], row_to_client)?;
    rows.next().transpose()
}

/// The enabled clients, in the order a grab tries them.
pub fn enabled_download_clients(conn: &Connection) -> rusqlite::Result<Vec<DownloadClientRow>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CLIENT_COLS} FROM download_clients WHERE enabled = 1 \
         ORDER BY priority DESC, created_at"
    ))?;
    let rows = stmt.query_map([], row_to_client)?;
    rows.collect()
}

pub fn insert_download_client(pool: &Pool, row: &DownloadClientRow) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO download_clients (id, kind, name, url, username, password, enabled, priority, created_at, settings) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![row.id, row.kind, row.name, row.url, row.username, row.password, row.enabled as i64, row.priority, row.created_at, serde_json::to_string(&row.settings)?],
    )?;
    Ok(())
}

/// One client's changes; a `None` keeps what is stored.
#[derive(Debug, Clone, Default)]
pub struct ClientChanges<'a> {
    pub name: Option<&'a str>,
    pub url: Option<&'a str>,
    pub username: Option<&'a str>,
    pub password: Option<&'a str>,
    pub settings: Option<&'a BTreeMap<String, String>>,
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
}

/// Applies `changes` to client `id`. A setting with an empty value keeps the
/// stored one, the way an empty password does, so a secret field stays write-only.
pub fn update_download_client(pool: &Pool, id: &str, changes: &ClientChanges) -> Result<bool> {
    let conn = pool.get()?;
    let settings = match changes.settings {
        Some(sent) => {
            let mut kept = get_download_client(&conn, id)?
                .map(|row| row.settings)
                .unwrap_or_default();
            for (key, value) in sent.iter().filter(|(_, v)| !v.is_empty()) {
                kept.insert(key.clone(), value.clone());
            }
            Some(serde_json::to_string(&kept)?)
        }
        None => None,
    };
    let n = conn.execute(
        "UPDATE download_clients SET \
            name = COALESCE(?2, name), \
            url = COALESCE(?3, url), \
            username = COALESCE(?4, username), \
            password = COALESCE(?5, password), \
            enabled = COALESCE(?6, enabled), \
            priority = COALESCE(?7, priority), \
            settings = COALESCE(?8, settings) \
         WHERE id = ?1",
        params![
            id,
            changes.name,
            changes.url,
            changes.username,
            changes.password,
            changes.enabled.map(|e| e as i64),
            changes.priority,
            settings
        ],
    )?;
    Ok(n > 0)
}

pub fn delete_download_client(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM download_clients WHERE id = ?1", params![id])? > 0)
}

#[cfg(test)]
mod tests;
