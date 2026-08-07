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
        let op = Self { state: state.clone(), id: random_token() };
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
