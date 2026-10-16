use anyhow::{Context, Result};
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_scene::{CustomFormat, QualityProfile, Sizes};
use rusqlite::{params, OptionalExtension};

/// This module's own tables, applied to its private database.
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

pub(super) const SEEDED: &str = "seeded";
pub(super) const SIZES: &str = "sizes";
pub(super) const DEFAULT_PROFILE: &str = "default_profile";

pub fn setting(pool: &Pool, key: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            "SELECT value FROM rule_settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn set_setting(pool: &Pool, key: &str, value: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO rule_settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub(super) fn profiles(pool: &Pool) -> Result<Vec<QualityProfile>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT body FROM quality_profiles ORDER BY updated_at, id")?;
    let bodies = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(bodies
        .iter()
        .filter_map(|body| serde_json::from_str(body).ok())
        .collect())
}

pub fn save_profile(pool: &Pool, profile: &QualityProfile, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO quality_profiles (id, body, updated_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(id) DO UPDATE SET body = excluded.body",
        params![profile.id, serde_json::to_string(profile)?, now_ms],
    )?;
    Ok(())
}

/// Removes a profile; titles that named it fall back to the default.
pub fn delete_profile(pool: &Pool, id: &str) -> Result<bool> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM title_profiles WHERE profile_id = ?1",
        params![id],
    )?;
    let removed = tx.execute("DELETE FROM quality_profiles WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(removed > 0)
}

pub(super) fn formats(pool: &Pool) -> Result<Vec<CustomFormat>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT body FROM custom_formats ORDER BY position, id")?;
    let bodies = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(bodies
        .iter()
        .filter_map(|body| serde_json::from_str(body).ok())
        .collect())
}

pub fn save_format(pool: &Pool, format: &CustomFormat, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    let next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM custom_formats",
        [],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO custom_formats (id, body, position, updated_at) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
        params![format.id, serde_json::to_string(format)?, next, now_ms],
    )?;
    Ok(())
}

pub fn delete_format(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM custom_formats WHERE id = ?1", params![id])? > 0)
}

pub(super) fn sizes(pool: &Pool) -> Result<Option<Sizes>> {
    setting(pool, SIZES)?
        .map(|body| serde_json::from_str(&body).context("stored size limits do not parse"))
        .transpose()
}

pub fn save_sizes(pool: &Pool, sizes: &Sizes) -> Result<()> {
    set_setting(pool, SIZES, &serde_json::to_string(sizes)?)
}

pub fn title_profile(pool: &Pool, kind: RequestKind, tmdb_id: u64) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            "SELECT profile_id FROM title_profiles WHERE kind = ?1 AND tmdb_id = ?2",
            params![kind.as_str(), tmdb_id as i64],
            |r| r.get(0),
        )
        .optional()?)
}

/// Names the profile a title is judged by; `None` puts it back on the default.
pub fn set_title_profile(
    pool: &Pool,
    kind: RequestKind,
    tmdb_id: u64,
    profile_id: Option<&str>,
) -> Result<()> {
    let conn = pool.get()?;
    match profile_id {
        Some(id) => conn.execute(
            "INSERT INTO title_profiles (kind, tmdb_id, profile_id) VALUES (?1, ?2, ?3) \
             ON CONFLICT(kind, tmdb_id) DO UPDATE SET profile_id = excluded.profile_id",
            params![kind.as_str(), tmdb_id as i64, id],
        )?,
        None => conn.execute(
            "DELETE FROM title_profiles WHERE kind = ?1 AND tmdb_id = ?2",
            params![kind.as_str(), tmdb_id as i64],
        )?,
    };
    Ok(())
}

/// Remembers the release name an import placed a file under.
pub fn record_release(pool: &Pool, abs_path: &str, release_title: &str, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO file_releases (abs_path, release_title, imported_at) VALUES (?1, ?2, ?3) \
         ON CONFLICT(abs_path) DO UPDATE SET release_title = excluded.release_title, \
             imported_at = excluded.imported_at",
        params![abs_path, release_title, now_ms],
    )?;
    Ok(())
}

pub fn release_of(pool: &Pool, abs_path: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row(
            "SELECT release_title FROM file_releases WHERE abs_path = ?1",
            params![abs_path],
            |r| r.get(0),
        )
        .optional()?)
}

/// Marks a download as a copy to place beside what the title holds.
pub fn place_beside(pool: &Pool, download_id: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO beside_grabs (download_id) VALUES (?1)",
        params![download_id],
    )?;
    Ok(())
}

pub fn is_beside(pool: &Pool, download_id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM beside_grabs WHERE download_id = ?1)",
        params![download_id],
        |r| r.get(0),
    )?)
}

const UPGRADE_BASE_DELAY_MS: i64 = 12 * 60 * 60 * 1000;
const UPGRADE_MAX_DELAY_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Whether a title's next upgrade search is due: half a day after a search
/// that grabbed, doubling with each one that found nothing, at most a week.
pub fn upgrade_due(pool: &Pool, kind: RequestKind, tmdb_id: u64, now_ms: i64) -> Result<bool> {
    let conn = pool.get()?;
    let last: Option<(i64, i64)> = conn
        .query_row(
            "SELECT last_at, attempts FROM upgrade_searches WHERE kind = ?1 AND tmdb_id = ?2",
            params![kind.as_str(), tmdb_id as i64],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(last.is_none_or(|(at, attempts)| now_ms >= at + upgrade_delay(attempts)))
}

fn upgrade_delay(attempts: i64) -> i64 {
    let factor = 1i64 << attempts.clamp(0, 4);
    (UPGRADE_BASE_DELAY_MS * factor).min(UPGRADE_MAX_DELAY_MS)
}

/// Stamps an upgrade search; one that grabbed nothing stretches the next wait.
pub fn record_upgrade_search(
    pool: &Pool,
    title: &kroma_module_sdk::engine::model::MonitoredTitle,
    now_ms: i64,
    grabbed: bool,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO upgrade_searches (kind, tmdb_id, last_at, attempts) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(kind, tmdb_id) DO UPDATE SET last_at = excluded.last_at, \
             attempts = CASE WHEN ?4 = 0 THEN 0 ELSE upgrade_searches.attempts + 1 END",
        params![
            title.kind.as_str(),
            title.tmdb_id as i64,
            now_ms,
            i64::from(!grabbed)
        ],
    )?;
    Ok(())
}
