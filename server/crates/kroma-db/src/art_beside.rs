//! The pictures a scan found beside each title's files, and the poster, the
//! backdrop and the logo they put in front of fetched art, behind the ones an
//! admin chose.

use std::collections::{HashMap, HashSet};

use rusqlite::{params, OptionalExtension};

use kroma_domain::Metadata;

use crate::chunked::query_by_subject_ids;
use crate::scanned::{self, Rewrite};
use crate::{Connection, Pool, Result};

/// The role of a picture kept as a title's poster.
pub const POSTER: &str = "poster";
/// The role of a picture kept as a title's backdrop.
pub const BACKDROP: &str = "backdrop";
/// The role of a picture kept as a title's logo.
pub const LOGO: &str = "logo";
/// The role of a picture kept as an episode's still, which travels as its
/// backdrop.
pub const STILL: &str = "still";

const INSERT: &str = "INSERT OR REPLACE INTO art_beside \
                      (subject_kind, subject_id, role, library, picture, url) \
                      VALUES (?1, ?2, ?3, ?4, ?5, ?6)";

/// One picture a scan found beside a title's files: whose it is, what it is to
/// that title, where it is on disk, and the URL it is served under.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Picture {
    pub subject_kind: &'static str,
    pub subject_id: String,
    pub library: String,
    pub role: &'static str,
    pub path: String,
    pub url: String,
}

/// Where on disk the picture served under a URL is, and its role.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    pub path: String,
    pub role: String,
}

/// Replace what earlier scans found with `pictures`. The libraries of `kept`,
/// whose folders a scan could not all read, keep what they held as well.
/// Returns how many pictures were written.
pub fn replace(pool: &Pool, pictures: &[Picture], kept: &HashSet<String>) -> Result<usize> {
    let rows = pictures.iter().map(|p| {
        (
            p.subject_kind,
            &p.subject_id,
            p.role,
            &p.library,
            &p.path,
            &p.url,
        )
    });
    let table = Rewrite {
        table: "art_beside",
        insert: INSERT,
        kept,
    };
    scanned::rewrite(pool, table, rows)
}

/// The picture served under `url`, when a scan found one.
pub fn source_of(pool: &Pool, url: &str) -> Result<Option<Source>> {
    let conn = pool.get()?;
    let source = conn
        .query_row(
            "SELECT picture, role FROM art_beside WHERE url = ?1 LIMIT 1",
            [url],
            |r| {
                Ok(Source {
                    path: r.get(0)?,
                    role: r.get(1)?,
                })
            },
        )
        .optional()?;
    Ok(source)
}

/// Pass over the picture served under `url` until the next scan finds it
/// again: it could not be read. Returns how many rows went.
pub fn forget(pool: &Pool, url: &str) -> Result<usize> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM art_beside WHERE url = ?1", [url])?)
}

/// The URL of the poster kept for the `kind` title `id`: the one an admin
/// chose, else the one beside its files.
pub fn poster_of(pool: &Pool, kind: &str, id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    let url = conn
        .query_row(
            "SELECT url FROM art_kept \
             WHERE subject_kind = ?1 AND subject_id = ?2 AND role = ?3 \
             ORDER BY precedence DESC LIMIT 1",
            params![kind, id, POSTER],
            |r| r.get(0),
        )
        .optional()?;
    Ok(url)
}

/// The poster, the backdrop and the logo of one title.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Urls {
    pub poster: Option<String>,
    pub backdrop: Option<String>,
    pub logo: Option<String>,
}

impl Urls {
    pub(crate) fn set(&mut self, role: &str, url: String) {
        match role {
            POSTER => self.poster = Some(url),
            BACKDROP | STILL => self.backdrop = Some(url),
            LOGO => self.logo = Some(url),
            _ => {}
        }
    }
}

#[derive(Default)]
pub(crate) struct Art(HashMap<String, Urls>);

impl Art {
    pub(crate) fn load(conn: &Connection, kind: &str, ids: &[&str]) -> Result<Self> {
        let rows = query_by_subject_ids(
            conn,
            kind,
            ids,
            &[],
            |ph| {
                format!(
                    "SELECT subject_id, role, url FROM art_kept \
                     WHERE subject_kind = ? AND subject_id IN ({ph}) ORDER BY precedence"
                )
            },
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get(2)?)),
        )?;
        let mut art = Self::default();
        for (id, role, url) in rows {
            art.0.entry(id).or_default().set(&role, url);
        }
        Ok(art)
    }

    pub(crate) fn paint(&self, id: &str, meta: Option<&mut Metadata>) {
        let (Some(urls), Some(meta)) = (self.0.get(id), meta) else {
            return;
        };
        if urls.poster.is_some() {
            meta.poster_url.clone_from(&urls.poster);
        }
        if urls.backdrop.is_some() {
            meta.backdrop_url.clone_from(&urls.backdrop);
        }
        if urls.logo.is_some() {
            meta.logo_url.clone_from(&urls.logo);
        }
    }

    pub(crate) fn paint_still(&self, id: &str, meta: &mut Option<Metadata>) {
        let still = self.0.get(id).and_then(|urls| urls.backdrop.as_ref());
        if let Some(still) = still {
            meta.get_or_insert_with(Metadata::blank).backdrop_url = Some(still.clone());
        }
    }

    pub(crate) fn paint_poster(&self, id: &str, meta: Option<&mut Metadata>) {
        let poster = self.0.get(id).and_then(|urls| urls.poster.as_ref());
        if let (Some(poster), Some(meta)) = (poster, meta) {
            meta.poster_url = Some(poster.clone());
        }
    }
}

#[cfg(test)]
mod tests;
