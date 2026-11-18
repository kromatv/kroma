use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use kroma_engine::infra::events::Envelope;
use kroma_engine::point::{Point, StubFn};
use kroma_engine::services::importers::POINT;
use kroma_engine::services::imports::JOB;
use serde_json::Value;
use tokio::sync::broadcast::Receiver;

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

/// An app whose importer, [`IMPORTER`], answers nothing until the sender it
/// comes with is sent a value or dropped. It then answers every method with
/// an empty object.
pub fn importer_held() -> (TestApp, Sender<()>) {
    let (release, held) = channel::<()>();
    let held = Mutex::new(held);
    let stub: StubFn = Arc::new(move |_, _| {
        let _ = held.lock().unwrap().recv();
        Some(serde_json::json!({ "Ok": {} }))
    });
    let t = test_app_with_importers(Point::stubs(POINT, vec![(IMPORTER, stub)]));
    (t, release)
}

/// Waits for the run of the import job to end and gives the status it ended
/// with. Subscribe before the import starts, or the end may already be past.
pub async fn import_job_ended(events: &mut Receiver<Envelope>) -> String {
    loop {
        let envelope = events.recv().await.expect("the event bus stays open");
        let event: Value = serde_json::from_str(envelope.payload_unrouted()).expect("an event");
        if event["type"] == "job.finished" && event["key"] == JOB.as_str() {
            return event["status"].as_str().unwrap_or_default().to_string();
        }
    }
}
