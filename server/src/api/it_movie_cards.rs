use std::collections::HashMap;

use axum::http::StatusCode;

use crate::api::test_support::{demo_item_id, get, test_app};
use crate::db;

fn first_file_of(item: &str) -> String {
    crate::services::demo::demo_data()
        .items
        .into_iter()
        .find(|i| i.id == item)
        .and_then(|i| i.files.into_iter().next())
        .map(|f| f.id)
        .unwrap()
}

#[tokio::test]
async fn the_card_view_lists_every_movie_without_its_files_or_tracks() {
    let t = test_app();

    let (status, cards) = get(&t.app, "/api/movies?view=card", Some(&t.token)).await;
    let (_, movies) = get(&t.app, "/api/movies", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    let cards = cards.as_array().unwrap();
    assert_eq!(cards.len(), movies.as_array().unwrap().len());
    for card in cards {
        assert!(card["id"].is_string() && card["title"].is_string(), "{card}");
        assert!(card["addedAt"].is_string(), "{card}");
        assert!(card["audioLanguages"].is_array(), "{card}");
        assert!(card["subtitleLanguages"].is_array(), "{card}");
        for gone in ["files", "subtitles", "audioTracks", "container"] {
            assert!(card.get(gone).is_none(), "{gone} in {card}");
        }
    }
}

#[tokio::test]
async fn a_subtitle_file_downloaded_for_a_film_or_lying_beside_it_counts_on_its_card() {
    let t = test_app();
    let film = demo_item_id("The Matrix");
    db::insert_downloaded_sub(
        &t.state.db,
        &db::DownloadedSub {
            id: "dl-ko".into(),
            item_id: film.clone(),
            language: Some("kor".into()),
            label: "Korean".into(),
            provider: "opensubtitles".into(),
            path: "/data/subs/dl-ko.vtt".into(),
        },
    )
    .unwrap();
    let beside = HashMap::from([(first_file_of(&film), vec!["pt".to_string()])]);
    db::set_external_subtitle_languages(&t.state.db, &beside).unwrap();

    let (_, cards) = get(&t.app, "/api/movies?view=card", Some(&t.token)).await;

    let card = cards
        .as_array()
        .unwrap()
        .iter()
        .find(|card| card["id"] == film.as_str())
        .unwrap();
    let subtitles = card["subtitleLanguages"].as_array().unwrap();
    assert!(subtitles.contains(&"kor".into()), "{card}");
    assert!(subtitles.contains(&"pt".into()), "{card}");
}

#[tokio::test]
async fn the_card_view_lists_every_show_without_its_credits() {
    let t = test_app();

    let (status, cards) = get(&t.app, "/api/shows?view=card", Some(&t.token)).await;
    let (_, shows) = get(&t.app, "/api/shows", Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    let ids = |list: &serde_json::Value| -> Vec<String> {
        list.as_array()
            .unwrap()
            .iter()
            .map(|s| s["id"].as_str().unwrap().to_string())
            .collect()
    };
    assert!(!ids(&cards).is_empty());
    assert_eq!(ids(&cards), ids(&shows));
    for card in cards.as_array().unwrap() {
        assert!(card["seasonCount"].is_number(), "{card}");
        assert!(card["audioLanguages"].is_array(), "{card}");
        assert!(card["subtitleLanguages"].is_array(), "{card}");
        assert!(card["episodeLanguages"].is_array(), "{card}");
        assert!(card["metadata"].get("cast").is_none(), "{card}");
        assert!(card["metadata"].get("crew").is_none(), "{card}");
    }
}

#[tokio::test]
async fn an_unknown_view_is_refused() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/movies?view=poster", Some(&t.token)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

fn ids(list: &serde_json::Value) -> Vec<&str> {
    list.as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["id"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn similar_titles_come_as_cards_when_asked() {
    let t = test_app();
    let (_, movies) = get(&t.app, "/api/movies", Some(&t.token)).await;
    let seed = movies[0]["id"].as_str().unwrap();

    let (status, cards) = get(
        &t.app,
        &format!("/api/items/{seed}/similar?view=card"),
        Some(&t.token),
    )
    .await;
    let (_, full) = get(
        &t.app,
        &format!("/api/items/{seed}/similar"),
        Some(&t.token),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert!(!ids(&cards).is_empty());
    assert_eq!(ids(&cards), ids(&full));
    for card in cards.as_array().unwrap() {
        for gone in ["files", "subtitles", "audioTracks", "container"] {
            assert!(card.get(gone).is_none(), "{gone} in {card}");
        }
    }
}
