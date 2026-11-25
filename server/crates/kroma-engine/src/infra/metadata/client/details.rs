use crate::domain::metadata::{CastMember, CrewMember, Metadata};
use crate::domain::ratings::{reader_rating, AgeRating, CountryRatings};

use super::super::common::{build_cast, build_crew};
use super::certification::{country_of, Certifications};
use super::details_json::{collect_keywords, pick_logo, Details};
use super::{api, tmdb_json, Target, IMG, MAX_CAST, MAX_CREW};

pub(super) fn fetch_details(
    api_key: &str,
    language: &str,
    household: &str,
    target: Target,
    id: u64,
) -> Result<Metadata, ()> {
    // Base language code (e.g. "fr" from "fr-FR") for picking a localized logo.
    let lang2 = language.split('-').next().unwrap_or("en");
    let detail_params = vec![
        ("language", language.to_string()),
        (
            "append_to_response",
            format!(
                "external_ids,credits,images,keywords,{}",
                target.certification_append()
            ),
        ),
        ("include_image_language", format!("{lang2},en,null")),
    ];
    let d: Details = tmdb_json(
        "metadata.details",
        &format!("{}/{}/{id}", api(), target.detail_path()),
        api_key,
        &detail_params,
    )?;
    let country = country_of(language, household);
    Ok(metadata_from(d, target, id, lang2, &country))
}

fn metadata_from(mut d: Details, target: Target, id: u64, lang2: &str, country: &str) -> Metadata {
    let logo_url = d
        .images
        .as_ref()
        .and_then(|i| pick_logo(&i.logos, lang2))
        .map(|p| format!("{IMG}/w500{p}"));
    let certifications = d.release_dates.take().or(d.content_ratings.take());
    let (ratings, age_rating) = age_ratings(certifications, country);
    let (imdb_id, tvdb_id) = ids_of(&mut d);
    let (cast, crew) = people_of(&mut d);
    Metadata {
        provider: "tmdb",
        tmdb_id: d.id,
        imdb_id,
        certification: age_rating.as_ref().map(|r| r.label.clone()),
        logo_url,
        cast,
        crew,
        tvdb_id,
        tmdb_url: format!("https://www.themoviedb.org/{}/{id}", target.web_kind()),
        ratings,
        age_rating,
        ..texts_of(d)
    }
}

fn texts_of(d: Details) -> Metadata {
    Metadata {
        title: d.title.or(d.name),
        original_title: d
            .original_title
            .or(d.original_name)
            .filter(|s| !s.is_empty()),
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
        ..Metadata::blank()
    }
}

fn ids_of(d: &mut Details) -> (Option<String>, Option<u64>) {
    let ext = d.external_ids.take();
    let imdb_id = d
        .imdb_id
        .take()
        .or_else(|| ext.as_ref().and_then(|e| e.imdb_id.clone()))
        .filter(|s| !s.is_empty());
    let tvdb_id = ext.and_then(|e| e.tvdb_id).filter(|&id| id > 0);
    (imdb_id, tvdb_id)
}

fn people_of(d: &mut Details) -> (Vec<CastMember>, Vec<CrewMember>) {
    let (raw_cast, raw_crew) = d
        .credits
        .take()
        .map(|c| (c.cast, c.crew))
        .unwrap_or_default();
    let created_by = std::mem::take(&mut d.created_by);
    (
        build_cast(raw_cast, MAX_CAST, false),
        build_crew(raw_crew, created_by, MAX_CREW),
    )
}

fn age_ratings(
    certifications: Option<Certifications>,
    country: &str,
) -> (CountryRatings, Option<AgeRating>) {
    let ratings = certifications
        .map(|c| c.every_country())
        .unwrap_or_default();
    let shown = reader_rating(&ratings, country, country);
    (ratings, shown)
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

        let meta = metadata_from(d, Target::Movie, 542178, "en", "US");

        assert_eq!(meta.tmdb_genre_ids, vec![35, 18]);
        assert_eq!(meta.genres, vec!["Comedy", "Drama"]);
    }

    #[test]
    fn a_film_and_a_show_keep_the_name_they_were_made_under() {
        let film = r#"{"id": 129, "title": "Spirited Away",
            "original_title": "千と千尋の神隠し"}"#;
        let show = r#"{"id": 70523, "name": "Dark", "original_name": "Dark"}"#;
        let untitled = r#"{"id": 1, "title": "Heat", "original_title": ""}"#;
        let parse = |raw| serde_json::from_str::<Details>(raw).unwrap();

        let film = metadata_from(parse(film), Target::Movie, 129, "en", "US");
        let show = metadata_from(parse(show), Target::Tv, 70523, "en", "US");
        let untitled = metadata_from(parse(untitled), Target::Movie, 1, "en", "US");

        assert_eq!(film.original_title.as_deref(), Some("千と千尋の神隠し"));
        assert_eq!(show.original_title.as_deref(), Some("Dark"));
        assert_eq!(untitled.original_title, None);
    }

    #[test]
    fn a_show_keeps_the_tv_only_genre_ids() {
        let raw = r#"{
            "id": 1399,
            "name": "Game of Thrones",
            "genres": [{"id": 10765, "name": "Sci-Fi & Fantasy"}, {"id": 18, "name": "Drama"}]
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Tv, 1399, "en", "US");

        assert_eq!(meta.tmdb_genre_ids, vec![10765, 18]);
    }

    #[test]
    fn a_movie_takes_its_age_rating_from_the_release_dates_of_the_asked_country() {
        let raw = r#"{
            "id": 603,
            "title": "The Matrix",
            "release_dates": {"results": [
                {"iso_3166_1": "FR", "release_dates": [{"certification": "12"}]},
                {"iso_3166_1": "US", "release_dates": [{"certification": "R"}]}
            ]}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Movie, 603, "fr", "FR");

        assert_eq!(meta.certification.as_deref(), Some("12"));
    }

    #[test]
    fn a_show_takes_its_age_rating_from_the_content_ratings() {
        let raw = r#"{
            "id": 1396,
            "name": "Breaking Bad",
            "content_ratings": {"results": [{"iso_3166_1": "US", "rating": "TV-MA"}]}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Tv, 1396, "en", "US");

        assert_eq!(meta.certification.as_deref(), Some("TV-MA"));
    }

    #[test]
    fn a_movie_keeps_the_label_every_country_gave_it() {
        let raw = r#"{
            "id": 603,
            "title": "The Matrix",
            "release_dates": {"results": [
                {"iso_3166_1": "FR", "release_dates": [{"certification": "12"}]},
                {"iso_3166_1": "DE", "release_dates": [{"certification": ""}]},
                {"iso_3166_1": "US", "release_dates": [{"certification": "R"}]}
            ]}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Movie, 603, "fr", "FR");

        let countries: Vec<(&str, &str)> = meta
            .ratings
            .iter()
            .map(|(c, l)| (c.as_str(), l.as_str()))
            .collect();
        assert_eq!(countries, vec![("FR", "12"), ("US", "R")]);
    }

    #[test]
    fn a_title_its_servers_country_never_rated_carries_a_borrowed_rating_naming_its_country() {
        let raw = r#"{
            "id": 1396,
            "name": "Breaking Bad",
            "content_ratings": {"results": [
                {"iso_3166_1": "DE", "rating": "16"},
                {"iso_3166_1": "US", "rating": "TV-MA"}
            ]}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Tv, 1396, "fr", "FR");

        let shown = meta.age_rating.unwrap();
        assert_eq!(
            (shown.label.as_str(), shown.country.as_str(), shown.borrowed),
            ("TV-MA", "US", true)
        );
        assert_eq!(meta.certification.as_deref(), Some("TV-MA"));
    }

    #[test]
    fn a_title_rated_by_its_servers_country_carries_that_rating_unborrowed() {
        let raw = r#"{
            "id": 603,
            "title": "The Matrix",
            "release_dates": {"results": [
                {"iso_3166_1": "FR", "release_dates": [{"certification": "12"}]}
            ]}
        }"#;
        let d: Details = serde_json::from_str(raw).unwrap();

        let meta = metadata_from(d, Target::Movie, 603, "fr", "FR");

        let shown = meta.age_rating.unwrap();
        assert_eq!(
            (shown.label.as_str(), shown.country.as_str(), shown.borrowed),
            ("12", "FR", false)
        );
    }

    #[test]
    fn a_title_no_provider_rated_carries_no_age_rating() {
        let d: Details = serde_json::from_str(r#"{"id": 1, "title": "X"}"#).unwrap();

        let meta = metadata_from(d, Target::Movie, 1, "en", "US");

        assert!(meta.certification.is_none());
        assert!(meta.age_rating.is_none());
        assert!(meta.ratings.is_empty());
    }

    #[test]
    fn a_title_with_no_genres_carries_no_genre_ids() {
        let d: Details = serde_json::from_str(r#"{"id": 1, "title": "X"}"#).unwrap();

        let meta = metadata_from(d, Target::Movie, 1, "en", "US");

        assert!(meta.tmdb_genre_ids.is_empty());
        assert!(meta.genres.is_empty());
    }
}
