//! Releases a title must not be grabbed again from, because their download
//! failed. The admin sees the list and can clear an entry.

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::engine::model::RequestKind;
use rusqlite::params;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Blocked {
    pub id: String,
    pub kind: RequestKind,
    pub tmdb_id: u64,
    pub release_title: String,
    pub info_hash: Option<String>,
    pub indexer_id: Option<String>,
    pub reason: String,
    pub added_at: i64,
}

impl Blocked {
    /// Whether a release by this name is this entry. Any indexer: the same
    /// release fails the same way wherever it is offered.
    pub fn matches(&self, release_title: &str) -> bool {
        self.release_title
            .trim()
            .eq_ignore_ascii_case(release_title.trim())
    }
}

pub fn add(pool: &Pool, entry: &Blocked) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO blocklist \
             (id, kind, tmdb_id, release_title, info_hash, indexer_id, reason, added_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            entry.id,
            entry.kind.as_str(),
            entry.tmdb_id as i64,
            entry.release_title,
            entry.info_hash,
            entry.indexer_id,
            entry.reason,
            entry.added_at
        ],
    )?;
    Ok(())
}

fn row(r: &rusqlite::Row) -> rusqlite::Result<Blocked> {
    let kind: String = r.get(1)?;
    Ok(Blocked {
        id: r.get(0)?,
        kind: RequestKind::parse(&kind).unwrap_or(RequestKind::Movie),
        tmdb_id: r.get::<_, i64>(2)? as u64,
        release_title: r.get(3)?,
        info_hash: r.get(4)?,
        indexer_id: r.get(5)?,
        reason: r.get(6)?,
        added_at: r.get(7)?,
    })
}

const COLS: &str = "id, kind, tmdb_id, release_title, info_hash, indexer_id, reason, added_at";

pub fn for_title(pool: &Pool, kind: RequestKind, tmdb_id: u64) -> Result<Vec<Blocked>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM blocklist WHERE kind = ?1 AND tmdb_id = ?2"
    ))?;
    let rows = stmt.query_map(params![kind.as_str(), tmdb_id as i64], row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn list(pool: &Pool) -> Result<Vec<Blocked>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM blocklist ORDER BY added_at DESC LIMIT 500"
    ))?;
    let rows = stmt.query_map([], row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn remove(pool: &Pool, id: &str) -> Result<bool> {
    let conn = pool.get()?;
    Ok(conn.execute("DELETE FROM blocklist WHERE id = ?1", params![id])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pool() -> kroma_module_sdk::db::testing::TempPool {
        let pool = kroma_module_sdk::db::testing::temp_pool("acq-blocklist");
        kroma_module_sdk::db::apply_migrations(
            &pool.get().unwrap(),
            super::super::store::MIGRATIONS,
        )
        .unwrap();
        pool
    }

    fn entry(id: &str, tmdb_id: u64) -> Blocked {
        Blocked {
            id: id.into(),
            kind: RequestKind::Movie,
            tmdb_id,
            release_title: "Movie.2020.1080p.WEB-DL-GRP".into(),
            info_hash: Some("abc".into()),
            indexer_id: Some("idx1".into()),
            reason: "failed".into(),
            added_at: 5,
        }
    }

    #[test]
    fn a_blocked_release_is_listed_for_its_title_only() {
        let p = pool();
        add(&p, &entry("b1", 603)).unwrap();
        add(&p, &entry("b2", 604)).unwrap();

        let blocked = for_title(&p, RequestKind::Movie, 603).unwrap();

        assert_eq!(blocked, [entry("b1", 603)]);
    }

    #[test]
    fn the_same_release_from_another_indexer_is_still_blocked() {
        let blocked = entry("b1", 603);

        assert!(blocked.matches(" movie.2020.1080p.web-dl-grp "));
        assert!(!blocked.matches("Movie.2020.2160p.WEB-DL-GRP"));
    }

    #[test]
    fn clearing_an_entry_lets_the_release_back() {
        let p = pool();
        add(&p, &entry("b1", 603)).unwrap();

        let removed = remove(&p, "b1").unwrap();

        assert!(removed);
        assert!(list(&p).unwrap().is_empty());
    }
}
