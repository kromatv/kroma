use axum::body::Body;
use axum::http::{Request, StatusCode};
use kroma_domain::metadata::{EpisodeInfo, MatchCandidate};
use kroma_module_host::testing::StubHost;
use tower::ServiceExt;

const TOKEN: &str = "host-token";

fn dune() -> MatchCandidate {
    MatchCandidate {
        tmdb_id: 438631,
        title: "Dune".into(),
        original_title: None,
        year: Some(2021),
        poster_url: None,
        overview: None,
        rating: None,
        score: 0.98,
        current: false,
    }
}

fn winter_is_coming() -> EpisodeInfo {
    EpisodeInfo {
        episode: 1,
        name: Some("Winter Is Coming".into()),
        overview: None,
        air_date: Some("2011-04-17".into()),
        still_url: None,
    }
}

async fn get(host: StubHost, uri: &str, token: Option<&str>) -> (StatusCode, String) {
    let mut req = Request::builder().method("GET").uri(uri);
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let res = kroma_module_supervisor::host_router::<StubHost>(TOKEN.into())
        .with_state(host)
        .oneshot(req.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = res.status();
    let bytes = axum::body::to_bytes(res.into_body(), 64 * 1024)
        .await
        .unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

#[tokio::test]
async fn a_search_comes_back_as_the_candidates_the_core_ranked() {
    let host = StubHost::new().with_metadata_candidates(vec![dune()]);

    let (status, body) = get(
        host,
        "/_host/metadata-search?q=Dune&kind=movie&year=2021",
        Some(TOKEN),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let found: Vec<MatchCandidate> = serde_json::from_str(&body).expect("candidates came back");
    assert_eq!(found[0].tmdb_id, 438631);
    assert_eq!(found[0].year, Some(2021));
    assert!((found[0].score - 0.98).abs() < f32::EPSILON);
}

#[tokio::test]
async fn a_search_needs_only_the_query_text() {
    let host = StubHost::new().with_metadata_candidates(vec![dune()]);

    let (status, body) = get(host, "/_host/metadata-search?q=Dune", Some(TOKEN)).await;

    assert_eq!(status, StatusCode::OK);
    let found: Vec<MatchCandidate> = serde_json::from_str(&body).expect("candidates came back");
    assert_eq!(found.len(), 1);
}

#[tokio::test]
async fn a_search_with_no_query_text_is_rejected() {
    let (status, _) = get(
        StubHost::new(),
        "/_host/metadata-search?kind=movie",
        Some(TOKEN),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_season_comes_back_as_the_episodes_the_provider_names() {
    let host = StubHost::new().with_metadata_episodes(vec![winter_is_coming()]);

    let (status, body) = get(
        host,
        "/_host/metadata-episodes?tmdbId=1399&season=1",
        Some(TOKEN),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let episodes: Vec<EpisodeInfo> = serde_json::from_str(&body).expect("episodes came back");
    assert_eq!(episodes[0].episode, 1);
    assert_eq!(episodes[0].name.as_deref(), Some("Winter Is Coming"));
    assert_eq!(episodes[0].air_date.as_deref(), Some("2011-04-17"));
}

#[tokio::test]
async fn a_season_lookup_takes_its_title_id_in_camel_case_only() {
    let host = StubHost::new().with_metadata_episodes(vec![winter_is_coming()]);

    let (status, _) = get(
        host,
        "/_host/metadata-episodes?tmdb_id=1399&season=1",
        Some(TOKEN),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn neither_lookup_answers_a_caller_without_the_host_token() {
    let searched = get(StubHost::new(), "/_host/metadata-search?q=Dune", None).await;
    let listed = get(
        StubHost::new(),
        "/_host/metadata-episodes?tmdbId=1399&season=1",
        None,
    )
    .await;

    assert_eq!(searched.0, StatusCode::UNAUTHORIZED);
    assert_eq!(listed.0, StatusCode::UNAUTHORIZED);
}
