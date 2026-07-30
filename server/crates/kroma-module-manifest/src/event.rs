//! The open, module-authored event envelope.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// An event emitted by a module.
///
/// The server's broadcast bus carries a *closed* `ServerEvent` enum today, so a
/// module cannot introduce its own event without editing that enum. This
/// envelope is the open alternative: a module publishes `{ module, tag,
/// payload }` and any subscriber filters by `module` / `tag`. The existing
/// typed events keep flowing unchanged; module events ride alongside them on
/// the same broadcast channel (serialized to JSON like the rest).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModuleEvent {
    pub module: String,
    pub tag: String,
    #[serde(default)]
    pub payload: Value,
}

impl ModuleEvent {
    pub fn new(module: impl Into<String>, tag: impl Into<String>, payload: Value) -> Self {
        Self { module: module.into(), tag: tag.into(), payload }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn new_sets_the_three_fields() {
        let ev = ModuleEvent::new("tv.kroma.downloads", "download.progress", json!({ "pct": 12 }));
        assert_eq!(ev.module, "tv.kroma.downloads");
        assert_eq!(ev.tag, "download.progress");
        assert_eq!(ev.payload["pct"], 12);
    }

    #[test]
    fn serializes_to_the_wire_envelope() {
        let ev = ModuleEvent::new("m", "t", json!({ "a": 1 }));
        let v = serde_json::to_value(&ev).unwrap();
        assert_eq!(v, json!({ "module": "m", "tag": "t", "payload": { "a": 1 } }));
    }

    #[test]
    fn payload_defaults_to_null_when_absent() {
        // The `#[serde(default)]` on `payload` lets a producer omit it entirely.
        let ev: ModuleEvent =
            serde_json::from_value(json!({ "module": "m", "tag": "t" })).unwrap();
        assert_eq!(ev.module, "m");
        assert_eq!(ev.tag, "t");
        assert!(ev.payload.is_null());
    }

    #[test]
    fn round_trips_through_json() {
        let ev = ModuleEvent::new("m", "t", json!([1, 2, 3]));
        let back: ModuleEvent = serde_json::from_str(&serde_json::to_string(&ev).unwrap()).unwrap();
        assert_eq!(back, ev);
    }
}
