//! Searches an admin asked for now. The backoff in MOD-68 and MOD-69 paces a
//! pass nobody is waiting on; someone standing in front of a title is waiting,
//! so these passes read no wait and write none. Each still stops at the same
//! target budget as the scheduled pass.

use std::collections::HashSet;

use anyhow::Result;
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::HostStorage;
use serde::{Deserialize, Serialize};

use crate::auto::{AutoSummary, Pass, search_title};
use crate::peers::indexers::IndexerRef;
use crate::upgrades::{Sweep, upgrade_pass};

mod queue;
mod routes;
mod start;

pub use routes::routes;
pub use start::{
    CUTOFF_JOB, NotStarted, ON_DEMAND_JOB, Started, start_cutoff_search, start_title_search,
};

const MAX_ASKS: usize = 20;

/// One film (`{}`) or one episode (`{"season":1,"episode":3}`) of a title.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unit {
    #[serde(default)]
    pub season: Option<u32>,
    #[serde(default)]
    pub episode: Option<u32>,
}

/// Searches every title a page queued. The `acquisition.ondemand` job.
pub fn drain_queue<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<AutoSummary> {
    let mut summary = AutoSummary::default();
    let Some(_slot) = start::claim() else {
        log("another search is already running".into());
        return Ok(summary);
    };
    for _ in 0..MAX_ASKS {
        let Some(ask) = queue::take(state.store())? else {
            break;
        };
        search_title_now(state, ask.kind, ask.tmdb_id, &ask.units, log, &mut summary)?;
    }
    if summary.titles == 0 {
        log("no title is waiting to be searched".into());
    }
    Ok(summary)
}

/// Searches every monitored title a better copy could still improve. The
/// `acquisition.cutoff` job.
pub fn sweep_cutoff<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<AutoSummary> {
    let mut summary = AutoSummary::default();
    let Some(_slot) = start::claim() else {
        log("another search is already running".into());
        return Ok(summary);
    };
    search_cutoff_now(state, log, &mut summary)?;
    Ok(summary)
}

fn search_title_now<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    units: &[Unit],
    log: &dyn Fn(String),
    summary: &mut AutoSummary,
) -> Result<()> {
    let Some(indexers) = sweepable(state, log)? else {
        return Ok(());
    };
    let open = open_rows(state, kind, tmdb_id, units)?;
    if open.is_empty() {
        log(format!("nothing is missing on title {tmdb_id}"));
        return Ok(());
    }
    let book = crate::rules::load(state)?;
    let pass = Pass {
        state,
        indexers: &indexers,
        book: &book,
        log,
        cancelled: &|| false,
    };
    search_title(&pass, (kind, tmdb_id), &open, summary, &mut HashSet::new())?;
    log(format!(
        "{} target(s) searched, {} grabbed",
        summary.targets, summary.grabbed
    ));
    Ok(())
}

fn search_cutoff_now<S: HostStorage>(
    state: &S,
    log: &dyn Fn(String),
    summary: &mut AutoSummary,
) -> Result<()> {
    let Some(indexers) = sweepable(state, log)? else {
        return Ok(());
    };
    let book = crate::rules::load(state)?;
    let pass = Pass {
        state,
        indexers: &indexers,
        book: &book,
        log,
        cancelled: &|| false,
    };
    upgrade_pass(&pass, summary, Sweep::now())?;
    log(format!(
        "{} target(s) searched, {} upgrade(s)",
        summary.targets, summary.upgrades
    ));
    Ok(())
}

pub fn missing_units<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    units: &[Unit],
) -> Result<usize> {
    Ok(open_rows(state, kind, tmdb_id, units)?.len())
}

fn sweepable<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<Option<Vec<IndexerRef>>> {
    match crate::peers::indexers::enabled(state) {
        Ok(found) if !found.is_empty() => Ok(Some(found)),
        Ok(_) => {
            log("no enabled indexer; configure one under Indexeurs".into());
            Ok(None)
        }
        Err(e) => {
            log(format!("no indexer answered: {e:#}"));
            Ok(None)
        }
    }
}

fn open_rows<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    units: &[Unit],
) -> Result<HashSet<String>> {
    let conn = state.db().get()?;
    let wanted = db::wanted_for_title(&conn, kind, tmdb_id)?;
    drop(conn);
    Ok(wanted
        .iter()
        .filter(|row| row.status == "wanted" && asked_for(row, units))
        .map(|row| row.id.clone())
        .collect())
}

fn asked_for(row: &WantedRow, units: &[Unit]) -> bool {
    units.is_empty()
        || units
            .iter()
            .any(|unit| unit.season == row.season && unit.episode == row.episode)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str, season: Option<u32>, episode: Option<u32>, status: &str) -> WantedRow {
        WantedRow {
            id: id.into(),
            request_id: None,
            kind: if season.is_some() { "episode" } else { "movie" }.into(),
            tmdb_id: 7,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season,
            episode,
            air_date: None,
            status: status.into(),
            last_search_at: None,
        }
    }

    #[test]
    fn an_empty_selection_takes_every_unit_of_the_title() {
        let open = row("a", Some(1), Some(1), "wanted");

        assert!(asked_for(&open, &[]));
    }

    #[test]
    fn a_selection_takes_the_units_it_names_and_no_others() {
        let picked = Unit {
            season: Some(1),
            episode: Some(2),
        };

        assert!(asked_for(&row("b", Some(1), Some(2), "wanted"), &[picked]));
        assert!(!asked_for(&row("a", Some(1), Some(1), "wanted"), &[picked]));
    }

    #[test]
    fn a_film_is_named_by_a_unit_with_neither_season_nor_episode() {
        let film = Unit {
            season: None,
            episode: None,
        };

        assert!(asked_for(&row("m", None, None, "wanted"), &[film]));
    }

    #[test]
    fn a_unit_arrives_under_the_keys_the_page_sends() {
        let body = serde_json::json!({ "season": 1, "episode": 3 });

        let unit: Unit = serde_json::from_value(body).unwrap();

        assert_eq!(unit.season, Some(1));
        assert_eq!(unit.episode, Some(3));
    }

    #[test]
    fn a_unit_that_names_a_season_only_leaves_the_episode_out() {
        let unit: Unit = serde_json::from_value(serde_json::json!({ "season": 2 })).unwrap();

        assert_eq!(unit.season, Some(2));
        assert_eq!(unit.episode, None);
    }
}
