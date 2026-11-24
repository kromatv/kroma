use std::collections::HashSet;

use rusqlite::Params;

use crate::{Pool, Result};

pub(crate) struct Rewrite<'a> {
    pub table: &'a str,
    pub insert: &'a str,
    pub kept: &'a HashSet<String>,
}

pub(crate) fn rewrite<P: Params>(
    pool: &Pool,
    rewrite: Rewrite<'_>,
    rows: impl IntoIterator<Item = P>,
) -> Result<usize> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let clear = format!(
        "DELETE FROM {} WHERE library NOT IN (SELECT value FROM json_each(?1))",
        rewrite.table
    );
    tx.execute(&clear, [serde_json::to_string(rewrite.kept)?])?;
    let mut written = 0;
    {
        let mut insert = tx.prepare(rewrite.insert)?;
        for row in rows {
            written += insert.execute(row)?;
        }
    }
    tx.commit()?;
    Ok(written)
}
