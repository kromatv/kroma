//! Asking the provider what a title could be, and ranking the answers.

use anyhow::{bail, Result};

use kroma_domain::matching::{self, Candidate, Query};

use crate::infra::metadata::discover;
use crate::model::MatchCandidate;
use crate::services::settings;
use crate::state::AppState;

// How many candidates a picker offers. One TMDB page is 20; more than that and
// the right title was never going to be found by scrolling.
pub(super) const MAX_CANDIDATES: usize = 20;

/// What a search is being scored against: the title and year the source parsed
/// to, and the id already pinned to it (so the picker can mark it).
#[derive(Debug, Clone, Default)]
pub struct MatchTarget {
    pub title: String,
    pub year: Option<u32>,
    pub current_tmdb_id: Option<u64>,
}

/// Search the provider for `search_text` and rank every hit against `target`.
///
/// `search_text` is what goes to the provider (an operator's own words, when
/// they typed some); `target` is what the score is measured against, so the
/// confidence stays honest about the thing on disk rather than about the query.
pub fn ranked(
    state: &AppState,
    scope: discover::DiscoverScope,
    search_text: &str,
    target: &MatchTarget,
) -> Result<Vec<MatchCandidate>> {
    let Some(api_key) = state.config.tmdb_api_key.clone() else {
        bail!("metadata disabled: set KROMA_TMDB_API_KEY");
    };
    let lang = settings::metadata_language(&state.settings, &state.config);
    // macOS filenames are NFD, so a title parsed from disk carries decomposed
    // accents (`é` as `e` + U+0301). TMDB's search returns nothing for those (it
    // even mismatches "Amélie" to an unrelated title), so strip the combining
    // marks first. This keeps a precomposed `é` and only fixes the decomposed case.
    let primary = matching::strip_combining(search_text);
    let mut hits = discover::search(&api_key, &lang, scope, &primary, 1)
        .map_err(|()| anyhow::anyhow!("TMDB search failed"))?
        .hits;
    // Still nothing? TMDB is also picky about apostrophes and leading articles:
    // "L'Île aux chiens" comes back empty while "ile aux chiens" finds it. Retry
    // once with the fully folded form (lowercased, de-accented, punctuation and a
    // leading article dropped) before giving up.
    if hits.is_empty() {
        let folded = matching::normalize(search_text);
        if !folded.is_empty() && folded != primary {
            hits = discover::search(&api_key, &lang, scope, &folded, 1)
                .map_err(|()| anyhow::anyhow!("TMDB search failed"))?
                .hits;
        }
    }
    Ok(rank(target, hits))
}

// Score every hit against the parsed title/year and sort most-likely first.
fn rank(target: &MatchTarget, hits: Vec<discover::DiscoverHit>) -> Vec<MatchCandidate> {
    let query = Query {
        title: &target.title,
        year: target.year,
    };
    let mut out: Vec<MatchCandidate> = hits
        .into_iter()
        .map(|h| {
            let score = matching::score(
                &query,
                &Candidate {
                    tmdb_id: h.tmdb_id,
                    title: h.title.clone(),
                    original_title: h.original_title.clone(),
                    year: h.year,
                    // Votes are a tiebreaker for the automatic pick; the picker
                    // shows a human the posters, so they add nothing here.
                    votes: 0,
                },
            );
            MatchCandidate {
                tmdb_id: h.tmdb_id,
                title: h.title,
                original_title: Some(h.original_title).filter(|s| !s.is_empty()),
                year: h.year,
                poster_url: h.poster_url,
                overview: h.overview,
                rating: h.rating,
                score,
                current: Some(h.tmdb_id) == target.current_tmdb_id,
            }
        })
        .collect();
    out.sort_by(|a, b| b.score.total_cmp(&a.score));
    out.truncate(MAX_CANDIDATES);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::requests::RequestKind;

    fn target(title: &str, year: Option<u32>, current: Option<u64>) -> MatchTarget {
        MatchTarget {
            title: title.to_string(),
            year,
            current_tmdb_id: current,
        }
    }

    fn hit(id: u64, title: &str, year: Option<u32>) -> discover::DiscoverHit {
        discover::DiscoverHit {
            kind: RequestKind::Movie,
            tmdb_id: id,
            title: title.to_string(),
            original_title: title.to_string(),
            year,
            poster_url: None,
            backdrop_url: None,
            overview: None,
            rating: None,
        }
    }

    #[test]
    fn rank_puts_the_best_scoring_candidate_first() {
        let local = target("It", Some(1990), None);
        let ranked = rank(
            &local,
            vec![hit(474350, "It", Some(2017)), hit(437, "It", Some(1990))],
        );
        assert_eq!(ranked[0].tmdb_id, 437);
        assert!(ranked[0].score > ranked[1].score);
    }

    #[test]
    fn rank_flags_the_stored_match_as_current() {
        let local = target("Dune", Some(2021), Some(438631));
        let ranked = rank(
            &local,
            vec![
                hit(438631, "Dune", Some(2021)),
                hit(841, "Dune", Some(1984)),
            ],
        );
        assert!(ranked.iter().find(|c| c.tmdb_id == 438631).unwrap().current);
        assert!(!ranked.iter().find(|c| c.tmdb_id == 841).unwrap().current);
    }

    #[test]
    fn rank_keeps_low_scoring_candidates_for_the_operator_to_pick() {
        // Unlike the automatic path, nothing is filtered out: the whole point is
        // that the operator can choose a title scoring below the accept cutoff.
        let local = target("Some Local Recording", None, None);
        let ranked = rank(&local, vec![hit(1, "Frozen", Some(2013))]);
        assert_eq!(ranked.len(), 1);
        assert!(ranked[0].score < matching::MIN_SCORE);
    }

    #[test]
    fn rank_caps_the_list() {
        let local = target("X", None, None);
        let hits = (0..50).map(|i| hit(i, "X", None)).collect();
        assert_eq!(rank(&local, hits).len(), MAX_CANDIDATES);
    }

    #[test]
    fn rank_omits_an_empty_original_title() {
        let local = target("Dune", None, None);
        let mut h = hit(1, "Dune", None);
        h.original_title = String::new();
        assert_eq!(rank(&local, vec![h])[0].original_title, None);
    }
}
