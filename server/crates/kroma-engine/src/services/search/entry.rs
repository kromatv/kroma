//! What the index remembers about a document outside tantivy: enough to turn a
//! match back into a hit and to weigh it, without reading the document store.

use tantivy::tokenizer::TextAnalyzer;

use super::hit::HitKind;

pub(super) struct Entry {
    pub id: String,
    pub kind: HitKind,
    pub show_id: Option<String>,
    pub library: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub titles: Vec<Vec<String>>,
    pub prior: f32,
}

pub(super) fn tokens(analyzer: &mut TextAnalyzer, raw: &str) -> Vec<String> {
    let mut stream = analyzer.token_stream(raw);
    let mut out = Vec::new();
    while stream.advance() {
        out.push(stream.token().text.clone());
    }
    out
}

const MAX_JOINED_WHOLE: usize = 4;

/// The spellings of a title with its word breaks removed: every adjacent pair,
/// and the whole of a short one. "Spider-Man" is typed "spiderman" as often as
/// not, and a tokenizer that splits on the hyphen has no such word.
pub(super) fn joined(title: &[String]) -> Vec<String> {
    let mut out: Vec<String> = title.windows(2).map(|pair| pair.concat()).collect();
    if (3..=MAX_JOINED_WHOLE).contains(&title.len()) {
        out.push(title.concat());
    }
    out
}

pub(super) fn prior(rating: Option<f32>) -> f32 {
    rating.map_or(0.5, |r| (r / 10.0).clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::search::schema;

    fn words(raw: &str) -> Vec<String> {
        tokens(&mut schema::analyzer(), raw)
    }

    #[test]
    fn a_title_is_tokenized_folded_and_lowercased() {
        assert_eq!(words("Amélie: Le Film"), ["amelie", "le", "film"]);
    }

    #[test]
    fn a_hyphenated_title_is_also_spelled_as_one_word() {
        assert_eq!(joined(&words("Spider-Man")), ["spiderman"]);
        assert_eq!(
            joined(&words("WALL·E 2")),
            ["walle", "e2", "walle2"],
            "pairs, then the whole of a short title"
        );
    }

    #[test]
    fn a_long_title_is_joined_by_pairs_only() {
        let long = words("the lord of the rings");

        let spellings = joined(&long);

        assert_eq!(spellings.len(), long.len() - 1);
    }

    #[test]
    fn an_unrated_title_sits_at_the_neutral_prior() {
        assert_eq!(prior(None), 0.5);
        assert_eq!(prior(Some(8.0)), 0.8);
        assert_eq!(prior(Some(40.0)), 1.0);
    }
}
