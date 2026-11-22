//! The play log: appending a finished session, and reading it back.

use anyhow::Result;
use kroma_domain::{HistoryLibrary, ImportedFrom, PlayEntry, PlayRecord};
use rusqlite::{params, Row};

use super::play_sort::PlaySort;
use super::time_watched::{RUNTIME_STANDS_IN, TIME_WATCHED};
use crate::Pool;

/// Append one finished playback to the history log.
pub fn record_play(pool: &Pool, play: &PlayRecord) -> Result<()> {
    let conn = pool.get()?;
    let id = kroma_primitives::short_hash(&format!(
        "play|{}|{}|{}|{}",
        play.user_id.as_deref().unwrap_or("?"),
        play.item_id.as_deref().unwrap_or("?"),
        play.started_at,
        kroma_primitives::random_token()
    ));
    conn.execute(
        "INSERT INTO play_history \
         (id,user_id,username,item_id,kind,title,library,started_at,ended_at,watched_ms,\
          device,player,mode,network,video_label,audio_label,show_title,season,episode) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
        params![
            id,
            play.user_id,
            play.username,
            play.item_id,
            play.kind,
            play.title,
            play.library,
            play.started_at,
            play.ended_at,
            play.watched_ms,
            play.device,
            play.player,
            play.mode,
            play.network,
            play.video_label,
            play.audio_label,
            play.show_title,
            play.season,
            play.episode,
        ],
    )?;
    Ok(())
}

/// `item_or_show` matches one item, or every episode of one show when a show id
/// is given.
#[derive(Debug, Clone, Default)]
pub struct PlayFilter {
    pub since: i64,
    pub user: Option<String>,
    pub library: Option<String>,
    pub item_or_show: Option<String>,
    pub sort: PlaySort,
}

const COLUMNS: &str = "h.id,h.user_id,COALESCE(h.username,'?'),h.item_id,h.kind,h.title,\
                       h.show_title,h.season,h.episode,h.device,h.player,h.mode,h.network,\
                       h.video_label,h.audio_label,COALESCE(h.library,i.library),\
                       h.started_at,h.ended_at,i.show_id,i.id IS NOT NULL,\
                       h.import_server_id,COALESCE(o.importer,''),COALESCE(o.name,'')";

const SCOPE: &str = "FROM play_history h LEFT JOIN items i ON i.id = h.item_id \
                     LEFT JOIN import_servers o ON o.id = h.import_server_id \
                     WHERE h.ended_at >= ?1 \
                     AND (?2 IS NULL OR h.user_id = ?2) \
                     AND (?3 IS NULL OR COALESCE(h.library,i.library) = ?3) \
                     AND (?4 IS NULL OR h.item_id = ?4 \
                          OR h.item_id IN (SELECT id FROM items WHERE show_id = ?4))";

pub fn plays(
    pool: &Pool,
    filter: &PlayFilter,
    limit: usize,
    offset: usize,
) -> Result<Vec<PlayEntry>> {
    let conn = pool.get()?;
    let order = filter.sort.clause();
    let sql = format!(
        "SELECT {COLUMNS},{TIME_WATCHED},{RUNTIME_STANDS_IN} {SCOPE} \
         ORDER BY {order} LIMIT ?5 OFFSET ?6"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![
            filter.since,
            filter.user,
            filter.library,
            filter.item_or_show,
            limit as i64,
            offset as i64
        ],
        entry,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// How many rows [`plays`] would page through.
pub fn plays_count(pool: &Pool, filter: &PlayFilter) -> Result<i64> {
    let conn = pool.get()?;
    let sql = format!("SELECT COUNT(*) {SCOPE}");
    Ok(conn.query_row(
        &sql,
        params![
            filter.since,
            filter.user,
            filter.library,
            filter.item_or_show
        ],
        |r| r.get(0),
    )?)
}

/// The libraries the watch log references, named. A library with no history is
/// left out; one deleted since keeps its id as its name.
pub fn history_libraries(pool: &Pool) -> Result<Vec<HistoryLibrary>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT h.lib, COALESCE(l.name, h.lib) AS name FROM \
           (SELECT DISTINCT COALESCE(p.library, i.library) AS lib FROM play_history p \
            LEFT JOIN items i ON i.id = p.item_id) h \
         LEFT JOIN libraries l ON l.id = h.lib \
         WHERE h.lib IS NOT NULL ORDER BY name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(HistoryLibrary {
            id: r.get(0)?,
            name: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn origin(r: &Row<'_>) -> rusqlite::Result<Option<ImportedFrom>> {
    let server: Option<String> = r.get(20)?;
    if server.is_none() {
        return Ok(None);
    }
    Ok(Some(ImportedFrom {
        importer: r.get(21)?,
        name: r.get(22)?,
    }))
}

fn entry(r: &Row<'_>) -> rusqlite::Result<PlayEntry> {
    Ok(PlayEntry {
        id: r.get(0)?,
        user_id: r.get(1)?,
        username: r.get(2)?,
        item_id: r.get(3)?,
        kind: r.get(4)?,
        title: r.get(5)?,
        show_title: r.get(6)?,
        season: r.get(7)?,
        episode: r.get(8)?,
        device: r.get(9)?,
        player: r.get(10)?,
        mode: r.get(11)?,
        network: r.get(12)?,
        video_label: r.get(13)?,
        audio_label: r.get(14)?,
        library: r.get(15)?,
        started_at: r.get(16)?,
        ended_at: r.get(17)?,
        show_id: r.get(18)?,
        in_catalog: r.get(19)?,
        imported_from: origin(r)?,
        watched_ms: r.get(23)?,
        watched_is_runtime: r.get(24)?,
    })
}

#[cfg(test)]
mod tests;
