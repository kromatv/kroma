use axum::http::StatusCode;
use kroma_engine::infra::events::Envelope;
use serde_json::{Value, json};
use tokio::sync::broadcast::Receiver;

use crate::api::test_support::{
    IMPORTER, TestApp, get, import_job_ended, importer_answering, importer_held, seed_session,
    send, test_app,
};
use crate::db;
use crate::model::Permission;

const IMPORTS: &str = "/api/admin/imports";
const JOB: &str = "/api/admin/jobs/household.import";

fn a_household() -> Value {
    json!({ "Ok": {
        "libraries": [{ "id": "1", "name": "Films", "kind": "movies" }],
        "titles": [{ "id": "t1", "kind": "movie", "title": "Heat" }],
    }})
}

fn kept() -> Value {
    json!({ "libraries": [{ "id": "1" }], "users": [{ "id": "42" }] })
}

fn the_review(sign_in: &str) -> Value {
    json!({
        "importer": IMPORTER,
        "signIn": sign_in,
        "server": { "id": "srv", "name": "Living room" },
        "selection": kept(),
    })
}

async fn start(t: &TestApp, body: Value) -> (StatusCode, Value) {
    send(&t.app, "POST", IMPORTS, Some(&t.token), Some(body)).await
}

async fn read(t: &TestApp, id: &Value) -> Value {
    let uri = format!("{IMPORTS}/{}", id.as_str().unwrap());
    get(&t.app, &uri, Some(&t.token)).await.1
}

async fn ran(t: &TestApp, events: &mut Receiver<Envelope>, sign_in: &str) -> Value {
    let (_, started) = start(t, the_review(sign_in)).await;
    import_job_ended(events).await;
    started["id"].clone()
}

#[tokio::test]
async fn starting_an_import_queues_what_the_owner_kept_and_the_job_runs_it() {
    let (t, _) = importer_answering(a_household());
    let mut events = t.state.events.subscribe();

    let (status, started) = start(&t, the_review("s-1")).await;

    let job = import_job_ended(&mut events).await;
    let import = read(&t, &started["id"]).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(job, "success");
    assert_eq!(import["status"], "completed");
    assert_eq!(import["runId"], started["runId"]);
    assert_eq!(import["importer"], IMPORTER);
    assert_eq!(
        import["server"],
        json!({ "id": "srv", "name": "Living room" })
    );
    assert_eq!(import["selection"], kept());
    assert_eq!(import["startedBy"], json!(t.user_id));
    assert_eq!(import["report"]["titles"]["read"], 1);
}

#[tokio::test]
async fn the_import_s_own_row_holds_the_reference_to_the_sign_in_the_importer_gave() {
    let (t, _) = importer_answering(a_household());
    let mut events = t.state.events.subscribe();

    let id = ran(&t, &mut events, "reference-s-1").await;

    let held: Option<String> = t
        .state
        .db
        .get()
        .unwrap()
        .query_row(
            "SELECT sign_in FROM imports WHERE id = ?1",
            [id.as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(held.as_deref(), Some("reference-s-1"));
    assert_eq!(read(&t, &id).await["signIn"], "reference-s-1");
}

#[tokio::test]
async fn the_importer_is_asked_with_the_reference_and_the_server_of_the_import() {
    let (t, asked) = importer_answering(a_household());
    let mut events = t.state.events.subscribe();

    ran(&t, &mut events, "s-1").await;

    let asked = asked.lock().unwrap();
    assert_eq!(
        asked[0],
        (
            "survey".to_string(),
            json!({ "signIn": "s-1", "server": "srv" })
        )
    );
    assert_eq!(asked[1].0, "titles");
    assert_eq!(asked[1].1["library"], "1");
}

#[tokio::test]
async fn a_running_import_shows_in_jobs_and_is_cancelled_there() {
    let (t, release) = importer_held();
    let mut events = t.state.events.subscribe();
    let (_, started) = start(&t, the_review("s-1")).await;

    let (_, job) = get(&t.app, JOB, Some(&t.token)).await;
    let cancel = format!("{JOB}/cancel");
    let (_, cancelled) = send(&t.app, "POST", &cancel, Some(&t.token), None).await;

    release.send(()).unwrap();
    let ended = import_job_ended(&mut events).await;
    assert_eq!(job["info"]["running"], true);
    assert_eq!(job["info"]["runId"], started["runId"]);
    assert_eq!(job["info"]["name"], "jobs.household.import.name");
    assert_eq!(cancelled, json!({ "cancelled": true }));
    assert_eq!(ended, "cancelled");
    assert_eq!(read(&t, &started["id"]).await["status"], "cancelled");
}

#[tokio::test]
async fn a_second_import_is_a_409_while_one_runs() {
    let (t, release) = importer_held();
    let mut events = t.state.events.subscribe();
    start(&t, the_review("s-1")).await;

    let (status, body) = start(&t, the_review("s-1")).await;

    release.send(()).unwrap();
    import_job_ended(&mut events).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body, json!({ "error": "an import is already running" }));
}

#[tokio::test]
async fn an_import_through_an_importer_that_is_not_running_is_a_404() {
    let t = test_app();

    let (status, body) = start(&t, the_review("s-1")).await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "error.moduleDisabled");
}

#[tokio::test]
async fn an_import_that_names_no_server_is_a_400() {
    let (t, asked) = importer_answering(a_household());
    let mut review = the_review("s-1");
    review["server"]["id"] = json!("");

    let (status, body) = start(&t, review).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body, json!({ "error": "an empty server id" }));
    assert!(asked.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_review_past_the_size_a_start_may_have_never_starts_an_import() {
    let (t, asked) = importer_answering(a_household());
    let mut review = the_review("s-1");
    review["server"]["name"] = json!("x".repeat(300 * 1024));

    let (status, _) = start(&t, review).await;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert!(asked.lock().unwrap().is_empty());
}

#[tokio::test]
async fn imports_are_listed_newest_first() {
    let (t, _) = importer_answering(a_household());
    let mut events = t.state.events.subscribe();
    let first = ran(&t, &mut events, "s-1").await;
    let second = ran(&t, &mut events, "s-1").await;

    let (status, body) = get(&t.app, IMPORTS, Some(&t.token)).await;

    let listed: Vec<&Value> = body["imports"]
        .as_array()
        .unwrap()
        .iter()
        .map(|import| &import["id"])
        .collect();
    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed, vec![&second, &first]);
}

#[tokio::test]
async fn an_import_that_never_ran_is_a_404() {
    let t = test_app();

    let (import, _) = get(&t.app, &format!("{IMPORTS}/nope"), Some(&t.token)).await;
    let (unmatched, _) = get(&t.app, &format!("{IMPORTS}/nope/unmatched"), Some(&t.token)).await;

    assert_eq!(import, StatusCode::NOT_FOUND);
    assert_eq!(unmatched, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn the_titles_an_import_matched_to_nothing_are_read_a_page_at_a_time() {
    let (t, _) = importer_answering(a_household());
    let mut events = t.state.events.subscribe();
    let id = ran(&t, &mut events, "s-1").await;
    let id = id.as_str().unwrap();
    let server_id = db::imports::server_key(IMPORTER, "srv");
    let thief = serde_json::from_value(json!({
        "id": "t2",
        "kind": "movie",
        "title": "Thief",
        "paths": ["/data/movies/Thief (1981)/Thief.mkv"],
    }))
    .unwrap();
    db::imports::describe(&t.state.db, &server_id, &[&thief]).unwrap();
    db::imports::add_unmatched(&t.state.db, id, &["t1", "t2"]).unwrap();

    let uri = format!("{IMPORTS}/{id}/unmatched?offset=1&limit=1");
    let (status, body) = get(&t.app, &uri, Some(&t.token)).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["total"], 2);
    assert_eq!(
        body["titles"],
        json!([{
            "id": "t2",
            "kind": "movie",
            "title": "Thief",
            "paths": ["/data/movies/Thief (1981)/Thief.mkv"],
            "ids": {},
        }])
    );
    assert_eq!(read(&t, &json!(id)).await["unmatchedTitles"], 2);
}

#[tokio::test]
async fn forgetting_a_sign_in_drops_its_reference_from_the_import_that_held_it() {
    let (t, _) = importer_answering(a_household());
    let mut events = t.state.events.subscribe();
    let id = ran(&t, &mut events, "s-1").await;
    let forget = format!("/api/admin/importers/{IMPORTER}/forget");

    let (status, _) = send(
        &t.app,
        "POST",
        &forget,
        Some(&t.token),
        Some(json!({ "signIn": "s-1" })),
    )
    .await;

    let import = read(&t, &id).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(import.get("signIn"), None);
    assert_eq!(import["status"], "completed");
}

#[tokio::test]
async fn someone_who_cannot_manage_settings_starts_and_reads_no_import() {
    let (t, asked) = importer_answering(a_household());
    let (_, viewer) = seed_session(
        &t.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );

    let (started, _) = send(
        &t.app,
        "POST",
        IMPORTS,
        Some(&viewer),
        Some(the_review("s-1")),
    )
    .await;
    let (listed, _) = get(&t.app, IMPORTS, Some(&viewer)).await;
    let (one, _) = get(&t.app, &format!("{IMPORTS}/nope"), Some(&viewer)).await;
    let (unmatched, _) = get(&t.app, &format!("{IMPORTS}/nope/unmatched"), Some(&viewer)).await;

    assert_eq!(
        [started, listed, one, unmatched],
        [StatusCode::FORBIDDEN; 4]
    );
    assert!(asked.lock().unwrap().is_empty());
}
