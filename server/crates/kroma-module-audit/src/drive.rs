//! Making the module do its work: every job it registers, every event topic it
//! listens on, every method of every point it answers, then the requests its
//! own `audit.json` names.

use std::collections::BTreeMap;

use kroma_http::Loopback;
use kroma_module_manifest::ModuleManifest;
use kroma_module_supervisor::Endpoint;
use kroma_module_wire::{Lifecycle, LIFECYCLE_PATH};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const CALL_MAX_TIME_SECS: u32 = 60;

/// What a module's `audit.json` adds to an audit: the settings the module finds
/// set, and requests to make once it is up. Without one, an audit still runs
/// the module's jobs, events and the points it answers.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fixtures {
    #[serde(default)]
    pub settings: BTreeMap<String, Value>,
    #[serde(default)]
    pub requests: Vec<Ask>,
}

/// One request to the module: a `GET` unless it names a method, with a JSON
/// `body` when it is a `POST`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Ask {
    #[serde(default = "get")]
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub body: Option<Value>,
}

fn get() -> String {
    "GET".to_string()
}

/// One request an audit made, and the status the module answered with, or
/// `None` when it did not answer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Call {
    pub method: String,
    pub path: String,
    pub status: Option<u16>,
}

impl Call {
    pub(crate) fn answered(&self) -> String {
        self.status.map_or_else(|| "-".to_string(), |status| status.to_string())
    }
}

pub(crate) struct Driver<'a> {
    pub(crate) endpoint: &'a Endpoint,
    pub(crate) token: String,
}

impl Driver<'_> {
    fn client(&self) -> Loopback {
        Loopback::new()
            .max_time(CALL_MAX_TIME_SECS)
            .header("authorization", format!("Bearer {}", self.token))
    }

    fn call(&self, ask: &Ask) -> Call {
        let url = self.endpoint.url(&ask.path);
        let answer = if ask.method.eq_ignore_ascii_case("GET") {
            self.client().get(&url)
        } else {
            self.client().post_json(&url, ask.body.as_ref().unwrap_or(&json!({})))
        };
        Call {
            method: ask.method.to_ascii_uppercase(),
            path: ask.path.clone(),
            status: answer.ok().map(|response| response.status),
        }
    }

    fn lifecycle(&self) -> Lifecycle {
        self.client()
            .get(&self.endpoint.url(LIFECYCLE_PATH))
            .ok()
            .and_then(|response| serde_json::from_slice(&response.body).ok())
            .unwrap_or_default()
    }

    pub(crate) fn run(
        &self,
        manifest: &ModuleManifest,
        fixtures: &Fixtures,
        methods_of: &dyn Fn(&str) -> Vec<String>,
    ) -> Vec<Call> {
        let lifecycle = self.lifecycle();
        let post = |path: String| Ask {
            method: "POST".to_string(),
            path,
            body: None,
        };
        let jobs = lifecycle.jobs.iter().map(|job| post(format!("/_job/run/{}", job.key)));
        let events = lifecycle.events.iter().map(|topic| post(format!("/_event/{topic}")));
        let points = manifest.contributes.iter().flat_map(|answered| {
            methods_of(&answered.point)
                .into_iter()
                .map(|method| post(format!("/_port/{}/{method}", answered.point)))
        });
        jobs.chain(events)
            .chain(points)
            .chain(fixtures.requests.iter().cloned())
            .map(|ask| self.call(&ask))
            .collect()
    }
}
