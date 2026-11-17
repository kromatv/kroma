use regex::{Regex, RegexBuilder};

use crate::parse::tokenize;
use crate::shape::reject;
use crate::{QualityProfile, Reject};

enum Term {
    Words(Vec<String>),
    Pattern(Regex),
}

struct Name<'a> {
    text: &'a str,
    words: Vec<String>,
}

fn words(text: &str) -> Vec<String> {
    tokenize(text)
        .flat_map(|token| token.split('-'))
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

impl Term {
    fn read(term: &str) -> Option<Self> {
        let term = term.trim();
        if let Some(pattern) = term
            .strip_prefix('/')
            .and_then(|rest| rest.strip_suffix('/'))
        {
            return RegexBuilder::new(pattern)
                .case_insensitive(true)
                .size_limit(1 << 20)
                .build()
                .ok()
                .map(Term::Pattern);
        }
        let words = words(term);
        (!words.is_empty()).then_some(Term::Words(words))
    }

    fn matches(&self, name: &Name) -> bool {
        match self {
            Term::Words(words) => name
                .words
                .windows(words.len())
                .any(|run| run == words.as_slice()),
            Term::Pattern(regex) => regex.is_match(name.text),
        }
    }
}

fn readable(terms: &[String]) -> impl Iterator<Item = (&String, Term)> {
    terms
        .iter()
        .filter_map(|written| Some((written, Term::read(written)?)))
}

pub(crate) fn check_terms(profile: &QualityProfile, name: &str) -> Result<(), Reject> {
    let name = Name {
        text: name,
        words: words(name),
    };
    if let Some((written, _)) =
        readable(&profile.must_not_contain).find(|(_, term)| term.matches(&name))
    {
        return Err(reject(
            "forbidden-keyword",
            written.clone(),
            [("term", serde_json::json!(written))],
        ));
    }
    let required: Vec<(&String, Term)> = readable(&profile.must_contain).collect();
    if !required.is_empty() && !required.iter().any(|(_, term)| term.matches(&name)) {
        let wanted: Vec<&str> = required
            .iter()
            .map(|(written, _)| written.as_str())
            .collect();
        return Err(reject(
            "missing-required-keyword",
            wanted.join(", "),
            [("terms", serde_json::json!(wanted))],
        ));
    }
    Ok(())
}
