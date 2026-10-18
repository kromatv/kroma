use regex::{Regex, RegexBuilder};

use crate::shape::reject;
use crate::{QualityProfile, Reject};

enum Term {
    Text(String),
    Pattern(Regex),
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
        (!term.is_empty()).then(|| Term::Text(term.to_lowercase()))
    }

    fn matches(&self, name: &str) -> bool {
        match self {
            Term::Text(text) => name.to_lowercase().contains(text),
            Term::Pattern(regex) => regex.is_match(name),
        }
    }
}

fn readable(terms: &[String]) -> impl Iterator<Item = (&String, Term)> {
    terms
        .iter()
        .filter_map(|written| Some((written, Term::read(written)?)))
}

pub(crate) fn check_terms(profile: &QualityProfile, name: &str) -> Result<(), Reject> {
    if let Some((written, _)) =
        readable(&profile.must_not_contain).find(|(_, term)| term.matches(name))
    {
        return Err(reject(
            "forbidden-keyword",
            written.clone(),
            [("term", serde_json::json!(written))],
        ));
    }
    let required: Vec<(&String, Term)> = readable(&profile.must_contain).collect();
    if !required.is_empty() && !required.iter().any(|(_, term)| term.matches(name)) {
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
