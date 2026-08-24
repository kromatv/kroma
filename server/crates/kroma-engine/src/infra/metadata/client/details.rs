use serde::Deserialize;

use crate::domain::metadata::Metadata;

use super::super::common::{build_cast, build_crew, RawCreatedBy, RawCredits};
use super::{api, curl_json, Target, IMG, MAX_CAST, MAX_CREW, MAX_KEYWORDS};

pub(super) fn fetch_details(
    api_key: &str,
    language: &str,
    target: Target,
    id: u64,
) -> Result<Metadata, ()> {
    // Base language code (e.g. "fr" from "fr-FR") for picking a localized logo.
    let lang2 = language.split('-').next().unwrap_or("en");
    let detail_params = vec![
        ("language", language.to_string()),
        (
            "append_to_response",
            "external_ids,credits,images,keywords".to_string(),
        ),
        ("include_image_language", format!("{lang2},en,null")),
    ];
    let d: Details = curl_json(
        &format!("{}/{}/{id}", api(), target.detail_path()),
        api_key,
        &detail_params,
    )?;

    let ext = d.external_ids;
    let imdb_id = d
        .imdb_id
        .or_else(|| ext.as_ref().and_then(|e| e.imdb_id.clone()))
        .filter(|s| !s.is_empty());
    // TVDB series id (TV only) keys the theme-song lookup during enrichment.
    let tvdb_id = ext.as_ref().and_then(|e| e.tvdb_id).filter(|&id| id > 0);

    // Cast + crew share the appended `credits` block; TV creators come from
    // the top-level `created_by`.
    let (raw_cast, raw_crew) = d.credits.map(|c| (c.cast, c.crew)).unwrap_or_default();
    let cast = build_cast(raw_cast, MAX_CAST, false);
    let crew = build_crew(raw_crew, d.created_by, MAX_CREW);

    Ok(Metadata {
        provider: "tmdb",
        tmdb_id: d.id,
        imdb_id,
        title: d.title.or(d.name),
        tagline: d.tagline.filter(|s| !s.is_empty()),
        overview: d.overview.filter(|s| !s.is_empty()),
        release_date: d
            .release_date
            .or(d.first_air_date)
            .filter(|s| !s.is_empty()),
        genres: d.genres.into_iter().map(|g| g.name).collect(),
        keywords: d.keywords.map(collect_keywords).unwrap_or_default(),
        rating: d.vote_average.filter(|v| *v > 0.0),
        poster_url: d.poster_path.map(|p| format!("{IMG}/w500{p}")),
        backdrop_url: d.backdrop_path.map(|p| format!("{IMG}/w1280{p}")),
        logo_url: d
            .images
            .as_ref()
            .and_then(|i| pick_logo(&i.logos, lang2))
            .map(|p| format!("{IMG}/w500{p}")),
        cast,
        crew,
        // Resolved later (a disk download) by `infra::theme`; this lookup only
        // carries the TVDB id it needs.
        theme_url: None,
        tvdb_id,
        tmdb_url: format!("https://www.themoviedb.org/{}/{id}", target.web_kind()),
    })
}

#[derive(Debug, Deserialize)]
struct Details {
    id: u64,
    #[serde(default)]
    title: Option<String>, // movies
    #[serde(default)]
    name: Option<String>, // shows
    #[serde(default)]
    overview: Option<String>,
    #[serde(default)]
    tagline: Option<String>,
    #[serde(default)]
    release_date: Option<String>, // movies
    #[serde(default)]
    first_air_date: Option<String>, // shows
    #[serde(default)]
    vote_average: Option<f32>,
    #[serde(default)]
    poster_path: Option<String>,
    #[serde(default)]
    backdrop_path: Option<String>,
    #[serde(default)]
    genres: Vec<Genre>,
    #[serde(default)]
    imdb_id: Option<String>, // present on movie details
    #[serde(default)]
    external_ids: Option<ExternalIds>, // appended (carries imdb_id for shows)
    #[serde(default)]
    credits: Option<RawCredits>, // appended (cast + crew)
    #[serde(default)]
    created_by: Vec<RawCreatedBy>, // TV series creators (top-level on show details)
    #[serde(default)]
    images: Option<Images>, // appended (logos)
    #[serde(default)]
    keywords: Option<Keywords>, // appended (thematic tags)
}

#[derive(Debug, Deserialize)]
struct Keywords {
    #[serde(default)]
    keywords: Vec<KeywordEntry>,
    #[serde(default)]
    results: Vec<KeywordEntry>,
}

#[derive(Debug, Deserialize)]
struct KeywordEntry {
    #[serde(default)]
    name: String,
}

fn collect_keywords(k: Keywords) -> Vec<String> {
    k.keywords
        .into_iter()
        .chain(k.results)
        .map(|e| e.name)
        .filter(|n| !n.is_empty())
        .take(MAX_KEYWORDS)
        .collect()
}

#[derive(Debug, Deserialize)]
struct Genre {
    name: String,
}

#[derive(Debug, Deserialize)]
struct Images {
    #[serde(default)]
    logos: Vec<ImageEntry>,
}

#[derive(Debug, Deserialize)]
struct ImageEntry {
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default, rename = "iso_639_1")]
    lang: Option<String>,
    #[serde(default)]
    vote_average: Option<f32>,
}

// Best title logo `file_path`: PNG only, preferring the configured language,
// then English, then language-neutral; ties broken by TMDB vote.
fn pick_logo(logos: &[ImageEntry], lang2: &str) -> Option<String> {
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
struct ExternalIds {
    #[serde(default)]
    imdb_id: Option<String>,
    #[serde(default)]
    tvdb_id: Option<u64>, // present on TV external_ids; absent for movies
}

#[cfg(test)]
mod tests {
    use super::*;

    // Network is not exercised in tests; we validate the JSON→Metadata mapping
    // against representative TMDB payloads instead.
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
