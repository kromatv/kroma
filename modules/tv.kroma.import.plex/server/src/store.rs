//! What the importer keeps, in its own database: the sign-ins, and what each
//! one opens. Nothing here is in the core database, so removing the module
//! removes every token (MOD-106).

mod pending;
mod readers;
mod sign_ins;

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::primitives::random_token;

pub(crate) use pending::{drop_pending, open_pending, pending, sweep_pending, Pending};
pub(crate) use readers::{keep_readers, keep_unlocked, reader_token, unlocked};
pub(crate) use sign_ins::{
    forget, keep_sign_in, server, servers, set_route, sign_in, Finished, ServerRow, SignIn,
};

pub(crate) const MIGRATIONS: &str = "
    CREATE TABLE IF NOT EXISTS client (
        id TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS pending (
        id         TEXT PRIMARY KEY,
        pin_id     INTEGER NOT NULL,
        code       TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        sign_in    TEXT
    );
    CREATE TABLE IF NOT EXISTS sign_ins (
        id         TEXT PRIMARY KEY,
        token      TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS servers (
        sign_in TEXT NOT NULL,
        id      TEXT NOT NULL,
        name    TEXT NOT NULL,
        token   TEXT NOT NULL,
        address TEXT,
        route   TEXT,
        PRIMARY KEY (sign_in, id)
    );
    CREATE TABLE IF NOT EXISTS readers (
        sign_in TEXT NOT NULL,
        server  TEXT NOT NULL,
        user    TEXT NOT NULL,
        token   TEXT NOT NULL,
        PRIMARY KEY (sign_in, server, user)
    );
    CREATE TABLE IF NOT EXISTS unlocked (
        sign_in TEXT NOT NULL,
        server  TEXT NOT NULL,
        user    TEXT NOT NULL,
        token   TEXT NOT NULL,
        PRIMARY KEY (sign_in, server, user)
    );
";

#[derive(Debug, Clone, Copy)]
pub(crate) struct ServerKey<'a> {
    pub sign_in: &'a str,
    pub server: &'a str,
}

/// The identifier plex.tv knows this install by, made once and kept.
pub(crate) fn client_id(pool: &Pool) -> Result<String> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO client (id) SELECT ?1 WHERE NOT EXISTS (SELECT 1 FROM client)",
        [random_token()],
    )?;
    Ok(
        conn.query_row("SELECT id FROM client ORDER BY rowid LIMIT 1", (), |row| {
            row.get(0)
        })?,
    )
}

#[cfg(test)]
mod tests;
