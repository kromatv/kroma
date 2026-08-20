//! The search pipeline shared by interactive search and the automatic
//! wanted-list job: a request + a scope -> Torznab queries -> decision-engine
//! scoring -> ordered candidate views.

pub mod backoff;
pub mod interactive;
pub mod manual;
pub mod sweep;
pub mod targets;

pub use interactive::{cached_release, grab_cached, interactive_search, score_release, CachedRelease};
pub use manual::manual_search;
pub use targets::{targets_for_scope, targets_for_wanted, wanted_ids_by, SearchScope, SearchTarget};

use kroma_module_sdk::db::WantedRow;

use crate::dtos::ScoredReleaseView;

/// Build a grab spec from a scored release the search chose, for a specific
/// request/title. `upgrade` marks a grab that replaces media already on disk.
#[allow(clippy::too_many_arguments)]
pub fn grab_spec_from_release(
    release: &ScoredReleaseView,
    magnet_or_url: &str,
    tmdb_id: u64,
    title: Option<String>,
    year: Option<u32>,
    request_id: Option<String>,
    wanted_ids: Vec<String>,
    upgrade: bool,
) -> crate::peers::downloads::GrabSpec {
    crate::peers::downloads::GrabSpec {
        magnet_or_url: magnet_or_url.to_string(),
        kind: release.target.clone(),
        tmdb_id,
        title,
        year,
        season: release.season,
        episodes: release.episodes.clone(),
        release_title: release.title.clone(),
        indexer_id: Some(release.indexer_id.clone()),
        size_bytes: release.size_bytes,
        score: release.score,
        score_breakdown: serde_json::to_string(&release.breakdown).ok(),
        request_id,
        wanted_ids,
        only_files: None,
        details_url: release.details_url.clone(),
        upgrade,
    }
}

/// The wanted rows a grab of this release covers (flip to `grabbed`).
pub fn wanted_ids_for(wanted: &[WantedRow], view: &ScoredReleaseView) -> Vec<String> {
    wanted_ids_by(wanted, &view.target, view.season, view.episodes.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dtos::ScoreLineView;

    fn view(target: &str, season: Option<u32>, episodes: Option<Vec<u32>>) -> ScoredReleaseView {
        ScoredReleaseView {
            title: "Show.S01E01.1080p".into(),
            guid: "g1".into(),
            indexer_id: "i1".into(),
            indexer_name: "T".into(),
            size_bytes: Some(1024),
            seeders: Some(9),
            leechers: None,
            published_at: None,
            target: target.into(),
            season,
            episodes,
            score: Some(42),
            breakdown: vec![ScoreLineView { rule: "res".into(), delta: 10, note: "1080p".into() }],
            rejected: None,
            grabbable: true,
            upgrade: false,
            details_url: Some("https://t/1".into()),
        }
    }

    fn row(id: &str, season: u32, episode: u32, status: &str) -> WantedRow {
        WantedRow {
            id: id.into(),
            request_id: "r1".into(),
            kind: "episode".into(),
            tmdb_id: 42,
            imdb_id: None,
            title: "Show".into(),
            year: None,
            season: Some(season),
            episode: Some(episode),
            air_date: None,
            status: status.into(),
            last_search_at: None,
        }
    }

    #[test]
    fn a_grab_spec_carries_what_the_search_decided() {
        let release = view("episode", Some(1), Some(vec![1]));
        let spec = grab_spec_from_release(
            &release,
            "magnet:?xt=1",
            42,
            Some("Show".into()),
            Some(2020),
            Some("r1".into()),
            vec!["w1".into()],
            true,
        );
        assert_eq!(spec.magnet_or_url, "magnet:?xt=1");
        assert_eq!(spec.kind, "episode", "the target the row was scored against");
        assert_eq!(spec.season, Some(1));
        assert_eq!(spec.episodes, Some(vec![1]));
        assert_eq!(spec.request_id.as_deref(), Some("r1"));
        assert_eq!(spec.wanted_ids, vec!["w1".to_string()]);
        assert!(spec.upgrade, "so the import replaces rather than sits beside");
        assert_eq!(spec.indexer_id.as_deref(), Some("i1"));
        assert!(spec.score_breakdown.is_some(), "the why travels with the grab");
    }

    #[test]
    fn an_episode_grab_covers_only_that_episode() {
        let wanted = vec![row("w1", 1, 1, "wanted"), row("w2", 1, 2, "wanted")];
        assert_eq!(wanted_ids_for(&wanted, &view("episode", Some(1), Some(vec![1]))), vec!["w1"]);
    }

    #[test]
    fn a_season_pack_covers_every_row_of_that_season() {
        let wanted = vec![row("w1", 1, 1, "wanted"), row("w2", 1, 2, "wanted"), row("w3", 2, 1, "wanted")];
        let ids = wanted_ids_for(&wanted, &view("season", Some(1), Some(vec![1, 2])));
        assert_eq!(ids, vec!["w1", "w2"], "the season it is, and no other");
    }

    #[test]
    fn a_release_covering_nothing_the_request_wants_covers_no_rows() {
        let wanted = vec![row("w1", 1, 1, "wanted")];
        assert!(wanted_ids_for(&wanted, &view("episode", Some(9), Some(vec![9]))).is_empty());
    }
}
