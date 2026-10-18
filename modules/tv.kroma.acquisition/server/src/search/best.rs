//! The best release one target can be filled from, as the automatic passes
//! pick it: asked of every indexer, judged by the title's rules, and kept only
//! when the caller wants what grabbing it would do.

use crate::peers::indexers::IndexerRef;
use crate::rules::blocklist::Blocked;
use crate::rules::files::JudgedFile;
use crate::search::hits::CachedRelease;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Verdict;

use crate::search::judge::Judge;
use crate::search::targets::SearchTarget;
use crate::search::verdict::{units_of, verdict_for};

/// What a target's sweep came to.
#[derive(Default)]
pub struct Outcome {
    pub best: Option<CachedRelease>,
    pub seen: usize,
    pub top_reject: Option<String>,
}

/// What one sweep is aimed at, what it is allowed to grab, and what the title
/// already holds.
pub struct Aim<'a> {
    pub target: &'a SearchTarget,
    pub judge: &'a Judge<'a>,
    pub tmdb_id: u64,
    pub files: &'a [JudgedFile],
    pub blocked: &'a [Blocked],
    pub accept: fn(Verdict) -> bool,
}

pub fn best_release<S: HostStorage>(
    state: &S,
    indexers: &[IndexerRef],
    aim: &Aim,
    errors: &mut Vec<String>,
) -> Outcome {
    let mut out = Outcome::default();
    for indexer in indexers {
        let found = match crate::search_indexer(state, indexer, &aim.target.query) {
            Ok(f) => f,
            Err(e) => {
                errors.push(format!("{}: {e:#}", indexer.name));
                continue;
            }
        };
        out.seen += found.len();
        for release in found {
            consider(aim, &release, indexer, &mut out);
        }
    }
    out
}

fn blocked(aim: &Aim, release: &crate::peers::indexers::Release) -> bool {
    aim.blocked
        .iter()
        .any(|b| b.matches(&release.title, release.info_hash.as_deref()))
}

fn consider(
    aim: &Aim,
    release: &crate::peers::indexers::Release,
    indexer: &IndexerRef,
    out: &mut Outcome,
) {
    let (mut view, judged) = aim.judge.release(release, indexer, aim.target);
    let Some(judged) = judged else {
        if out.top_reject.is_none() {
            out.top_reject = view.rejected;
        }
        return;
    };
    if blocked(aim, release) {
        return;
    }
    let verdict = verdict_for(
        &judged.evaluation,
        &units_of(&view, aim.files),
        aim.files,
        aim.judge.profile(),
    );
    if !(aim.accept)(verdict) {
        return;
    }
    let magnet_or_url = release
        .magnet
        .clone()
        .or_else(|| release.link.clone())
        .unwrap_or_default();
    if magnet_or_url.is_empty() {
        return;
    }
    let better = out
        .best
        .as_ref()
        .and_then(|b| b.judged.as_ref())
        .is_none_or(|held| kroma_scene::rank(&judged, held).is_gt());
    if better {
        view.verdict = Some(verdict);
        view.upgrade = crate::search::interactive::replaces(Some(verdict));
        out.best = Some(CachedRelease {
            view,
            judged: Some(judged),
            magnet_or_url,
            info_hash: release.info_hash.clone(),
            tmdb_id: aim.tmdb_id,
        });
    }
}

#[cfg(test)]
#[path = "test_world.rs"]
pub(crate) mod test_world;

#[cfg(test)]
mod tests {
    use kroma_module_sdk::engine::model::RequestKind;
    use kroma_module_sdk::testing::blocking;

    use super::test_world::{host, Fakes};
    use super::*;
    use crate::search::test_support::{indexer, TestRules};

    const DUNE_1080: &str = "Dune.2021.1080p.BluRay.x264-GRP";
    const DUNE_720: &str = "Dune.2021.720p.WEB-DL.x264-GRP";

    fn dune() -> SearchTarget {
        SearchTarget::movie(438631, None, "Dune".into(), Some(2021))
    }

    fn fills(verdict: Verdict) -> bool {
        verdict.is_wanted()
    }

    fn blocked(release_title: &str) -> Blocked {
        Blocked {
            id: "b1".into(),
            kind: RequestKind::Movie,
            tmdb_id: 438631,
            release_title: release_title.into(),
            info_hash: None,
            indexer_id: None,
            reason: "stalled".into(),
            added_at: 0,
        }
    }

    async fn sweep(fakes: Fakes, blocked: Vec<Blocked>) -> (Outcome, Vec<String>) {
        let host = host(&fakes).await;
        blocking(move || {
            let rules = TestRules::new();
            let judge = rules.judge();
            let target = dune();
            let aim = Aim {
                target: &target,
                judge: &judge,
                tmdb_id: 438631,
                files: &[],
                blocked: &blocked,
                accept: fills,
            };
            let mut errors = Vec::new();
            let out = best_release(&host, &[indexer(1)], &aim, &mut errors);
            (out, errors)
        })
        .await
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_higher_ranked_release_of_a_sweep_wins() {
        let fakes = Fakes::new().offering(&[DUNE_720, DUNE_1080]);

        let (out, errors) = sweep(fakes, Vec::new()).await;

        assert_eq!(out.best.unwrap().view.title, DUNE_1080);
        assert_eq!(out.seen, 2);
        assert!(errors.is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_blocked_release_is_never_the_best() {
        let fakes = Fakes::new().offering(&[DUNE_720, DUNE_1080]);

        let (out, _) = sweep(fakes, vec![blocked(DUNE_1080)]).await;

        assert_eq!(out.best.unwrap().view.title, DUNE_720);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_release_nobody_can_download_is_skipped() {
        let mut fakes = Fakes::new().offering(&[DUNE_1080]);
        fakes.releases[0]["magnet"] = serde_json::Value::Null;

        let (out, _) = sweep(fakes, Vec::new()).await;

        assert!(out.best.is_none());
        assert_eq!(out.seen, 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_release_under_the_link_alone_is_still_grabbable() {
        let mut fakes = Fakes::new().offering(&[DUNE_1080]);
        fakes.releases[0]["magnet"] = serde_json::Value::Null;
        fakes.releases[0]["link"] = "http://t/dune.torrent".into();

        let (out, _) = sweep(fakes, Vec::new()).await;

        assert_eq!(out.best.unwrap().magnet_or_url, "http://t/dune.torrent");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_sweep_nothing_fits_says_what_the_first_refusal_was() {
        let fakes = Fakes::new().offering(&["Arrival.2016.1080p.BluRay.x264-GRP"]);

        let (out, _) = sweep(fakes, Vec::new()).await;

        assert!(out.best.is_none());
        assert!(out.top_reject.is_some());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn an_indexer_that_fails_is_reported_and_the_sweep_goes_on() {
        let mut fakes = Fakes::new().offering(&[DUNE_1080]);
        fakes.search_error = Some("timed out".into());

        let (out, errors) = sweep(fakes, Vec::new()).await;

        assert!(out.best.is_none());
        assert_eq!(errors.len(), 1);
        assert!(errors[0].starts_with("Tracker: "), "{errors:?}");
    }
}
