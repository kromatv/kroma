//! Module management for the admin console. State persists in the settings store
//! under the `moduleStates` blob (see `kroma_engine::modules`).

use std::collections::BTreeMap;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use kroma_module_supervisor::Supervisor;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api::extract::AuthUser;
use crate::model::Permission;
use crate::state::SharedState;

/// Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/modules", get(list_modules))
        .route("/modules/{id}/enabled", post(set_enabled))
        .route("/modules/{id}/config", put(set_config))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminModule {
    #[serde(flatten)]
    manifest: kroma_module_sdk::ModuleManifest,
    enabled: bool,
    config_values: BTreeMap<String, Value>,
    removable: bool,
}

async fn list_modules(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    // Runtime-installed `.kmod` modules are removable; compile-time ones are not.
    let removable_ids: std::collections::HashSet<String> =
        kroma_module_kernel::installed_ids(&state).into_iter().collect();
    let mods: Vec<AdminModule> = kroma_module_kernel::manifests(&state)
        .into_iter()
        .map(|m| {
            let enabled = kroma_engine::modules::module_enabled(&state.settings, &m.id);
            let removable = removable_ids.contains(&m.id);
            let stored = kroma_engine::modules::module_config(&state.settings, &m.id);
            let config_values = m
                .config
                .iter()
                .map(|f| {
                    let value = stored.get(&f.key).cloned().unwrap_or_else(|| {
                        f.default.clone().map(Value::from).unwrap_or(Value::Null)
                    });
                    (f.key.clone(), value)
                })
                .collect();
            AdminModule { manifest: m, enabled, config_values, removable }
        })
        .collect();
    Ok(Json(mods).into_response())
}

#[derive(Deserialize)]
struct EnabledBody {
    enabled: bool,
}

async fn set_enabled(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<EnabledBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    kroma_engine::modules::set_module_enabled(&state.settings, &state.db, &id, body.enabled);
    // Drive the module's lifecycle so the toggle starts/stops its live services,
    // not just its listing flag.
    if let Some(module) = kroma_module_kernel::find_server(&id) {
        let host: Arc<dyn kroma_module_host::HostCtx> = state.clone();
        if body.enabled {
            module.on_enable(host).await;
        } else {
            module.on_disable(host).await;
        }
    }
    // A runtime-installed sidecar follows the toggle too: its process comes up
    // or goes down now, not at the next server restart. A failed start is
    // reported but does not undo the flag: the admin asked for "enabled".
    let mut warning = None;
    if sup.installed_ids().iter().any(|installed| installed == &id) {
        let sup = sup.clone();
        let sidecar_id = id.clone();
        let enabled = body.enabled;
        let outcome = tokio::task::spawn_blocking(move || {
            if enabled {
                sup.start_installed(&sidecar_id)
            } else {
                sup.stop(&sidecar_id);
                Ok(())
            }
        })
        .await;
        match outcome {
            Ok(Ok(())) => {}
            Ok(Err(e)) => warning = Some(format!("{e:#}")),
            Err(_) => warning = Some("module lifecycle task panicked".to_string()),
        }
    }
    state
        .events
        .publish_value(json!({ "type": "module.changed", "id": id, "enabled": body.enabled }));
    Ok(Json(json!({ "id": id, "enabled": body.enabled, "warning": warning })).into_response())
}

async fn set_config(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(values): Json<BTreeMap<String, Value>>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    // Allow-list against the manifest, so a client can only write fields the module
    // actually declares.
    let allowed: std::collections::HashSet<String> = kroma_module_kernel::manifests(&state)
        .into_iter()
        .find(|m| m.id == id)
        .map(|m| m.config.into_iter().map(|f| f.key).collect())
        .unwrap_or_default();
    let map: serde_json::Map<String, Value> =
        values.into_iter().filter(|(k, _)| allowed.contains(k)).collect();
    kroma_engine::modules::set_module_config(&state.settings, &state.db, &id, map);
    Ok(Json(json!({ "id": id, "ok": true })).into_response())
}
