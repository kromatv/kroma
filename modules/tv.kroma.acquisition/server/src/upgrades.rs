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
    use super::*;

    #[test]
    fn only_a_better_copy_counts_as_an_upgrade() {
        assert!(upgrades(Verdict::Upgrade(kroma_scene::Reason::Formats)));
        assert!(upgrades(Verdict::Beside(kroma_scene::Reason::Formats)));
        assert!(!upgrades(Verdict::Fill));
    }
}
