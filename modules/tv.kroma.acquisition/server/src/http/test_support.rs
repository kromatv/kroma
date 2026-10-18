use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use kroma_module_sdk::domain::{LibraryScope, Permission, User};
use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage;
use serde_json::Value;
use tower::ServiceExt as _;

pub(crate) const TOKEN: &str = "admin";
pub(crate) const LIBRARIAN: &str = "librarian";

fn user_with(permissions: Vec<Permission>) -> User {
    User {
        id: "u1".into(),
        email: "a@b.c".into(),
        username: "ana".into(),
        avatar_url: None,
        language: None,
        audio_language: None,
        subtitle_language: None,
        permissions,
        libraries: LibraryScope::All,
        created_at: "2024-01-01T00:00:00Z".into(),
        has_pin: false,
    }
}

pub(crate) fn signed_in(host: StubHost) -> StubHost {
    host.with_session(TOKEN, user_with(vec![Permission::SettingsManage]))
        .with_session(LIBRARIAN, user_with(vec![Permission::LibraryManage]))
}

pub(crate) fn host() -> StubHost {
    let host = signed_in(StubHost::with_core(
        kroma_module_sdk::db::testing::temp_pool("acq-routes"),
    ));
    kroma_module_sdk::db::apply_migrations(
        &host.store().get().unwrap(),
        crate::rules::schema::MIGRATIONS,
    )
    .unwrap();
    host
}

pub(crate) fn seed_movie_file(host: &StubHost, tmdb_id: u64, path: &str) {
    let conn = host.db().get().unwrap();
    conn.execute_batch(&format!(
        "PRAGMA foreign_keys = OFF;
         INSERT INTO files (id, item_id, abs_path, rel_path, container, v_codec, v_width, v_height, probed)
         VALUES ('f-{tmdb_id}', 'i-{tmdb_id}', '{path}', 'Movie (2020)/movie.mkv', 'mkv', 'h264', 1920, 1080, 1);
         INSERT INTO acq_file_tmdb (abs_path, tmdb_id) VALUES ('{path}', {tmdb_id});"
    ))
    .unwrap();
}

pub(crate) async fn call(
    router: Router<StubHost>,
    host: &StubHost,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let body = match body {
        Some(json) => {
            req = req.header("content-type", "application/json");
            Body::from(json.to_string())
        }
        None => Body::empty(),
    };
    let resp = router
        .with_state(host.clone())
        .oneshot(req.body(body).unwrap())
        .await
        .unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

pub(crate) async fn admin(
    router: Router<StubHost>,
    host: &StubHost,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    call(router, host, method, path, Some(TOKEN), body).await
}
