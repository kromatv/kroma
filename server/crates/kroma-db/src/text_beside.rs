//! The text a scan read from the `.nfo` file beside each title's files
//! (LIB-84). It is shown on a title the provider did not match, under what a
//! person wrote by hand ([`crate::title_edits`]).

use std::collections::{HashMap, HashSet};

use kroma_domain::title_edit::TitleEdit;

use crate::scanned::{self, Rewrite};
use crate::{Pool, Result};

const INSERT: &str = "INSERT OR REPLACE INTO text_beside \
                      (subject_kind, subject_id, library, nfo, modified, edit) \
                      VALUES (?1, ?2, ?3, ?4, ?5, ?6)";

/// One `.nfo` file a scan found beside a title's files: whose it is, where it
/// is on disk, and when it was last modified, in milliseconds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Nfo {
    pub subject_kind: &'static str,
    pub subject_id: String,
    pub library: String,
    pub path: String,
    pub modified: Option<i64>,
}

/// What a scan read from one [`Nfo`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Text {
    pub nfo: Nfo,
    pub edit: TitleEdit,
}

/// What an earlier scan read from a file, and when the file was modified then.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Read {
    pub modified: Option<i64>,
    pub edit: TitleEdit,
}

/// Replace what earlier scans read with `texts`. The libraries of `kept`,
/// whose folders a scan could not all read, keep what they held as well.
/// Returns how many texts were written.
pub fn replace(pool: &Pool, texts: &[Text], kept: &HashSet<String>) -> Result<usize> {
    let rows = texts
        .iter()
        .map(|Text { nfo, edit }| {
            let edit = serde_json::to_string(edit)?;
            Ok((
                nfo.subject_kind,
                &nfo.subject_id,
                &nfo.library,
                &nfo.path,
                nfo.modified,
                edit,
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let table = Rewrite {
        table: "text_beside",
        insert: INSERT,
        kept,
    };
    scanned::rewrite(pool, table, rows)
}

/// What earlier scans read, by the path of each file.
pub fn read_before(pool: &Pool) -> Result<HashMap<String, Read>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT nfo, modified, edit FROM text_beside")?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, String>(2)?)))?
        .collect::<rusqlite::Result<Vec<(String, Option<i64>, String)>>>()?;
    let read = rows.into_iter().filter_map(|(path, modified, edit)| {
        let edit = serde_json::from_str(&edit).ok()?;
        Some((path, Read { modified, edit }))
    });
    Ok(read.collect())
}

#[cfg(test)]
mod tests;
