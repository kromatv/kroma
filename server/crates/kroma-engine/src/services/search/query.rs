//! Query construction.
//!
//! Each query token is matched across every weighted text field: exactly, by
//! prefix (so it matches while you're still typing or dictating), and, on the
//! fields that hold a name, fuzzily. The per-field matches are OR'd together;
//! the per-token clauses are AND'd, so every word must land somewhere "tom
//! hardy" only matches a title whose cast (or title) covers both words.

use tantivy::query::{BooleanQuery, BoostQuery, FuzzyTermQuery, Occur, Query};
use tantivy::schema::Field;
use tantivy::{Searcher, Term};

use super::schema::Fields;

// Field, weight, and whether a typo may be forgiven in it. A title hit outranks
// an alt-title/cast hit, which outranks a genre hit, which outranks a loose
// overview hit. `show_title` sits near the bottom on purpose: it is there so
// "breaking bad ozymandias" resolves to the episode, not so that every episode
// of a show competes with the show itself.
//
// Fuzziness only on the fields that hold a name: at any useful edit distance a
// synopsis matches most queries by accident, burying the title actually typed.
/// Whether a typo may be forgiven in a field. Names are reproduced from memory
/// and deserve it; prose matches most queries by accident at any useful edit
/// distance.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Fuzzy {
    Allowed,
    Exact,
}

fn weights(f: &Fields) -> [(Field, f32, Fuzzy); 6] {
    [
        (f.title, 6.0, Fuzzy::Allowed),
        (f.alt_title, 4.0, Fuzzy::Allowed),
        (f.show_title, 1.5, Fuzzy::Allowed),
        (f.cast, 3.0, Fuzzy::Allowed),
        (f.genres, 2.0, Fuzzy::Exact),
        (f.overview, 0.3, Fuzzy::Exact),
    ]
}

// Edit-distance budget for a token. At 2, "arrival" reaches "arrive" and
// "rival", so only a long token, where two edits are a small fraction of it,
// gets the full budget. tantivy caps fuzzy distance at 2.
fn distance(token: &str) -> u8 {
    match token.chars().count() {
        0..=3 => 0,
        4..=8 => 1,
        _ => 2,
    }
}

const EXACT_BONUS: f32 = 1.5;
const PREFIX_PENALTY: f32 = 0.5;

const COMMON_SHARE: f64 = 0.3;

// Document frequency is not a statistic under this many titles: in a catalogue
// of two, every word is in half of it.
const MIN_CORPUS: u64 = 30;

const STOPWORD_WEIGHT: f32 = 0.05;

/// Whether `token` is in enough of the index to have stopped meaning anything.
/// Measured against the field it is most common in, since an article saturates
/// the synopses long before it saturates the titles.
pub(super) fn is_common(searcher: &Searcher, fields: &Fields, token: &str) -> bool {
    let total = searcher.num_docs();
    if total < MIN_CORPUS {
        return false;
    }
    weights(fields).iter().any(|(field, _, _)| {
        let term = Term::from_field_text(*field, token);
        searcher
            .doc_freq(&term)
            .is_ok_and(|df| df as f64 > total as f64 * COMMON_SHARE)
    })
}

/// Build a query from already-normalized tokens (lowercased + diacritic-folded
/// by the index analyzer). Returns `None` when there are no tokens, so the caller
/// returns an empty result set rather than matching everything.
pub(super) fn build(fields: &Fields, tokens: &[String], common: &[bool]) -> Option<Box<dyn Query>> {
    if tokens.is_empty() {
        return None;
    }
    let weights = weights(fields);
    let has_meaning = common.iter().any(|c| !c);
    let mut per_token: Vec<(Occur, Box<dyn Query>)> = Vec::with_capacity(tokens.len());
    for (i, token) in tokens.iter().enumerate() {
        let empty = has_meaning && common.get(i).copied().unwrap_or(false);
        let occur = if empty { Occur::Should } else { Occur::Must };
        let scale = if empty { STOPWORD_WEIGHT } else { 1.0 };
        let dist = distance(token);
        let mut variants: Vec<(Occur, Box<dyn Query>)> = Vec::with_capacity(weights.len() * 3);
        for (field, boost, fuzzy) in weights {
            let term = Term::from_field_text(field, token);
            let exact: Box<dyn Query> = Box::new(FuzzyTermQuery::new(term.clone(), 0, true));
            variants.push((
                Occur::Should,
                Box::new(BoostQuery::new(exact, boost * EXACT_BONUS * scale)),
            ));
            // Fuzzy match (transposition_cost_one = treat swaps as one edit).
            if fuzzy == Fuzzy::Allowed && dist > 0 {
                let fuzzy: Box<dyn Query> = Box::new(FuzzyTermQuery::new(term.clone(), dist, true));
                variants.push((
                    Occur::Should,
                    Box::new(BoostQuery::new(fuzzy, boost * scale)),
                ));
            }
            // Prefix match for partial words ("brea" → "Breaking").
            let prefix: Box<dyn Query> = Box::new(FuzzyTermQuery::new_prefix(term, 0, true));
            variants.push((
                Occur::Should,
                Box::new(BoostQuery::new(prefix, boost * PREFIX_PENALTY * scale)),
            ));
        }
        per_token.push((occur, Box::new(BooleanQuery::new(variants))));
    }
    Some(Box::new(BooleanQuery::new(per_token)))
}
