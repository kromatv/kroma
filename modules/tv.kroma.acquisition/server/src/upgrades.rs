//! The upgrade pass: monitored titles whose files their profile would still
//! improve are searched for a better copy, on a backoff of their own that
//! starts at half a day and stretches to a week, so upgrades never starve a
//! missing episode.

use anyhow::Result;
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::engine::model::MonitoredTitle;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Verdict;

use crate::auto::{AutoSummary, Grab, MAX_TARGETS, Pass, grab_candidate, target_label};
use crate::rules::files::judge_title_files;
use crate::rules::store;
use crate::search::best::{Aim, best_release};
use crate::search::judge::Judge;

mod targets;

use targets::upgrade_targets;

const MAX_TITLES: usize = 5;
const MAX_TITLES_NOW: usize = 25;
const MAX_TARGETS_PER_TITLE: usize = 3;

/// How far one upgrade sweep goes, and whether a title's own wait holds it
/// back. An admin who pressed the button is not waiting on MOD-69's cadence.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Sweep {
    titles: usize,
    honour_backoff: bool,
}

impl Sweep {
    pub(crate) fn scheduled() -> Self {
        Self {
            titles: MAX_TITLES,
            honour_backoff: true,
        }
    }

    pub(crate) fn now() -> Self {
        Self {
            titles: MAX_TITLES_NOW,
            honour_backoff: false,
        }
    }
}

pub(crate) fn upgrade_pass<S: HostStorage>(
    pass: &Pass<'_, S>,
    summary: &mut AutoSummary,
    sweep: Sweep,
) -> Result<()> {
    let conn = pass.state.db().get()?;
    let titles = db::list_monitored(&conn)?;
    drop(conn);
    let now = now_ms();
    let mut visited = 0;
    for title in titles {
        if (pass.cancelled)() || summary.targets >= MAX_TARGETS || visited >= sweep.titles {
            break;
        }
        if sweep.honour_backoff
            && !store::upgrade_due(pass.state.store(), title.kind, title.tmdb_id, now)?
        {
            continue;
        }
        match upgrade_title(pass, &title, summary) {
            Ok(None) => store::record_upgrade_search(pass.state.store(), &title, now, false)?,
            Ok(Some(grabbed)) => {
                visited += 1;
                store::record_upgrade_search(pass.state.store(), &title, now, grabbed)?;
            }
            Err(e) => summary
                .errors
                .push(format!("upgrade search failed for {}: {e:#}", title.title)),
        }
    }
    Ok(())
}

fn upgrades(verdict: Verdict) -> bool {
    matches!(verdict, Verdict::Upgrade(_) | Verdict::Beside(_))
}

// `None` when nothing the title holds is below its profile, so there was
// nothing to search; `Some(grabbed)` once it was searched.
fn upgrade_title<S: HostStorage>(
    pass: &Pass<'_, S>,
    title: &MonitoredTitle,
    summary: &mut AutoSummary,
) -> Result<Option<bool>> {
    let state = pass.state;
    let (kind, tmdb_id) = (title.kind, title.tmdb_id);
    let conn = state.db().get()?;
    let rows: Vec<WantedRow> = db::wanted_for_title(&conn, kind, tmdb_id)?
        .into_iter()
        .filter(|w| w.status == "available")
        .collect();
    let request_id = db::find_open_request(&conn, kind, tmdb_id)?.map(|r| r.id);
    drop(conn);
    let profile = pass.book.profile_for(state, kind, tmdb_id)?;
    if !profile.upgrades_allowed || rows.is_empty() {
        return Ok(None);
    }
    let original = crate::rules::original_language(state, kind, tmdb_id)?;
    let rules = pass.book.rules(profile);
    let files = judge_title_files(state, kind, tmdb_id, &rules, original.as_ref())?;
    let judge = Judge::for_title(rules, original.as_ref(), &files);
    let targets = upgrade_targets(kind, &rows, &files, profile);
    if targets.is_empty() {
        return Ok(None);
    }
    let blocked = crate::rules::blocklist::for_title(state.store(), kind, tmdb_id)?;
    let mut grabbed = false;
    for (st, covered) in targets.iter().take(MAX_TARGETS_PER_TITLE) {
        if summary.targets >= MAX_TARGETS {
            break;
        }
        summary.targets += 1;
        let aim = Aim {
            target: st,
            judge: &judge,
            tmdb_id,
            files: &files,
            blocked: &blocked,
            accept: upgrades,
        };
        let Some(candidate) = best_release(state, pass.indexers, &aim, &mut summary.errors).best
        else {
            continue;
        };
        (pass.log)(format!(
            "upgrading \"{}\" {} with \"{}\"",
            title.title,
            target_label(st),
            candidate.view.title
        ));
        let grab = Grab {
            title: Some((title.title.clone(), title.year)),
            request_id: request_id.clone(),
            rows: covered.clone(),
        };
        match grab_candidate(state, &candidate, grab) {
            Ok(()) => {
                summary.upgrades += 1;
                grabbed = true;
            }
            Err(e) => summary.errors.push(format!("upgrade grab failed: {e:#}")),
        }
    }
    Ok(Some(grabbed))
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::engine::model::RequestKind;
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::testing::blocking;

    use super::*;
    use crate::search::best::test_world::{
        host, hold_file, monitor, monitored, want, wanted_row, Fakes,
    };

    const DUNE_1080: &str = "Dune.2021.1080p.BluRay.x264-GRP";
    const DUNE_720: &str = "Dune.2021.720p.WEB-DL.x264-GRP";

    async fn held_720(fakes: &Fakes) -> StubHost {
        let host = host(fakes).await;
        let film = monitored(RequestKind::Movie, 2, "Dune", Some(2021));
        monitor(&host, &film);
        want(&host, &[wanted_row("m1", &film, None, None, "available")]);
        hold_file(&host, &film, None, None, "Dune.2021.720p.WEB-DL.x264-GRP.mkv");
        host
    }

    async fn pass(host: StubHost, sweep: Sweep, cancelled: bool) -> AutoSummary {
        pass_from(host, sweep, cancelled, AutoSummary::default()).await
    }

    async fn pass_from(
        host: StubHost,
        sweep: Sweep,
        cancelled: bool,
        mut summary: AutoSummary,
    ) -> AutoSummary {
        blocking(move || {
            let book = crate::rules::load(&host).unwrap();
            let indexers = crate::peers::indexers::enabled(&host).unwrap();
            let log = |_: String| {};
            let stop = move || cancelled;
            let pass = Pass {
                state: &host,
                indexers: &indexers,
                book: &book,
                log: &log,
                cancelled: &stop,
            };
            upgrade_pass(&pass, &mut summary, sweep).unwrap();
            summary
        })
        .await
    }

    #[test]
    fn only_a_better_copy_counts_as_an_upgrade() {
        assert!(upgrades(Verdict::Upgrade(kroma_scene::Reason::Formats)));
        assert!(upgrades(Verdict::Beside(kroma_scene::Reason::Formats)));
        assert!(!upgrades(Verdict::Fill));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_film_held_below_its_cutoff_is_upgraded_from_a_better_release() {
        let fakes = Fakes::new().offering(&[DUNE_720, DUNE_1080]);
        let host = held_720(&fakes).await;

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(summary.upgrades, 1);
        assert_eq!(fakes.grabbed_titles(), [DUNE_1080]);
        assert_eq!(fakes.grabbed_rows(), [["m1"]]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_film_with_no_better_release_on_offer_is_searched_and_left() {
        let fakes = Fakes::new().offering(&[DUNE_720]);
        let host = held_720(&fakes).await;

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!((summary.targets, summary.upgrades), (1, 0));
        assert!(fakes.grabbed_titles().is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_film_already_at_its_cutoff_spends_no_search() {
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = host(&fakes).await;
        let film = monitored(RequestKind::Movie, 2, "Dune", Some(2021));
        monitor(&host, &film);
        want(&host, &[wanted_row("m1", &film, None, None, "available")]);
        hold_file(&host, &film, None, None, "Dune.2021.1080p.BluRay.x264-GRP.mkv");

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(summary.targets, 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_title_with_nothing_on_disk_is_not_an_upgrade_candidate() {
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = host(&fakes).await;
        let film = monitored(RequestKind::Movie, 2, "Dune", Some(2021));
        monitor(&host, &film);
        want(&host, &[wanted_row("m1", &film, None, None, "wanted")]);

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(summary.targets, 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_scheduled_pass_waits_out_a_title_it_just_searched() {
        let fakes = Fakes::new().offering(&[DUNE_720]);
        let host = held_720(&fakes).await;
        pass(host.clone(), Sweep::scheduled(), false).await;

        let second = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(second.targets, 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_search_now_pass_ignores_the_wait() {
        let fakes = Fakes::new().offering(&[DUNE_720]);
        let host = held_720(&fakes).await;
        pass(host.clone(), Sweep::scheduled(), false).await;

        let second = pass(host, Sweep::now(), false).await;

        assert_eq!(second.targets, 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_cancelled_pass_searches_nothing() {
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = held_720(&fakes).await;

        let summary = pass(host, Sweep::now(), true).await;

        assert_eq!(summary.targets, 0);
        assert!(fakes.grabbed_titles().is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_failed_upgrade_grab_is_reported_not_counted() {
        let mut fakes = Fakes::new().offering(&[DUNE_1080]);
        fakes.grab_error = Some("engine down".into());
        let host = held_720(&fakes).await;

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(summary.upgrades, 0);
        assert_eq!(summary.errors.len(), 1);
        assert!(summary.errors[0].starts_with("upgrade grab failed"), "{:?}", summary.errors);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_season_held_below_its_cutoff_is_upgraded_by_its_pack() {
        let fakes = Fakes::new().offering(&["Show.S01.1080p.BluRay.x264-GRP"]);
        let host = host(&fakes).await;
        let show = monitored(RequestKind::Show, 1, "Show", None);
        monitor(&host, &show);
        want(
            &host,
            &[
                wanted_row("a", &show, Some(1), Some(1), "available"),
                wanted_row("b", &show, Some(1), Some(2), "available"),
            ],
        );
        hold_file(&host, &show, Some(1), Some(1), "Show.S01E01.720p.WEB-DL.x264-GRP.mkv");
        hold_file(&host, &show, Some(1), Some(2), "Show.S01E02.720p.WEB-DL.x264-GRP.mkv");

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(summary.upgrades, 1);
        assert_eq!(fakes.grabbed_rows(), [["a", "b"]]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_title_whose_search_breaks_is_reported_and_the_pass_goes_on() {
        let fakes = Fakes::new().offering(&[DUNE_1080]);
        let host = held_720(&fakes).await;
        host.db().get().unwrap().execute_batch("DROP TABLE wanted").unwrap();

        let summary = pass(host, Sweep::scheduled(), false).await;

        assert_eq!(summary.errors.len(), 1);
        assert!(summary.errors[0].starts_with("upgrade search failed for Dune"), "{:?}", summary.errors);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_title_stops_at_the_pass_target_budget() {
        let fakes = Fakes::new().offering(&["Show.S01E01.1080p.BluRay.x264-GRP"]);
        let host = host(&fakes).await;
        let show = monitored(RequestKind::Show, 1, "Show", None);
        monitor(&host, &show);
        want(
            &host,
            &[
                wanted_row("a", &show, Some(1), Some(1), "available"),
                wanted_row("b", &show, Some(1), Some(2), "available"),
                wanted_row("c", &show, Some(1), Some(3), "available"),
            ],
        );
        hold_file(&host, &show, Some(1), Some(1), "Show.S01E01.720p.WEB-DL.x264-GRP.mkv");
        hold_file(&host, &show, Some(1), Some(2), "Show.S01E02.720p.WEB-DL.x264-GRP.mkv");
        hold_file(&host, &show, Some(1), Some(3), "Show.S01E03.1080p.BluRay.x264-GRP.mkv");
        let nearly_full = AutoSummary {
            targets: MAX_TARGETS - 1,
            ..AutoSummary::default()
        };

        let summary = pass_from(host, Sweep::scheduled(), false, nearly_full).await;

        assert_eq!(summary.targets, MAX_TARGETS);
    }
}
