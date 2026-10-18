//! What a page asked for, waiting for the job that answers it.

use anyhow::Result;
use kroma_module_sdk::db::Pool;
use kroma_module_sdk::engine::model::RequestKind;
use rusqlite::{OptionalExtension, params};

use super::Unit;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Ask {
    pub(super) kind: RequestKind,
    pub(super) tmdb_id: u64,
    pub(super) units: Vec<Unit>,
}

pub(super) fn push(pool: &Pool, ask: &Ask, now_ms: i64) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT OR IGNORE INTO search_queue (kind, tmdb_id, units, queued_at) \
         VALUES (?1, ?2, ?3, ?4)",
        params![
            ask.kind.as_str(),
            ask.tmdb_id as i64,
            serde_json::to_string(&ask.units)?,
            now_ms
        ],
    )?;
    Ok(())
}

pub(super) fn take(pool: &Pool) -> Result<Option<Ask>> {
    let conn = pool.get()?;
    let row: Option<(i64, String, i64, String)> = conn
        .query_row(
            "SELECT id, kind, tmdb_id, units FROM search_queue ORDER BY id LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?;
    let Some((id, kind, tmdb_id, units)) = row else {
        return Ok(None);
    };
    conn.execute("DELETE FROM search_queue WHERE id = ?1", params![id])?;
    Ok(RequestKind::parse(&kind).map(|kind| Ask {
        kind,
        tmdb_id: tmdb_id as u64,
        units: serde_json::from_str(&units).unwrap_or_default(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pool() -> kroma_module_sdk::db::testing::TempPool {
        let pool = kroma_module_sdk::db::testing::temp_pool("acq-queue");
        kroma_module_sdk::db::apply_migrations(
            &pool.get().unwrap(),
            crate::rules::schema::MIGRATIONS,
        )
        .unwrap();
        pool
    }

    fn ask(tmdb_id: u64, units: Vec<Unit>) -> Ask {
        Ask {
            kind: RequestKind::Show,
            tmdb_id,
            units,
        }
    }

    fn episode(episode: u32) -> Unit {
        Unit {
            season: Some(1),
            episode: Some(episode),
        }
    }

    #[test]
    fn an_ask_comes_back_as_it_was_written_down() {
        let p = pool();
        push(&p, &ask(1396, vec![episode(3)]), 1).unwrap();

        let taken = take(&p).unwrap().expect("the ask");

        assert_eq!(taken, ask(1396, vec![episode(3)]));
        assert!(take(&p).unwrap().is_none());
    }

    #[test]
    fn the_oldest_ask_is_answered_first() {
        let p = pool();
        push(&p, &ask(1396, Vec::new()), 1).unwrap();
        push(&p, &ask(603, Vec::new()), 2).unwrap();

        assert_eq!(take(&p).unwrap().unwrap().tmdb_id, 1396);
        assert_eq!(take(&p).unwrap().unwrap().tmdb_id, 603);
    }

    #[test]
    fn pressing_twice_for_the_same_units_queues_one_search() {
        let p = pool();

        push(&p, &ask(1396, vec![episode(3)]), 1).unwrap();
        push(&p, &ask(1396, vec![episode(3)]), 2).unwrap();

        assert!(take(&p).unwrap().is_some());
        assert!(take(&p).unwrap().is_none());
    }

    #[test]
    fn a_second_selection_of_the_same_title_is_its_own_ask() {
        let p = pool();

        push(&p, &ask(1396, vec![episode(3)]), 1).unwrap();
        push(&p, &ask(1396, vec![episode(4)]), 2).unwrap();

        assert_eq!(take(&p).unwrap().unwrap().units, vec![episode(3)]);
        assert_eq!(take(&p).unwrap().unwrap().units, vec![episode(4)]);
    }

    #[test]
    fn an_empty_queue_hands_back_nothing() {
        assert!(take(&pool()).unwrap().is_none());
    }
}
