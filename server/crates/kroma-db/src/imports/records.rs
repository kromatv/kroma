//! The record of what imports brought from a server: for each row of the other
//! server, the fingerprint it had when it was brought and what it became here.

use std::collections::HashMap;

use kroma_domain::imports::Kind;

use crate::{Pool, Result, params, query_by_subject_ids};

/// The rows of one kind brought from one server. `scope` narrows a kind whose
/// ids repeat: a watch state is its title's id under its user's.
#[derive(Debug, Clone, Copy)]
pub struct Ledger<'a> {
    pub server_id: &'a str,
    pub kind: Kind,
    pub scope: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Brought {
    pub fingerprint: String,
    pub target: Option<String>,
}

/// One row to record. No `target` keeps the one already recorded.
#[derive(Debug, Clone, Copy)]
pub struct Entry<'a> {
    pub id: &'a str,
    pub fingerprint: &'a str,
    pub target: Option<&'a str>,
}

/// What the record holds for `ids`, by id. An id it does not hold is absent.
pub fn brought(pool: &Pool, ledger: &Ledger<'_>, ids: &[&str]) -> Result<HashMap<String, Brought>> {
    let conn = pool.get()?;
    let rows = query_by_subject_ids(
        &conn,
        ledger.server_id,
        ids,
        &[ledger.kind.as_str(), ledger.scope],
        |placeholders| {
            format!(
                "SELECT source_id, fingerprint, target FROM import_records \
                 WHERE server_id = ? AND source_id IN ({placeholders}) AND kind = ? AND scope = ?"
            )
        },
        |r| {
            let brought = Brought {
                fingerprint: r.get(1)?,
                target: r.get(2)?,
            };
            Ok((r.get::<_, String>(0)?, brought))
        },
    )?;
    Ok(rows.into_iter().collect())
}

/// What every row of one kind became here, by the other server's id for it.
pub fn targets(pool: &Pool, server_id: &str, kind: Kind) -> Result<HashMap<String, String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT source_id, target FROM import_records \
         WHERE server_id = ?1 AND kind = ?2 AND target IS NOT NULL",
    )?;
    let rows = stmt.query_map(params![server_id, kind.as_str()], |r| {
        Ok((r.get(0)?, r.get(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Records `entries` as brought by `import_id`. An entry the record already
/// holds unchanged is not written again.
pub fn record(
    pool: &Pool,
    ledger: &Ledger<'_>,
    import_id: &str,
    entries: &[Entry<'_>],
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO import_records \
               (server_id, kind, scope, source_id, fingerprint, target, import_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(server_id, kind, scope, source_id) DO UPDATE SET \
               fingerprint = excluded.fingerprint, \
               target = COALESCE(excluded.target, import_records.target), \
               import_id = excluded.import_id \
             WHERE import_records.fingerprint <> excluded.fingerprint \
                OR (excluded.target IS NOT NULL \
                    AND excluded.target IS NOT import_records.target)",
        )?;
        for entry in entries {
            stmt.execute(params![
                ledger.server_id,
                ledger.kind.as_str(),
                ledger.scope,
                entry.id,
                entry.fingerprint,
                entry.target,
                import_id
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}
