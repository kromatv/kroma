use kroma_module_manifest::{Translations, Words};
use serde_json::Value;

const MAX_LANGUAGES: usize = 32;
const MAX_WORD_CHARS: usize = 1000;
const MAX_TAG_LEN: usize = 35;
const MAX_SETUP: usize = 32;

pub(super) fn tagline(row: &Value) -> Option<String> {
    row.get("tagline").and_then(Value::as_str).and_then(bounded)
}

pub(super) fn translations(row: &Value) -> Translations {
    let Some(by_language) = row.get("translations").and_then(Value::as_object) else {
        return Translations::new();
    };
    by_language
        .iter()
        .filter(|(tag, _)| is_language(tag))
        .map(|(tag, words)| (tag.clone(), words_of(words)))
        .filter(|(_, words)| *words != Words::default())
        .take(MAX_LANGUAGES)
        .collect()
}

/// The modules a descriptor offers a server's guided setup, in its order, each
/// once.
pub(super) fn setup(descriptor: &Value) -> Vec<String> {
    let mut offered: Vec<String> = Vec::new();
    let ids = descriptor.get("setup").and_then(Value::as_array);
    for id in ids.into_iter().flatten().filter_map(Value::as_str) {
        if offered.len() < MAX_SETUP && !offered.iter().any(|held| held == id) {
            offered.push(id.to_string());
        }
    }
    offered
}

fn words_of(words: &Value) -> Words {
    let word = |key: &str| words.get(key).and_then(Value::as_str).and_then(bounded);
    Words {
        name: word("name"),
        description: word("description"),
        tagline: word("tagline"),
    }
}

fn bounded(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty() && text.chars().count() <= MAX_WORD_CHARS).then(|| text.to_string())
}

fn is_language(tag: &str) -> bool {
    let mut parts = tag.split('-');
    let primary = parts.next().unwrap_or_default();
    let subtag = |part: &str| {
        (1..=8).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_alphanumeric())
    };
    tag.len() <= MAX_TAG_LEN
        && (2..=3).contains(&primary.len())
        && primary.bytes().all(|b| b.is_ascii_lowercase())
        && parts.all(subtag)
}
