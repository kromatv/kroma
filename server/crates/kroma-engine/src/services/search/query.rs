//! Query construction.
//!
//! Each query token is matched across every weighted text field: exactly, by
//! prefix (so it matches while you're still typing or dictating), and, on the
//! fields that hold a name, fuzzily. The per-field matches are OR'd together;
//! the per-token clauses are AND'd, so every word must land somewhere "tom
//! hardy" only matches a title whose cast (or title) covers both words.

use tantivy::query::{
    BooleanQuery, BoostQuery, ConstScoreQuery, DisjunctionMaxQuery, FuzzyTermQuery, Occur,
    PhraseQuery, Query, TermQuery,
};
use tantivy::schema::{Field, IndexRecordOption};
use tantivy::{Searcher, Term};

use super::parse::{Locator, Parsed, Role, Token};
use super::schema::Fields;

/// Whether a typo may be forgiven in a field. Names are reproduced from memory
/// and deserve it; prose matches most queries by accident at any useful edit
/// distance.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Fuzzy {
    Allowed,
    Exact,
}

fn weights(f: &Fields) -> [(Field, f32, Fuzzy); 8] {
    [
        (f.title, 6.0, Fuzzy::Allowed),
        (f.alt_title, 4.0, Fuzzy::Allowed),
        (f.joined, 3.0, Fuzzy::Exact),
        (f.show_title, 1.5, Fuzzy::Allowed),
        (f.cast, 3.0, Fuzzy::Allowed),
        (f.crew, 2.5, Fuzzy::Allowed),
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

const LOCATOR_BOOST: f32 = 400.0;

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

/// How many of a query's words a result has to carry.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Need {
    /// Every word that means something.
    All,
    /// At least this many of them, for a query nothing answers in full.
    AtLeast(usize),
}

/// Build a query from a parsed one. Returns `None` when there are no tokens, so
/// the caller returns an empty result set rather than matching everything.
pub(super) fn build(
    fields: &Fields,
    parsed: &Parsed,
    common: &[bool],
    need: Need,
) -> Option<Box<dyn Query>> {
    if parsed.tokens.is_empty() {
        return None;
    }
    let has_meaning = parsed
        .tokens
        .iter()
        .zip(common)
        .any(|(token, common)| token.role == Role::Text && !common);
    let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::with_capacity(parsed.tokens.len() + 1);
    for (index, token) in parsed.tokens.iter().enumerate() {
        let empty = has_meaning && common.get(index).copied().unwrap_or(false);
        let optional = empty || (has_meaning && token.role != Role::Text);
        let occur = match need {
            Need::All if !optional => Occur::Must,
            _ => Occur::Should,
        };
        let scale = if empty { STOPWORD_WEIGHT } else { 1.0 };
        clauses.push((occur, token_clause(fields, token, scale)));
    }
    if let Some(locator) = parsed.locator {
        clauses.push((Occur::Should, located(fields, locator)));
    }
    clauses.extend(as_written(fields, parsed));
    let mut query = BooleanQuery::new(clauses);
    if let Need::AtLeast(count) = need {
        query.set_minimum_number_should_match(count);
    }
    Some(Box::new(query))
}

fn token_clause(fields: &Fields, token: &Token, scale: f32) -> Box<dyn Query> {
    let dist = distance(&token.text);
    let weights = weights(fields);
    let mut variants: Vec<(Occur, Box<dyn Query>)> = Vec::with_capacity(weights.len() * 3);
    for (field, boost, fuzzy) in weights {
        let term = Term::from_field_text(field, &token.text);
        variants.push(should(exact(term.clone()), boost * EXACT_BONUS * scale));
        // Fuzzy match (transposition_cost_one = treat swaps as one edit).
        if fuzzy == Fuzzy::Allowed && dist > 0 {
            let fuzzy = FuzzyTermQuery::new(term.clone(), dist, true);
            variants.push(should(Box::new(fuzzy), boost * scale));
        }
        // Prefix match for partial words ("brea" → "Breaking").
        let prefix = FuzzyTermQuery::new_prefix(term, 0, true);
        variants.push(should(Box::new(prefix), boost * PREFIX_PENALTY * scale));
        if fuzzy == Fuzzy::Allowed {
            for alias in &token.aliases {
                let term = Term::from_field_text(field, alias);
                variants.push(should(exact(term), boost * scale));
            }
        }
    }
    Box::new(BooleanQuery::new(variants))
}

const AS_WRITTEN: f32 = 2.0;

fn as_written(fields: &Fields, parsed: &Parsed) -> Vec<(Occur, Box<dyn Query>)> {
    let all_text = parsed.tokens.iter().all(|token| token.role == Role::Text);
    if parsed.tokens.len() < 2 || !all_text {
        return Vec::new();
    }
    [
        (fields.title, 6.0),
        (fields.alt_title, 4.0),
        (fields.cast, 3.0),
        (fields.crew, 2.5),
    ]
    .into_iter()
    .map(|(field, boost)| {
        let terms: Vec<Term> = parsed
            .tokens
            .iter()
            .map(|token| Term::from_field_text(field, &token.text))
            .collect();
        let phrase = ConstScoreQuery::new(Box::new(PhraseQuery::new(terms)), 1.0);
        should(Box::new(phrase), boost * AS_WRITTEN)
    })
    .collect()
}

fn exact(term: Term) -> Box<dyn Query> {
    let query = TermQuery::new(term, IndexRecordOption::Basic);
    Box::new(ConstScoreQuery::new(Box::new(query), 1.0))
}

fn should(query: Box<dyn Query>, boost: f32) -> (Occur, Box<dyn Query>) {
    (Occur::Should, Box::new(BoostQuery::new(query, boost)))
}

fn located(fields: &Fields, locator: Locator) -> Box<dyn Query> {
    let number = |field: Field, value: u32| -> (Occur, Box<dyn Query>) {
        let term = Term::from_field_u64(field, u64::from(value));
        (
            Occur::Must,
            Box::new(TermQuery::new(term, IndexRecordOption::Basic)),
        )
    };
    let mut wanted = vec![number(fields.season, locator.season)];
    if let Some(episode) = locator.episode {
        wanted.push(number(fields.episode, episode));
    }
    let wanted = ConstScoreQuery::new(Box::new(BooleanQuery::new(wanted)), 1.0);
    Box::new(BoostQuery::new(Box::new(wanted), LOCATOR_BOOST))
}

/// Matches a title carrying any of `phrases` in one of its titles or synopses,
/// in whatever language either was stored. A phrase of several words has to
/// appear as written; a title match scores above a synopsis one.
pub(super) fn carrying(fields: &Fields, phrases: &[Vec<String>]) -> Option<Box<dyn Query>> {
    const TITLE: f32 = 1.0;
    const SYNOPSIS: f32 = 0.6;
    let mut wordings: Vec<Box<dyn Query>> = Vec::new();
    for words in phrases.iter().filter(|words| !words.is_empty()) {
        for (field, score) in [
            (fields.title, TITLE),
            (fields.alt_title, TITLE),
            (fields.overview, SYNOPSIS),
        ] {
            let terms: Vec<Term> = words
                .iter()
                .map(|word| Term::from_field_text(field, word))
                .collect();
            let query: Box<dyn Query> = match terms.as_slice() {
                [term] => Box::new(TermQuery::new(term.clone(), IndexRecordOption::Basic)),
                _ => Box::new(PhraseQuery::new(terms)),
            };
            wordings.push(Box::new(ConstScoreQuery::new(query, score)));
        }
    }
    if wordings.is_empty() {
        return None;
    }
    Some(Box::new(DisjunctionMaxQuery::new(wordings)))
}
