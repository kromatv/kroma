//! Pure TMDB candidate matching: normalize titles, score search hits against the
//! `(title, year)` a filename parsed to, and pick the best one or reject them all.
//! Zero I/O: the HTTP half lives in the engine's `infra::metadata::search`.

mod normalize;

use normalize::{dice, normalize_core, strip_article};

pub use normalize::{normalize, similarity, strip_combining};

/// One TMDB search hit, reduced to what scoring needs.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Candidate {
    pub tmdb_id: u64,
    // Localized title (`title` for movies, `name` for shows).
    pub title: String,
    pub original_title: String,
    pub year: Option<u32>,
    pub votes: u32,
}

#[derive(Debug, Clone, Copy)]
pub struct Query<'a> {
    pub title: &'a str,
    pub year: Option<u32>,
}

// Below this we record a miss rather than store a wrong poster: nothing
// downstream re-questions a bad match.
pub const MIN_SCORE: f32 = 0.35;

const SIM_WEIGHT: f32 = 0.75;
// Same year rescues a partial title match, e.g. a foreign filename resolving to
// an English `title`/`original_title` pair.
const YEAR_EXACT: f32 = 0.25;
// Off by one: release year vs. festival/production year, extremely common.
const YEAR_NEAR: f32 = 0.10;
// Years that genuinely disagree: almost always a different title entirely.
const YEAR_FAR: f32 = -0.35;
// Tiny nudge so a well-known title outranks an obscure namesake; capped low
// enough that it can never overturn a title or year signal.
const VOTES_WEIGHT: f32 = 0.03;
const VOTES_CAP: u32 = 2000;
// An article-dropped match ("Matrix" vs "The Matrix") must never tie a literal
// title, or "A Scary Movie" outranks the real "Scary Movie" on TMDB's ordering
// alone. Cap it just below a perfect score.
const ARTICLE_MATCH_CEIL: f32 = 0.97;

/// Score one candidate in `0.0..=1.0`. See [`MIN_SCORE`] for the accept cutoff.
pub fn score(query: &Query, candidate: &Candidate) -> f32 {
    score_parts(query, candidate).0
}

fn score_parts(query: &Query, candidate: &Candidate) -> (f32, bool) {
    let (sim, exact) = title_match(query.title, candidate);
    let year_adj = match (query.year, candidate.year) {
        (Some(a), Some(b)) if a == b => YEAR_EXACT,
        (Some(a), Some(b)) if a.abs_diff(b) <= 1 => YEAR_NEAR,
        (Some(_), Some(_)) => YEAR_FAR,
        // One side has no year: no evidence either way.
        _ => 0.0,
    };
    let votes = VOTES_WEIGHT * (candidate.votes.min(VOTES_CAP) as f32 / VOTES_CAP as f32);
    ((SIM_WEIGHT * sim + year_adj + votes).clamp(0.0, 1.0), exact)
}

// Best title similarity in `0.0..=1.0` across the candidate's localized and
// original titles, plus whether that best was a *literal* match. A literal match
// is reserved the perfect 1.0; a match that only holds once a leading article is
// dropped is capped at [`ARTICLE_MATCH_CEIL`], so an exact title always outranks a
// namesake that merely folds onto it.
fn title_match(query: &str, candidate: &Candidate) -> (f32, bool) {
    let (sim_t, exact_t) = title_similarity(query, &candidate.title);
    let (sim_o, exact_o) = title_similarity(query, &candidate.original_title);
    (sim_t.max(sim_o), exact_t || exact_o)
}

// Similarity of one title to the query, and whether it was literal. `strict`
// keeps articles so an exact title scores a true 1.0; the article-tolerant
// `loose` path only rescues an article difference ("Matrix" vs "The Matrix") and
// is capped below 1.0 so it can never tie the literal form.
fn title_similarity(query: &str, title: &str) -> (f32, bool) {
    let q = normalize_core(query);
    let t = normalize_core(title);
    let strict = dice(&q, &t);
    if strict >= 1.0 {
        return (1.0, true);
    }
    let loose = dice(&strip_article(&q), &strip_article(&t));
    (strict.max(ARTICLE_MATCH_CEIL * loose), false)
}

/// The best candidate and its score, or `None` when nothing clears [`MIN_SCORE`].
pub fn pick_best<'a>(query: &Query, candidates: &'a [Candidate]) -> Option<(&'a Candidate, f32)> {
    candidates
        .iter()
        .map(|c| {
            let (s, exact) = score_parts(query, c);
            (c, s, exact)
        })
        .filter(|&(_, s, _)| s >= MIN_SCORE)
        // Rank by score, then break ties deterministically so the pick never rides
        // on TMDB's result ordering: a literal-exact title over an article-variant,
        // then the better-known film (votes), then the lower id.
        .max_by(|a, b| {
            a.1.total_cmp(&b.1)
                .then(a.2.cmp(&b.2))
                .then(a.0.votes.cmp(&b.0.votes))
                .then(b.0.tmdb_id.cmp(&a.0.tmdb_id))
        })
        .map(|(c, s, _)| (c, s))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cand(id: u64, title: &str, year: Option<u32>) -> Candidate {
        Candidate {
            tmdb_id: id,
            title: title.to_string(),
            original_title: title.to_string(),
            year,
            votes: 0,
        }
    }

    #[test]
    fn exact_title_and_year_scores_near_one() {
        let q = Query {
            title: "The Matrix",
            year: Some(1999),
        };
        assert!(score(&q, &cand(603, "The Matrix", Some(1999))) > 0.99);
    }

    #[test]
    fn a_matching_year_lifts_a_partial_title_over_the_bar() {
        // Filenames drop or mangle subtitles constantly; the year is what makes
        // the remainder trustworthy enough to accept.
        let q = Query {
            title: "Blade Runner",
            year: Some(2017),
        };
        let s = score(&q, &cand(335984, "Blade Runner 2049", Some(2017)));
        assert!(s > 0.8, "expected a confident match, got {s}");
    }

    #[test]
    fn an_unrecognizable_title_is_rejected_even_on_an_exact_year() {
        // TMDB sometimes answers through an alternative title we never see, so
        // neither `title` nor `original_title` resembles the query. We choose to
        // record a miss: a wrong poster is invisible and nothing downstream
        // re-questions it, whereas a miss is visible and manually fixable.
        let q = Query {
            title: "Les Evades",
            year: Some(1994),
        };
        assert!(score(&q, &cand(278, "The Shawshank Redemption", Some(1994))) < MIN_SCORE);
    }

    #[test]
    fn a_wrong_year_sinks_an_otherwise_plausible_title() {
        let q = Query {
            title: "It",
            year: Some(2017),
        };
        assert!(score(&q, &cand(1, "It Follows", Some(2014))) < MIN_SCORE);
    }

    #[test]
    fn pick_best_prefers_the_right_year_over_tmdb_ordering() {
        // What TMDB returns first for "It" is not what the file is.
        let q = Query {
            title: "It",
            year: Some(1990),
        };
        let candidates = vec![cand(474350, "It", Some(2017)), cand(437, "It", Some(1990))];
        let (best, _) = pick_best(&q, &candidates).expect("a match");
        assert_eq!(best.tmdb_id, 437);
    }

    #[test]
    fn pick_best_rejects_everything_when_nothing_is_close() {
        let q = Query {
            title: "Some Obscure Documentary",
            year: None,
        };
        assert!(pick_best(&q, &[cand(1, "Frozen", Some(2013))]).is_none());
    }

    #[test]
    fn pick_best_matches_on_the_original_title() {
        let q = Query {
            title: "La Haine",
            year: None,
        };
        let c = Candidate {
            tmdb_id: 406,
            title: "Hate".to_string(),
            original_title: "La Haine".to_string(),
            year: Some(1995),
            votes: 0,
        };
        assert!(pick_best(&q, &[c]).is_some());
    }

    #[test]
    fn an_article_variant_scores_below_a_literal_title() {
        let q = Query {
            title: "Scary Movie",
            year: Some(2026),
        };
        let exact = score(&q, &cand(1, "Scary Movie", Some(2026)));
        let variant = score(&q, &cand(2, "A Scary Movie", Some(2026)));
        assert_eq!(exact, 1.0);
        assert!(
            variant < exact,
            "variant {variant} should sit below exact {exact}"
        );
        assert!(
            variant > 0.9,
            "variant {variant} should stay a strong match"
        );
    }

    #[test]
    fn pick_best_prefers_an_exact_title_over_an_article_variant() {
        let q = Query {
            title: "Scary Movie",
            year: Some(2026),
        };
        let exact = Candidate {
            tmdb_id: 1273221,
            title: "Scary Movie".to_string(),
            original_title: "Scary Movie".to_string(),
            year: Some(2026),
            votes: 40,
        };
        let variant = Candidate {
            tmdb_id: 1513026,
            title: "A Scary Movie".to_string(),
            original_title: "Una película de miedo".to_string(),
            year: Some(2026),
            votes: 3,
        };
        let exact_first = [exact.clone(), variant.clone()];
        assert_eq!(
            pick_best(&q, &exact_first).expect("a match").0.tmdb_id,
            1273221
        );
        let variant_first = [variant, exact];
        assert_eq!(
            pick_best(&q, &variant_first).expect("a match").0.tmdb_id,
            1273221
        );
    }

    #[test]
    fn votes_break_a_tie_between_identical_titles() {
        let q = Query {
            title: "Titan",
            year: None,
        };
        let obscure = Candidate {
            votes: 3,
            ..cand(1, "Titan", None)
        };
        let famous = Candidate {
            votes: 5000,
            ..cand(2, "Titan", None)
        };
        let candidates = [obscure, famous];
        let (best, _) = pick_best(&q, &candidates).expect("a match");
        assert_eq!(best.tmdb_id, 2);
    }

    #[test]
    fn score_stays_within_bounds() {
        let q = Query {
            title: "X",
            year: Some(2022),
        };
        let s = score(
            &q,
            &Candidate {
                votes: u32::MAX,
                ..cand(1, "Y", Some(1900))
            },
        );
        assert!((0.0..=1.0).contains(&s), "score {s} out of range");
    }
}
