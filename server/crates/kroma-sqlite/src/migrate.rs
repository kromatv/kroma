//! Versioned migrations keyed on `PRAGMA user_version`: a fresh file starts from
//! a baseline, every later change is a numbered step, and an up-to-date database
//! costs one read of its header.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use rusqlite::Connection;

/// What a [`Step`] runs, inside the transaction that also records its version.
pub enum Run {
    Sql(&'static str),
    Code(fn(&Connection) -> rusqlite::Result<()>),
}

/// One change to a schema, applied once and never edited after it ships.
pub struct Step {
    pub name: &'static str,
    pub run: Run,
    /// Turns foreign keys off around the step and checks them before it
    /// commits: SQLite ignores the pragma inside a transaction, and rebuilding a
    /// table drops it while other tables still point at it.
    pub rebuilds: bool,
}

/// A database's whole history: the shape a new file starts from, the version
/// that shape stands for, and every step since.
pub struct Schema {
    /// Names the database in an error, "the core database" or a module's id.
    pub name: &'static str,
    pub baseline: &'static str,
    pub baseline_version: u32,
    pub steps: &'static [Step],
    /// Brings a database written before versioning existed (tables present,
    /// `user_version` still 0) up to the baseline. `None` refuses such a file.
    pub legacy: Option<fn(&Connection) -> Result<()>>,
}

impl Schema {
    /// The version a database holds once every step has run.
    pub fn latest(&self) -> u32 {
        self.baseline_version + self.steps.len() as u32
    }
}

/// What [`migrate`] found and did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Migrated {
    Current,
    Created,
    Upgraded { from: u32, to: u32 },
}

/// Brings the database behind `conn` to `schema.latest()`.
///
/// A database already there is left untouched. One written by a newer build is
/// refused rather than read with the wrong shape. Before upgrading an existing
/// file, `path` (when given) is copied beside it with `VACUUM INTO`, keeping the
/// last [`KEPT_SNAPSHOTS`]; a copy that cannot be made is logged and the upgrade
/// goes on, so a full disk does not stop the server from starting.
pub fn migrate(conn: &mut Connection, schema: &Schema, path: Option<&Path>) -> Result<Migrated> {
    let latest = schema.latest();
    let found = user_version(conn)?;
    if found == latest {
        return Ok(Migrated::Current);
    }
    if found > latest {
        bail!(
            "{} is at schema version {found}, written by a newer KROMA than this one \
             (which knows up to {latest}); update KROMA, or restore a backup this version made",
            schema.name
        );
    }
    if found == 0 && !has_tables(conn)? {
        create(conn, schema)?;
        apply_steps(conn, schema, schema.baseline_version)?;
        return Ok(Migrated::Created);
    }
    if let Some(path) = path {
        snapshot(conn, path, found);
    }
    let from = if found == 0 {
        let legacy = schema
            .legacy
            .with_context(|| format!("{} has tables but no schema version", schema.name))?;
        legacy(conn)
            .with_context(|| format!("{} could not adopt its legacy schema", schema.name))?;
        conn.pragma_update(None, "user_version", schema.baseline_version)?;
        schema.baseline_version
    } else if found < schema.baseline_version {
        bail!(
            "{} is at schema version {found}, older than this KROMA can upgrade from \
             ({}); open it with an earlier release first",
            schema.name,
            schema.baseline_version
        );
    } else {
        found
    };
    apply_steps(conn, schema, from)?;
    Ok(Migrated::Upgraded {
        from: found,
        to: latest,
    })
}

/// How many pre-upgrade copies [`migrate`] keeps beside a database.
pub const KEPT_SNAPSHOTS: usize = 2;

/// The database's `PRAGMA user_version`, the schema version [`migrate`] keeps.
pub fn user_version(conn: &Connection) -> Result<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

fn has_tables(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%')",
        [],
        |r| r.get(0),
    )?)
}

fn create(conn: &mut Connection, schema: &Schema) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute_batch(schema.baseline)
        .with_context(|| format!("{} could not create its baseline", schema.name))?;
    tx.pragma_update(None, "user_version", schema.baseline_version)?;
    tx.commit()?;
    Ok(())
}

fn apply_steps(conn: &mut Connection, schema: &Schema, from: u32) -> Result<()> {
    let done = (from - schema.baseline_version) as usize;
    for (at, step) in schema.steps.iter().enumerate().skip(done) {
        let version = schema.baseline_version + at as u32 + 1;
        apply(conn, step, version)
            .with_context(|| format!("{} step {version} ({}) failed", schema.name, step.name))?;
    }
    Ok(())
}

fn apply(conn: &mut Connection, step: &Step, version: u32) -> Result<()> {
    if step.rebuilds {
        conn.execute_batch("PRAGMA foreign_keys = OFF")?;
    }
    let applied = run(conn, step, version);
    if step.rebuilds {
        conn.execute_batch("PRAGMA foreign_keys = ON")?;
    }
    applied
}

fn run(conn: &mut Connection, step: &Step, version: u32) -> Result<()> {
    let tx = conn.transaction()?;
    match step.run {
        Run::Sql(sql) => tx.execute_batch(sql)?,
        Run::Code(code) => code(&tx)?,
    }
    if step.rebuilds {
        let broken: i64 =
            tx.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
                r.get(0)
            })?;
        if broken > 0 {
            bail!("{broken} rows point at a row the step removed");
        }
    }
    tx.pragma_update(None, "user_version", version)?;
    tx.commit()?;
    Ok(())
}

fn snapshot(conn: &Connection, path: &Path, version: u32) {
    let target = snapshot_path(path, version);
    let _ = std::fs::remove_file(&target);
    match conn.execute("VACUUM INTO ?1", [target.to_string_lossy()]) {
        Ok(_) => prune_snapshots(path),
        Err(e) => tracing::warn!(
            "no copy of {} was kept before upgrading it: {e}",
            path.display()
        ),
    }
}

fn snapshot_path(path: &Path, version: u32) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".pre-v{version}"));
    path.with_file_name(name)
}

fn prune_snapshots(path: &Path) {
    let Some(dir) = path.parent() else { return };
    let prefix = format!(
        "{}.pre-v",
        path.file_name().unwrap_or_default().to_string_lossy()
    );
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut copies: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    copies.sort_by_key(|copy| std::cmp::Reverse(copy.0));
    for (_, stale) in copies.into_iter().skip(KEPT_SNAPSHOTS) {
        let _ = std::fs::remove_file(stale);
    }
}

#[cfg(test)]
mod tests;
