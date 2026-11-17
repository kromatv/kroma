use std::sync::{Arc, Mutex};

use kroma_engine::point::{Point, StubFn};
use kroma_engine::services::importers::POINT;
use serde_json::Value;

use super::{TestApp, test_app_with_importers};

pub const IMPORTER: &str = "tv.x.import";

pub type ImporterCalls = Arc<Mutex<Vec<(String, Value)>>>;

/// An app where a running importer, [`IMPORTER`], answers every method with
/// `answer`, and the `(method, body)` of each call it received.
pub fn importer_answering(answer: Value) -> (TestApp, ImporterCalls) {
    let calls: ImporterCalls = Arc::default();
    let seen = calls.clone();
    let stub: StubFn = Arc::new(move |method, body| {
        seen.lock()
            .unwrap()
            .push((method.to_string(), body.clone()));
        Some(answer.clone())
    });
    let t = test_app_with_importers(Point::stubs(POINT, vec![(IMPORTER, stub)]));
    (t, calls)
}
