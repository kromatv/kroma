//! Live progress for store operations. Install / update / uninstall publish
//! `module.op.*` frames over the event bus so the admin UI can render per-module
//! download and install progress instead of one opaque request. Module
//! vocabulary stays out of core's typed union deliberately (see the note in
//! kroma-engine's events.rs), so these publish as raw values.

use serde_json::{json, Value};

use crate::services::auth::random_token;
use crate::state::SharedState;

/// One store operation on the wire: `started` carries the resolved plan,
/// `progress`/`done` reference its modules by id, `finished` closes it.
pub struct Op {
    state: SharedState,
    id: String,
}

impl Op {
    pub fn begin(state: &SharedState, kind: &str, requested: &str, modules: Value) -> Self {
        let op = Self {
            state: state.clone(),
            id: random_token(),
        };
        op.publish(json!({
            "type": "module.op.started",
            "op": op.id,
            "kind": kind,
            "requested": requested,
            "modules": modules,
        }));
        op
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn download(&self, module: &str, received: u64, total: Option<u64>) {
        self.publish(json!({
            "type": "module.op.progress",
            "op": self.id,
            "id": module,
            "phase": "download",
            "received": received,
            "total": total,
        }));
    }

    pub fn installing(&self, module: &str) {
        self.publish(json!({
            "type": "module.op.progress",
            "op": self.id,
            "id": module,
            "phase": "install",
        }));
    }

    pub fn done(&self, module: &str, version: &str) {
        self.publish(json!({
            "type": "module.op.done",
            "op": self.id,
            "id": module,
            "version": version,
        }));
    }

    pub fn finish(&self, error: Option<&str>) {
        self.publish(json!({
            "type": "module.op.finished",
            "op": self.id,
            "ok": error.is_none(),
            "error": error,
        }));
    }

    fn publish(&self, value: Value) {
        self.state.events.publish_value(value);
    }
}

#[cfg(test)]
mod tests {
    use tokio::sync::broadcast::Receiver;

    use super::*;
    use crate::api::test_support::test_app;
    use crate::infra::events::Envelope;

    fn drain(rx: &mut Receiver<Envelope>) -> Vec<Value> {
        let mut out = Vec::new();
        while let Ok(envelope) = rx.try_recv() {
            out.push(serde_json::from_str(envelope.payload_unrouted()).expect("frame is json"));
        }
        out
    }

    #[tokio::test]
    async fn one_operation_frames_its_whole_life_under_a_single_id() {
        let t = test_app();
        let mut rx = t.state.events.subscribe();

        let op = Op::begin(
            &t.state,
            "install",
            "tv.x.app",
            json!([{ "id": "tv.x.app" }]),
        );
        op.download("tv.x.app", 512, Some(2048));
        op.installing("tv.x.app");
        op.done("tv.x.app", "1.0.0");
        op.finish(None);

        let frames = drain(&mut rx);
        let types: Vec<&str> = frames.iter().map(|f| f["type"].as_str().unwrap()).collect();
        assert_eq!(
            types,
            [
                "module.op.started",
                "module.op.progress",
                "module.op.progress",
                "module.op.done",
                "module.op.finished",
            ]
        );
        assert!(!op.id().is_empty());
        assert!(
            frames.iter().all(|f| f["op"] == json!(op.id())),
            "{frames:?}"
        );

        assert_eq!(frames[0]["kind"], json!("install"));
        assert_eq!(frames[0]["requested"], json!("tv.x.app"));
        assert_eq!(frames[0]["modules"][0]["id"], json!("tv.x.app"));

        assert_eq!(frames[1]["phase"], json!("download"));
        assert_eq!(frames[1]["id"], json!("tv.x.app"));
        assert_eq!(frames[1]["received"], json!(512));
        assert_eq!(frames[1]["total"], json!(2048));
        assert_eq!(frames[2]["phase"], json!("install"));
        assert_eq!(frames[3]["version"], json!("1.0.0"));
        assert_eq!(frames[4]["ok"], json!(true));
        assert!(frames[4]["error"].is_null());
    }

    #[tokio::test]
    async fn a_download_of_unknown_length_still_reports_what_it_has_received() {
        let t = test_app();
        let mut rx = t.state.events.subscribe();

        let op = Op::begin(&t.state, "update", "tv.x.app", Value::Array(Vec::new()));
        op.download("tv.x.app", 42, None);

        let frames = drain(&mut rx);
        assert_eq!(frames[1]["received"], json!(42));
        assert!(frames[1]["total"].is_null());
    }

    #[tokio::test]
    async fn a_failed_operation_closes_with_the_reason_rather_than_going_quiet() {
        let t = test_app();
        let mut rx = t.state.events.subscribe();

        let op = Op::begin(&t.state, "uninstall", "tv.x.app", Value::Array(Vec::new()));
        op.finish(Some("checksum mismatch"));

        let frames = drain(&mut rx);
        assert_eq!(frames[1]["type"], json!("module.op.finished"));
        assert_eq!(frames[1]["ok"], json!(false));
        assert_eq!(frames[1]["error"], json!("checksum mismatch"));
    }

    #[tokio::test]
    async fn two_operations_never_share_an_id() {
        let t = test_app();
        let a = Op::begin(&t.state, "install", "tv.x.a", Value::Array(Vec::new()));
        let b = Op::begin(&t.state, "install", "tv.x.b", Value::Array(Vec::new()));
        assert_ne!(a.id(), b.id());
    }
}
