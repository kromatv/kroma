//! The automatic wanted-list search: what makes an approved request download
//! itself. Runs as the `acquisition.search` job (cron + on-approve trigger):
//! due wanted rows -> per-request targets (season packs first) -> indexer
//! sweep -> best accepted release above zero -> grab. Every due row is stamped
//! and pushed out by its own backoff, so a freshly-aired episode comes back
//! within minutes while an ancient gap steps aside.

use std::collections::{HashMap, HashSet};

use anyhow::Result;

use kroma_module_sdk::db;
use kroma_module_sdk::engine::services::jobs::now_ms;
use kroma_module_sdk::engine::services::requests::today_ymd;

use crate::search::backoff::base_delay_ms;
use crate::search::{score_release, targets_for_wanted, wanted_ids_by};

const BATCH: usize = 60;
// Indexer round trips one pass may spend. Ordering, not a request cap, is what
// keeps a fresh episode ahead of an old one, so the budget only bounds cost.
const MAX_TARGETS: usize = 40;

#[derive(Debug, Default)]
pub struct AutoSummary {
    pub requests: usize,
    pub targets: usize,
    pub grabbed: usize,
    pub errors: Vec<String>,
}

pub fn auto_search_pass<S: kroma_module_sdk::host::HostStorage>(
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

    let today = today_ymd();
    let now = now_ms();
    let conn = state.db().get()?;
    let due = db::wanted_searchable(&conn, &today, now, BATCH)?;
    let indexers = crate::peers::indexers::enabled(state)?;
    drop(conn);
    if due.is_empty() {
        log("nothing wanted right now".into());
        return Ok(summary);
    }
    if indexers.is_empty() {
        log("no enabled indexer; configure one under Indexeurs".into());
        return Ok(summary);
    }

    let mut request_ids: Vec<String> = Vec::new();
    for w in &due {
        if !request_ids.contains(&w.request_id) {
            request_ids.push(w.request_id.clone());
        }
    }
    let profile = crate::profile_from_settings(state);

    let due_ids: HashSet<String> = due.iter().map(|w| w.id.clone()).collect();
    let mut searched: HashSet<String> = HashSet::new();
    for request_id in &request_ids {
        if cancelled() || summary.targets >= MAX_TARGETS {
            break;
        }
        // One request failing is not the pass failing: the rows already searched
        // still have to be charged below, or the next pass repeats this one.
        if let Err(e) = search_request(
            state,
            request_id,
            &indexers,
            &profile,
            &due_ids,
            &mut summary,
            &mut searched,
            log,
            cancelled,
        ) {
            summary.errors.push(format!("search failed for request {request_id}: {e:#}"));
        }
    }

    // Push each SEARCHED row out by its own backoff, grabbed or not: the next
    // pass then rotates to whatever is both due and freshest. A row the target
    // budget or a cancel never reached is not charged an attempt, or a fresh
    // episode behind a backlog would back off to hours out without one indexer
    // ever having been asked for it.
    let charged: Vec<&db::WantedRow> = due.iter().filter(|w| searched.contains(&w.id)).collect();
    schedule_retries(state, &charged, &today, now)?;
    log(format!(
        "{} target(s) searched across {} request(s), {} grabbed",
        summary.targets, summary.requests, summary.grabbed
    ));
    Ok(summary)
}

// Rows sharing an air-recency bucket share a base delay, so one UPDATE per
// bucket covers the batch instead of one per row.
fn schedule_retries<S: kroma_module_sdk::host::HostStorage>(
    state: &S,
    due: &[&db::WantedRow],
    today: &str,
    now: i64,
) -> Result<()> {
    let mut buckets: HashMap<i64, Vec<String>> = HashMap::new();
    for w in due {
        buckets.entry(base_delay_ms(w.air_date.as_deref(), today)).or_default().push(w.id.clone());
    }
    for (delay, ids) in buckets {
        db::schedule_next_search(state.db(), &ids, now, delay)?;
    }
    Ok(())
}

fn wanted_row_ids(wanted: &[db::WantedRow], st: &crate::search::SearchTarget) -> Vec<String> {
    // Reuse the coverage rule the grab path uses, driven by the target shape.
    wanted_ids_by(wanted, st.kind, st.season, st.episodes.as_deref())
        .into_iter()
        .filter(|id| wanted.iter().any(|w| &w.id == id && w.status == "wanted"))
        .collect()
}

// A target earns one of the pass's indexer slots when it still has an open row
// nothing grabbed this pass, AND at least one of its rows is in the due batch.
// The request's whole open list becomes targets, so without the second rule an
// old unfindable season spends every slot ahead of the episode that just aired,
// is charged no backoff for it (only due rows are), and does it again forever.
fn worth_a_slot(target_rows: &[String], covered: &HashSet<String>, due_ids: &HashSet<String>) -> bool {
    !target_rows.is_empty()
        && !target_rows.iter().all(|id| covered.contains(id))
        && target_rows.iter().any(|id| due_ids.contains(id))
}

fn target_label(st: &crate::search::SearchTarget) -> String {
    match (st.season, st.episodes.as_ref().and_then(|e| e.first())) {
        (Some(s), _) if st.kind == "season" => format!("S{s:02} pack"),
        (Some(s), Some(e)) => format!("S{s:02}E{e:02}"),
        _ => "the movie".to_string(),
    }
}

fn search_request<S: kroma_module_sdk::host::HostStorage>(
    state: &S,
    request_id: &str,
    indexers: &[crate::peers::indexers::IndexerRef],
    profile: &kroma_scene::Profile,
    due_ids: &HashSet<String>,
    summary: &mut AutoSummary,
    searched: &mut HashSet<String>,
    log: &dyn Fn(String),
    cancelled: &dyn Fn() -> bool,
) -> Result<()> {
    let conn = state.db().get()?;
    let Some(req) = db::get_request(&conn, request_id)? else { return Ok(()) };
    let wanted = db::wanted_for_request(&conn, request_id)?;
    drop(conn);

    summary.requests += 1;
    let targets = targets_for_wanted(req.kind, &wanted, &today_ymd());
    // Rows a pack grab already covered this pass (skip episode targets).
    let mut covered: HashSet<String> = HashSet::new();
    for st in &targets {
        if cancelled() || summary.targets >= MAX_TARGETS {
            break;
        }
        let target_rows = wanted_row_ids(&wanted, st);
        if !worth_a_slot(&target_rows, &covered, due_ids) {
            continue;
        }
        summary.targets += 1;
        searched.extend(target_rows.iter().cloned());

        let outcome = best_candidate(state, indexers, st, profile, req.tmdb_id, &mut summary.errors);
        let Some((candidate, score)) = outcome.best else {
            // A silent empty pass reads the same as a broken indexer; say which
            // it was, since this is the only trace the admin ever gets.
            log(format!(
                "no release for \"{}\" {} ({} seen{})",
                req.title,
                target_label(st),
                outcome.seen,
                outcome.top_reject.map(|r| format!(", best rejected: {r}")).unwrap_or_default()
            ));
            continue;
        };
        log(format!(
            "grabbing \"{}\" (score {score}) for \"{}\"",
            candidate.view.title, req.title
        ));
        let spec = crate::search::grab_spec_from_release(
            &candidate.view,
            &candidate.magnet_or_url,
            candidate.tmdb_id,
            Some(req.title.clone()),
            req.year,
            Some(request_id.to_string()),
            target_rows.clone(),
            // The automatic pass only ever fills gaps: an upgrade is always a
            // deliberate act from the request page.
            false,
        );
        match crate::peers::downloads::grab(state, &spec) {
            Ok(row) => {
                // Background job: fine to add synchronously here.
                crate::peers::downloads::activate(state, &row.id);
                summary.grabbed += 1;
                covered.extend(target_rows);
            }
            Err(e) => summary.errors.push(format!("grab failed: {e:#}")),
        }
    }
    Ok(())
}

#[derive(Default)]
struct Outcome {
    best: Option<(crate::search::CachedRelease, i32)>,
    seen: usize,
    top_reject: Option<String>,
}

fn best_candidate<S: kroma_module_sdk::host::HostStorage>(
    state: &S,
    indexers: &[crate::peers::indexers::IndexerRef],
    st: &crate::search::SearchTarget,
    profile: &kroma_scene::Profile,
    tmdb_id: u64,
    errors: &mut Vec<String>,
) -> Outcome {
    let mut out = Outcome::default();
    for indexer in indexers {
        let found = match crate::search_indexer(state, indexer, &st.query) {
            Ok(f) => f,
            Err(e) => {
                errors.push(format!("{}: {e:#}", indexer.name));
                continue;
            }
        };
        out.seen += found.len();
        take_best(found, indexer, st, profile, tmdb_id, &mut out);
    }
    out
}

fn take_best(
    found: Vec<crate::peers::indexers::Release>,
    indexer: &crate::peers::indexers::IndexerRef,
    st: &crate::search::SearchTarget,
    profile: &kroma_scene::Profile,
    tmdb_id: u64,
    out: &mut Outcome,
) {
    for release in found {
        let view = score_release(&release, indexer, st, profile);
        let Some(score) = view.score else {
            if out.top_reject.is_none() {
                out.top_reject = view.rejected;
            }
            continue;
        };
        let magnet_or_url =
            release.magnet.clone().or_else(|| release.link.clone()).unwrap_or_default();
        if magnet_or_url.is_empty() {
            continue;
        }
        if out.best.as_ref().is_none_or(|(_, s)| score > *s) {
            out.best = Some((crate::search::CachedRelease { view, magnet_or_url, tmdb_id }, score));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::peers::indexers::Query;
    use kroma_scene::Target;

    fn target(kind: &'static str, season: Option<u32>, episodes: Option<Vec<u32>>) -> crate::search::SearchTarget {
        crate::search::SearchTarget {
            query: Query::Movie { tmdb_id: None, imdb_id: None, title: "T".into(), year: None },
            target: Target::Movie { year: None },
            kind,
            season,
            episodes,
        }
    }

    fn ids(v: &[&str]) -> HashSet<String> {
        v.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn only_a_target_holding_a_due_row_spends_a_slot() {
        let due = ids(&["s05e10"]);
        let backlog = vec!["s01e01".to_string(), "s01e02".to_string()];
        assert!(
            !worth_a_slot(&backlog, &HashSet::new(), &due),
            "a backed-off season must not spend the budget the fresh episode needs"
        );
        assert!(worth_a_slot(&["s05e10".to_string()], &HashSet::new(), &due));
    }

    #[test]
    fn a_pack_already_grabbed_this_pass_does_not_spend_a_second_slot() {
        let due = ids(&["s01e01"]);
        let rows = vec!["s01e01".to_string()];
        assert!(!worth_a_slot(&rows, &ids(&["s01e01"]), &due));
        assert!(!worth_a_slot(&[], &HashSet::new(), &due), "nothing open is nothing to search");
    }

    #[test]
    fn target_labels_name_what_was_searched() {
        assert_eq!(target_label(&target("movie", None, None)), "the movie");
        assert_eq!(target_label(&target("season", Some(3), None)), "S03 pack");
        assert_eq!(target_label(&target("episode", Some(3), Some(vec![7]))), "S03E07");
    }
}
