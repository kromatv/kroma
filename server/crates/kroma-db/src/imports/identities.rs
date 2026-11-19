//! The identity another server held for each file, by the file's path on this
//! machine. Matching reaches one through `files`, as it reaches an acquisition
//! hint.

use std::collections::HashMap;

use rusqlite::OptionalExtension;

use crate::{Connection, Pool, Result, Row, params};

const NO_TITLE_FOUND: i64 = 0;

/// What a file is of: a film, or a show for a file that is one of its
/// episodes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Subject {
    Movie,
    Show,
}

impl Subject {
    fn as_str(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Show => "show",
        }
    }

    fn id_column(self) -> &'static str {
        match self {
            Self::Movie => "i.id",
            Self::Show => "i.show_id",
        }
    }
}

/// The ids a film or a show has in the catalogues TMDB can be asked by.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Elsewhere {
    pub imdb: Option<String>,
    pub tvdb: Option<u64>,
}

/// The ids another server held for a film or a show.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HeldIds {
    pub tmdb: Option<u64>,
    pub elsewhere: Elsewhere,
}

/// One file's identity. `path` is the file's path as the scan records it, and
/// `ids` are its film's, or its show's when the file is an episode.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileIdentity {
    pub path: String,
    pub subject: Subject,
    pub ids: HeldIds,
}

/// What matching takes from the identity of a film or a show: the TMDB id it
/// names, or the ids TMDB has still to be asked about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Lead {
    Tmdb(u64),
    Ask(Elsewhere),
}

impl Lead {
    pub fn tmdb(&self) -> Option<u64> {
        match self {
            Self::Tmdb(id) => Some(*id),
            Self::Ask(_) => None,
        }
    }

    pub fn unasked(self) -> Option<Elsewhere> {
        match self {
            Self::Tmdb(_) => None,
            Self::Ask(elsewhere) => Some(elsewhere),
        }
    }
}

fn stored(id: Option<u64>) -> Option<i64> {
    id.and_then(|id| i64::try_from(id).ok())
}

fn read(id: Option<i64>) -> Option<u64> {
    id.and_then(|id| u64::try_from(id).ok())
        .filter(|id| *id > 0)
}

/// Keeps each identity under its file. Answers, in the order given, whether
/// one was written: false for an identity already kept as it is. One that
/// changed forgets what TMDB answered for the ids it had.
pub fn keep_identities(
    pool: &Pool,
    server_id: &str,
    identities: &[FileIdentity],
) -> Result<Vec<bool>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let mut written = Vec::with_capacity(identities.len());
    {
        let mut stmt = tx.prepare(
            "INSERT INTO import_identities \
               (abs_path, server_id, subject, tmdb_id, imdb_id, tvdb_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(abs_path) DO UPDATE SET \
               server_id = excluded.server_id, subject = excluded.subject, \
               tmdb_id = excluded.tmdb_id, imdb_id = excluded.imdb_id, \
               tvdb_id = excluded.tvdb_id, found_tmdb_id = NULL \
             WHERE import_identities.subject <> excluded.subject \
                OR import_identities.tmdb_id IS NOT excluded.tmdb_id \
                OR import_identities.imdb_id IS NOT excluded.imdb_id \
                OR import_identities.tvdb_id IS NOT excluded.tvdb_id",
        )?;
        for identity in identities {
            let rows = stmt.execute(params![
                identity.path,
                server_id,
                identity.subject.as_str(),
                stored(identity.ids.tmdb),
                identity.ids.elsewhere.imdb,
                stored(identity.ids.elsewhere.tvdb)
            ])?;
            written.push(rows == 1);
        }
    }
    tx.commit()?;
    Ok(written)
}

fn leads_sql(subject: Subject, narrowed: &str) -> String {
    let id = subject.id_column();
    let of_a_show = match subject {
        Subject::Movie => "IS NULL",
        Subject::Show => "IS NOT NULL",
    };
    format!(
        "SELECT {id}, n.tmdb_id, n.found_tmdb_id, n.imdb_id, n.tvdb_id \
         FROM import_identities n \
         JOIN files f ON f.abs_path = n.abs_path \
         JOIN items i ON i.id = f.item_id \
         WHERE n.subject = ?1 AND i.show_id {of_a_show} {narrowed} \
           AND (n.tmdb_id IS NOT NULL OR n.found_tmdb_id IS NULL \
                OR n.found_tmdb_id <> {NO_TITLE_FOUND}) \
         ORDER BY COALESCE(n.tmdb_id, n.found_tmdb_id) IS NULL, n.abs_path"
    )
}

fn lead_row(r: &Row) -> rusqlite::Result<(String, Lead)> {
    let known = read(r.get(1)?).or(read(r.get(2)?));
    let lead = match known {
        Some(tmdb) => Lead::Tmdb(tmdb),
        None => Lead::Ask(Elsewhere {
            imdb: r.get(3)?,
            tvdb: read(r.get(4)?),
        }),
    };
    Ok((r.get(0)?, lead))
}

/// The lead of every film, by item id, or of every show, by show id, one of
/// whose files has an identity. Among the files of one, an identity that names
/// a TMDB id leads.
pub fn identity_leads(pool: &Pool, subject: Subject) -> Result<HashMap<String, Lead>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&leads_sql(subject, ""))?;
    let rows = stmt.query_map([subject.as_str()], lead_row)?;
    let mut leads = HashMap::new();
    for row in rows {
        let (id, lead) = row?;
        leads.entry(id).or_insert(lead);
    }
    Ok(leads)
}

/// The lead of one film, by item id, or of one show, by show id.
pub fn identity_lead(
    conn: &Connection,
    subject: Subject,
    id: &str,
) -> rusqlite::Result<Option<Lead>> {
    let narrowed = format!("AND {} = ?2", subject.id_column());
    let first = format!("{} LIMIT 1", leads_sql(subject, &narrowed));
    conn.query_row(&first, params![subject.as_str(), id], lead_row)
        .optional()
        .map(|found| found.map(|(_, lead)| lead))
}

/// Keeps what TMDB answered for the films, or the shows, known by the ids
/// `asked`: the id it found, or that it knows none. Matching does not ask
/// about them again.
pub fn answer_identities(
    pool: &Pool,
    subject: Subject,
    asked: &Elsewhere,
    found: Option<u64>,
) -> Result<()> {
    pool.get()?.execute(
        "UPDATE import_identities SET found_tmdb_id = ?1 \
         WHERE subject = ?2 AND tmdb_id IS NULL AND imdb_id IS ?3 AND tvdb_id IS ?4",
        params![
            stored(found).unwrap_or(NO_TITLE_FOUND),
            subject.as_str(),
            asked.imdb,
            stored(asked.tvdb)
        ],
    )?;
    Ok(())
}
