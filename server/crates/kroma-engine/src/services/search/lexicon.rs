//! The words a query uses to say what it is after rather than to name it:
//! "film", "season 2", "two". They come from the `vocab.*` copy of every
//! language the app ships, folded the way the index folds its own words, so a
//! query is read the same whatever language it is typed in and a new language
//! brings its own words with its catalog.

use std::collections::HashSet;
use std::sync::OnceLock;

use super::entry::tokens;
use super::schema;
use crate::services::vocab;

pub(super) struct Lexicon {
    pub movie: HashSet<String>,
    pub show: HashSet<String>,
    pub season: HashSet<String>,
    pub episode: HashSet<String>,
    pub articles: HashSet<String>,
    numbers: Vec<Vec<String>>,
}

const ROMAN: [&str; 9] = ["ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const FIRST_NUMBER: usize = 2;

impl Lexicon {
    pub(super) fn shared() -> &'static Self {
        static LEXICON: OnceLock<Lexicon> = OnceLock::new();
        LEXICON.get_or_init(Self::read)
    }

    fn read() -> Self {
        let mut analyzer = schema::analyzer();
        let mut fold = |word: &str| -> Option<String> {
            let mut folded = tokens(&mut analyzer, word);
            (folded.len() == 1).then(|| folded.remove(0))
        };
        let mut set = |key: &str| -> HashSet<String> {
            vocab::words(key).iter().filter_map(|word| fold(word)).collect()
        };
        let movie = set("vocab.movie");
        let show = set("vocab.show");
        let season = set("vocab.season");
        let episode = set("vocab.episode");
        let articles = set("vocab.articles");
        let spoken = vocab::by_language("vocab.numbers");
        let numbers = ROMAN
            .iter()
            .enumerate()
            .map(|(at, roman)| {
                let mut group = vec![(at + FIRST_NUMBER).to_string(), (*roman).to_string()];
                for language in &spoken {
                    if let Some(word) = language.get(at).and_then(|word| fold(word)) {
                        if !group.contains(&word) {
                            group.push(word);
                        }
                    }
                }
                group
            })
            .collect();
        Self {
            movie,
            show,
            season,
            episode,
            articles,
            numbers,
        }
    }

    /// The other ways to write the number `word` is, when it is one. A single
    /// letter is a word far more often than it is a numeral.
    pub(super) fn spellings(&self, word: &str) -> Vec<String> {
        if word.len() == 1 && !word.chars().all(|c| c.is_ascii_digit()) {
            return Vec::new();
        }
        self.numbers
            .iter()
            .find(|group| group.iter().any(|spelling| spelling == word))
            .map(|group| group.iter().filter(|s| *s != word).cloned().collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_number_is_known_by_its_digit_its_numeral_and_every_language_s_word() {
        let lexicon = Lexicon::shared();

        assert_eq!(lexicon.spellings("2"), ["ii", "two", "deux"]);
        assert_eq!(lexicon.spellings("trois"), ["3", "iii", "three"]);
        assert_eq!(lexicon.spellings("x"), Vec::<String>::new());
        assert_eq!(lexicon.spellings("dune"), Vec::<String>::new());
    }

    #[test]
    fn the_words_are_folded_as_the_index_folds_a_query() {
        let lexicon = Lexicon::shared();

        assert!(lexicon.show.contains("serie"), "série, without its accent");
        assert!(lexicon.episode.contains("episode"));
        assert!(lexicon.season.contains("saison") && lexicon.season.contains("season"));
        assert!(lexicon.articles.contains("the") && lexicon.articles.contains("le"));
    }
}
