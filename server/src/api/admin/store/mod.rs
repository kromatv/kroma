//! The admin module Store: browse a registry catalog, plan and install (with
//! automatic dependency resolution + checksum verification), update and
//! uninstall runtime `.kmod` modules. Admin-gated (`settings.manage`);
//! installing native code is an admin-trust action. Long operations stream
//! `module.op.*` progress frames over the event bus (see [`events`]).
//!
//! A "registry" is any static host serving a catalog index (see [`catalog`])
//! plus the `.kmod` files it points at. The Store reads a list of them (see
//! [`registries`]): one pinned official catalog, whose URL the
//! `moduleRegistryUrl` setting overrides, plus any the operator added.

mod catalog;
mod events;
pub mod install;
mod plan;
mod registries;

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Extension, Json, Router};
use kroma_module_supervisor::Supervisor;
use serde_json::{json, Value};

use crate::api::extract::AuthUser;
use crate::model::Permission;
use crate::state::SharedState;

// One ceiling for both install paths: the supervisor applies it to a URL fetch.
const MAX_BUNDLE_BYTES: usize = kroma_module_supervisor::MAX_BUNDLE_BYTES as usize;

// Default module registry: the first-party catalog worker (see
// apps/modules). It reads `modules.json` off the latest GitHub
// Release, edge-caches it with a stale fallback, and serves a browsable page
// at the bare origin. Overridable via the `moduleRegistryUrl` setting.
const DEFAULT_REGISTRY: &str = "https://modules.kroma.tv/modules.json";

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/store/install", post(install_upload).layer(DefaultBodyLimit::max(MAX_BUNDLE_BYTES)))
        .route("/store/install-url", post(install_url))
        .route("/store/install-id", post(install_id))
        .route("/store/plan", post(plan))
        .route("/store/update", post(update))
        .route("/store/registry-preview", post(registry_preview))
        .route("/store/catalog", get(catalog_view))
        .route("/store/{id}", delete(uninstall))
}

#[derive(serde::Deserialize)]
struct InstallUrl {
    url: String,
    // Verified before install when given; omitted means unverified.
    #[serde(default)]
    sha256: Option<String>,
}

async fn install_url(
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Json(body): Json<InstallUrl>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let bytes = sup
        .download_artifact(&body.url, body.sha256.as_deref(), &|_, _| {})
        .await
        .map_err(|e| bad(&format!("install failed: {e:#}")))?;
    // Unpack + spawn is blocking; keep it off the async runtime.
    let url = body.url.clone();
    let manifest: Value = {
        let sup = sup.clone();
        tokio::task::spawn_blocking(move || sup.install(&bytes, None, ("url", Some(&url))))
            .await
            .map_err(|_| bad("install task panicked"))?
            .map_err(|e| bad(&format!("install failed: {e:#}")))?
    };
    Ok(installed_json(&manifest).into_response())
}

#[derive(serde::Deserialize)]
struct InstallId {
    id: String,
    // Optional-dependency ids the admin opted into installing alongside.
    #[serde(default)]
    include: Vec<String>,
}

async fn install_id(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Json(body): Json<InstallId>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let report = install::install_with_deps(&state, &sup, &body.id, &body.include)
        .await
        .map_err(|e| bad(&format!("install failed: {e:#}")))?;
    Ok(Json(report).into_response())
}

// The dry-run behind the install dialog: what installing `id` would pull
// (dependencies first) and which optional dependencies could ride along.
async fn plan(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Json(body): Json<InstallId>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let view = plan::plan_view(&state, &sup, &body.id, &body.include)
        .await
        .map_err(|e| bad(&format!("{e:#}")))?;
    Ok(Json(view).into_response())
}

#[derive(serde::Deserialize, Default)]
struct UpdateBody {
    // Restrict the batch to these module ids; absent means every outdated one.
    #[serde(default)]
    ids: Option<Vec<String>>,
}

async fn update(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Json(body): Json<UpdateBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let outcome = install::update_all(&state, &sup, body.ids.as_deref())
        .await
        .map_err(|e| bad(&format!("update failed: {e:#}")))?;
    Ok(Json(outcome).into_response())
}

#[derive(serde::Deserialize)]
struct PreviewBody {
    url: String,
}

// Fetch + parse a candidate registry BEFORE it is added, so the add flow can
// show what the catalog serves (or why it can't be read) instead of saving
// blind. Same https gate as `registries::considered`; the fetch itself is
// bounded by the supervisor's catalog timeout + size cap.
async fn registry_preview(
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Json(body): Json<PreviewBody>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let url = body.url.trim();
    if url.len() > 512 {
        return Err(bad("the URL is too long"));
    }
    if !url.starts_with("https://") {
        return Err(bad("a registry URL must be https"));
    }
    let (modules, error) = match catalog::fetch(&sup, url).await {
        Ok(modules) => (modules, None),
        Err(e) => (Vec::new(), Some(format!("{e:#}"))),
    };
    let sample: Vec<Value> = modules
        .iter()
        .take(10)
        .map(|m| json!({ "id": m.id, "name": m.name, "version": m.version, "library": m.library }))
        .collect();
    Ok(Json(json!({
        "ok": error.is_none(),
        "error": error,
        "moduleCount": modules.len(),
        "modules": sample,
    }))
    .into_response())
}

// Fetched server-side (no CORS) across every configured registry and enriched
// per module with this server's verdict. An unreachable registry is NOT an HTTP
// error: its failure is reported on its own row in `registries`, so one dead
// host leaves the rest of the catalog usable.
async fn catalog_view(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    let fetched = registries::fetch_all(&state, &sup).await;
    Ok(Json(catalog::enriched(&state, &fetched)).into_response())
}

// The manual escape hatch: no registry, no checksum to verify against - the
// upload IS the source.
async fn install_upload(
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    body: Bytes,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    if body.is_empty() {
        return Err(bad("empty bundle"));
    }
    // Unpack + spawn is blocking; keep it off the async runtime.
    let manifest: Value =
        tokio::task::spawn_blocking(move || sup.install(&body, None, ("upload", None)))
        .await
        .map_err(|_| bad("install task panicked"))?
        .map_err(|e| bad(&format!("install failed: {e:#}")))?;
    Ok(installed_json(&manifest).into_response())
}

#[derive(serde::Deserialize, Default)]
struct UninstallQuery {
    // Skips the dependents guard; the UI asks for explicit confirmation first.
    #[serde(default)]
    force: bool,
}

async fn uninstall(
    State(state): State<SharedState>,
    Extension(sup): Extension<Arc<Supervisor>>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Query(q): Query<UninstallQuery>,
) -> Result<Response, Response> {
    super::require(&user, Permission::SettingsManage)?;
    // Dependents guard: removing a module other enabled modules hard-depend on
    // would break them at their next port call. Surface who needs it
    // (structured, so the UI can offer an informed force) instead of removing.
    if !q.force {
        let dependents: Vec<String> = kroma_module_kernel::manifests(&state)
            .into_iter()
            .filter(|m| m.id != id && m.depends_on.iter().any(|d| d.id == id))
            .filter(|m| kroma_engine::modules::module_enabled(&state.settings, &m.id))
            .map(|m| m.id)
            .collect();
        if !dependents.is_empty() {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({
                    "error": format!("'{id}' is required by: {}", dependents.join(", ")),
                    "dependents": dependents,
                })),
            )
                .into_response());
        }
    }
    let op = events::Op::begin(&state, "uninstall", &id, json!([{ "id": id }]));
    let result = {
        let id = id.clone();
        tokio::task::spawn_blocking(move || sup.uninstall(&id))
            .await
            .map_err(|_| bad("uninstall task panicked"))?
    };
    match result {
        Ok(()) => {
            op.finish(None);
            Ok(Json(json!({ "ok": true })).into_response())
        }
        Err(e) => {
            let msg = format!("uninstall failed: {e:#}");
            op.finish(Some(&msg));
            Err(bad(&msg))
        }
    }
}

fn installed_json(manifest: &Value) -> Json<Value> {
    Json(json!({
        "id": manifest.get("id"),
        "name": manifest.get("name"),
        "version": manifest.get("version"),
    }))
}

fn bad(msg: &str) -> Response {
    (StatusCode::BAD_REQUEST, msg.to_string()).into_response()
}
