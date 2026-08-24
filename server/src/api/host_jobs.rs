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
use crate::services::jobs::{Cron, JobContext, RemoteRun};
use crate::state::SharedState;

/// The `/_host/register-job` route, guarded by the shared host token the same way
/// `host_router` guards its callbacks. Merge into the `/api` router (before the
/// `Extension(supervisor)` layer, which this handler reads).
pub fn routes(host_token: String) -> Router<SharedState> {
    Router::new()
        .route("/_host/register-job", post(register_job))
        .route_layer(from_fn_with_state(
            HostToken(host_token),
            require_host_token,
        ))
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
    let Some(key) = leak_key(&body.key) else {
        tracing::warn!(module = %body.module_id, key = %body.key, "refusing job key");
        return (StatusCode::BAD_REQUEST, "unusable job key").into_response();
    };
    let schedule = match body.schedule {
        Some(expr) if !Cron::is_valid(&expr) => {
            tracing::warn!(module = %body.module_id, key, "job is manual-only: bad cron");
            None
        }
        given => given,
    };
    let category = body.category.parse::<Category>().unwrap_or_else(|()| {
        tracing::warn!(
            category = %body.category,
            key,
            "unknown job category from module; defaulting to acquisition"
        );
        Category::Acquisition
    });
    let run = remote_run(supervisor.clone(), body.module_id.clone(), key.to_string());
    state.jobs.register_remote(key, category, schedule, run);
    // register_remote seeds only the module's default schedule; overlay any
    // persisted admin override now that the key exists in the schedules map (the
    // startup load_schedules ran before this sidecar was up, so it skipped it).
    state.jobs.load_schedules(&state.db);
    tracing::info!(module = %body.module_id, key, "registered remote job");
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

type KeyPool = Mutex<HashMap<String, &'static str>>;

// Leaked to reach the `&'static str` `register_remote` keeps: bounded in count
// and length so a module respawning with generated keys cannot grow the core one
// callback at a time, and in charset so it stays one segment of `/_job/run/{key}`.
const MAX_KEY_LEN: usize = 64;
const MAX_KEYS: usize = 512;

fn leak_key_in(pool: &KeyPool, key: &str) -> Option<&'static str> {
    if key.is_empty() || key.len() > MAX_KEY_LEN || !key.bytes().all(is_key_byte) {
        return None;
    }
    let mut pool = pool.lock().unwrap();
    if let Some(&leaked) = pool.get(key) {
        return Some(leaked);
    }
    if pool.len() >= MAX_KEYS {
        return None;
    }
    let leaked: &'static str = Box::leak(key.to_string().into_boxed_str());
    pool.insert(key.to_string(), leaked);
    Some(leaked)
}

fn is_key_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')
}

fn leak_key(key: &str) -> Option<&'static str> {
    static CACHE: OnceLock<KeyPool> = OnceLock::new();
    leak_key_in(CACHE.get_or_init(|| Mutex::new(HashMap::new())), key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::test_support::{send, test_app};

    fn pool() -> KeyPool {
        Mutex::new(HashMap::new())
    }

    #[test]
    fn a_key_seen_twice_is_leaked_once() {
        let pool = pool();

        let first = leak_key_in(&pool, "acquisition.import");
        let second = leak_key_in(&pool, "acquisition.import");

        assert_eq!(first, Some("acquisition.import"));
        assert_eq!(first.map(str::as_ptr), second.map(str::as_ptr));
    }

    #[test]
    fn a_key_no_job_could_be_named_is_refused_before_anything_is_leaked() {
        let pool = pool();

        assert_eq!(leak_key_in(&pool, ""), None);
        assert_eq!(leak_key_in(&pool, "../../../etc/passwd"), None);
        assert_eq!(leak_key_in(&pool, "acquisition import"), None);
        assert_eq!(leak_key_in(&pool, &"k".repeat(MAX_KEY_LEN + 1)), None);

        assert!(pool.lock().unwrap().is_empty());
    }

    #[test]
    fn a_module_sending_endless_new_keys_stops_being_leaked_to() {
        let pool = pool();

        for n in 0..MAX_KEYS {
            assert!(leak_key_in(&pool, &format!("flood.{n}")).is_some(), "{n}");
        }

        assert_eq!(leak_key_in(&pool, "flood.past-the-ceiling"), None);
        assert_eq!(pool.lock().unwrap().len(), MAX_KEYS);
    }

    #[tokio::test]
    async fn a_registration_the_core_will_not_leak_for_registers_no_job() {
        let t = test_app();
        let body = serde_json::json!({
            "moduleId": "tv.kroma.flood",
            "key": "not a job key",
            "category": "maintenance",
        });

        let (status, _) = send(
            &t.app,
            "POST",
            "/api/_host/register-job",
            Some("test-host-token"),
            Some(body),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(t.state.jobs.resolve("not a job key"), None);
    }

    #[tokio::test]
    async fn a_schedule_no_scheduler_could_read_leaves_the_job_manual_only() {
        let t = test_app();
        let body = serde_json::json!({
            "moduleId": "tv.kroma.flood",
            "key": "flood.hourly",
            "category": "maintenance",
            "schedule": "whenever you like",
        });

        let (status, _) = send(
            &t.app,
            "POST",
            "/api/_host/register-job",
            Some("test-host-token"),
            Some(body),
        )
        .await;

        assert_eq!(status, StatusCode::NO_CONTENT);
        let listed = t.state.jobs.list(&t.state);
        let job = listed
            .iter()
            .find(|j| j.key == "flood.hourly")
            .expect("job registered");
        assert_eq!(job.schedule, None);
    }
}
