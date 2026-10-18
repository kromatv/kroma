//! What a title already holds, judged by the same rules as a release: each
//! file's facts read from its probe, and from the release name it was imported
//! under when this module placed it.

use anyhow::Result;
use kroma_module_sdk::db::{self, TitleFile};
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Evaluation, Language, QualityProfile, Rules, cutoff_unmet, evaluate};
use serde::Serialize;

use super::file_facts::file_facts;
use super::store;

/// One file on disk, judged.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgedFile {
    pub file_id: String,
    pub rel_path: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub episode_end: Option<u32>,
    pub release: Option<String>,
    pub runtime_minutes: Option<u32>,
    pub evaluation: Evaluation,
    pub below_target: bool,
}

impl JudgedFile {
    /// Whether this file holds `episode` of `season` (always, for a film).
    pub fn holds(&self, season: Option<u32>, episode: Option<u32>) -> bool {
        match (season, episode) {
            (None, None) => self.season.is_none(),
            (Some(s), None) => self.season == Some(s),
            (Some(s), Some(e)) => {
                self.season == Some(s)
                    && self.episode.is_some_and(|first| {
                        (first..=self.episode_end.unwrap_or(first)).contains(&e)
                    })
            }
            (None, Some(_)) => false,
        }
    }
}

/// How long one unit of the title runs, as the files on disk measure it. The
/// middle value, so one short extra does not drag a per-minute size limit.
pub fn title_runtime(files: &[JudgedFile]) -> Option<u32> {
    let mut minutes: Vec<u32> = files.iter().filter_map(|f| f.runtime_minutes).collect();
    minutes.sort_unstable();
    minutes.get(minutes.len() / 2).copied()
}

fn unit_runtime(held: &TitleFile) -> Option<u32> {
    let episodes = match (held.episode, held.episode_end) {
        (Some(first), Some(last)) if last >= first => last - first + 1,
        _ => 1,
    };
    let minutes = held.file.duration_ms? / 60_000 / u64::from(episodes);
    (minutes > 0).then_some(minutes as u32)
}

/// Each unit the files hold, once, by the episode each file starts at.
pub fn held_units(files: &[JudgedFile]) -> Vec<(Option<u32>, Option<u32>)> {
    let mut units: Vec<_> = files.iter().map(|f| (f.season, f.episode)).collect();
    units.sort_unstable();
    units.dedup();
    units
}

/// Whether the files holding `episode` of `season` (the film, for `None`)
/// leave it below `profile`'s target.
pub fn unit_below_target(
    files: &[JudgedFile],
    season: Option<u32>,
    episode: Option<u32>,
    profile: &QualityProfile,
) -> bool {
    let held: Vec<Evaluation> = files
        .iter()
        .filter(|f| f.holds(season, episode))
        .map(|f| f.evaluation.clone())
        .collect();
    cutoff_unmet(&held, profile)
}

/// Every file of a title, judged under `rules`.
pub fn judge_title_files<S: HostStorage>(
    state: &S,
    kind: RequestKind,
    tmdb_id: u64,
    rules: &Rules,
    original: Option<&Language>,
) -> Result<Vec<JudgedFile>> {
    let conn = state.db().get()?;
    let files = db::title_files(&conn, kind, tmdb_id)?;
    drop(conn);
    files
        .into_iter()
        .map(|held| judge_file(state, held, rules, original))
        .collect()
}

fn judge_file<S: HostStorage>(
    state: &S,
    held: TitleFile,
    rules: &Rules,
    original: Option<&Language>,
) -> Result<JudgedFile> {
    let release = match held.file.abs_path.as_deref() {
        Some(path) => store::release_of(state.store(), path)?,
        None => None,
    };
    let facts = file_facts(&held.file, release.as_deref());
    let evaluation = evaluate(&facts, original, rules);
    Ok(JudgedFile {
        file_id: held.file.id.clone(),
        rel_path: held.file.rel_path.clone(),
        season: held.season,
        episode: held.episode,
        episode_end: held.episode_end,
        runtime_minutes: unit_runtime(&held),
        below_target: cutoff_unmet(std::slice::from_ref(&evaluation), rules.profile),
        evaluation,
        release,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::TestRules;
    use kroma_module_sdk::domain::MediaFile;
    use kroma_scene::Quality;

    fn judged(season: u32, episode: u32, quality: Quality, rank: u32) -> JudgedFile {
        JudgedFile {
            file_id: format!("s{season}e{episode}"),
            rel_path: None,
            season: Some(season),
            episode: Some(episode),
            episode_end: None,
            release: None,
            runtime_minutes: None,
            evaluation: Evaluation {
                quality,
                quality_rank: Some(rank),
                formats: Vec::new(),
                format_score: 0,
                revision: 1,
            },
            below_target: false,
        }
    }

    #[test]
    fn an_episode_below_target_is_told_apart_from_one_at_it() {
        let rules = TestRules::new();
        let files = [
            judged(1, 1, Quality::WebDl720, 1),
            judged(1, 2, Quality::Bluray1080, rules.profile.cutoff_rank()),
        ];

        let below: Vec<_> = held_units(&files)
            .into_iter()
            .filter(|&(season, episode)| unit_below_target(&files, season, episode, &rules.profile))
            .collect();

        assert_eq!(below, [(Some(1), Some(1))]);
    }

    #[test]
    fn a_run_file_holds_each_episode_in_it() {
        let judged = JudgedFile {
            file_id: "f1".into(),
            rel_path: None,
            season: Some(1),
            episode: Some(3),
            episode_end: Some(4),
            release: None,
            runtime_minutes: None,
            evaluation: Evaluation {
                quality: kroma_scene::Quality::WebDl1080,
                quality_rank: Some(1),
                formats: Vec::new(),
                format_score: 0,
                revision: 1,
            },
            below_target: false,
        };

        assert!(judged.holds(Some(1), Some(4)));
        assert!(judged.holds(Some(1), None));
        assert!(!judged.holds(Some(1), Some(5)));
        assert!(!judged.holds(None, None));
    }

    fn with_runtime(episode: u32, minutes: u32, spans: u32) -> JudgedFile {
        JudgedFile {
            runtime_minutes: Some(minutes),
            episode_end: Some(episode + spans - 1),
            ..judged(1, episode, Quality::WebDl1080, 1)
        }
    }

    #[test]
    fn the_runtime_a_size_limit_uses_is_the_middle_of_what_the_title_holds() {
        let files = [
            with_runtime(1, 21, 1),
            with_runtime(2, 22, 1),
            with_runtime(3, 48, 1),
        ];

        assert_eq!(title_runtime(&files), Some(22));
    }

    #[test]
    fn a_title_whose_files_report_no_duration_leaves_the_runtime_unknown() {
        let files = [judged(1, 1, Quality::WebDl1080, 1)];

        assert_eq!(title_runtime(&files), None);
    }

    fn run_of(episodes: u32, duration_ms: u64) -> TitleFile {
        TitleFile {
            season: Some(1),
            episode: Some(1),
            episode_end: Some(episodes),
            file: MediaFile {
                id: "f1".into(),
                rel_path: None,
                container: "mkv".into(),
                size: None,
                edition: None,
                probed: false,
                unreadable: None,
                duration_ms: Some(duration_ms),
                abs_path: None,
                video: None,
                audio: None,
                audio_tracks: Vec::new(),
                subtitles: Vec::new(),
                edition_id: None,
            },
        }
    }

    #[test]
    fn a_file_holding_a_run_of_episodes_counts_as_one_episode_long() {
        assert_eq!(unit_runtime(&run_of(3, 3 * 22 * 60_000)), Some(22));
    }

    #[test]
    fn a_file_the_probe_timed_at_nothing_says_nothing_about_the_runtime() {
        assert_eq!(unit_runtime(&run_of(1, 0)), None);
    }
}
