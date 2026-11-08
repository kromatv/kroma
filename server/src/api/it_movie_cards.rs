use axum::http::StatusCode;

use crate::api::test_support::{get, test_app};

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
        for gone in ["files", "subtitles", "audioTracks", "container"] {
            assert!(card.get(gone).is_none(), "{gone} in {card}");
        }
    }
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
