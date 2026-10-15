use super::release::{movie_dates, MovieDates};
use super::*;

// Network is not exercised; we validate the JSON→adapter mapping the way
// the sibling client does.
#[test]
fn maps_credits_and_recommendations() {
    let raw = r#"{
        "title": "Dune: Part Two",
        "credits": {
            "cast": [
                {"name": "Second", "character": "B", "profile_path": "/b.jpg", "order": 1},
                {"name": "First", "character": "A", "profile_path": "/a.jpg", "order": 0},
                {"name": "NoChar", "character": "", "order": 2}
            ],
            "crew": [
                {"name": "Editor Ed", "job": "Editor"},
                {"name": "Denis", "job": "Director"},
                {"name": "Writer Wanda", "job": "Writer"}
            ]
        },
        "recommendations": {
            "page": 1,
            "total_pages": 1,
            "results": [
                {"id": 693134, "title": "Rec One", "poster_path": "/r.jpg", "release_date": "2024-02-27", "vote_average": 8.2},
                {"id": 0, "title": null}
            ]
        }
    }"#;
    let d: DetailResp = serde_json::from_str(raw).unwrap();

    let (raw_cast, raw_crew) = d.credits.map(|c| (c.cast, c.crew)).unwrap_or_default();
    let cast = build_cast(raw_cast, MAX_CAST, true);
    // Sorted by `order`; empty characters dropped; profile URL absolutized.
    assert_eq!(cast[0].name, "First");
    assert_eq!(cast[0].character.as_deref(), Some("A"));
    assert_eq!(
        cast[0].profile_url.as_deref(),
        Some("https://image.tmdb.org/t/p/w342/a.jpg")
    );
    assert_eq!(cast[2].character, None);

    let crew = build_crew(raw_crew, d.created_by, MAX_CREW);
    // Non-authorship jobs (Editor) dropped; directors rank first.
    assert_eq!(crew[0].name, "Denis");
    assert!(crew.iter().all(|c| c.name != "Editor Ed"));

    let similar: Vec<_> = d
        .recommendations
        .map(|r| r.results)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|h| hit_from(RequestKind::Movie, h))
        .collect();
    // The title-less row is skipped; the good one keeps the parent's kind.
    assert_eq!(similar.len(), 1);
    assert_eq!(similar[0].tmdb_id, 693134);
    assert_eq!(similar[0].kind, RequestKind::Movie);
    assert_eq!(similar[0].year, Some(2024));
}

#[test]
fn movie_available_date_prefers_digital_then_theatrical() {
    let raw = r#"{
        "release_dates": { "results": [
            { "iso_3166_1": "FR", "release_dates": [
                { "type": 3, "release_date": "2024-02-28T00:00:00.000Z" }
            ]},
            { "iso_3166_1": "US", "release_dates": [
                { "type": 3, "release_date": "2024-03-01T00:00:00.000Z" },
                { "type": 4, "release_date": "2024-04-16T00:00:00.000Z" }
            ]}
        ]}
    }"#;
    let d: DetailResp = serde_json::from_str(raw).unwrap();
    let dates = movie_dates(d.release_dates, Some("2024-03-01"));
    // US digital (type 4) wins over US/FR theatrical, truncated to a date.
    assert_eq!(dates.available.as_deref(), Some("2024-04-16"));
    assert_eq!(dates.cinema.as_deref(), Some("2024-03-01"));
    // No typed windows: fall back to the basic release_date.
    assert_eq!(
        movie_dates(None, Some("2025-01-09")),
        MovieDates {
            available: Some("2025-01-09".into()),
            cinema: Some("2025-01-09".into()),
        }
    );
}

#[test]
fn a_title_reads_its_original_language_and_country() {
    let raw = r#"{ "name": "Les Revenants", "original_language": "fr", "origin_country": ["FR"] }"#;

    let d: DetailResp = serde_json::from_str(raw).unwrap();

    assert_eq!(d.original_language.as_deref(), Some("fr"));
    assert_eq!(d.origin_country, ["FR"]);
}

#[test]
fn show_next_air_maps_from_next_episode() {
    let raw = r#"{
        "name": "Severance",
        "status": "Returning Series",
        "next_episode_to_air": { "air_date": "2026-01-17", "season_number": 2, "episode_number": 3 },
        "number_of_episodes": 19
    }"#;
    let d: DetailResp = serde_json::from_str(raw).unwrap();
    assert_eq!(d.status.as_deref(), Some("Returning Series"));
    let n = d.next_episode_to_air.unwrap();
    assert_eq!(n.air_date.as_deref(), Some("2026-01-17"));
    assert_eq!(n.season_number, Some(2));
    assert_eq!(n.episode_number, Some(3));
}

#[test]
fn tv_creators_fold_into_crew() {
    let raw = r#"{
        "name": "Severance",
        "created_by": [{"name": "Dan Erickson"}],
        "credits": {"cast": [], "crew": []}
    }"#;
    let d: DetailResp = serde_json::from_str(raw).unwrap();
    let crew = build_crew(
        d.credits.map(|c| c.crew).unwrap_or_default(),
        d.created_by,
        MAX_CREW,
    );
    assert_eq!(crew.len(), 1);
    assert_eq!(crew[0].name, "Dan Erickson");
    assert_eq!(crew[0].job, "Creator");
}
