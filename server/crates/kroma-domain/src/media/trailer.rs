use std::cmp::Reverse;

use serde::{Deserialize, Serialize};

mod words;

use words::{PROMOTION_WORDS, SUBTITLED, TRAILER_WORDS};

const MAX_TRAILERS: usize = 12;

/// One video TMDB lists for a title, as its `videos` endpoint answers it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TmdbVideo {
    pub key: String,
    pub site: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub iso_639_1: String,
    pub name: String,
    pub official: bool,
    pub published_at: Option<String>,
}

/// How a trailer reaches a viewer: spoken in their language (`localized`),
/// with subtitles in it burned into the picture (`subtitled`), or in neither
/// (`original`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrailerVersion {
    Localized,
    Subtitled,
    Original,
}

/// A trailer or a teaser.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TrailerKind {
    Trailer,
    Teaser,
}

/// A trailer a viewer can be offered, best first in the list it comes in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Trailer {
    /// The YouTube video id.
    pub video: String,
    pub name: String,
    /// The ISO 639-1 language TMDB files the video under.
    pub language: String,
    pub version: TrailerVersion,
    pub kind: TrailerKind,
    pub official: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
}

type Rank = (TrailerVersion, bool, TrailerKind, bool, bool);

fn base(tag: &str) -> String {
    tag.split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn mentions(name: &str, words: &[&str]) -> bool {
    let name = name.to_lowercase();
    words.iter().any(|word| {
        ((word.chars().count() > 4 || !word.is_ascii()) && name.contains(word))
            || name.match_indices(word).any(|(at, _)| {
                let before = name[..at].chars().next_back();
                let after = name[at + word.len()..].chars().next();
                !before.is_some_and(char::is_alphanumeric)
                    && !after.is_some_and(char::is_alphanumeric)
            })
    })
}

fn version(video: &TmdbVideo, viewer: &str) -> TrailerVersion {
    if base(&video.iso_639_1) != viewer {
        TrailerVersion::Original
    } else if mentions(&video.name, SUBTITLED) {
        TrailerVersion::Subtitled
    } else {
        TrailerVersion::Localized
    }
}

/// The YouTube trailers and teasers in `videos`, best first for a viewer who
/// speaks `viewer`. In their language beats subtitled in it, which beats the
/// title's `original` language, which beats any other. Then a trailer beats a
/// teaser, a main trailer beats a ticket promotion, official beats fan-made,
/// and the newest wins what is left.
pub fn rank_trailers(videos: &[TmdbVideo], viewer: &str, original: Option<&str>) -> Vec<Trailer> {
    let viewer = base(viewer);
    let original = original.map(base);
    let mut ranked: Vec<(Trailer, Rank)> = videos
        .iter()
        .filter(|v| v.site.eq_ignore_ascii_case("YouTube") && !v.key.is_empty())
        .filter_map(|v| {
            let kind = match v.kind.as_str() {
                "Trailer" => TrailerKind::Trailer,
                "Teaser" => TrailerKind::Teaser,
                _ => return None,
            };
            let version = version(v, &viewer);
            let foreign_language = version == TrailerVersion::Original
                && original.as_deref() != Some(&base(&v.iso_639_1));
            let main = mentions(&v.name, TRAILER_WORDS) && !mentions(&v.name, PROMOTION_WORDS);
            let trailer = Trailer {
                video: v.key.clone(),
                name: v.name.clone(),
                language: base(&v.iso_639_1),
                version,
                kind,
                official: v.official,
                published_at: v.published_at.clone(),
            };
            Some((
                trailer,
                (version, foreign_language, kind, !main, !v.official),
            ))
        })
        .collect();
    ranked.sort_by(|(a, a_rank), (b, b_rank)| {
        a_rank
            .cmp(b_rank)
            .then_with(|| Reverse(&a.published_at).cmp(&Reverse(&b.published_at)))
    });
    let mut seen = std::collections::HashSet::new();
    ranked
        .into_iter()
        .map(|(trailer, _)| trailer)
        .filter(|t| seen.insert(t.video.clone()))
        .take(MAX_TRAILERS)
        .collect()
}

#[cfg(test)]
mod tests;
