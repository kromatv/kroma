use crate::domain::metadata::Metadata;

use super::super::common::{build_cast, build_crew};
use super::details_json::{collect_keywords, pick_logo, Details};
use super::{api, curl_json, Target, IMG, MAX_CAST, MAX_CREW};

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
    Ok(metadata_from(d, target, id, lang2))
}

fn metadata_from(d: Details, target: Target, id: u64, lang2: &str) -> Metadata {
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

    Metadata {
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
        tmdb_genre_ids: d.genres.iter().map(|g| g.id).collect(),
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Network is not exercised in tests; we validate the JSON→Metadata mapping
    // against representative TMDB payloads instead.
    #[test]
    fn a_movie_keeps_the_genre_ids_beside_the_names_they_came_with() {
        let raw = r#"{
            "id": 542178,
            "title": "The French Dispatch",
            "genres": [{"id": 35, "name": "Comedy"}, {"id": 18, "name": "Drama"}]
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Movie, 542178, "en");

        assert_eq!(meta.tmdb_genre_ids, vec![35, 18]);
        assert_eq!(meta.genres, vec!["Comedy", "Drama"]);
    }

    #[test]
    fn a_show_keeps_the_tv_only_genre_ids() {
        let raw = r#"{
            "id": 1399,
            "name": "Game of Thrones",
            "genres": [{"id": 10765, "name": "Sci-Fi & Fantasy"}, {"id": 18, "name": "Drama"}]
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Tv, 1399, "en");

        assert_eq!(meta.tmdb_genre_ids, vec![10765, 18]);
    }

    #[test]
    fn a_title_with_no_genres_carries_no_genre_ids() {
        let d: Details = serde_json::from_str(r#"{"id": 1, "title": "X"}"#).unwrap();

        let meta = metadata_from(d, Target::Movie, 1, "en");

        assert!(meta.tmdb_genre_ids.is_empty());
        assert!(meta.genres.is_empty());
    }
}
