//! The two faces of this sidecar: the console's device list and installer,
//! and the screens the channel on the box asks for.

use std::sync::Arc;

use axum::extract::{Extension, Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{bearer_from_headers, json_error, AuthUser, HostCtx};

use crate::address::DeviceAddress;
use crate::core::Core;
use crate::state::Roku;
use crate::{channel, detail, lan};

pub fn routes<S>(roku: Arc<Roku>) -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/roku", get(status::<S>).put(save_password::<S>))
        .route("/roku/scan", post(scan::<S>))
        .route("/roku/add", post(add::<S>))
        .route("/roku/{serial}/install", post(install::<S>))
        .route("/roku/{serial}/launch", post(launch::<S>))
        .route("/channel/home", get(home))
        .route("/channel/detail/{kind}/{id}", get(detail))
        .layer(Extension(roku))
}

fn view(roku: &Roku) -> Response {
    Json(json!({
        "serverUrl": lan::server_url(),
        "hasPassword": !roku.password().is_empty(),
        "devices": roku.devices(),
    }))
    .into_response()
}

async fn status<S: HostCtx + Clone>(
    State(state): State<S>,
    Extension(roku): Extension<Arc<Roku>>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    Ok(view(&roku))
}

async fn scan<S: HostCtx + Clone>(
    State(state): State<S>,
    Extension(roku): Extension<Arc<Roku>>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    roku.scan().await;
    Ok(view(&roku))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct AddBody {
    ip: String,
}

async fn add<S: HostCtx + Clone>(
    State(state): State<S>,
    Extension(roku): Extension<Arc<Roku>>,
    AuthUser(user): AuthUser,
    Json(body): Json<AddBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let address = DeviceAddress::parse(&body.ip)
        .ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "not an address on this network"))?;
    roku.add(address)
        .await
        .map_err(|e| json_error(StatusCode::BAD_GATEWAY, &format!("{e:#}")))?;
    Ok(view(&roku))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct PasswordBody {
    password: String,
}

async fn save_password<S: HostCtx + Clone>(
    State(state): State<S>,
    Extension(roku): Extension<Arc<Roku>>,
    AuthUser(user): AuthUser,
    Json(body): Json<PasswordBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    roku.set_password(&body.password)
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("{e:#}")))?;
    Ok(view(&roku))
}

fn server_url_or_503() -> Result<String, Response> {
    lan::server_url().ok_or_else(|| {
        json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "no LAN address to hand the box",
        )
    })
}

async fn install<S: HostCtx + Clone>(
    State(state): State<S>,
    Extension(roku): Extension<Arc<Roku>>,
    AuthUser(user): AuthUser,
    Path(serial): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    if roku.password().is_empty() {
        return Err(json_error(StatusCode::BAD_REQUEST, "no developer password"));
    }
    let server_url = server_url_or_503()?;
    roku.install(&serial, server_url).await;
    Ok(view(&roku))
}

async fn launch<S: HostCtx + Clone>(
    State(state): State<S>,
    Extension(roku): Extension<Arc<Roku>>,
    AuthUser(user): AuthUser,
    Path(serial): Path<String>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let server_url = server_url_or_503()?;
    roku.launch(&serial, server_url).await;
    Ok(view(&roku))
}

fn core_for(headers: &HeaderMap) -> Result<Core, Response> {
    let bearer = bearer_from_headers(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "missing bearer token"))?;
    Core::from_env(bearer)
        .map_err(|e| json_error(StatusCode::INTERNAL_SERVER_ERROR, &format!("{e:#}")))
}

struct Labels {
    continuing: &'static str,
    movies: &'static str,
    shows: &'static str,
}

fn labels(user: &kroma_module_sdk::domain::User) -> Labels {
    match user.language.as_deref() {
        Some(l) if l.starts_with("fr") => Labels {
            continuing: "Reprendre",
            movies: "Films",
            shows: "Séries",
        },
        _ => Labels {
            continuing: "Continue watching",
            movies: "Movies",
            shows: "Shows",
        },
    }
}

async fn home(AuthUser(user): AuthUser, headers: HeaderMap) -> Result<Response, Response> {
    let core = core_for(&headers)?;
    let labels = labels(&user);
    let (continuing, sections) =
        tokio::join!(core.get_or_null("/continue"), core.get_or_null("/home"));
    let mut rows = channel::home_rows(labels.continuing, &continuing, &sections);
    if rows.len() <= 1 {
        let (movies, shows) = tokio::join!(core.get_or_null("/movies"), core.get_or_null("/shows"));
        rows.extend(channel::library_rows(
            labels.movies,
            labels.shows,
            &movies,
            &shows,
        ));
    }
    Ok(Json(json!({ "rows": rows })).into_response())
}

async fn resume_ms(core: &Core, item_id: &str) -> i64 {
    core.get_or_null(&format!("/progress/{item_id}"))
        .await
        .get("positionMs")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0)
}

async fn detail(
    AuthUser(_user): AuthUser,
    headers: HeaderMap,
    Path((kind, id)): Path<(String, String)>,
) -> Result<Response, Response> {
    let core = core_for(&headers)?;
    let not_found = || json_error(StatusCode::NOT_FOUND, "unknown item");
    let detail = if kind == "show" {
        let show = core
            .get(&format!("/shows/{id}"))
            .await
            .map_err(|_| not_found())?;
        let up_next = core.get_or_null(&format!("/shows/{id}/up-next")).await;
        let resume = match up_next
            .get("item")
            .and_then(|i| i.get("id"))
            .and_then(serde_json::Value::as_str)
        {
            Some(item_id) => resume_ms(&core, item_id).await,
            None => 0,
        };
        detail::show_detail(&show, &up_next, resume)
    } else {
        let item = core
            .get(&format!("/items/{id}"))
            .await
            .map_err(|_| not_found())?;
        let resume = resume_ms(&core, &id).await;
        detail::item_detail(&item, resume)
    };
    Ok(Json(detail).into_response())
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
    use axum::http::Request;
    use tower::ServiceExt;

    use kroma_module_sdk::domain::{LibraryScope, User};
    use kroma_module_sdk::host::testing::StubHost;

    use super::*;

    fn operator() -> User {
        User {
            id: "u1".into(),
            email: "ana@kroma.tv".into(),
            username: "ana".into(),
            avatar_url: None,
            language: None,
            audio_language: None,
            subtitle_language: None,
            permissions: Vec::new(),
            libraries: LibraryScope::All,
            created_at: "2026-01-01T00:00:00Z".into(),
            has_pin: false,
        }
    }

    async fn add_by_hand(ip: &str) -> StatusCode {
        let host = StubHost::new().with_session("tok", operator());
        let app = routes::<StubHost>(crate::roku_service(std::path::Path::new("/nowhere")))
            .with_state(host);
        let request = Request::post("/roku/add")
            .header(AUTHORIZATION, "Bearer tok")
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(json!({ "ip": ip }).to_string()))
            .unwrap();

        app.oneshot(request).await.unwrap().status()
    }

    #[tokio::test]
    async fn adding_a_box_by_hand_takes_an_address_on_this_network_and_nothing_else() {
        assert_eq!(add_by_hand("roku.local").await, StatusCode::BAD_REQUEST);
        assert_eq!(
            add_by_hand("attacker.example.com").await,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(add_by_hand("203.0.113.7").await, StatusCode::BAD_REQUEST);
        assert_eq!(add_by_hand("100.64.0.1").await, StatusCode::BAD_REQUEST);
        assert_eq!(add_by_hand("").await, StatusCode::BAD_REQUEST);
    }
}
