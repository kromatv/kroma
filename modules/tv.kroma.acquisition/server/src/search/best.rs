//! The best release one target can be filled from, as the automatic passes
//! pick it: asked of every indexer, judged by the title's rules, and kept only
//! when the caller wants what grabbing it would do.

use crate::peers::indexers::IndexerRef;
use crate::rules::blocklist::Blocked;
use crate::rules::files::JudgedFile;
use crate::search::hits::CachedRelease;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::Verdict;

use crate::search::judge::{Judge, units_of, verdict_for};
use crate::search::targets::SearchTarget;

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
    if aim.blocked.iter().any(|b| b.matches(&release.title)) {
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
            tmdb_id: aim.tmdb_id,
        });
    }
}
