//! RSS sync: each indexer's latest releases, read without a query, matched to
//! monitored titles by name and year, and grabbed when they fill something
//! missing or upgrade something held. How a new episode lands within minutes
//! without asking every indexer for every episode.

use std::collections::{HashMap, HashSet};

use anyhow::Result;
use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::engine::model::{MonitoredTitle, RequestKind};
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::engine::services::requests::today_ymd;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{ParsedRelease, Verdict};

use crate::auto::{grab_candidate, Grab};
use crate::peers::indexers::{IndexerRef, Query, Release};
use crate::rules::files::judge_title_files;
use crate::rules::RuleBook;
use crate::search::hits::CachedRelease;
use crate::search::judge::{units_of, verdict_for, Judge};
use crate::search::SearchTarget;

const LAST_RUN: &str = "rss_last_at";

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RssSummary {
    pub releases: usize,
    pub matched: usize,
    pub grabbed: usize,
}

/// Reads every indexer's latest releases once `acqRssMinutes` has passed
/// since the last read.
pub fn rss_pass<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<RssSummary> {
    let minutes = state.setting_i64("acqRssMinutes", 15).max(0);
    let now = now_ms();
    if minutes == 0 || !state.setting_bool("acqEnabled", false) || !due(state, now, minutes)? {
        return Ok(RssSummary::default());
    }
    if !crate::peers::downloads::gate_open(state) {
        return Ok(RssSummary::default());
    }
    crate::rules::store::set_setting(state.store(), LAST_RUN, &now.to_string())?;
    let indexers = crate::peers::indexers::enabled(state)?;
    let conn = state.db().get()?;
    let titles = db::list_monitored(&conn)?;
    drop(conn);
    let by_name = index_titles(&titles);
    let book = crate::rules::load(state)?;
    let mut summary = RssSummary::default();
    let mut picks: HashMap<(RequestKind, u64, String), (CachedRelease, Vec<String>)> = HashMap::new();
    for indexer in &indexers {
        let latest = match crate::search_indexer(state, indexer, &Query::Text { query: String::new() }) {
            Ok(releases) => releases,
            Err(e) => {
                log(format!("rss: {} did not answer: {e:#}", indexer.name));
                continue;
            }
        };
        summary.releases += latest.len();
        for release in latest {
            let Some(title) = match_title(&by_name, &release.title) else {
                continue;
            };
            summary.matched += 1;
            if let Some((pick, rows)) = judge_for(state, &book, title, &release, indexer)? {
                keep_best(&mut picks, title, pick, rows);
            }
        }
    }
    for ((kind, tmdb_id, _), (candidate, rows)) in picks {
        let conn = state.db().get()?;
        let request_id = db::find_open_request(&conn, kind, tmdb_id)?.map(|r| r.id);
        drop(conn);
        let title = titles.iter().find(|t| (t.kind, t.tmdb_id) == (kind, tmdb_id));
        log(format!("rss: grabbing \"{}\"", candidate.view.title));
        let grab = Grab {
            title: title.map(|t| (t.title.clone(), t.year)),
            request_id,
            rows,
        };
        match grab_candidate(state, &candidate, grab) {
            Ok(()) => summary.grabbed += 1,
            Err(e) => log(format!("rss: grab failed: {e:#}")),
        }
    }
    Ok(summary)
}

fn due<S: HostStorage>(state: &S, now: i64, minutes: i64) -> Result<bool> {
    let last: i64 = crate::rules::store::setting(state.store(), LAST_RUN)?
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    Ok(now - last >= minutes * 60_000)
}

/// A name as releases spell it, reduced to what survives every spelling:
/// lowercase letters and digits, accents dropped, `&` read as `and`.
pub(crate) fn clean_title(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.to_lowercase().replace('&', " and ").chars() {
        let folded = match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => 'a',
            'ç' => 'c',
            'è' | 'é' | 'ê' | 'ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' => 'i',
            'ñ' => 'n',
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
            'ù' | 'ú' | 'û' | 'ü' => 'u',
            'ý' | 'ÿ' => 'y',
            other => other,
        };
        if folded.is_ascii_alphanumeric() {
            out.push(folded);
        }
    }
    out
}

fn index_titles(titles: &[MonitoredTitle]) -> HashMap<String, Vec<&MonitoredTitle>> {
    let mut by_name: HashMap<String, Vec<&MonitoredTitle>> = HashMap::new();
    for title in titles {
        let names: HashSet<String> = std::iter::once(&title.title)
            .chain(title.aliases.iter())
            .map(|name| clean_title(name))
            .filter(|name| !name.is_empty())
            .collect();
        for name in names {
            by_name.entry(name).or_default().push(title);
        }
    }
    by_name
}

/// The monitored title a release is of: same cleaned name, the right kind,
/// and for a film a year within one of the title's.
pub(crate) fn match_title<'a>(
    by_name: &HashMap<String, Vec<&'a MonitoredTitle>>,
    release_name: &str,
) -> Option<&'a MonitoredTitle> {
    let parsed = kroma_scene::parse_release_name(release_name);
    let episodic = parsed.season.is_some() || parsed.full_season;
    by_name
        .get(&clean_title(&parsed.title))?
        .iter()
        .copied()
        .find(|title| match title.kind {
            RequestKind::Show => episodic,
            RequestKind::Movie => {
                !episodic
                    && match (title.year, parsed.year) {
                        (Some(want), Some(got)) => want.abs_diff(got) <= 1,
                        _ => true,
                    }
            }
        })
}

/// What the release would fill or upgrade, as a target and the rows it covers.
pub(crate) fn target_for(
    title: &MonitoredTitle,
    parsed: &ParsedRelease,
    rows: &[WantedRow],
) -> Option<(SearchTarget, Vec<String>)> {
    let row = |season: Option<u32>, episode: Option<u32>| {
        rows.iter()
            .find(|w| w.season == season && w.episode == episode)
    };
    if title.kind == RequestKind::Movie {
        let w = row(None, None)?;
        let st = SearchTarget::movie(title.tmdb_id, w.imdb_id.clone(), title.title.clone(), title.year);
        return Some((st, vec![w.id.clone()]));
    }
    let season = parsed.season?;
    if parsed.full_season {
        let held: Vec<&WantedRow> = rows.iter().filter(|w| w.season == Some(season)).collect();
        if held.is_empty() {
            return None;
        }
        let episodes: Vec<u32> = held.iter().filter_map(|w| w.episode).collect();
        let st = SearchTarget::season(
            title.tmdb_id,
            title.title.clone(),
            season,
            held.len() as u32,
            Some(episodes),
        );
        return Some((st, held.iter().map(|w| w.id.clone()).collect()));
    }
    let first = parsed.episode?;
    let last = parsed.episode_end.unwrap_or(first).max(first);
    let covered: Vec<&WantedRow> = (first..=last)
        .filter_map(|episode| row(Some(season), Some(episode)))
        .collect();
    if covered.is_empty() {
        return None;
    }
    let st = SearchTarget::episode(title.tmdb_id, title.title.clone(), season, first);
    Some((st, covered.iter().map(|w| w.id.clone()).collect()))
}

fn judge_for<S: HostStorage>(
    state: &S,
    book: &RuleBook,
    title: &MonitoredTitle,
    release: &Release,
    indexer: &IndexerRef,
) -> Result<Option<(CachedRelease, Vec<String>)>> {
    let (kind, tmdb_id) = (title.kind, title.tmdb_id);
    let conn = state.db().get()?;
    let today = today_ymd();
    let rows: Vec<WantedRow> = db::wanted_for_title(&conn, kind, tmdb_id)?
        .into_iter()
        .filter(|w| w.air_date.as_deref().is_none_or(|d| d <= today.as_str()))
        .collect();
    drop(conn);
    let parsed = kroma_scene::parse_release_name(&release.title);
    let Some((st, covered)) = target_for(title, &parsed, &rows) else {
        return Ok(None);
    };
    if crate::rules::blocklist::for_title(state.store(), kind, tmdb_id)?
        .iter()
        .any(|b| b.matches(&release.title))
    {
        return Ok(None);
    }
    let profile = book.profile_for(state, kind, tmdb_id)?;
    let original = crate::rules::original_language(state, kind, tmdb_id)?;
    let judge = Judge {
        rules: book.rules(profile),
        original: original.as_ref(),
        runtime_minutes: None,
    };
    let (mut view, judged) = judge.release(release, indexer, &st);
    let Some(judged) = judged else {
        return Ok(None);
    };
    let files = judge_title_files(state, kind, tmdb_id, &judge.rules, original.as_ref())?;
    let verdict = verdict_for(&judged.evaluation, &units_of(&view, &files), &files, profile);
    let grabbed = rows
        .iter()
        .filter(|w| covered.contains(&w.id))
        .any(|w| w.status == "grabbed");
    if !verdict.is_wanted() || grabbed {
        return Ok(None);
    }
    view.verdict = Some(verdict);
    view.upgrade = matches!(verdict, Verdict::Upgrade(_) | Verdict::Beside(_));
    let magnet_or_url = release
        .magnet
        .clone()
        .or_else(|| release.link.clone())
        .unwrap_or_default();
    if magnet_or_url.is_empty() {
        return Ok(None);
    }
    Ok(Some((
        CachedRelease {
            view,
            judged: Some(judged),
            magnet_or_url,
            tmdb_id,
        },
        covered,
    )))
}

fn keep_best(
    picks: &mut HashMap<(RequestKind, u64, String), (CachedRelease, Vec<String>)>,
    title: &MonitoredTitle,
    pick: CachedRelease,
    rows: Vec<String>,
) {
    let mut unit = rows.clone();
    unit.sort();
    let key = (title.kind, title.tmdb_id, unit.join(","));
    let better = picks.get(&key).is_none_or(|(held, _)| {
        match (&pick.judged, &held.judged) {
            (Some(new), Some(old)) => kroma_scene::rank(new, old).is_gt(),
            _ => false,
        }
    });
    if better {
        picks.insert(key, (pick, rows));
    }
}

#[cfg(test)]
mod tests;
