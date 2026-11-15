//! Weighing a collected match by what tantivy's score cannot see: how much of a
//! title the query spells, and whether the title is the year, the kind and the
//! episode the query asked for.

use super::entry::Entry;
use super::hit::{kind_weight, HitKind};
use super::lexicon::Lexicon;
use super::parse::{Locator, Parsed, Role};

/// What a query asks for, read once and applied to every candidate.
pub(super) struct Intent {
    words: Vec<String>,
    year: Option<u32>,
    kind: Option<HitKind>,
    locator: Option<Locator>,
}

const WHOLE_TITLE: f32 = 2.0;
const TITLE_START: f32 = 1.6;
const TITLE_RUN: f32 = 1.3;
const YEAR_MATCH: f32 = 1.4;
const KIND_MATCH: f32 = 1.6;
const LOCATED: f32 = 6.0;
const PRIOR_SPAN: f32 = 0.2;

impl Intent {
    /// `meaningful` flags the words that are not in most of the catalogue.
    pub(super) fn of(parsed: &Parsed, meaningful: &[bool]) -> Self {
        let kept: Vec<String> = parsed
            .tokens
            .iter()
            .zip(meaningful)
            .filter(|(token, meaningful)| **meaningful && token.role == Role::Text)
            .map(|(token, _)| token.text.clone())
            .collect();
        Self {
            words: if kept.is_empty() { parsed.words() } else { kept },
            year: parsed.year(),
            kind: parsed.kind(),
            locator: parsed.locator,
        }
    }

    pub(super) fn located(&self, entry: &Entry) -> bool {
        let Some(locator) = self.locator else {
            return false;
        };
        entry.kind == HitKind::Episode
            && entry.season == Some(locator.season)
            && locator.episode.is_none_or(|episode| entry.episode == Some(episode))
    }

    /// The factor a candidate's raw score is multiplied by.
    pub(super) fn weigh(&self, entry: &Entry, boost: f32) -> f32 {
        let mut factor = kind_weight(entry.kind) * self.title_factor(entry) * boost;
        if self.year.is_some() && entry.year == self.year {
            factor *= YEAR_MATCH;
        }
        if self.kind == Some(entry.kind) {
            factor *= KIND_MATCH;
        }
        if self.located(entry) {
            factor *= LOCATED;
        }
        factor * (1.0 - PRIOR_SPAN / 2.0 + PRIOR_SPAN * entry.prior)
    }

    fn title_factor(&self, entry: &Entry) -> f32 {
        entry
            .titles
            .iter()
            .map(|title| spelled(title, &self.words))
            .fold(1.0, f32::max)
    }
}

fn spelled(title: &[String], query: &[String]) -> f32 {
    if query.is_empty() || title.is_empty() {
        return 1.0;
    }
    let bare = strip_article(title);
    let asked = strip_article(query);
    if bare == asked || title == query {
        return WHOLE_TITLE;
    }
    if starts(bare, asked) || starts(title, query) {
        return TITLE_START;
    }
    if title.windows(query.len()).any(|run| starts(run, query)) {
        return TITLE_RUN;
    }
    1.0
}

fn strip_article(words: &[String]) -> &[String] {
    let articles = &Lexicon::shared().articles;
    match words.split_first() {
        Some((first, rest)) if !rest.is_empty() && articles.contains(first) => rest,
        _ => words,
    }
}

fn starts(title: &[String], query: &[String]) -> bool {
    let Some((last, head)) = query.split_last() else {
        return false;
    };
    title.len() >= query.len()
        && title[..head.len()] == *head
        && title[head.len()].starts_with(last.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(raw: &str) -> Vec<String> {
        raw.split_whitespace().map(str::to_string).collect()
    }

    fn factor(title: &str, query: &str) -> f32 {
        spelled(&words(title), &words(query))
    }

    #[test]
    fn a_query_that_is_the_whole_title_scores_highest() {
        assert_eq!(factor("dune", "dune"), WHOLE_TITLE);
        assert_eq!(factor("dune part two", "dune"), TITLE_START);
        assert_eq!(factor("children of dune", "dune"), TITLE_RUN);
        assert_eq!(factor("arrival", "dune"), 1.0);
    }

    #[test]
    fn a_leading_article_is_not_part_of_the_spelling() {
        assert_eq!(factor("the thing", "thing"), WHOLE_TITLE);
        assert_eq!(factor("thing", "the thing"), WHOLE_TITLE);
        assert_eq!(factor("the", "the"), WHOLE_TITLE);
    }

    #[test]
    fn a_word_still_being_typed_counts_as_started() {
        assert_eq!(factor("breaking bad", "breaking b"), TITLE_START);
        assert_eq!(factor("breaking bad", "brea"), TITLE_START);
        assert_eq!(factor("dune", "dun"), TITLE_START);
    }

    #[test]
    fn words_out_of_order_earn_nothing() {
        assert_eq!(factor("bad breaking", "breaking bad"), 1.0);
    }
}
