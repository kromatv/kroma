//! Starting a watch: what the engine already holds, two viewers at once, and
//! a search that turns up nothing.

use serde_json::json;

use super::super::test_support::{dune, found, sintel, watched, watched_at_once, Peers};

#[tokio::test(flavor = "multi_thread")]
async fn a_film_the_embedded_engine_already_holds_is_handed_back_without_a_grab() {
    let peers = Peers {
        live: Some(json!({
            "id": "9619ccec50f68056",
            "release_title": "Dune.2021.MULTi.VF2.1080p.WEB.x264-FW",
            "status": "downloading",
        })),
        ..Peers::default()
    };

    let reply = watched(&peers, dune()).await.unwrap();

    assert_eq!(
        serde_json::to_value(reply).unwrap(),
        json!({
            "download_id": "9619ccec50f68056",
            "release": "Dune.2021.MULTi.VF2.1080p.WEB.x264-FW",
            "reused": true,
        })
    );
    assert_eq!(
        peers.looked_up(),
        vec![json!({
            "kind": "movie",
            "tmdb_id": 438631,
            "client_id": "embedded",
            "season": null,
            "episode": null,
        })]
    );
    assert!(peers.grabbed().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn two_viewers_starting_one_film_at_once_converge_on_one_download() {
    let peers = found(&[("Sintel.2010.1080p.WEB.x264", 2)]);

    let [first, second] = watched_at_once(&peers, [sintel(), sintel()]).await;
    let (first, second) = (first.unwrap(), second.unwrap());

    assert_eq!(first.download_id, second.download_id);
    assert_ne!(first.reused, second.reused);
    assert_eq!(peers.grabbed().len(), 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_search_that_finds_nothing_answers_err() {
    let peers = Peers::default();

    let err = watched(&peers, dune()).await.unwrap_err();

    assert_eq!(err.to_string(), "no release found for this title");
    assert!(peers.grabbed().is_empty());
}
