//! The `/_host/register-job` callback a sidecar module POSTs to so its scheduled
//! jobs join the core `JobManager` (admin Tâches, cron, run-now, history) like an
//! in-core job. On each trigger, the registered closure resolves the module's
//! current local port and blocking-POSTs `/_job/run/{key}`. Mounted on `/api`
//! next to `host_router`, guarded by the same shared host token.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use axum::extract::State;
use axum::http::StatusCode;
use axum::middleware::from_fn_with_state;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Extension, Json, Router};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_supervisor::Supervisor;

use crate::model::Category;
use crate::services::jobs::{JobContext, RemoteRun};
use crate::state::SharedState;

/// The `/_host/register-job` route, guarded by the shared host token the same way
/// `host_router` guards its callbacks. Merge into the `/api` router (before the
/// `Extension(supervisor)` layer, which this handler reads).
pub fn routes(host_token: String) -> Router<SharedState> {
    Router::new()
        .route("/_host/register-job", post(register_job))
        .route_layer(from_fn_with_state(HostToken(host_token), require_host_token))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterJobBody {
    module_id: String,
    key: String,
    category: String,
    schedule: Option<String>,
}

async fn register_job(
    State(state): State<SharedState>,
    Extension(supervisor): Extension<Arc<Supervisor>>,
    Json(body): Json<RegisterJobBody>,
) -> Response {
    let key = leak_key(&body.key);
    let category = body.category.parse::<Category>().unwrap_or_else(|()| {
        tracing::warn!(
            category = %body.category,
            key = %body.key,
            "unknown job category from module; defaulting to acquisition"
        );
        Category::Acquisition
    });
    let run = remote_run(supervisor.clone(), body.module_id.clone(), body.key.clone());
    state.jobs.register_remote(key, category, body.schedule, run);
    // register_remote seeds only the module's default schedule; overlay any
    // persisted admin override now that the key exists in the schedules map (the
    // startup load_schedules ran before this sidecar was up, so it skipped it).
    state.jobs.load_schedules(&state.db);
    tracing::info!(module = %body.module_id, key = %body.key, "registered remote job");
    StatusCode::NO_CONTENT.into_response()
}

// On each trigger, resolves the module's current local port and blocking-POSTs
// `/_job/run/{key}` with the shared host token, on the JobManager's blocking
// thread (a long import is fine). A non-2xx or unreachable sidecar fails the
// run, recorded by the console with the error message.
fn remote_run(supervisor: Arc<Supervisor>, module_id: String, key: String) -> RemoteRun {
    let host_token = supervisor.host_token().to_string();
    Arc::new(move |_ctx: &JobContext| -> anyhow::Result<()> {
        // Module not running (disabled, or mid-respawn): a scheduled fire is a
        // no-op, not a failure. Returning Ok keeps the job history clean instead
        // of recording an error every tick while the module is down.
        let Some(port) = supervisor.port_of(&module_id) else {
            tracing::debug!(module = %module_id, "remote job skipped: module not running");
            return Ok(());
        };
        let url = format!("http://127.0.0.1:{port}/_job/run/{key}");
        let resp = kroma_http::Fetch::new()
            .header("authorization", format!("Bearer {host_token}"))
            // Imports move whole files across disks; allow up to 30 minutes.
            .max_time(30 * 60)
            .post_json(&url, &serde_json::Value::Null)?;
        if (200..300).contains(&resp.status) {
            Ok(())
        } else {
            anyhow::bail!("sidecar returned HTTP {}: {}", resp.status, resp.text());
        }
    })
}

// Leaks to `&'static str` (what `register_remote` needs for its `'static` maps),
// caching by key so a respawn reuses the same leak. Job keys are a small fixed
// set, so the total leak is bounded.
fn leak_key(key: &str) -> &'static str {
    static CACHE: OnceLock<Mutex<HashMap<String, &'static str>>> = OnceLock::new();
    let mut map = CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
    if let Some(&leaked) = map.get(key) {
        return leaked;
    }
    let leaked: &'static str = Box::leak(key.to_string().into_boxed_str());
    map.insert(key.to_string(), leaked);
    leaked
}
