use axum::http::StatusCode;
use kroma_testing::TempDir;
use serde_json::{Value, json};

use crate::api::test_support::{
    IMPORTER, TestApp, get, import_job_ended, importer_answering, seed_session, send,
};
use crate::model::Permission;

const IMPORTS: &str = "/api/admin/imports";
const FOLDERS: &str = "/api/admin/imports/folders";
const LIBRARIES: &str = "/api/admin/libraries";

fn a_household() -> Value {
    json!({ "Ok": {
        "libraries": [
            { "id": "1", "name": "Films", "kind": "movies", "folders": ["/data/movies"] },
        ],
    }})
}

fn this_machine() -> (TempDir, String) {
    let disk = kroma_testing::temp_dir("it-imports-folders");
    let films = disk.path().join("films");
    std::fs::create_dir_all(&films).unwrap();
    (disk, films.to_string_lossy().into_owned())
}

fn the_review(folders: Value) -> Value {
    json!({
        "importer": IMPORTER,
        "signIn": "s-1",
        "server": { "id": "srv", "name": "Living room" },
        "selection": { "libraries": [{ "id": "1", "folders": folders }] },
    })
}

async fn imported(t: &TestApp, review: Value) -> Value {
    let mut events = t.state.events.subscribe();
    let (_, started) = send(&t.app, "POST", IMPORTS, Some(&t.token), Some(review)).await;
    import_job_ended(&mut events).await;
    let uri = format!("{IMPORTS}/{}", started["id"].as_str().unwrap());
    get(&t.app, &uri, Some(&t.token)).await.1
}

async fn asked_about(t: &TestApp, token: &str, folders: Value) -> (StatusCode, Value) {
    let ask = json!({ "importer": IMPORTER, "server": "srv", "folders": folders });
    send(&t.app, "POST", FOLDERS, Some(token), Some(ask)).await
}

#[tokio::test]
async fn an_import_makes_a_source_over_the_folder_the_owner_confirmed_on_the_review() {
    let (t, _) = importer_answering(a_household());
    let (_disk, films) = this_machine();
    let confirmed = json!([{ "folder": "/data/movies", "here": films }]);

    let import = imported(&t, the_review(confirmed.clone())).await;

    let (_, listed) = get(&t.app, LIBRARIES, Some(&t.token)).await;
    let source = &listed["libraries"][0];
    assert_eq!(import["status"], "completed");
    assert_eq!(import["selection"]["libraries"][0]["folders"], confirmed);
    assert_eq!(import["report"]["libraries"]["brought"], 1);
    assert_eq!(listed["libraries"].as_array().unwrap().len(), 1);
    assert_eq!(source["name"], "Films");
    assert_eq!(source["kind"], "film");
    assert_eq!(source["folders"], json!([films]));
}

#[tokio::test]
async fn a_review_reads_where_each_folder_is_here_and_which_one_to_ask_for() {
    let (t, _) = importer_answering(a_household());
    let (_disk, films) = this_machine();

    let (status, body) = asked_about(&t, &t.token, json!([films, "/data/movies"])).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({ "folders": [
            { "folder": films, "here": films },
            { "folder": "/data/movies" },
        ]})
    );
}

#[tokio::test]
async fn a_review_after_an_import_asks_for_no_folder_the_owner_answered_before() {
    let (t, _) = importer_answering(a_household());
    let (_disk, films) = this_machine();
    imported(
        &t,
        the_review(json!([{ "folder": "/data/movies", "here": films }])),
    )
    .await;

    let (_, body) = asked_about(&t, &t.token, json!(["/data/movies"])).await;
    let again = imported(&t, the_review(json!([]))).await;

    let (_, listed) = get(&t.app, LIBRARIES, Some(&t.token)).await;
    assert_eq!(
        body,
        json!({ "folders": [{ "folder": "/data/movies", "here": films }] })
    );
    assert_eq!(again["status"], "completed");
    assert_eq!(listed["libraries"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn a_folder_answer_no_review_could_give_is_a_400_and_starts_no_import() {
    let (t, asked) = importer_answering(a_household());
    let nowhere = json!([{ "folder": "/data/movies", "here": "" }]);

    let (status, body) = send(
        &t.app,
        "POST",
        IMPORTS,
        Some(&t.token),
        Some(the_review(nowhere)),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body, json!({ "error": "an empty folder of this machine" }));
    assert!(asked.lock().unwrap().is_empty());
}

#[tokio::test]
async fn someone_who_cannot_manage_settings_reads_where_no_folder_is() {
    let (t, _) = importer_answering(a_household());
    let (_disk, films) = this_machine();
    let (_, viewer) = seed_session(
        &t.state,
        "viewer@test.dev",
        "viewer",
        &[Permission::Playback],
    );

    let (status, _) = asked_about(&t, &viewer, json!([films])).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
}
