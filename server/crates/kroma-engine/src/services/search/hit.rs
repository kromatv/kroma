use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum HitKind {
    Movie,
    Show,
    Episode,
}

/// Hits come back sorted by descending relevance, so the position is the rank.
pub struct Hit {
    pub id: String,
    pub kind: HitKind,
    /// Set on an episode: the show it belongs to.
    pub show_id: Option<String>,
}

// A show title lives on every one of its episodes, so a query naming the show
// matches the whole season list. Collect several pages' worth of raw hits, fold
// the episodes back under their show, and only then cut to `limit`.
pub(super) const CANDIDATE_FACTOR: usize = 8;
// tantivy cuts to this on raw score, before anything here has weighed a hit by
// what kind of thing it is. A film that lost that race to a wall of episodes
// matching on show_title is gone before the weighing runs, and no multiplier
// brings back a document that was never collected, so the window is generous.
pub(super) const MAX_CANDIDATES: usize = 1200;
// A show that did NOT match itself is represented by its best few episodes.
pub(super) const MAX_EPISODES_PER_SHOW: usize = 3;

// Reorders the collected window only, which is why MAX_CANDIDATES is wide.
pub(super) fn kind_weight(kind: HitKind) -> f32 {
    match kind {
        HitKind::Movie => 1.0,
        HitKind::Show => 0.75,
        HitKind::Episode => 0.4,
    }
}

/// Drops every episode whose show is itself a hit, caps what is left at
/// [`MAX_EPISODES_PER_SHOW`] per show, and truncates to `limit`. Relevance order
/// is preserved, so a show keeps the rank its own document earned.
pub(super) fn collapse_episodes(hits: Vec<Hit>, limit: usize) -> Vec<Hit> {
    let shows: HashSet<String> = hits
        .iter()
        .filter(|h| h.kind == HitKind::Show)
        .map(|h| h.id.clone())
        .collect();
    let mut kept_per_show: HashMap<String, usize> = HashMap::new();
    let mut out = Vec::with_capacity(limit);
    for hit in hits {
        if out.len() == limit {
            break;
        }
        if let Some(show_id) = hit.show_id.as_deref() {
            if shows.contains(show_id) {
                continue;
            }
            let kept = kept_per_show.entry(show_id.to_string()).or_default();
            if *kept >= MAX_EPISODES_PER_SHOW {
                continue;
            }
            *kept += 1;
        }
        out.push(hit);
    }
    out
}
