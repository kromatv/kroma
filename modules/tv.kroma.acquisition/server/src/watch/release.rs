use std::cmp::Reverse;
use std::time::Duration;

use anyhow::{bail, Result};
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Codec, Profile, Res, UnstatedResolution};

use crate::dtos::{IndexerReport, ScoredReleaseView};
use crate::search::hits::collect_search_hits;
use crate::search::sweep::{unanswered, IndexerFailure};
use crate::search::{CachedRelease, SearchTarget};

const SWEEP_BUDGET: Duration = Duration::from_secs(20);

// The client picks its own words for this refusal, and the point envelope
// carries a refusal as one string, so the code leads the message.
const NO_INDEXER_ANSWERED: &str = "no-indexer-answered";

const INDEXERS_NAMED: usize = 3;

pub(super) fn rank<S: HostStorage + Clone>(
    host: &S,
    tmdb_id: u64,
    targets: &[SearchTarget],
) -> Result<Vec<CachedRelease>> {
    let indexers = crate::peers::indexers::enabled(host)?;
    if indexers.is_empty() {
        bail!("no indexer is enabled");
    }
    let (found, reports) = collect_search_hits(
        host,
        &indexers,
        targets,
        &watch_profile(host),
        tmdb_id,
        Some(SWEEP_BUDGET),
    );
    let mut startable: Vec<CachedRelease> = found
        .iter()
        .filter(|release| release.view.grabbable && release.view.score.is_some())
        .cloned()
        .collect();
    if startable.is_empty() {
        bail!("{}", refusal(&found, &reports));
    }
    startable.sort_by_key(|release| Reverse(rank_of(&release.view)));
    Ok(startable)
}

#[derive(PartialEq, Eq, PartialOrd, Ord)]
struct Rank {
    is_the_episode_itself: bool,
    is_not_a_disc: bool,
    score: Option<i32>,
    size_bytes: Option<u64>,
}

fn rank_of(view: &ScoredReleaseView) -> Rank {
    Rank {
        is_the_episode_itself: view.target == "episode",
        is_not_a_disc: !kroma_scene::parse_release_name(&view.title).disc,
        score: view.score,
        size_bytes: view.size_bytes,
    }
}

fn watch_profile<S: HostStorage>(host: &S) -> Profile {
    let library = crate::profile_from_settings(host);
    Profile {
        resolution: library.resolution.min(Res::R1080),
        unstated_resolution: UnstatedResolution::RankLast,
        preferred_codec: Some(Codec::H264),
        min_seeders: library.min_seeders.min(1),
        max_size_bytes_movie: library.max_size_bytes_movie,
        max_size_bytes_episode: library.max_size_bytes_episode,
        required_keywords: Vec::new(),
        forbidden_keywords: library.forbidden_keywords,
    }
}

fn refusal(found: &[CachedRelease], reports: &[IndexerReport]) -> String {
    if let Some(broken) = unanswered(reports) {
        return unsearchable(&broken);
    }
    if found.is_empty() {
        return "no release found for this title".into();
    }
    let mut tally: Vec<(String, usize)> = Vec::new();
    for release in found {
        let rule = refused_by(&release.view);
        match tally.iter_mut().find(|(known, _)| *known == rule) {
            Some((_, count)) => *count += 1,
            None => tally.push((rule, 1)),
        }
    }
    tally.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
    let rules: Vec<String> = tally
        .iter()
        .take(3)
        .map(|(rule, count)| format!("{rule} ({count})"))
        .collect();
    let plural = if found.len() == 1 { "" } else { "s" };
    format!(
        "found {} release{plural}, none can be watched: {}",
        found.len(),
        rules.join(", ")
    )
}

fn unsearchable(broken: &[IndexerFailure]) -> String {
    let mut said: Vec<String> = broken
        .iter()
        .take(INDEXERS_NAMED)
        .map(|failed| format!("{}: {}", failed.indexer, failed.error))
        .collect();
    let unnamed = broken.len() - said.len();
    if unnamed > 0 {
        said.push(format!("and {unnamed} more"));
    }
    format!("{NO_INDEXER_ANSWERED}: {}", said.join("; "))
}

fn refused_by(view: &ScoredReleaseView) -> String {
    match view.rejected.as_deref() {
        Some(reason) => reason.split(':').next().unwrap_or(reason).trim().into(),
        None => "no download link".into(),
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;
    use serde_json::json;

    use super::*;
    use crate::peers::indexers::Release;
    use crate::search::hits::score_release;
    use crate::search::test_support::{episode_target, indexer, profile, release};

    fn cached(found: Release) -> CachedRelease {
        CachedRelease {
            view: score_release(&found, &indexer(0), &episode_target(), &profile()),
            magnet_or_url: String::new(),
            torrent_url: None,
            tmdb_id: 42,
        }
    }

    #[test]
    fn a_viewer_waiting_is_held_to_one_source_where_the_library_asks_for_two() {
        let host = StubHost::new();

        let (library, watching) = (crate::profile_from_settings(&host), watch_profile(&host));

        assert_eq!(library.min_seeders, 2);
        assert_eq!(watching.min_seeders, 1);
    }

    #[test]
    fn an_operator_who_asks_for_no_seeders_at_all_is_not_overruled() {
        let host = StubHost::new().with_setting("acqMinSeeders", json!(0));

        assert_eq!(watch_profile(&host).min_seeders, 0);
    }

    #[test]
    fn a_name_stating_no_resolution_is_kept_for_a_viewer_and_refused_for_the_library() {
        let host = StubHost::new();

        let (library, watching) = (crate::profile_from_settings(&host), watch_profile(&host));

        assert_eq!(library.unstated_resolution, UnstatedResolution::Refuse);
        assert_eq!(watching.unstated_resolution, UnstatedResolution::RankLast);
    }

    #[test]
    fn a_keyword_the_library_requires_is_dropped_for_a_viewer_and_a_ban_is_not() {
        let host = StubHost::new()
            .with_setting("acqRequiredKeywords", json!("MULTI"))
            .with_setting("acqForbiddenKeywords", json!("CAM"));

        let watching = watch_profile(&host);

        assert!(watching.required_keywords.is_empty());
        assert_eq!(watching.forbidden_keywords, vec!["CAM".to_string()]);
    }

    fn answered(name: &str) -> IndexerReport {
        IndexerReport {
            id: name.to_lowercase(),
            name: name.into(),
            found: 0,
            error: None,
            elapsed_ms: 12,
        }
    }

    fn down(name: &str, error: &str) -> IndexerReport {
        IndexerReport {
            error: Some(error.into()),
            ..answered(name)
        }
    }

    #[test]
    fn a_sweep_that_answered_with_nothing_says_so() {
        let asked = [answered("Internet Archive")];

        assert_eq!(
            refusal(&[], &asked),
            "no release found for this title",
            "one indexer looked and found nothing: the title is what is missing"
        );
    }

    #[test]
    fn a_sweep_not_one_indexer_could_answer_blames_the_indexers_rather_than_the_title() {
        let broken = [
            down("Internet Archive", "definition 'internetarchive' not found"),
            down("YggReborn (API)", "definition 'yggreborn-api' not found"),
        ];

        assert_eq!(
            refusal(&[], &broken),
            "no-indexer-answered: Internet Archive: definition 'internetarchive' not found; \
             YggReborn (API): definition 'yggreborn-api' not found"
        );
    }

    #[test]
    fn more_broken_indexers_than_the_refusal_names_are_counted_at_the_end() {
        let broken: Vec<IndexerReport> = ["a", "b", "c", "d", "e"]
            .iter()
            .map(|name| down(name, "connection refused"))
            .collect();

        let message = refusal(&[], &broken);

        assert_eq!(
            message,
            "no-indexer-answered: a: connection refused; b: connection refused; \
             c: connection refused; and 2 more"
        );
    }

    #[test]
    fn a_sweep_whose_every_hit_was_refused_names_the_rules_commonest_first() {
        let found = [
            cached(release("Show.S01E01.1080p", Some(0))),
            cached(release("Show.S01E09.1080p", Some(5))),
            cached(release("Show.S01E01.720p", Some(0))),
        ];

        assert_eq!(
            refusal(&found, &[answered("Tracker")]),
            "found 3 releases, none can be watched: seeders (2), wrong-episode (1)"
        );
    }

    #[test]
    fn a_hit_nothing_can_be_grabbed_from_is_counted_as_that() {
        let mut linkless = release("Show.S01E01.1080p", Some(5));
        linkless.magnet = None;
        linkless.details_url = None;

        let message = refusal(&[cached(linkless)], &[answered("Tracker")]);

        assert_eq!(
            message,
            "found 1 release, none can be watched: no download link (1)"
        );
    }
}
