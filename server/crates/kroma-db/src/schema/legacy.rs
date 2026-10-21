//! Databases written before the schema was versioned: the old schema batch and
//! migration list, run once to bring such a file up to the baseline.

use anyhow::{Context, Result};
use rusqlite::Connection;

use super::{titled_wanted, MIGRATIONS, SCHEMA};

const ALREADY_APPLIED: &[&str] = &[
    "duplicate column name",
    "already exists",
    "no such column",
    "no such table",
    "no such index",
];

pub(super) fn adopt(conn: &Connection) -> Result<()> {
    conn.execute_batch(SCHEMA)
        .context("failed to apply schema")?;
    for sql in MIGRATIONS {
        run(conn, sql);
    }
    if let Err(e) = titled_wanted::apply(conn) {
        tracing::error!("the wanted ledger could not move to one row per title: {e}");
    }
    Ok(())
}

pub(super) fn replay_data(conn: &Connection) {
    for sql in MIGRATIONS.iter().filter(|sql| moves_data(sql)) {
        run(conn, sql);
    }
}

fn run(conn: &Connection, sql: &str) {
    let Err(e) = conn.execute(sql, []) else {
        return;
    };
    let message = e.to_string();
    if !ALREADY_APPLIED.iter().any(|known| message.contains(known)) {
        let statement = sql.split_whitespace().take(6).collect::<Vec<_>>().join(" ");
        tracing::warn!("a legacy migration did not apply ({statement} ...): {message}");
    }
}

fn moves_data(sql: &str) -> bool {
    let head = sql.trim_start().to_ascii_uppercase();
    ["INSERT", "UPDATE", "DELETE"]
        .iter()
        .any(|verb| head.starts_with(verb))
}
