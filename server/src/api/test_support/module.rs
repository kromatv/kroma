use std::sync::Arc;

use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use kroma_module_host::Contribution;

use super::{build_app, TestApp};
use crate::state::Contributions;

pub const CONTRIBUTOR: &str = "tv.test.module";

pub fn test_app_contributing(points: &[&str]) -> TestApp {
    build_app(None, &[], None, answered_at("http://127.0.0.1:1", points))
}

pub async fn test_app_answering(point: &str, module: Router<()>) -> TestApp {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let _ = axum::serve(listener, module).await;
    });
    build_app(None, &[], None, answered_at(&base, &[point]))
}

pub fn describing() -> Router<()> {
    Router::new().route("/_port/watchable/describe", post(describe))
}

async fn describe(Json(asked): Json<Asked>) -> Json<Value> {
    let peers = match asked.locale.as_str() {
        "fr" => "Pairs",
        _ => "Peers",
    };
    Json(json!({
        "label": "Torrents",
        "icon": "magnet",
        "figures": [{ "key": "sources", "label": peers, "kind": "ratio" }],
        "actions": [],
    }))
}

#[derive(Deserialize)]
struct Asked {
    #[serde(default)]
    locale: String,
}

fn answered_at(base: &str, points: &[&str]) -> Contributions {
    let base = base.to_string();
    let points: Vec<String> = points.iter().map(|point| point.to_string()).collect();
    Arc::new(move |point: &str| {
        let answers = points
            .iter()
            .any(|named| named == point)
            .then(|| Contribution {
                module_id: CONTRIBUTOR.into(),
                instance: None,
                base_url: base.clone(),
                token: "test-module-token".into(),
            });
        answers.into_iter().collect()
    })
}
