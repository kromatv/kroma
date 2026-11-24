//! The text a scan read from the `.nfo` file beside each title's files
//! (LIB-84). It is shown over the provider's text, under what a person wrote
//! by hand ([`crate::title_edits`]). The TMDB id a file names (LIB-85) is what
//! matching takes for the title, behind the ids a person, an acquisition or an
//! import gave it. A file that names only an IMDb or a TheTVDB id (LIB-92)
//! leads to the TMDB id TMDB answers for it, kept here once asked.

use std::collections::{HashMap, HashSet};

use kroma_domain::title_edit::TitleEdit;
use rusqlite::{OptionalExtension, Row};

use crate::imports::{Elsewhere, Lead};
use crate::scanned::{self, Rewrite};
use crate::{Connection, Pool, Result, params};

const INSERT: &str = "INSERT OR REPLACE INTO text_beside \
                      (subject_kind, subject_id, library, nfo, modified, edit, tmdb_id, \
                       imdb_id, tvdb_id) \
                      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)";
const LEADS: &str = "SELECT subject_id, tmdb_id, imdb_id, tvdb_id FROM text_beside \
                     WHERE subject_kind = ?1 \
                       AND (tmdb_id > 0 OR (tmdb_id IS NULL \
                            AND (imdb_id IS NOT NULL OR tvdb_id IS NOT NULL)))";
const NO_TITLE_FOUND: i64 = 0;

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

/// What a scan read from one [`Nfo`]: its text, the TMDB id it names, and
/// its ids in the catalogues TMDB can be asked by.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Text {
    pub nfo: Nfo,
    pub edit: TitleEdit,
    pub tmdb: Option<u64>,
    pub elsewhere: Elsewhere,
}

/// What an earlier scan read from a file, and when the file was modified then.
/// `tmdb` is also the id TMDB answered for `elsewhere`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Read {
    pub modified: Option<i64>,
    pub edit: TitleEdit,
    pub tmdb: Option<u64>,
    pub elsewhere: Elsewhere,
}

fn stored(id: Option<u64>) -> Option<i64> {
    id.and_then(|id| i64::try_from(id).ok())
}

fn loaded(id: Option<i64>) -> Option<u64> {
    id.and_then(|id| u64::try_from(id).ok())
}

/// Replace what earlier scans read with `texts`. The libraries of `kept`,
/// whose folders a scan could not all read, keep what they held as well.
/// Returns how many texts were written.
pub fn replace(pool: &Pool, texts: &[Text], kept: &HashSet<String>) -> Result<usize> {
    let rows = texts
        .iter()
        .map(|text| {
            let Text {
                nfo,
                tmdb,
                elsewhere,
                ..
            } = text;
            Ok((
                nfo.subject_kind,
                &nfo.subject_id,
                &nfo.library,
                &nfo.path,
                nfo.modified,
                serde_json::to_string(&text.edit)?,
                stored(*tmdb),
                &elsewhere.imdb,
                stored(elsewhere.tvdb),
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

fn read_row(r: &Row) -> rusqlite::Result<(String, Option<Read>)> {
    let edit: String = r.get(2)?;
    let (modified, tmdb) = (r.get(1)?, loaded(r.get(3)?));
    let elsewhere = Elsewhere {
        imdb: r.get(4)?,
        tvdb: loaded(r.get(5)?),
    };
    let read = serde_json::from_str(&edit).ok().map(|edit| Read {
        modified,
        edit,
        tmdb,
        elsewhere,
    });
    Ok((r.get(0)?, read))
}

/// What earlier scans read, by the path of each file.
pub fn read_before(pool: &Pool) -> Result<HashMap<String, Read>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT nfo, modified, edit, tmdb_id, imdb_id, tvdb_id FROM text_beside")?;
    let rows = stmt
        .query_map([], read_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let read = rows
        .into_iter()
        .filter_map(|(path, read)| read.map(|read| (path, read)));
    Ok(read.collect())
}

fn lead_row(r: &Row) -> rusqlite::Result<(String, Lead)> {
    let lead = match loaded(r.get(1)?) {
        Some(tmdb) => Lead::Tmdb(tmdb),
        None => Lead::Ask(Elsewhere {
            imdb: r.get(2)?,
            tvdb: loaded(r.get(3)?),
        }),
    };
    Ok((r.get(0)?, lead))
}

/// What the file beside each title of `kind` leads matching to, by the
/// title's id: the TMDB id it names, else the ids TMDB has still to be asked
/// about.
pub fn leads(pool: &Pool, kind: &str) -> Result<HashMap<String, Lead>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(LEADS)?;
    let rows = stmt.query_map(params![kind], lead_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// What the file beside one title leads matching to.
pub fn lead(conn: &Connection, kind: &str, id: &str) -> rusqlite::Result<Option<Lead>> {
    let one = format!("{LEADS} AND subject_id = ?2");
    conn.query_row(&one, params![kind, id], lead_row)
        .optional()
        .map(|found| found.map(|(_, lead)| lead))
}

/// Keeps what TMDB answered for the titles of `kind` whose file names the
/// ids `asked` and no TMDB id: the id it found, or that it knows none.
/// Matching does not ask about them again until the file changes.
pub fn answer(pool: &Pool, kind: &str, asked: &Elsewhere, found: Option<u64>) -> Result<()> {
    pool.get()?.execute(
        "UPDATE text_beside SET tmdb_id = ?1 \
         WHERE subject_kind = ?2 AND tmdb_id IS NULL AND imdb_id IS ?3 AND tvdb_id IS ?4",
        params![
            stored(found).unwrap_or(NO_TITLE_FOUND),
            kind,
            asked.imdb,
            stored(asked.tvdb)
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests;
