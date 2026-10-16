//! The upgrade pass: monitored titles whose files their profile would still
//! improve are searched for a better copy, on a backoff of their own that
//! starts at half a day and stretches to a week, so upgrades never starve a
//! missing episode.

use std::collections::BTreeMap;

use anyhow::Result;
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::engine::model::{MonitoredTitle, RequestKind};
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Evaluation, QualityProfile, Verdict, cutoff_unmet};

use crate::auto::{AutoSummary, Grab, MAX_TARGETS, Pass, grab_candidate, target_label};
use crate::rules::files::{JudgedFile, judge_title_files};
use crate::rules::store;
use crate::search::SearchTarget;
use crate::search::best::{Aim, best_release};
use crate::search::judge::Judge;

const MAX_TITLES: usize = 5;
const MAX_TARGETS_PER_TITLE: usize = 3;

pub(crate) fn upgrade_pass<S: HostStorage>(
    pass: &Pass<'_, S>,
    summary: &mut AutoSummary,
) -> Result<()> {
    let conn = pass.state.db().get()?;
    let titles = db::list_monitored(&conn)?;
    drop(conn);
    let now = now_ms();
    let mut visited = 0;
    for title in titles {
        if (pass.cancelled)() || summary.targets >= MAX_TARGETS || visited >= MAX_TITLES {
            break;
        }
        if !store::upgrade_due(pass.state.store(), title.kind, title.tmdb_id, now)? {
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
    let judge = Judge {
        rules: pass.book.rules(profile),
        original: original.as_ref(),
        runtime_minutes: None,
    };
    let files = judge_title_files(state, kind, tmdb_id, &judge.rules, original.as_ref())?;
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

/// What to search to upgrade a title: the film, or per season the pack when
/// every monitored episode there could be improved, else the episodes that
/// could. Each target comes with the rows it covers.
pub(crate) fn upgrade_targets(
    kind: RequestKind,
    rows: &[WantedRow],
    files: &[JudgedFile],
    profile: &QualityProfile,
) -> Vec<(SearchTarget, Vec<String>)> {
    let unmet = |season: Option<u32>, episode: Option<u32>| {
        let held: Vec<Evaluation> = files
            .iter()
            .filter(|f| f.holds(season, episode))
            .map(|f| f.evaluation.clone())
            .collect();
        cutoff_unmet(&held, profile)
    };
    if kind == RequestKind::Movie {
        return rows
            .iter()
            .find(|w| w.kind == "movie" && unmet(None, None))
            .map(|w| {
                let st = SearchTarget::movie(w.tmdb_id, w.imdb_id.clone(), w.title.clone(), w.year);
                (st, vec![w.id.clone()])
            })
            .into_iter()
            .collect();
    }
    let mut seasons: BTreeMap<u32, Vec<&WantedRow>> = BTreeMap::new();
    for w in rows {
        if let Some(season) = w.season {
            seasons.entry(season).or_default().push(w);
        }
    }
    let mut out = Vec::new();
    for (season, held) in seasons {
        let open: Vec<&&WantedRow> = held.iter().filter(|w| unmet(w.season, w.episode)).collect();
        if open.is_empty() {
            continue;
        }
        let sample = held[0];
        if open.len() == held.len() && held.len() > 1 {
            let episodes: Vec<u32> = held.iter().filter_map(|w| w.episode).collect();
            let st = SearchTarget::season(
                sample.tmdb_id,
                sample.title.clone(),
                season,
                held.len() as u32,
                Some(episodes),
            );
            out.push((st, held.iter().map(|w| w.id.clone()).collect()));
            continue;
        }
        for w in open {
            if let Some(episode) = w.episode {
                let st = SearchTarget::episode(w.tmdb_id, w.title.clone(), season, episode);
                out.push((st, vec![w.id.clone()]));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::test_support::TestRules;
    use kroma_scene::Quality;

    fn row(id: &str, season: Option<u32>, episode: Option<u32>) -> WantedRow {
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
            status: "available".into(),
            last_search_at: None,
        }
    }

    fn file(season: Option<u32>, episode: Option<u32>, quality: Quality, rank: u32) -> JudgedFile {
        JudgedFile {
            file_id: format!("f{season:?}{episode:?}"),
            rel_path: None,
            season,
            episode,
            episode_end: None,
            release: None,
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

    fn cutoff_rank(rules: &TestRules) -> u32 {
        rules.profile.cutoff_rank()
    }

    #[test]
    fn a_film_below_its_cutoff_is_searched() {
        let rules = TestRules::new();
        let rows = [row("m", None, None)];
        let files = [file(None, None, Quality::WebDl720, 1)];

        let targets = upgrade_targets(RequestKind::Movie, &rows, &files, &rules.profile);

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0.kind, "movie");
        assert_eq!(targets[0].1, ["m"]);
    }

    #[test]
    fn a_film_at_its_cutoff_is_left_alone() {
        let rules = TestRules::new();
        let rows = [row("m", None, None)];
        let files = [file(None, None, Quality::Bluray1080, cutoff_rank(&rules))];

        assert!(upgrade_targets(RequestKind::Movie, &rows, &files, &rules.profile).is_empty());
    }

    #[test]
    fn a_season_whose_every_episode_is_below_takes_a_pack() {
        let rules = TestRules::new();
        let rows = [row("a", Some(1), Some(1)), row("b", Some(1), Some(2))];
        let files = [
            file(Some(1), Some(1), Quality::WebDl720, 1),
            file(Some(1), Some(2), Quality::WebDl720, 1),
        ];

        let targets = upgrade_targets(RequestKind::Show, &rows, &files, &rules.profile);

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0.kind, "season");
        assert_eq!(targets[0].1, ["a", "b"]);
    }

    #[test]
    fn a_season_partly_below_takes_the_episodes_that_are() {
        let rules = TestRules::new();
        let rows = [row("a", Some(1), Some(1)), row("b", Some(1), Some(2))];
        let files = [
            file(Some(1), Some(1), Quality::WebDl720, 1),
            file(Some(1), Some(2), Quality::Bluray1080, cutoff_rank(&rules)),
        ];

        let targets = upgrade_targets(RequestKind::Show, &rows, &files, &rules.profile);

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].0.kind, "episode");
        assert_eq!(targets[0].1, ["a"]);
    }

    #[test]
    fn only_a_better_copy_counts_as_an_upgrade() {
        assert!(upgrades(Verdict::Upgrade(kroma_scene::Reason::Formats)));
        assert!(upgrades(Verdict::Beside(kroma_scene::Reason::Formats)));
        assert!(!upgrades(Verdict::Fill));
    }
}
