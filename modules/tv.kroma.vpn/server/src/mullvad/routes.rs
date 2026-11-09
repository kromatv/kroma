use std::path::PathBuf;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use kroma_module_sdk::domain::Permission;
use kroma_module_sdk::host::{json_error, run_blocking, AuthUser, HostCtx};
use serde::Deserialize;
use serde_json::json;

use super::ConnectError;
use crate::routes::bring_up;

/// `POST /vpn/mullvad` body. `accountNumber` is needed the first time only:
/// once this server holds a device, changing place names just the place.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectBody {
    pub account_number: Option<String>,
    pub country: String,
    pub city: Option<String>,
    #[serde(default)]
    pub owned_only: bool,
}

/// `POST /vpn/mullvad/devices/remove` body: free one of the account's slots.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveDeviceBody {
    pub account_number: String,
    pub device_id: String,
}

pub fn routes<S>() -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/vpn/mullvad", post(connect::<S>).delete(disconnect::<S>))
        .route("/vpn/mullvad/locations", get(locations::<S>))
        .route("/vpn/mullvad/devices/remove", post(remove_device::<S>))
}

fn dir(host: &dyn HostCtx) -> PathBuf {
    host.data_dir().join("vpn")
}

fn refused(error: ConnectError) -> Response {
    let (status, body) = match error {
        ConnectError::AccountNeeded => {
            (StatusCode::BAD_REQUEST, json!({ "code": "accountNeeded" }))
        }
        ConnectError::InvalidAccount => {
            (StatusCode::BAD_REQUEST, json!({ "code": "invalidAccount" }))
        }
        ConnectError::MaxDevices(devices) => (
            StatusCode::CONFLICT,
            json!({ "code": "maxDevices", "devices": devices }),
        ),
        ConnectError::NoRelay => (StatusCode::NOT_FOUND, json!({ "code": "noRelay" })),
        ConnectError::Throttled => (
            StatusCode::TOO_MANY_REQUESTS,
            json!({ "code": "throttled" }),
        ),
        ConnectError::Unavailable(detail) => (
            StatusCode::BAD_GATEWAY,
            json!({ "code": "unavailable", "detail": detail }),
        ),
    };
    (status, Json(body)).into_response()
}

fn failed() -> Response {
    json_error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "the request did not finish",
    )
}

async fn locations<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let countries = run_blocking(super::locations).await.map_err(|_| failed())?;
    match countries {
        Ok(countries) => Ok(Json(json!({ "countries": countries })).into_response()),
        Err(error) => Err(refused(error)),
    }
}

async fn connect<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<ConnectBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let held = dir(&state);
    let outcome = run_blocking(move || {
        super::connect(
            &held,
            body.account_number
                .as_deref()
                .filter(|n| !n.trim().is_empty()),
            &body.country,
            body.city.as_deref(),
            body.owned_only,
        )
    })
    .await
    .map_err(|_| failed())?;
    let (_, config) = outcome.map_err(refused)?;
    bring_up(&state, config).await;
    let provider =
        crate::provider::provider_of(&dir(&state), &state.setting_str("vpnWgConfig", ""));
    Ok(Json(json!({ "provider": provider })).into_response())
}

async fn disconnect<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let held = dir(&state);
    run_blocking(move || super::forget(&held))
        .await
        .map_err(|_| failed())?;
    bring_up(&state, String::new()).await;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn remove_device<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<RemoveDeviceBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    run_blocking(move || super::free_device(&body.account_number, &body.device_id))
        .await
        .map_err(|_| failed())?
        .map_err(refused)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
