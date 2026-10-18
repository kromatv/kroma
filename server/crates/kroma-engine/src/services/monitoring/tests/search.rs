use super::*;

use std::sync::{Arc, Mutex};

use axum::Json;
use axum::routing::post;

type Asked = Arc<Mutex<Vec<serde_json::Value>>>;

async fn fake_acquisition(answer: serde_json::Value) -> (String, Asked) {
    let asked: Asked = Arc::new(Mutex::new(Vec::new()));
    let seen = asked.clone();
    let app = axum::Router::new().route(
        "/_port/acquisition/search-now",
        post(move |Json(body): Json<serde_json::Value>| {
            let answer = answer.clone();
            seen.lock().unwrap().push(body);
            async move { Json(json!({ "Ok": answer })) }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    (format!("http://127.0.0.1:{port}"), asked)
}

fn wants_an_episode(host: &StubHost) {
    let row = db::WantedRow {
        id: db::unit_id("episode", SHOW, Some(1), Some(1)),
        request_id: None,
        kind: "episode".into(),
        tmdb_id: SHOW,
        imdb_id: None,
        title: "Show".into(),
        year: None,
        season: Some(1),
        episode: Some(1),
        air_date: Some("2020-01-01".into()),
        status: "wanted".into(),
        last_search_at: None,
    };
    db::insert_wanted(host.db(), &[row], 1).unwrap();
}

#[test]
fn a_search_with_no_acquisition_module_says_why_rather_than_going_quiet() {
    let host = host();
    wants_an_episode(&host);

    let answer = search_now(&host, RequestKind::Show, SHOW, &[]).unwrap();

    assert!(!answer.started);
    assert_eq!(answer.reason.as_deref(), Some("noModule"));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_search_now_reaches_the_module_and_brings_its_answer_back() {
    let (base, asked) = fake_acquisition(json!({ "started": true, "units": 2 })).await;
    let host = host().with_point("acquisition", None, &base, "t");
    wants_an_episode(&host);

    let answer = tokio::task::spawn_blocking(move || search_now(&host, RequestKind::Show, SHOW, &[]))
    .await
    .unwrap()
    .unwrap();

    assert!(answer.started);
    assert_eq!(answer.units, 2);
    assert_eq!(asked.lock().unwrap()[0]["tmdb_id"], json!(SHOW));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_module_that_refuses_hands_its_reason_to_the_caller() {
    let (base, _asked) =
        fake_acquisition(json!({ "started": false, "reason": "noIndexer" })).await;
    let host = host().with_point("acquisition", None, &base, "t");
    wants_an_episode(&host);

    let answer = tokio::task::spawn_blocking(move || search_now(&host, RequestKind::Show, SHOW, &[]))
    .await
    .unwrap()
    .unwrap();

    assert!(!answer.started);
    assert_eq!(answer.reason.as_deref(), Some("noIndexer"));
}

#[test]
fn a_module_that_cannot_be_reached_is_reported_as_failed() {
    let host = host().with_point("acquisition", None, "http://127.0.0.1:1", "t");
    wants_an_episode(&host);

    let answer = search_now(&host, RequestKind::Show, SHOW, &[]).unwrap();

    assert!(!answer.started);
    assert_eq!(answer.reason.as_deref(), Some("failed"));
}

#[test]
fn naming_units_leaves_a_film_row_out_of_the_search() {
    let _tmdb = tmdb();
    let host = host();
    monitor(&host, RequestKind::Movie, MOVIE, &MonitorBody::default(), None).unwrap();
    exec(&host, "UPDATE wanted SET last_search_at = 99");
    let units = [EpisodeRef {
        season: 1,
        episode: 1,
    }];

    search_now(&host, RequestKind::Movie, MOVIE, &units).unwrap();

    let conn = host.db().get().unwrap();
    let rows = db::wanted_for_title(&conn, RequestKind::Movie, MOVIE).unwrap();
    assert_eq!(rows[0].last_search_at, Some(99));
}
