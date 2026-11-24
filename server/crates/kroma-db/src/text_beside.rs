//! The text a scan read from the `.nfo` file beside each title's files
//! (LIB-84). It is shown on a title the provider did not match, under what a
//! person wrote by hand ([`crate::title_edits`]). The TMDB id a file names
//! (LIB-85) is what matching takes for the title, behind the ids a person, an
//! acquisition or an import gave it.

use std::collections::{HashMap, HashSet};

use kroma_domain::title_edit::TitleEdit;
use rusqlite::OptionalExtension;

use crate::scanned::{self, Rewrite};
use crate::{Connection, Pool, Result, params};

const INSERT: &str = "INSERT OR REPLACE INTO text_beside \
                      (subject_kind, subject_id, library, nfo, modified, edit, tmdb_id) \
                      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";
const LEADS: &str = "SELECT subject_id, tmdb_id FROM text_beside \
                     WHERE subject_kind = ?1 AND tmdb_id > 0";

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

/// What a scan read from one [`Nfo`]: its text, and the TMDB id it names.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Text {
    pub nfo: Nfo,
    pub edit: TitleEdit,
    pub tmdb: Option<u64>,
}

/// What an earlier scan read from a file, and when the file was modified then.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Read {
    pub modified: Option<i64>,
    pub edit: TitleEdit,
    pub tmdb: Option<u64>,
}

/// Replace what earlier scans read with `texts`. The libraries of `kept`,
/// whose folders a scan could not all read, keep what they held as well.
/// Returns how many texts were written.
pub fn replace(pool: &Pool, texts: &[Text], kept: &HashSet<String>) -> Result<usize> {
    let rows = texts
        .iter()
        .map(|Text { nfo, edit, tmdb }| {
            let edit = serde_json::to_string(edit)?;
            Ok((
                nfo.subject_kind,
                &nfo.subject_id,
                &nfo.library,
                &nfo.path,
                nfo.modified,
                edit,
                tmdb.and_then(|id| i64::try_from(id).ok()),
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
    let mut stmt = conn.prepare("SELECT nfo, modified, edit, tmdb_id FROM text_beside")?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get::<_, String>(2)?, r.get(3)?))
        })?
        .collect::<rusqlite::Result<Vec<(String, Option<i64>, String, Option<i64>)>>>()?;
    let read = rows.into_iter().filter_map(|(path, modified, edit, tmdb)| {
        let edit = serde_json::from_str(&edit).ok()?;
        let tmdb = tmdb.and_then(|id| u64::try_from(id).ok());
        Some((
            path,
            Read {
                modified,
                edit,
                tmdb,
            },
        ))
    });
    Ok(read.collect())
}

/// The TMDB id the file beside each title of `kind` names, by the title's id.
pub fn leads(pool: &Pool, kind: &str) -> Result<HashMap<String, u64>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(LEADS)?;
    let rows = stmt.query_map(params![kind], |r| Ok((r.get(0)?, r.get::<_, i64>(1)?)))?;
    let mut leads = HashMap::new();
    for row in rows {
        let (id, tmdb): (String, i64) = row?;
        leads.extend(u64::try_from(tmdb).ok().map(|tmdb| (id, tmdb)));
    }
    Ok(leads)
}

/// The TMDB id the file beside one title names.
pub fn lead(conn: &Connection, kind: &str, id: &str) -> rusqlite::Result<Option<u64>> {
    let one = format!("{LEADS} AND subject_id = ?2");
    let found = conn
        .query_row(&one, params![kind, id], |r| r.get::<_, i64>(1))
        .optional()?;
    Ok(found.and_then(|tmdb| u64::try_from(tmdb).ok()))
}

#[cfg(test)]
mod tests;
