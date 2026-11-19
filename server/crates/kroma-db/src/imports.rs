//! Persistence for imports of another media server: the servers read, each
//! import's own row, and the record of what was brought from which server. A
//! time is epoch milliseconds unless its name says otherwise.

mod catalogue;
mod folders;
mod newcomers;
mod passes;
mod records;
mod states;
mod titles;

#[cfg(test)]
mod tests;

pub use catalogue::*;
pub use folders::*;
pub use newcomers::*;
pub use passes::*;
pub use records::*;
pub(crate) use states::release_held_states;
pub use states::{merge_states, Merged, Place};
pub use titles::*;

use kroma_domain::imports::{Failure, FailureReason, Import, Origin, Report, Selection, Status};
use rusqlite::OptionalExtension;
use serde::de::DeserializeOwned;

use super::{Connection, Pool, Result, Row, params};

const COLS: &str = "i.id, s.importer, s.server, s.name, i.sign_in, i.selection, i.started_by, \
    i.status, i.run_id, i.created_at, i.started_at, i.finished_at, i.report, i.failure, \
    (SELECT COUNT(*) FROM import_unmatched u WHERE u.import_id = i.id)";

const FROM: &str = "FROM imports i JOIN import_servers s ON s.id = i.server_id";

fn stored<T: DeserializeOwned + Default>(text: &str) -> T {
    serde_json::from_str(text).unwrap_or_default()
}

fn row_to_import(r: &Row) -> rusqlite::Result<Import> {
    let selection: String = r.get(5)?;
    let status: String = r.get(7)?;
    let report: String = r.get(12)?;
    let failure: Option<String> = r.get(13)?;
    let unmatched_titles: i64 = r.get(14)?;
    Ok(Import {
        id: r.get(0)?,
        importer: r.get(1)?,
        server: Origin {
            id: r.get(2)?,
            name: r.get(3)?,
        },
        sign_in: r.get(4)?,
        selection: stored(&selection),
        started_by: r.get(6)?,
        status: status.parse().unwrap_or(Status::Failed),
        run_id: r.get(8)?,
        created_at: r.get(9)?,
        started_at: r.get(10)?,
        finished_at: r.get(11)?,
        report: stored(&report),
        unmatched_titles: unmatched_titles.max(0) as u64,
        failure: failure.and_then(|text| serde_json::from_str(&text).ok()),
    })
}

fn read(conn: &Connection, id: &str) -> Result<Option<Import>> {
    let import = conn
        .query_row(
            &format!("SELECT {COLS} {FROM} WHERE i.id = ?1"),
            [id],
            row_to_import,
        )
        .optional()?;
    Ok(import)
}

/// The key of one server of one importer in `import_servers`. It is derived
/// from the two ids, so the same server has the same key on every machine.
pub fn server_key(importer: &str, server: &str) -> String {
    kroma_primitives::short_hash(&format!("{}|{importer}|{server}", importer.len()))
}

/// An import to queue: the server it reads, the importer's reference to the
/// sign-in it keeps, and what the owner kept on the review screen.
pub struct NewImport<'a> {
    pub id: &'a str,
    pub importer: &'a str,
    pub server: &'a Origin,
    pub sign_in: &'a str,
    pub selection: &'a Selection,
    pub started_by: Option<&'a str>,
    pub created_ms: i64,
}

/// Queues an import and remembers its server. False, with nothing written, when
/// another import is queued or running: one runs at a time.
pub fn queue(pool: &Pool, new: &NewImport<'_>) -> Result<bool> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let server_id = server_key(new.importer, &new.server.id);
    tx.execute(
        "INSERT INTO import_servers (id, importer, server, name) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET name = excluded.name WHERE excluded.name <> ''",
        params![server_id, new.importer, new.server.id, new.server.name],
    )?;
    let queued = tx.execute(
        "INSERT INTO imports (id, server_id, sign_in, selection, started_by, status, created_at) \
         SELECT ?1, ?2, ?3, ?4, ?5, 'queued', ?6 \
         WHERE NOT EXISTS (SELECT 1 FROM imports WHERE status IN ('queued', 'running'))",
        params![
            new.id,
            server_id,
            new.sign_in,
            serde_json::to_string(new.selection)?,
            new.started_by,
            new.created_ms
        ],
    )?;
    if queued == 1 {
        tx.commit()?;
    }
    Ok(queued == 1)
}

/// Takes back an import that never started. False when a run has claimed it.
pub fn withdraw(pool: &Pool, id: &str) -> Result<bool> {
    let withdrawn = pool.get()?.execute(
        "DELETE FROM imports WHERE id = ?1 AND status = 'queued'",
        [id],
    )?;
    Ok(withdrawn == 1)
}

/// Hands the queued import to the job run `run_id` and marks it running. `None`
/// when no import is queued.
pub fn claim(pool: &Pool, run_id: &str, now_ms: i64) -> Result<Option<Import>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let queued: Option<String> = tx
        .query_row(
            "SELECT id FROM imports WHERE status = 'queued' ORDER BY created_at LIMIT 1",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let Some(id) = queued else {
        return Ok(None);
    };
    tx.execute(
        "UPDATE imports SET status = 'running', run_id = ?2, started_at = ?3 WHERE id = ?1",
        params![id, run_id, now_ms],
    )?;
    let import = read(&tx, &id)?;
    tx.commit()?;
    Ok(import)
}

/// Keeps the report of an import that is still running, so a reader sees how
/// far it is.
pub fn save_report(pool: &Pool, id: &str, report: &Report) -> Result<()> {
    pool.get()?.execute(
        "UPDATE imports SET report = ?2 WHERE id = ?1",
        params![id, serde_json::to_string(report)?],
    )?;
    Ok(())
}

/// How an import ended.
pub struct Ending<'a> {
    pub status: Status,
    pub failure: Option<&'a Failure>,
    pub report: &'a Report,
    pub finished_ms: i64,
}

pub fn finish(pool: &Pool, id: &str, ending: &Ending<'_>) -> Result<()> {
    let failure = ending.failure.map(serde_json::to_string).transpose()?;
    pool.get()?.execute(
        "UPDATE imports SET status = ?2, failure = ?3, report = ?4, finished_at = ?5 WHERE id = ?1",
        params![
            id,
            ending.status.as_str(),
            failure,
            serde_json::to_string(ending.report)?,
            ending.finished_ms
        ],
    )?;
    Ok(())
}

/// Ends every import a restart cut short as failed, keeping what it had
/// brought. Returns how many there were.
pub fn fail_interrupted(pool: &Pool, now_ms: i64) -> Result<usize> {
    let failure = Failure {
        reason: FailureReason::Interrupted,
        message: None,
    };
    let ended = pool.get()?.execute(
        "UPDATE imports SET status = 'failed', failure = ?1, finished_at = ?2 \
         WHERE status IN ('queued', 'running')",
        params![serde_json::to_string(&failure)?, now_ms],
    )?;
    Ok(ended)
}

/// Drops the reference to a sign-in the importer no longer keeps from every
/// import that holds it. Returns how many held it.
pub fn forget_sign_in(pool: &Pool, importer: &str, sign_in: &str) -> Result<usize> {
    let forgotten = pool.get()?.execute(
        "UPDATE imports SET sign_in = NULL WHERE sign_in = ?2 \
           AND server_id IN (SELECT id FROM import_servers WHERE importer = ?1)",
        params![importer, sign_in],
    )?;
    Ok(forgotten)
}

pub fn get(pool: &Pool, id: &str) -> Result<Option<Import>> {
    let conn = pool.get()?;
    read(&conn, id)
}

/// Newest first.
pub fn list(pool: &Pool, limit: usize) -> Result<Vec<Import>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} {FROM} ORDER BY i.created_at DESC, i.id LIMIT ?1"
    ))?;
    let rows = stmt.query_map([limit as i64], row_to_import)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Drops all but the newest `keep` imports, each with its list of unmatched
/// titles. The record of what they brought stays.
pub fn prune(pool: &Pool, keep: usize) -> Result<()> {
    pool.get()?.execute(
        "DELETE FROM imports WHERE id NOT IN \
         (SELECT id FROM imports ORDER BY created_at DESC, id LIMIT ?1)",
        [keep as i64],
    )?;
    Ok(())
}
