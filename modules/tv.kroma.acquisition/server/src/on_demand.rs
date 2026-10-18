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
    use std::sync::{Arc, Mutex};

    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::testing::blocking;

    use super::queue::{self, Ask};
    use super::*;
    use crate::search::best::test_world::{host, hold_file, monitor, monitored, want, wanted_row, Fakes};

    pub(super) static SOLO: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    const DUNE_1080: &str = "Dune.2021.1080p.BluRay.x264-GRP";
    const DUNE_720: &str = "Dune.2021.720p.WEB-DL.x264-GRP";

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

    fn dune() -> kroma_module_sdk::engine::model::MonitoredTitle {
        monitored(RequestKind::Movie, 2, "Dune", Some(2021))
    }

    async fn wanting_dune(fakes: &Fakes) -> StubHost {
        let host = host(fakes).await;
        let film = dune();
        monitor(&host, &film);
        want(&host, &[wanted_row("m1", &film, None, None, "wanted")]);
        host
    }

    fn ask_for_dune(host: &StubHost) {
        let ask = Ask {
            kind: RequestKind::Movie,
            tmdb_id: 2,
            units: Vec::new(),
        };
        queue::push(host.store(), &ask, 1).unwrap();
    }

    fn logged() -> (Arc<Mutex<Vec<String>>>, impl Fn(String)) {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let sink = lines.clone();
        (lines, move |line| sink.lock().unwrap().push(line))
    }

    async fn drained(host: StubHost) -> (AutoSummary, Vec<String>) {
        blocking(move || {
            let (lines, log) = logged();
            let summary = drain_queue(&host, &log).unwrap();
            let lines = lines.lock().unwrap().clone();
            (summary, lines)
        })
        .await
    }

    async fn swept(host: StubHost) -> (AutoSummary, Vec<String>) {
        blocking(move || {
            let (lines, log) = logged();
            let summary = sweep_cutoff(&host, &log).unwrap();
            let lines = lines.lock().unwrap().clone();
            (summary, lines)
        })
        .await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_queued_title_is_searched_and_its_missing_film_grabbed() {
        let _solo = SOLO.lock().await;
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = wanting_dune(&fakes).await;
        ask_for_dune(&host);

        let (summary, _) = drained(host).await;

        assert_eq!((summary.titles, summary.grabbed), (1, 1));
        assert_eq!(fakes.grabbed_rows(), [["m1"]]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_empty_queue_says_nothing_is_waiting() {
        let _solo = SOLO.lock().await;
        let fakes = Fakes::new();
        let host = host(&fakes).await;

        let (summary, lines) = drained(host).await;

        assert_eq!(summary.titles, 0);
        assert_eq!(lines, ["no title is waiting to be searched"]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_title_with_nothing_missing_is_reported_and_not_searched() {
        let _solo = SOLO.lock().await;
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = host(&fakes).await;
        monitor(&host, &dune());
        ask_for_dune(&host);

        let (summary, lines) = drained(host).await;

        assert_eq!(summary.targets, 0);
        assert!(lines.iter().any(|l| l == "nothing is missing on title 2"), "{lines:?}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_queue_drained_with_no_indexer_says_to_configure_one() {
        let _solo = SOLO.lock().await;
        let mut fakes = Fakes::new();
        fakes.indexers.clear();
        let host = wanting_dune(&fakes).await;
        ask_for_dune(&host);

        let (summary, lines) = drained(host).await;

        assert_eq!(summary.titles, 0);
        assert!(lines.iter().any(|l| l.starts_with("no enabled indexer")), "{lines:?}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_queue_drained_with_no_indexer_module_says_none_answered() {
        let _solo = SOLO.lock().await;
        let host = StubHost::with_core(kroma_module_sdk::db::testing::temp_pool("acq-od"));
        kroma_module_sdk::db::apply_migrations(
            &host.store().get().unwrap(),
            crate::rules::schema::MIGRATIONS,
        )
        .unwrap();
        ask_for_dune(&host);

        let (_, lines) = drained(host).await;

        assert!(lines.iter().any(|l| l.starts_with("no indexer answered")), "{lines:?}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_drain_started_while_another_search_runs_does_nothing() {
        let _solo = SOLO.lock().await;
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = wanting_dune(&fakes).await;
        ask_for_dune(&host);
        let held = start::claim().expect("a free slot");

        let (summary, lines) = drained(host).await;

        drop(held);
        assert_eq!(summary.titles, 0);
        assert_eq!(lines, ["another search is already running"]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_cutoff_sweep_upgrades_a_title_held_below_its_cutoff() {
        let _solo = SOLO.lock().await;
        let fakes = Fakes::new().offering(&[DUNE_720, DUNE_1080]);
        let host = host(&fakes).await;
        let film = dune();
        monitor(&host, &film);
        want(&host, &[wanted_row("m1", &film, None, None, "available")]);
        hold_file(&host, &film, None, None, "Dune.2021.720p.WEB-DL.x264-GRP.mkv");

        let (summary, lines) = swept(host).await;

        assert_eq!(summary.upgrades, 1);
        assert_eq!(fakes.grabbed_titles(), [DUNE_1080]);
        assert_eq!(lines.last().unwrap(), "1 target(s) searched, 1 upgrade(s)");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_cutoff_sweep_with_no_indexer_searches_nothing() {
        let _solo = SOLO.lock().await;
        let mut fakes = Fakes::new();
        fakes.indexers.clear();
        let host = host(&fakes).await;

        let (summary, _) = swept(host).await;

        assert_eq!(summary.targets, 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_cutoff_sweep_started_while_another_runs_does_nothing() {
        let _solo = SOLO.lock().await;
        let fakes = Fakes::new();
        let host = host(&fakes).await;
        let held = start::claim().expect("a free slot");

        let (_, lines) = swept(host).await;

        drop(held);
        assert_eq!(lines, ["another search is already running"]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_missing_units_of_a_title_are_those_a_page_can_still_ask_for() {
        let fakes = Fakes::new();
        let host = host(&fakes).await;
        let show = monitored(RequestKind::Show, 1, "Show", None);
        monitor(&host, &show);
        want(
            &host,
            &[
                wanted_row("a", &show, Some(1), Some(1), "wanted"),
                wanted_row("b", &show, Some(1), Some(2), "wanted"),
                wanted_row("c", &show, Some(1), Some(3), "available"),
            ],
        );
        let second = Unit {
            season: Some(1),
            episode: Some(2),
        };

        let (all, one) = blocking(move || {
            (
                missing_units(&host, RequestKind::Show, 1, &[]).unwrap(),
                missing_units(&host, RequestKind::Show, 1, &[second]).unwrap(),
            )
        })
        .await;

        assert_eq!((all, one), (2, 1));
    }
}
