use std::collections::HashMap;
use std::sync::Arc;

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use kroma_module_host::host_token::{require_host_token, HostToken};
use kroma_module_host::ServerModule;

use crate::remote_host::RemoteHost;

// What this process serves and what it asks the core for, gathered before the
// router is built. Kept out of [`serve`] because each is a loop over the modules
// with its own rule, and `serve`'s own job is the order the parts come up in.
pub(crate) fn collect_jobs(
    modules: &[Box<dyn ServerModule<RemoteHost>>],
) -> (HashMap<&'static str, JobFn>, Vec<JobSpec>) {
    // job_fns backs /_job/run/{key}; job_specs registers with the core scheduler.
    let mut job_fns: HashMap<&'static str, JobFn> = HashMap::new();
    let mut job_specs: Vec<JobSpec> = Vec::new();
    for job in modules.iter().flat_map(|module| module.jobs()) {
        job_fns.insert(job.key, job.run);
        job_specs.push(JobSpec {
            key: job.key.to_string(),
            category: job.category.to_string(),
            schedule: job.schedule.map(str::to_string),
        });
    }
    (job_fns, job_specs)
}

pub(crate) type JobFn = fn(&RemoteHost) -> anyhow::Result<()>;

pub(crate) struct JobSpec {
    pub(crate) key: String,
    pub(crate) category: String,
    pub(crate) schedule: Option<String>,
}

pub(crate) fn job_router(
    job_fns: HashMap<&'static str, JobFn>,
    token: String,
) -> axum::Router<RemoteHost> {
    axum::Router::new()
        .route("/_job/run/{key}", axum::routing::post(run_job))
        .route_layer(axum::middleware::from_fn_with_state(
            HostToken(token),
            require_host_token,
        ))
        .layer(axum::Extension(Arc::new(job_fns)))
}

async fn run_job(
    axum::extract::State(host): axum::extract::State<RemoteHost>,
    axum::Extension(job_fns): axum::Extension<Arc<HashMap<&'static str, JobFn>>>,
    axum::extract::Path(key): axum::extract::Path<String>,
) -> Response {
    let Some(&run) = job_fns.get(key.as_str()) else {
        tracing::warn!(job = %key, "run requested for a job this process does not have");
        return (StatusCode::NOT_FOUND, format!("unknown job {key}")).into_response();
    };
    tracing::info!(job = %key, "job starting");
    let started = std::time::Instant::now();
    let outcome = tokio::task::spawn_blocking(move || run(&host)).await;
    let elapsed_ms = started.elapsed().as_millis();
    match outcome {
        Ok(Ok(())) => {
            tracing::info!(job = %key, elapsed_ms, "job done");
            StatusCode::OK.into_response()
        }
        Ok(Err(e)) => {
            tracing::error!(job = %key, elapsed_ms, error = %format!("{e:#}"), "job failed");
            (StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}")).into_response()
        }
        Err(e) => {
            tracing::error!(job = %key, elapsed_ms, error = %e, "job panicked");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("job panicked: {e}"),
            )
                .into_response()
        }
    }
}

pub(crate) fn register_jobs(url: &str, module_id: &str, host_token: &str, specs: &[JobSpec]) {
    for spec in specs {
        let body = serde_json::json!({
            "moduleId": module_id,
            "key": spec.key,
            "category": spec.category,
            "schedule": spec.schedule,
        });
        match kroma_http::Loopback::new()
            .header("authorization", format!("Bearer {host_token}"))
            .post_json(url, &body)
        {
            Ok(resp) if (200..300).contains(&resp.status) => {
                tracing::info!(job = %spec.key, "registered job with core scheduler");
            }
            Ok(resp) => tracing::warn!(
                job = %spec.key,
                status = resp.status,
                "core rejected job registration: {}",
                resp.text()
            ),
            Err(e) => {
                tracing::warn!(job = %spec.key, error = %format!("{e:#}"), "job registration failed")
            }
        }
    }
}
