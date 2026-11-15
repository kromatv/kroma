//! Reading a query for what it asks beyond its words: an episode named by its
//! number, a release year, a kind of title, a sequel spelled another way.

use super::hit::HitKind;
use super::lexicon::Lexicon;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Role {
    /// A word the result has to carry.
    Text,
    /// A release year, which no text field holds.
    Year(u32),
    /// A word that names what is being looked for rather than its title.
    Kind(HitKind),
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct Token {
    pub text: String,
    pub role: Role,
    /// Other spellings of the same number: "2", "ii", "two".
    pub aliases: Vec<String>,
}

/// "s02e05", "2x05", "season 2": the episode a query points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Locator {
    pub season: u32,
    pub episode: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct Parsed {
    pub tokens: Vec<Token>,
    pub locator: Option<Locator>,
}

impl Parsed {
    pub(super) fn year(&self) -> Option<u32> {
        self.tokens.iter().find_map(|t| match t.role {
            Role::Year(year) => Some(year),
            _ => None,
        })
    }

    pub(super) fn kind(&self) -> Option<HitKind> {
        self.tokens.iter().find_map(|t| match t.role {
            Role::Kind(kind) => Some(kind),
            _ => None,
        })
    }

    pub(super) fn words(&self) -> Vec<String> {
        self.tokens.iter().map(|t| t.text.clone()).collect()
    }

    pub(super) fn text_words(&self) -> Vec<String> {
        self.tokens
            .iter()
            .filter(|t| t.role == Role::Text)
            .map(|t| t.text.clone())
            .collect()
    }
}

/// Every word as plain text, which is what a query means when reading more
/// into it found nothing.
pub(super) fn literal(words: &[String]) -> Parsed {
    Parsed {
        tokens: words.iter().map(|w| token(w, Role::Text)).collect(),
        locator: None,
    }
}

/// `words` are already folded and lowercased by the index analyzer.
pub(super) fn parse(words: &[String], lexicon: &Lexicon) -> Parsed {
    let (rest, locator) = take_locator(words, lexicon);
    let plain = rest
        .iter()
        .filter(|w| role_of(w, lexicon) == Role::Text)
        .count();
    let tokens = rest
        .iter()
        .map(|word| {
            let role = if plain > 0 {
                role_of(word, lexicon)
            } else {
                Role::Text
            };
            Token {
                text: word.clone(),
                role,
                aliases: lexicon.spellings(word),
            }
        })
        .collect();
    Parsed { tokens, locator }
}

fn token(word: &str, role: Role) -> Token {
    Token {
        text: word.to_string(),
        role,
        aliases: Vec::new(),
    }
}

fn role_of(word: &str, lexicon: &Lexicon) -> Role {
    if let Some(year) = year(word) {
        return Role::Year(year);
    }
    if lexicon.movie.contains(word) {
        return Role::Kind(HitKind::Movie);
    }
    if lexicon.show.contains(word) {
        return Role::Kind(HitKind::Show);
    }
    Role::Text
}

fn year(word: &str) -> Option<u32> {
    if word.len() != 4 {
        return None;
    }
    word.parse::<u32>().ok().filter(|y| (1900..=2099).contains(y))
}

fn take_locator(words: &[String], lexicon: &Lexicon) -> (Vec<String>, Option<Locator>) {
    let mut rest = Vec::with_capacity(words.len());
    let mut season = None;
    let mut episode = None;
    let mut index = 0;
    while index < words.len() {
        let word = words[index].as_str();
        let next = words.get(index + 1).and_then(|w| number(w, 3));
        if season.is_none() {
            if let Some((s, e)) = compact(word) {
                season = Some(s);
                episode = e;
                index += 1;
                continue;
            }
            if let (true, Some(n)) = (lexicon.season.contains(word), next) {
                season = Some(n);
                index += 2;
                continue;
            }
        }
        if season.is_some() && episode.is_none() {
            if let Some(e) = word.strip_prefix('e').and_then(|d| number(d, 3)) {
                episode = Some(e);
                index += 1;
                continue;
            }
            if let (true, Some(n)) = (lexicon.episode.contains(word), next) {
                episode = Some(n);
                index += 2;
                continue;
            }
        }
        rest.push(words[index].clone());
        index += 1;
    }
    match season {
        Some(season) if !rest.is_empty() => (rest, Some(Locator { season, episode })),
        _ => (words.to_vec(), None),
    }
}

fn number(digits: &str, max_len: usize) -> Option<u32> {
    if digits.is_empty() || digits.len() > max_len || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

fn compact(word: &str) -> Option<(u32, Option<u32>)> {
    if let Some(body) = word.strip_prefix('s') {
        return match body.split_once('e') {
            Some((s, e)) => Some((number(s, 2)?, Some(number(e, 3)?))),
            None => Some((number(body, 2)?, None)),
        };
    }
    let (s, e) = word.split_once('x')?;
    Some((number(s, 2)?, Some(number(e, 3)?)))
}

#[cfg(test)]
mod tests;
