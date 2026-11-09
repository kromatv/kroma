//! The managed WireGuard bridge admin API (`/vpn`), generic over any
//! [`HostCtx`] state. Moved out of the binary so the VPN module owns its whole
//! vertical: status for the downloads-page card, write-only config upload, and a
//! live seal test. Gated on `settings.manage`. The endpoint owns only the
//! WireGuard secret (never returned to clients); the raw `vpnProxyUrl` fallback
//! and the kill-switch toggle live in the Acquisition settings view.

use std::collections::BTreeMap;

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

use kroma_module_sdk::domain::Permission;

use crate::bandwidth::{engine_bandwidth, range_or_default};
use crate::{SaveVpnBody, VpnAdminView, VpnTestResult};
use axum::http::StatusCode;
use kroma_module_sdk::host::{blocking, json_error, run_blocking, service, AuthUser, HostCtx};

use crate::wg_configured;

use crate::Vpn;

pub fn routes<S>() -> Router<S>
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/vpn", get(status::<S>).put(save::<S>))
        .route("/vpn/test", post(test::<S>))
        .route("/vpn/bandwidth", get(bandwidth::<S>))
        .merge(crate::mullvad::routes::routes::<S>())
        .merge(crate::saved::routes::routes::<S>())
}

#[derive(Debug, Default, serde::Deserialize)]
struct RangeParams {
    #[serde(default)]
    range: Option<String>,
}

async fn bandwidth<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Query(params): Query<RangeParams>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let range = range_or_default(params.range.as_deref().unwrap_or_default()).to_string();
    let view = blocking(move || Ok(engine_bandwidth(&state, &range))).await?;
    Ok(Json(view).into_response())
}

// `GET /vpn`
async fn status<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let vpn = service::<Vpn>(&state);
    let bridge_running = match &vpn {
        Some(vpn) => vpn.running().await,
        None => false,
    };
    let status = crate::port::engine_status(&state);
    if let Some(vpn) = &vpn {
        vpn.remember_exit(status.as_ref().and_then(|status| status.exit_ip.clone()));
    }
    let provider = crate::provider::provider_of(
        &state.data_dir().join("vpn"),
        &state.setting_str("vpnWgConfig", ""),
    );
    let saved = crate::saved::views(
        &state.data_dir().join("vpn"),
        &state.setting_str("vpnWgConfig", ""),
    );
    let view = VpnAdminView {
        provider,
        saved,
        wg_configured: wg_configured(&state),
        bridge_running,
        local_port: state.setting_i64("vpnLocalPort", 25345).clamp(1, 65535) as u16,
        status,
    };
    Ok(Json(view).into_response())
}

// `PUT /vpn` store the WireGuard config ("" removes it) and/or the
// local bridge port, then restart the bridge + the embedded engine so the new
// tunnel applies immediately.
async fn save<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
    Json(body): Json<SaveVpnBody>,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let mut patch: BTreeMap<String, Value> = BTreeMap::new();
    if let Some(wg) = body.wg_config {
        let held = state.data_dir().join("vpn");
        run_blocking(move || crate::mullvad::forget(&held))
            .await
            .map_err(|_| {
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "the request did not finish",
                )
            })?;
        patch.insert("vpnWgConfig".into(), json!(wg.trim()));
    }
    if let Some(port) = body.local_port {
        patch.insert("vpnLocalPort".into(), json!(port));
    }
    if !patch.is_empty() {
        state.set_settings(patch);
        if let Some(vpn) = service::<Vpn>(&state) {
            vpn.apply(&state).await;
        }
        crate::port::restart_engine(&state);
    }
    Ok(Json(json!({ "ok": true, "wgConfigured": wg_configured(&state) })).into_response())
}

// `POST /vpn/test` run the seal probe now (also drives the gate).
async fn test<S: HostCtx + Clone + Send + Sync + 'static>(
    State(state): State<S>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    state.require(&user, Permission::SettingsManage)?;
    let result = blocking(move || {
        Ok(match crate::port::engine_seal_check(&state) {
            Some(check) => VpnTestResult {
                sealed: check.sealed,
                proxied_ip: check.proxied_ip,
                direct_ip: check.direct_ip,
                error: check.error,
            },
            None => VpnTestResult {
                sealed: false,
                proxied_ip: None,
                direct_ip: None,
                error: Some("no VPN proxy configured".into()),
            },
        })
    })
    .await?;
    Ok(Json(result).into_response())
}

/// Make `config` the tunnel's ("" stops it), then restart the bridge and the
/// engine so the new route applies at once.
pub(crate) async fn bring_up<S: HostCtx + Clone + Send + Sync + 'static>(
    state: &S,
    config: String,
) {
    let mut patch: BTreeMap<String, Value> = BTreeMap::new();
    patch.insert("vpnWgConfig".into(), json!(config));
    state.set_settings(patch);
    if let Some(vpn) = service::<Vpn>(state) {
        vpn.apply(state).await;
    }
    crate::port::restart_engine(state);
}
