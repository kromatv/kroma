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
async fn an_unknown_view_is_refused() {
    let t = test_app();

    let (status, _) = get(&t.app, "/api/movies?view=poster", Some(&t.token)).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}
