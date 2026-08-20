//! Reading an id list back in batches SQLite can bind.

use anyhow::Result;
use rusqlite::{Connection, Row};

/// Chunk size for `IN (...)` id lists: comfortably under SQLite's bound-variable
/// limit while keeping the query count per batch effectively constant.
pub(crate) const IN_CHUNK: usize = 800;

/// Run a `subject_kind = ? AND subject_id IN (…)` lookup over `ids` in
/// [`IN_CHUNK`]-sized batches, prepending `kind` to each chunk's bound params.
/// `build_sql` receives the `?,?,…` placeholder list and returns the full
/// statement; `map` turns each row into a `T`. Rows come back flat in DB order,
/// for the caller to fold into whatever shape it needs (the shared scaffold
/// behind `metadata_core::get_cores` and the `translations` loader).
pub(crate) fn query_by_subject_ids<T>(
    conn: &Connection,
    kind: &str,
    ids: &[&str],
    build_sql: impl Fn(&str) -> String,
    mut map: impl FnMut(&Row) -> rusqlite::Result<T>,
) -> Result<Vec<T>> {
    let mut out = Vec::new();
    for chunk in ids.chunks(IN_CHUNK) {
        let ph = vec!["?"; chunk.len()].join(",");
        let mut stmt = conn.prepare(&build_sql(&ph))?;
        let params_iter = std::iter::once(kind).chain(chunk.iter().copied());
        let rows = stmt.query_map(rusqlite::params_from_iter(params_iter), &mut map)?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
}
