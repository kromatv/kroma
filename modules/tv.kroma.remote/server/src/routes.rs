use std::sync::Arc;

use axum::extract::{Extension, State};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{AuthUser, HostCtx};

use crate::access::RemoteAccess;

/// The Remote-access admin API, generic over any [`HostCtx`] state. Mounted by
/// the binary's `RemoteModule` with the live [`RemoteAccess`] injected as an
/// `Extension`. Paths are relative to the `/api/admin` nest.
pub fn routes<S>(remote: Arc<RemoteAccess>) -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/remote", get(get_remote::<S>).put(save_remote::<S>))
        .layer(Extension(remote))
}

// Config (token masked) + live connector status.
async fn status_value(host: &dyn HostCtx, remote: &RemoteAccess) -> serde_json::Value {
    let st = remote.status().await;
    json!({
        "enabled": host.setting_bool("remoteAccess", false),
        "url": host.setting_str("remoteUrl", "").trim().trim_end_matches('/'),
        "hasToken": !host.setting_str("remoteAccessToken", "").trim().is_empty(),
        "status": serde_json::to_value(&st).unwrap_or_default(),
    })
}

// `GET /remote` -> current config (token masked) + live status.
async fn get_remote<S: HostCtx>(
    State(state): State<S>,
    Extension(remote): Extension<Arc<RemoteAccess>>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require_any_admin(&user)?;
    Ok(Json(status_value(&state, &remote).await).into_response())
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RemoteSaveBody {
    enabled: bool,
    url: String,
    token: Option<String>,
}

// `PUT /remote` -> persist config, then kick one reconcile so the
// connector starts/stops immediately (non-blocking). Returns the fresh status.
async fn save_remote<S: HostCtx>(
    State(state): State<S>,
    Extension(remote): Extension<Arc<RemoteAccess>>,
    AuthUser(user): AuthUser,
    Json(body): Json<RemoteSaveBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    // Blank/omitted keeps the stored token: only overwrite it when a non-blank
    // value was actually typed.
    let token = body
        .token
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty());
    let mut patch = std::collections::BTreeMap::new();
    patch.insert("remoteAccess".to_string(), json!(body.enabled));
    patch.insert("remoteUrl".to_string(), json!(body.url.trim()));
    if let Some(tok) = token {
        patch.insert("remoteAccessToken".to_string(), json!(tok));
    }
    state.set_settings(patch);
    remote.reconcile(&state).await;
    Ok(Json(status_value(&state, &remote).await).into_response())
}

#[cfg(test)]
mod tests {
    use axum::body::{to_bytes, Body};
    use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    use kroma_module_sdk::host::testing::StubHost;

    use crate::test_support::{host, remote_for};

    use super::*;

    async fn call(host: &StubHost, request: Request<Body>) -> (StatusCode, serde_json::Value) {
        let app = routes::<StubHost>(remote_for(host)).with_state(host.clone());
        let response = app.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or_default())
    }

    fn get_remote_request() -> Request<Body> {
        Request::get("/remote")
            .header(AUTHORIZATION, "Bearer tok")
            .body(Body::empty())
            .unwrap()
    }

    fn put_remote_request(body: serde_json::Value) -> Request<Body> {
        Request::put("/remote")
            .header(AUTHORIZATION, "Bearer tok")
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn reports_the_config_without_the_token() {
        let host = host()
            .with_setting("remoteUrl", json!("https://kroma.example.com/"))
            .with_setting("remoteAccessToken", json!("secret"));

        let (status, body) = call(&host, get_remote_request()).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["enabled"], json!(false));
        assert_eq!(body["url"], json!("https://kroma.example.com"));
        assert_eq!(body["hasToken"], json!(true));
        assert!(!body.to_string().contains("secret"));
    }

    #[tokio::test]
    async fn refuses_a_request_without_a_session() {
        let host = host();
        let request = Request::get("/remote").body(Body::empty()).unwrap();

        let (status, _) = call(&host, request).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn saves_the_trimmed_url_and_token() {
        let host = host();
        let request = put_remote_request(
            json!({ "enabled": false, "url": " https://kroma.example.com ", "token": " abc " }),
        );

        let (status, body) = call(&host, request).await;

        assert_eq!(status, StatusCode::OK);
        let written = host.settings_written();
        assert_eq!(written[0]["remoteUrl"], json!("https://kroma.example.com"));
        assert_eq!(written[0]["remoteAccessToken"], json!("abc"));
        assert_eq!(body["hasToken"], json!(true));
    }

    #[tokio::test]
    async fn keeps_the_stored_token_when_the_new_one_is_blank() {
        let host = host();
        let request = put_remote_request(json!({ "enabled": false, "url": "", "token": "  " }));

        call(&host, request).await;

        assert!(!host.settings_written()[0].contains_key("remoteAccessToken"));
    }
}
