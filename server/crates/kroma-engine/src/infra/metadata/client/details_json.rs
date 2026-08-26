//! Raw TMDB detail-endpoint JSON shapes, and the two picks that read nothing
//! but them. The fetch and the JSON->domain mapping live in [`super::details`].

use serde::Deserialize;

use super::super::common::{RawCreatedBy, RawCredits};
use super::MAX_KEYWORDS;

#[derive(Debug, Deserialize)]
pub(super) struct Details {
    pub(super) id: u64,
    #[serde(default)]
    pub(super) title: Option<String>, // movies
    #[serde(default)]
    pub(super) name: Option<String>, // shows
    #[serde(default)]
    pub(super) overview: Option<String>,
    #[serde(default)]
    pub(super) tagline: Option<String>,
    #[serde(default)]
    pub(super) release_date: Option<String>, // movies
    #[serde(default)]
    pub(super) first_air_date: Option<String>, // shows
    #[serde(default)]
    pub(super) vote_average: Option<f32>,
    #[serde(default)]
    pub(super) poster_path: Option<String>,
    #[serde(default)]
    pub(super) backdrop_path: Option<String>,
    #[serde(default)]
    pub(super) genres: Vec<Genre>,
    #[serde(default)]
    pub(super) imdb_id: Option<String>, // present on movie details
    #[serde(default)]
    pub(super) external_ids: Option<ExternalIds>, // appended (carries imdb_id for shows)
    #[serde(default)]
    pub(super) credits: Option<RawCredits>, // appended (cast + crew)
    #[serde(default)]
    pub(super) created_by: Vec<RawCreatedBy>, // TV series creators (top-level on show details)
    #[serde(default)]
    pub(super) images: Option<Images>, // appended (logos)
    #[serde(default)]
    pub(super) keywords: Option<Keywords>, // appended (thematic tags)
}

#[derive(Debug, Deserialize)]
pub(super) struct Keywords {
    #[serde(default)]
    pub(super) keywords: Vec<KeywordEntry>,
    #[serde(default)]
    pub(super) results: Vec<KeywordEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct KeywordEntry {
    #[serde(default)]
    pub(super) name: String,
}

pub(super) fn collect_keywords(k: Keywords) -> Vec<String> {
    k.keywords
        .into_iter()
        .chain(k.results)
        .map(|e| e.name)
        .filter(|n| !n.is_empty())
        .take(MAX_KEYWORDS)
        .collect()
}

#[derive(Debug, Deserialize)]
pub(super) struct Genre {
    pub(super) id: u32,
    pub(super) name: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct Images {
    #[serde(default)]
    pub(super) logos: Vec<ImageEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ImageEntry {
    #[serde(default)]
    pub(super) file_path: Option<String>,
    #[serde(default, rename = "iso_639_1")]
    pub(super) lang: Option<String>,
    #[serde(default)]
    pub(super) vote_average: Option<f32>,
}

// Best title logo `file_path`: PNG only, preferring the configured language,
// then English, then language-neutral; ties broken by TMDB vote.
pub(super) fn pick_logo(logos: &[ImageEntry], lang2: &str) -> Option<String> {
    let rank = |l: &ImageEntry| -> u8 {
        match l.lang.as_deref() {
            Some(x) if x == lang2 => 0,
            Some("en") => 1,
            None | Some("") => 2,
            _ => 3,
        }
    };
    logos
        .iter()
        .filter(|l| l.file_path.as_deref().is_some_and(|p| p.ends_with(".png")))
        .min_by(|a, b| {
            rank(a).cmp(&rank(b)).then(
                b.vote_average
                    .unwrap_or(0.0)
                    .partial_cmp(&a.vote_average.unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
        })
        .and_then(|l| l.file_path.clone())
}

#[derive(Debug, Deserialize)]
pub(super) struct ExternalIds {
    #[serde(default)]
    pub(super) imdb_id: Option<String>,
    #[serde(default)]
    pub(super) tvdb_id: Option<u64>, // present on TV external_ids; absent for movies
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_movie_details() {
        let raw = r#"{
            "id": 542178,
            "title": "The French Dispatch",
            "tagline": "Read all about it.",
            "overview": "A love letter to journalists.",
            "release_date": "2021-10-21",
            "vote_average": 7.4,
            "poster_path": "/poster.jpg",
            "backdrop_path": "/back.jpg",
            "genres": [{"id": 35, "name": "Comedy"}, {"id": 18, "name": "Drama"}],
            "imdb_id": "tt8847712",
            "external_ids": {"imdb_id": "tt8847712"}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();
        assert_eq!(d.id, 542178);
        assert_eq!(d.title.as_deref(), Some("The French Dispatch"));
        assert_eq!(d.imdb_id.as_deref(), Some("tt8847712"));
        assert_eq!(d.genres.len(), 2);
        assert_eq!(d.vote_average, Some(7.4));
    }

    #[test]
    fn parses_tv_details_with_external_ids() {
        let raw = r#"{
            "id": 1399,
            "name": "Game of Thrones",
            "overview": "Seven noble families fight.",
            "first_air_date": "2011-04-17",
            "vote_average": 8.4,
            "poster_path": "/got.jpg",
            "genres": [{"id": 10765, "name": "Sci-Fi & Fantasy"}],
            "external_ids": {"imdb_id": "tt0944947"}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();
        assert_eq!(d.name.as_deref(), Some("Game of Thrones"));
        assert!(d.title.is_none());
        assert_eq!(
            d.external_ids.and_then(|e| e.imdb_id).as_deref(),
            Some("tt0944947")
        );
    }

    #[test]
    fn parses_appended_credits() {
        let raw = r#"{
            "id": 1,
            "title": "X",
            "credits": {
                "cast": [
                    {"name": "Bravo", "character": "B", "order": 1},
                    {"name": "Alpha", "character": "A", "order": 0},
                    {"name": "NoChar", "character": "", "order": 2}
                ]
            }
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();
        let mut cast = d.credits.unwrap().cast;
        cast.sort_by_key(|m| m.order.unwrap_or(u32::MAX));
        assert_eq!(cast[0].name, "Alpha");
        assert_eq!(cast[0].character.as_deref(), Some("A"));
        // Empty character strings are dropped during the Metadata mapping.
        assert_eq!(cast[2].character.as_deref(), Some(""));
    }

    #[test]
    fn collects_movie_and_tv_keywords() {
        // Movies nest under `keywords`.
        let movie: Keywords = serde_json::from_str(
            r#"{"keywords":[{"id":1,"name":"road movie"},{"id":2,"name":"summer"}]}"#,
        )
        .unwrap();
        assert_eq!(collect_keywords(movie), vec!["road movie", "summer"]);
        // Shows nest under `results`.
        let tv: Keywords =
            serde_json::from_str(r#"{"results":[{"id":3,"name":"dystopia"}]}"#).unwrap();
        assert_eq!(collect_keywords(tv), vec!["dystopia"]);
    }
}
