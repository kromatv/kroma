//! What the two doubles record: the shared event-bus log, and the three
//! intercepting methods written once so both hosts capture traffic alike.

use std::collections::BTreeMap;
use std::sync::Mutex;

use kroma_domain::{Audience, NotificationSpec};

/// One thing that went onto the event bus: the addressee (`None` for a
/// broadcast) and the event's topic.
pub type Published = (Option<String>, String);

// The three calls both hosts RECORD rather than answer, written once.
//
// `Recording` wraps a real host and forwards everything else to it, and
// `StubHost` has nothing behind it to forward to - but these three are the
// traffic a test asserts on, so both must intercept them and both must do it
// the same way. A test reading `log.published` should not have to know which
// host it happens to be holding.
macro_rules! records_into_log {
    () => {
        fn publish(&self, event: Event) {
            self.log.published.lock().unwrap().push((None, event.topic));
        }
        fn publish_to(&self, user_id: &str, event: Event) {
            self.log
                .published
                .lock()
                .unwrap()
                .push((Some(user_id.to_string()), event.topic));
        }
        fn notify(&self, audience: &Audience, spec: &NotificationSpec) -> usize {
            self.log
                .notified
                .lock()
                .unwrap()
                .push((audience.clone(), spec.clone()));
            1
        }
    };
}

pub(super) use records_into_log;

/// What a [`StubHost`] or [`Recording`] saw. Shared behind an `Arc` so a clone
/// of the host - axum takes its state by value - observes the same traffic.
#[derive(Default)]
pub(super) struct Log {
    pub(super) published: Mutex<Vec<Published>>,
    pub(super) notified: Mutex<Vec<(Audience, NotificationSpec)>>,
    pub(super) jobs: Mutex<Vec<(&'static str, &'static str)>>,
    pub(super) settings_written: Mutex<Vec<BTreeMap<String, serde_json::Value>>>,
}

impl Log {
    pub(super) fn published(&self) -> Vec<Published> {
        self.published.lock().unwrap().clone()
    }
    pub(super) fn topics(&self) -> Vec<String> {
        self.published
            .lock()
            .unwrap()
            .iter()
            .map(|(_, t)| t.clone())
            .collect()
    }
    pub(super) fn notifications(&self) -> Vec<(Audience, NotificationSpec)> {
        self.notified.lock().unwrap().clone()
    }
    pub(super) fn jobs(&self) -> Vec<(&'static str, &'static str)> {
        self.jobs.lock().unwrap().clone()
    }
    pub(super) fn settings_written(&self) -> Vec<BTreeMap<String, serde_json::Value>> {
        self.settings_written.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::fixtures::spec;
    use super::super::StubHost;
    use super::*;
    use crate::{Event, HostCtx};

    #[test]
    fn the_bus_is_recorded_rather_than_delivered() {
        let host = StubHost::new();
        host.publish(Event::new("scan.finished", json!({})));
        host.publish_to("ana", Event::new("notification.created", json!({})));
        assert_eq!(host.notify(&Audience::user("ana"), &spec()), 1);
        host.trigger_job("library.scan", "test");

        assert_eq!(
            host.published(),
            [
                (None, "scan.finished".to_string()),
                (Some("ana".to_string()), "notification.created".to_string()),
            ]
        );
        assert_eq!(host.topics(), ["scan.finished", "notification.created"]);
        assert_eq!(host.notifications().len(), 1);
        assert_eq!(host.jobs(), [("library.scan", "test")]);
    }

    #[test]
    fn a_clone_sees_the_same_traffic_as_the_original() {
        // axum takes router state BY VALUE, so a handler always works on a clone.
        // If the log were not shared, every assertion after a request would read
        // an empty vec.
        let host = StubHost::new();
        let clone = host.clone();
        clone.publish(Event::new("download.progress", json!({})));
        assert_eq!(host.topics(), ["download.progress"]);
    }

    #[test]
    fn a_written_setting_is_recorded_and_readable_back() {
        let host = StubHost::new();
        host.set_settings(BTreeMap::from([("k".to_string(), json!("v"))]));

        assert_eq!(host.setting_str("k", "fallback"), "v");
        assert_eq!(host.settings_written().len(), 1);
        assert_eq!(host.settings_written()[0]["k"], json!("v"));
    }

    #[test]
    fn an_addressed_send_does_not_leak_into_the_broadcast_channel() {
        // `publish_to` carries personal content ("your request was denied" names
        // its recipient), so it must never reach the channel every client reads.
        // The trait makes implementing it mandatory; this is the other half -
        // that an implementation keeps the two buses apart.
        let host = StubHost::new();
        host.publish_to("ana", Event::new("notification.created", json!({})));
        assert_eq!(
            host.published(),
            [(Some("ana".to_string()), "notification.created".to_string())]
        );
        assert!(
            host.published().iter().all(|(to, _)| to.is_some()),
            "an addressed event leaked into the broadcast bus"
        );
    }
}
