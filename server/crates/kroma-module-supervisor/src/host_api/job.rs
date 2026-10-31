//! A module asking the core to run one of its jobs now, under a key and a
//! reason the core keeps for the life of the process.

use std::collections::HashMap;
use std::sync::RwLock;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use kroma_module_host::HostCtx;

#[derive(serde::Deserialize)]
pub(super) struct JobBody {
    key: String,
    reason: String,
}

// `trigger_job` takes `&'static str` for in-process callers passing literals, so
// a key off the wire has to be leaked. Job keys are a small fixed vocabulary;
// this ceiling is what keeps a sidecar sending unbounded new ones from growing
// the core's memory one callback at a time.
const MAX_INTERNED: usize = 512;

type InternPool = RwLock<HashMap<String, &'static str>>;

fn intern_in(pool: &InternPool, s: String) -> Option<&'static str> {
    if let Some(found) = pool.read().unwrap().get(&s) {
        return Some(found);
    }
    let mut pool = pool.write().unwrap();
    if let Some(found) = pool.get(&s) {
        return Some(found);
    }
    if pool.len() >= MAX_INTERNED {
        return None;
    }
    let leaked: &'static str = Box::leak(s.clone().into_boxed_str());
    pool.insert(s, leaked);
    Some(leaked)
}

// Keys and reasons get a ceiling each: `key` is a closed vocabulary, `reason` is
// free-form, and one pool would let a module's reasons exhaust the slots every
// future key needs.
fn intern_key(s: String) -> Option<&'static str> {
    static KEYS: std::sync::OnceLock<InternPool> = std::sync::OnceLock::new();
    intern_in(KEYS.get_or_init(|| RwLock::new(HashMap::new())), s)
}

fn intern_reason(s: String) -> Option<&'static str> {
    static REASONS: std::sync::OnceLock<InternPool> = std::sync::OnceLock::new();
    intern_in(REASONS.get_or_init(|| RwLock::new(HashMap::new())), s)
}

pub(super) async fn trigger_job<S: HostCtx>(
    State(host): State<S>,
    Json(body): Json<JobBody>,
) -> StatusCode {
    let Some(key) = intern_key(body.key) else {
        tracing::warn!("refusing to intern another job key; a module is sending unbounded ones");
        return StatusCode::BAD_REQUEST;
    };
    host.trigger_job(key, intern_reason(body.reason).unwrap_or("module"));
    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::{InternPool, MAX_INTERNED, intern_in};

    #[test]
    fn a_job_key_off_the_wire_is_leaked_once_and_only_so_many_times() {
        let pool = InternPool::new(std::collections::HashMap::new());

        assert_eq!(
            intern_in(&pool, "acquisition.import".to_string()),
            Some("acquisition.import")
        );
        assert_eq!(
            intern_in(&pool, "acquisition.import".to_string()).map(str::as_ptr),
            intern_in(&pool, "acquisition.import".to_string()).map(str::as_ptr),
            "a key seen twice must not be leaked twice",
        );

        for n in 0..MAX_INTERNED {
            intern_in(&pool, format!("flood.{n}"));
        }

        assert_eq!(intern_in(&pool, "flood.past-the-ceiling".to_string()), None);
    }
}
