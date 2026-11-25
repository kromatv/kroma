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

#[test]
fn a_movie_is_made_by_its_first_production_companies() {
    let raw = r#"{
        "id": 603,
        "title": "The Matrix",
        "production_companies": [
            {"id": 79, "name": "Village Roadshow Pictures"},
            {"id": 372, "name": "Groucho II Film Partnership"},
            {"id": 1885, "name": " "},
            {"id": 174, "name": "Warner Bros. Pictures"},
            {"id": 1, "name": "Silver Pictures"}
        ]
    }"#;
    let d: Details = serde_json::from_str(raw).unwrap();

    let meta = metadata_from(d, Target::Movie, 603, "en", "US");

    assert_eq!(
        meta.studios,
        vec![
            "Village Roadshow Pictures",
            "Groucho II Film Partnership",
            "Warner Bros. Pictures"
        ]
    );
}

#[test]
fn a_show_is_made_by_the_networks_that_air_it() {
    let raw = r#"{
        "id": 1396,
        "name": "Breaking Bad",
        "production_companies": [{"id": 11073, "name": "Sony Pictures Television Studios"}],
        "networks": [{"id": 174, "name": "AMC"}]
    }"#;
    let d: Details = serde_json::from_str(raw).unwrap();

    let meta = metadata_from(d, Target::Tv, 1396, "en", "US");

    assert_eq!(meta.studios, vec!["AMC"]);
}
