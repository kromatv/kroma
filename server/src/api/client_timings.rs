//! `POST /api/perf/client`: what a client measured on its side, so the
//! performance reports show what a device waited for and not only what the
//! server did. Each API sample also files the time spent outside the server:
//! the network, a tunnel, the client's own queue.

use std::time::Duration;

use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::{Json, Router};
use kroma_perf::{Reported, profiler};
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::state::SharedState;

const BODY_LIMIT: usize = 64 * 1024;
const SAMPLES_KEPT: usize = 200;
const NAME_CHARS: usize = 200;
const LONGEST_MS: f64 = 10.0 * 60.0 * 1_000.0;
const CALLER: &str = "(client)";

pub fn routes() -> Router<SharedState> {
    Router::new().route(
        "/perf/client",
        post(report).layer(DefaultBodyLimit::max(BODY_LIMIT)),
    )
}

#[derive(Deserialize)]
struct Report {
    samples: Vec<Sample>,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum SampleKind {
    Api,
    Screen,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    kind: SampleKind,
    name: String,
    ms: f64,
    server_ms: Option<f64>,
}

async fn report(
    AuthUser(_user): AuthUser,
    headers: HeaderMap,
    Json(report): Json<Report>,
) -> StatusCode {
    let shell = shell_of(&headers);
    for sample in report
        .samples
        .iter()
        .take(SAMPLES_KEPT)
        .filter(|s| plausible(s))
    {
        file(sample, &shell);
    }
    StatusCode::NO_CONTENT
}

fn file(sample: &Sample, shell: &str) {
    let kind = match sample.kind {
        SampleKind::Api => "client",
        SampleKind::Screen => "screen",
    };
    keep(kind, sample, shell, sample.ms);
    if let (SampleKind::Api, Some(server_ms)) = (sample.kind, sample.server_ms) {
        keep("network", sample, shell, (sample.ms - server_ms).max(0.0));
    }
}

fn keep(kind: &'static str, sample: &Sample, shell: &str, ms: f64) {
    profiler().record_reported(Reported {
        kind,
        label: &sample.name,
        origin: Some(shell),
        caller: CALLER,
        elapsed: Duration::from_secs_f64(ms / 1_000.0),
    });
}

fn plausible(sample: &Sample) -> bool {
    let in_range = |ms: f64| ms.is_finite() && (0.0..=LONGEST_MS).contains(&ms);
    !sample.name.is_empty()
        && sample.name.chars().count() <= NAME_CHARS
        && in_range(sample.ms)
        && sample.server_ms.is_none_or(in_range)
}

fn shell_of(headers: &HeaderMap) -> String {
    let declared = headers
        .get("x-kroma-client")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split('/').next())
        .unwrap_or_default();
    let clean: String = declared
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .take(32)
        .collect();
    if clean.is_empty() {
        "unknown".into()
    } else {
        clean.to_ascii_lowercase()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(ms: f64, server_ms: Option<f64>) -> Sample {
        Sample {
            kind: SampleKind::Api,
            name: "GET /api/home".into(),
            ms,
            server_ms,
        }
    }

    #[test]
    fn a_timing_out_of_any_sane_range_is_dropped() {
        assert!(plausible(&sample(120.0, Some(30.0))));
        assert!(!plausible(&sample(-1.0, None)));
        assert!(!plausible(&sample(f64::NAN, None)));
        assert!(!plausible(&sample(20.0, Some(LONGEST_MS + 1.0))));
    }

    #[test]
    fn the_shell_comes_from_the_client_header_and_never_carries_markup() {
        let mut headers = HeaderMap::new();
        headers.insert("x-kroma-client", "Tizen<script>/0.1.39".parse().unwrap());

        let shell = shell_of(&headers);

        assert_eq!(shell, "tizenscript");
        assert_eq!(shell_of(&HeaderMap::new()), "unknown");
    }
}
