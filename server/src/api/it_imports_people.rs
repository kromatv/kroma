use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::api::test_support::{
    IMPORTER, TestApp, get, import_job_ended, importer_answering, seed_session, send,
};
use crate::model::Permission;

const IMPORTS: &str = "/api/admin/imports";

fn a_household() -> Value {
    json!({ "Ok": {
        "users": [
            { "id": "42", "name": "Ana", "signedIn": true, "allLibraries": true },
            { "id": "43", "name": "Ben", "email": "ben@example.test", "allLibraries": true },
            { "id": "44", "name": "Cleo", "allLibraries": true, "finerLimits": ["rating"] },
        ],
    }})
}

fn the_review(users: Value) -> Value {
    json!({
        "importer": IMPORTER,
        "signIn": "s-1",
        "server": { "id": "srv", "name": "Living room" },
        "selection": { "users": users },
    })
}

async fn start(t: &TestApp, users: Value) -> (StatusCode, Value) {
    send(
        &t.app,
        "POST",
        IMPORTS,
        Some(&t.token),
        Some(the_review(users)),
    )
    .await
}

async fn imported(t: &TestApp, users: Value) -> Value {
    let mut events = t.state.events.subscribe();
    let (status, started) = start(t, users).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "the import did not start: {started}"
    );
    import_job_ended(&mut events).await;
    let uri = format!("{IMPORTS}/{}", started["id"].as_str().unwrap());
    get(&t.app, &uri, Some(&t.token)).await.1
}

async fn members(t: &TestApp) -> Vec<Value> {
    let (_, body) = get(&t.app, "/api/admin/users", Some(&t.token)).await;
    body["users"].as_array().unwrap().clone()
}

async fn member(t: &TestApp, name: &str) -> Value {
    let found = members(t).await.into_iter().find(|m| m["username"] == name);
    found.unwrap_or_else(|| panic!("no account named {name}"))
}

#[tokio::test]
async fn an_import_gives_each_user_the_owner_kept_an_account_that_waits_on_a_drafted_invitation() {
    let (t, _) = importer_answering(a_household());

    let import = imported(&t, json!([{ "id": "42" }, { "id": "43" }, { "id": "44" }])).await;

    let (ben, cleo) = (member(&t, "Ben").await, member(&t, "Cleo").await);
    assert_eq!(import["status"], "completed");
    assert_eq!(
        import["report"]["users"],
        json!({ "read": 3, "brought": 3, "unmatched": 0 })
    );
    assert_eq!(members(&t).await.len(), 3);
    assert_eq!(ben["invitation"], "pending");
    assert_eq!(ben["email"], "ben@example.test");
    assert_eq!(ben["libraries"], Value::Null);
    assert_eq!(cleo["invitation"], "pending");
    assert_eq!(cleo["libraries"], json!([]));
}

#[tokio::test]
async fn the_account_the_owner_chose_for_a_user_travels_with_what_they_kept() {
    let (t, _) = importer_answering(a_household());
    let (here, _) = seed_session(&t.state, "b@example.test", "Benjamin", &[]);
    let users = json!([
        { "id": "43", "account": { "existing": here } },
        { "id": "44", "account": "new" },
    ]);

    let import = imported(&t, users.clone()).await;

    let names: Vec<Value> = members(&t)
        .await
        .into_iter()
        .map(|m| m["username"].clone())
        .collect();
    assert_eq!(import["selection"]["users"], users);
    assert_eq!(import["report"]["users"]["brought"], 2);
    assert_eq!(names.len(), 3);
    assert!(!names.contains(&json!("Ben")));
    assert_eq!(member(&t, "Benjamin").await["invitation"], Value::Null);
}

#[tokio::test]
async fn a_pin_sent_with_a_kept_user_is_not_stored_with_the_import() {
    let (t, _) = importer_answering(a_household());
    let pin = crate::services::auth::random_token();

    let import = imported(&t, json!([{ "id": "44", "pin": pin }])).await;

    let stored: String = t
        .state
        .db
        .get()
        .unwrap()
        .query_row("SELECT selection FROM imports", [], |r| r.get(0))
        .unwrap();
    assert_eq!(import["selection"]["users"], json!([{ "id": "44" }]));
    assert!(!stored.contains(&pin));
}

#[tokio::test]
async fn attaching_a_user_to_an_account_this_server_does_not_have_is_a_400() {
    let (t, asked) = importer_answering(a_household());

    let (status, body) = start(
        &t,
        json!([{ "id": "43", "account": { "existing": "nobody" } }]),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        body,
        json!({ "error": "a user attached to an account this server does not have" })
    );
    assert!(asked.lock().unwrap().is_empty());
    assert_eq!(members(&t).await.len(), 1);
}

#[tokio::test]
async fn a_second_import_of_the_same_users_adds_no_account() {
    let (t, _) = importer_answering(a_household());
    imported(&t, json!([{ "id": "43" }, { "id": "44" }])).await;
    let first = members(&t).await;

    let again = imported(&t, json!([{ "id": "43" }, { "id": "44" }])).await;

    assert_eq!(
        again["report"]["users"],
        json!({ "read": 2, "brought": 0, "unmatched": 0 })
    );
    assert_eq!(members(&t).await.len(), first.len());
}

fn an_administrator_of_settings_alone(t: &TestApp) -> String {
    let rights = [Permission::SettingsManage];
    seed_session(&t.state, "ops@example.test", "ops", &rights).1
}

#[tokio::test]
async fn an_administrator_who_cannot_manage_accounts_brings_no_user_over() {
    let (t, asked) = importer_answering(a_household());
    let limited = an_administrator_of_settings_alone(&t);
    let review = the_review(json!([{ "id": "43" }]));

    let (status, _) = send(&t.app, "POST", IMPORTS, Some(&limited), Some(review)).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(asked.lock().unwrap().is_empty());
    assert_eq!(members(&t).await.len(), 2);
}

#[tokio::test]
async fn an_administrator_who_cannot_manage_accounts_starts_an_import_that_keeps_no_user() {
    let (t, _) = importer_answering(a_household());
    let limited = an_administrator_of_settings_alone(&t);
    let mut events = t.state.events.subscribe();

    let (status, _) = send(
        &t.app,
        "POST",
        IMPORTS,
        Some(&limited),
        Some(the_review(json!([]))),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    import_job_ended(&mut events).await;
    assert_eq!(members(&t).await.len(), 2);
}
