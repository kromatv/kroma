//! The automatic search: what makes a monitored title download itself. Runs as
//! the `acquisition.search` job (cron + triggers). Missing rows come first,
//! each title judged by its own profile; whatever budget is left goes to
//! titles that could still be upgraded. Every searched row is pushed out by its
//! own backoff, so a freshly-aired episode comes back within minutes while an
//! ancient gap steps aside.

use std::collections::{HashMap, HashSet};

use anyhow::Result;

use kroma_module_sdk::db;
use kroma_module_sdk::engine::model::RequestKind;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::engine::services::requests::today_ymd;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Verdict;

use crate::rules::files::judge_title_files;
use crate::rules::RuleBook;
use crate::search::backoff::base_delay_ms;
use crate::search::best::{best_release, Aim};
use crate::search::judge::Judge;
use crate::search::{targets_for_wanted, wanted_ids_by, SearchTarget};

const BATCH: usize = 60;
pub(crate) const MAX_TARGETS: usize = 40;

#[derive(Debug, Default)]
pub struct AutoSummary {
    pub titles: usize,
    pub targets: usize,
    pub grabbed: usize,
    pub upgrades: usize,
    pub errors: Vec<String>,
}

/// What one pass shares across titles.
pub(crate) struct Pass<'a, S: HostStorage> {
    pub(crate) state: &'a S,
    pub(crate) indexers: &'a [crate::peers::indexers::IndexerRef],
    pub(crate) book: &'a RuleBook,
    pub(crate) log: &'a dyn Fn(String),
    pub(crate) cancelled: &'a dyn Fn() -> bool,
}

pub fn auto_search_pass<S: HostStorage>(
    state: &S,
    log: &dyn Fn(String),
    cancelled: &dyn Fn() -> bool,
) -> Result<AutoSummary> {
    let mut summary = AutoSummary::default();
    if !state.setting_bool("acqEnabled", false) {
        log("automatic acquisition is disabled (acqEnabled)".into());
        return Ok(summary);
    }
    if !crate::peers::downloads::gate_open(state) {
        log("VPN kill switch is closed; skipping the search pass".into());
        return Ok(summary);
    }
    let indexers = crate::peers::indexers::enabled(state)?;
    if indexers.is_empty() {
        log("no enabled indexer; configure one under Indexeurs".into());
        return Ok(summary);
    }
    let book = crate::rules::load(state)?;
    let pass = Pass {
        state,
        indexers: &indexers,
        book: &book,
        log,
        cancelled,
    };
    fill_missing(&pass, &mut summary)?;
    if summary.targets < MAX_TARGETS && !cancelled() {
        crate::upgrades::upgrade_pass(&pass, &mut summary)?;
    }
    log(format!(
        "{} target(s) searched across {} title(s), {} grabbed, {} upgrade(s)",
        summary.targets, summary.titles, summary.grabbed, summary.upgrades
    ));
    Ok(summary)
}

fn fill_missing<S: HostStorage>(pass: &Pass<'_, S>, summary: &mut AutoSummary) -> Result<()> {
    let today = today_ymd();
    let now = now_ms();
    let conn = pass.state.db().get()?;
    let due = db::wanted_searchable(&conn, &today, now, BATCH)?;
    drop(conn);
    if due.is_empty() {
        (pass.log)("nothing missing right now".into());
        return Ok(());
    }
    let due_ids: HashSet<String> = due.iter().map(|w| w.id.clone()).collect();
    let mut searched: HashSet<String> = HashSet::new();
    for (kind, tmdb_id) in titles_of(&due) {
        if (pass.cancelled)() || summary.targets >= MAX_TARGETS {
            break;
        }
        // One title failing is not the pass failing: the rows already searched
        // still have to be charged below, or the next pass repeats this one.
        if let Err(e) = search_title(pass, (kind, tmdb_id), &due_ids, summary, &mut searched) {
            summary
                .errors
                .push(format!("search failed for title {tmdb_id}: {e:#}"));
        }
    }
    // Push each SEARCHED row out by its own backoff, grabbed or not: the next
    // pass then rotates to whatever is both due and freshest. A row the target
    // budget or a cancel never reached is not charged an attempt, or a fresh
    // episode behind a backlog would back off to hours out without one indexer
    // ever having been asked for it.
    let charged: Vec<&db::WantedRow> = due.iter().filter(|w| searched.contains(&w.id)).collect();
    schedule_retries(pass.state, &charged, &today, now)
}

/// The titles due rows belong to, freshest first and each once.
fn titles_of(due: &[db::WantedRow]) -> Vec<(RequestKind, u64)> {
    let mut seen = HashSet::new();
    due.iter()
        .map(|w| (title_kind(&w.kind), w.tmdb_id))
        .filter(|title| seen.insert(*title))
        .collect()
}

pub(crate) fn title_kind(unit_kind: &str) -> RequestKind {
    if unit_kind == "movie" {
        RequestKind::Movie
    } else {
        RequestKind::Show
    }
}

// Rows sharing an air-recency bucket share a base delay, so one UPDATE per
// bucket covers the batch instead of one per row.
fn schedule_retries<S: HostStorage>(
    state: &S,
    due: &[&db::WantedRow],
    today: &str,
    now: i64,
) -> Result<()> {
    let mut buckets: HashMap<i64, Vec<String>> = HashMap::new();
    for w in due {
        buckets
            .entry(base_delay_ms(w.air_date.as_deref(), today))
            .or_default()
            .push(w.id.clone());
    }
    for (delay, ids) in buckets {
        db::schedule_next_search(state.db(), &ids, now, delay)?;
    }
    Ok(())
}

fn wanted_row_ids(wanted: &[db::WantedRow], st: &SearchTarget) -> Vec<String> {
    wanted_ids_by(wanted, st.kind, st.season, st.episodes.as_deref())
        .into_iter()
        .filter(|id| wanted.iter().any(|w| &w.id == id && w.status == "wanted"))
        .collect()
}

// The title's whole open list becomes targets, so without the due-batch rule
// an old unfindable season spends every slot ahead of the episode that just
// aired, is charged no backoff for it (only due rows are), and does it again
// forever.
fn worth_a_slot(
    target_rows: &[String],
    covered: &HashSet<String>,
    due_ids: &HashSet<String>,
) -> bool {
    !target_rows.is_empty()
        && !target_rows.iter().all(|id| covered.contains(id))
        && target_rows.iter().any(|id| due_ids.contains(id))
}

pub(crate) fn target_label(st: &SearchTarget) -> String {
    match (st.season, st.episodes.as_ref().and_then(|e| e.first())) {
        (Some(s), _) if st.kind == "season" => format!("S{s:02} pack"),
        (Some(s), Some(e)) => format!("S{s:02}E{e:02}"),
        _ => "the movie".to_string(),
    }
}

fn fills(verdict: Verdict) -> bool {
    verdict.is_wanted()
}

fn search_title<S: HostStorage>(
    pass: &Pass<'_, S>,
    (kind, tmdb_id): (RequestKind, u64),
    due_ids: &HashSet<String>,
    summary: &mut AutoSummary,
    searched: &mut HashSet<String>,
) -> Result<()> {
    let state = pass.state;
    let conn = state.db().get()?;
    let wanted = db::wanted_for_title(&conn, kind, tmdb_id)?;
    let request_id = db::find_open_request(&conn, kind, tmdb_id)?.map(|r| r.id);
    drop(conn);
    summary.titles += 1;
    let profile = pass.book.profile_for(state, kind, tmdb_id)?;
    let original = crate::rules::original_language(state, kind, tmdb_id)?;
    let judge = Judge {
        rules: pass.book.rules(profile),
        original: original.as_ref(),
        runtime_minutes: None,
    };
    let files = judge_title_files(state, kind, tmdb_id, &judge.rules, original.as_ref())?;
    let blocked = crate::rules::blocklist::for_title(state.store(), kind, tmdb_id)?;
    let mut covered: HashSet<String> = HashSet::new();
    for st in &targets_for_wanted(kind, &wanted, &today_ymd()) {
        if (pass.cancelled)() || summary.targets >= MAX_TARGETS {
            break;
        }
        let target_rows = wanted_row_ids(&wanted, st);
        if !worth_a_slot(&target_rows, &covered, due_ids) {
            continue;
        }
        summary.targets += 1;
        searched.extend(target_rows.iter().cloned());
        let aim = Aim {
            target: st,
            judge: &judge,
            tmdb_id,
            files: &files,
            blocked: &blocked,
            accept: fills,
        };
        let outcome = best_release(state, pass.indexers, &aim, &mut summary.errors);
        let title = wanted.first().map(|w| w.title.as_str()).unwrap_or_default();
        let Some(candidate) = outcome.best else {
            (pass.log)(format!(
                "no release for \"{title}\" {} ({} seen{})",
                target_label(st),
                outcome.seen,
                outcome
                    .top_reject
                    .map(|r| format!(", best rejected: {r}"))
                    .unwrap_or_default()
            ));
            continue;
        };
        (pass.log)(format!(
            "grabbing \"{}\" (score {}) for \"{title}\"",
            candidate.view.title,
            candidate.view.score.unwrap_or(0)
        ));
        let grab = Grab {
            title: wanted.first().map(|w| (w.title.clone(), w.year)),
            request_id: request_id.clone(),
            rows: target_rows.clone(),
        };
        match grab_candidate(state, &candidate, grab) {
            Ok(()) => {
                summary.grabbed += 1;
                covered.extend(target_rows);
            }
            Err(e) => summary.errors.push(format!("grab failed: {e:#}")),
        }
    }
    Ok(())
}

/// Who a grab answers to.
pub(crate) struct Grab {
    pub(crate) title: Option<(String, Option<u32>)>,
    pub(crate) request_id: Option<String>,
    pub(crate) rows: Vec<String>,
}

pub(crate) fn grab_candidate<S: HostStorage>(
    state: &S,
    candidate: &crate::search::CachedRelease,
    grab: Grab,
) -> Result<()> {
    let (title, year) = grab.title.unzip();
    let spec = crate::search::grab_spec_from_release(
        &candidate.view,
        &candidate.magnet_or_url,
        candidate.tmdb_id,
        title,
        year.flatten(),
        grab.request_id,
        grab.rows,
        candidate.view.upgrade,
    );
    let row = crate::peers::downloads::grab(state, &spec)?;
    if matches!(candidate.view.verdict, Some(Verdict::Beside(_))) {
        crate::rules::store::place_beside(state.store(), &row.id)?;
    }
    crate::peers::downloads::activate(state, &row.id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::peers::indexers::Query;
    use kroma_scene::Target;

    fn target(
        kind: &'static str,
        season: Option<u32>,
        episodes: Option<Vec<u32>>,
    ) -> SearchTarget {
        SearchTarget {
            query: Query::Movie {
                tmdb_id: None,
                imdb_id: None,
                title: "T".into(),
                year: None,
            },
            target: Target::Movie { year: None },
            kind,
            season,
            episodes,
        }
    }

    fn ids(v: &[&str]) -> HashSet<String> {
        v.iter().map(|s| (*s).to_string()).collect()
    }

    fn row(id: &str, kind: &str, tmdb_id: u64) -> db::WantedRow {
        db::WantedRow {
            id: id.into(),
            request_id: None,
            kind: kind.into(),
            tmdb_id,
            imdb_id: None,
            title: "T".into(),
            year: None,
            season: None,
            episode: None,
            air_date: None,
            status: "wanted".into(),
            last_search_at: None,
        }
    }

    #[test]
    fn only_a_target_holding_a_due_row_spends_a_slot() {
        let due = ids(&["s05e10"]);
        let backlog = vec!["s01e01".to_string(), "s01e02".to_string()];

        assert!(!worth_a_slot(&backlog, &HashSet::new(), &due));
        assert!(worth_a_slot(&["s05e10".to_string()], &HashSet::new(), &due));
    }

    #[test]
    fn a_pack_already_grabbed_this_pass_does_not_spend_a_second_slot() {
        let due = ids(&["s01e01"]);
        let rows = vec!["s01e01".to_string()];

        assert!(!worth_a_slot(&rows, &ids(&["s01e01"]), &due));
        assert!(!worth_a_slot(&[], &HashSet::new(), &due));
    }

    #[test]
    fn target_labels_name_what_was_searched() {
        assert_eq!(target_label(&target("movie", None, None)), "the movie");
        assert_eq!(target_label(&target("season", Some(3), None)), "S03 pack");
        assert_eq!(
            target_label(&target("episode", Some(3), Some(vec![7]))),
            "S03E07"
        );
    }

    #[test]
    fn due_rows_are_searched_title_by_title_in_the_order_they_came() {
        let due = vec![
            row("a", "episode", 7),
            row("b", "movie", 603),
            row("c", "episode", 7),
        ];

        let titles = titles_of(&due);

        assert_eq!(titles, [(RequestKind::Show, 7), (RequestKind::Movie, 603)]);
    }

    #[test]
    fn a_pass_fills_a_slot_and_upgrades_but_never_takes_a_worse_copy() {
        assert!(fills(Verdict::Fill));
        assert!(fills(Verdict::Upgrade(kroma_scene::Reason::Quality)));
        assert!(!fills(Verdict::NotBetter(kroma_scene::Reason::LowerQuality)));
    }
}
