//! Real-time event bus.
//!
//! Fans server events out to every WebSocket client (`GET /api/events`); a no-op with no subscribers.

use serde::Serialize;
use tokio::sync::broadcast;

/// A server-pushed event. Serialized as `{ "type": "...", ...fields }`.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type")]
pub enum ServerEvent {
    #[serde(rename = "hello")]
    Hello { version: &'static str },
    #[serde(rename = "scan.started")]
    ScanStarted,
    #[serde(rename = "scan.completed")]
    ScanCompleted {
        items: usize,
        shows: usize,
        libraries: usize,
    },
    #[serde(rename = "library.updated")]
    LibraryUpdated,
    #[serde(rename = "item.updated")]
    ItemUpdated { id: String },
    #[serde(rename = "show.updated")]
    ShowUpdated { id: String },
    #[serde(rename = "enrich.progress")]
    EnrichProgress { done: usize, total: usize },
    #[serde(rename = "enrich.completed")]
    EnrichCompleted { resolved: usize, total: usize },
    #[serde(rename = "probe.progress")]
    ProbeProgress { done: usize, total: usize },
    #[serde(rename = "probe.completed")]
    ProbeCompleted { total: usize },
    #[serde(rename = "playback.started")]
    PlaybackStarted { count: usize },
    #[serde(rename = "playback.updated")]
    PlaybackUpdated { count: usize },
    #[serde(rename = "playback.stopped")]
    PlaybackStopped { count: usize },
    #[serde(rename = "playback.terminate")]
    PlaybackTerminate {
        #[serde(rename = "sessionId")]
        session_id: String,
        message: String,
    },
    #[serde(rename = "cast.receiver")]
    CastReceiverChanged {
        receiver: Box<crate::model::CastReceiver>,
    },
    #[serde(rename = "cast.receiver.gone")]
    CastReceiverGone {
        #[serde(rename = "receiverId")]
        receiver_id: String,
    },
    #[serde(rename = "cast.position")]
    CastPosition {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        #[serde(rename = "positionMs")]
        position_ms: i64,
        #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")]
        duration_ms: Option<i64>,
        state: crate::model::CastState,
    },
    #[serde(rename = "cast.command")]
    CastCommandIssued {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        seq: u64,
        command: crate::model::CastCommand,
    },
    #[serde(rename = "cast.kicked")]
    CastKicked {
        #[serde(rename = "receiverId")]
        receiver_id: String,
    },
    #[serde(rename = "settings.updated")]
    SettingsUpdated,
    #[serde(rename = "job.started")]
    JobStarted {
        key: String,
        #[serde(rename = "runId")]
        run_id: String,
    },
    #[serde(rename = "job.progress")]
    JobProgress {
        key: String,
        #[serde(rename = "runId")]
        run_id: String,
        done: usize,
        total: usize,
    },
    #[serde(rename = "job.log")]
    JobLog {
        #[serde(rename = "runId")]
        run_id: String,
        level: &'static str,
        message: String,
    },
    #[serde(rename = "job.finished")]
    JobFinished {
        key: String,
        #[serde(rename = "runId")]
        run_id: String,
        status: String,
    },
    #[serde(rename = "pipeline.stats")]
    PipelineStats {
        stages: Vec<crate::model::StageStat>,
    },
    #[serde(rename = "request.updated")]
    RequestUpdated { id: String, status: String },
    #[serde(rename = "report.updated")]
    ReportUpdated { id: String, status: String },
    // Module events (download.progress, vpn.status, ...) publish generically via
    // `HostCtx::publish(Event)`; the bus fans out the raw JSON, so the core owns
    // no module event type.
}

/// Who an event is for. Most of the bus is server-wide activity every
/// signed-in client may see; a notification names its recipient instead, so it
/// is addressed and the socket pump drops it for everyone else.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Audience {
    Everyone,
    User(std::sync::Arc<str>),
}

/// One bus message: the pre-serialized event plus who may see it. The payload
/// is deliberately unreachable without naming a viewer via [`Self::payload_for`],
/// so the routing decision can't be skipped by accident.
#[derive(Clone, Debug)]
pub struct Envelope {
    audience: Audience,
    json: std::sync::Arc<str>,
}

impl Envelope {
    /// The JSON to forward to a socket authenticated as `viewer`, or `None` when
    /// this event is addressed to somebody else.
    pub fn payload_for(&self, viewer: &str) -> Option<&str> {
        self.visible_to(viewer).then(|| &*self.json)
    }

    /// Whether a socket authenticated as `viewer` may receive this event.
    pub fn visible_to(&self, viewer: &str) -> bool {
        match &self.audience {
            Audience::Everyone => true,
            Audience::User(id) => &**id == viewer,
        }
    }

    /// The raw payload, for subscribers that are not sockets (the pipeline
    /// dispatcher) and for tests. Named so that reaching past the audience check
    /// is a deliberate act rather than a slip.
    pub fn payload_unrouted(&self) -> &str {
        &self.json
    }
}

/// Cheap-to-clone handle to the broadcast channel. The channel carries the
/// event pre-serialized as JSON (`Arc<str>`): one `serde_json::to_string` at
/// publish time instead of one per subscriber per message, and a zero-cost
/// no-op (not even serialization) while nobody is connected.
#[derive(Clone)]
pub struct Bus {
    tx: broadcast::Sender<Envelope>,
}

impl Bus {
    pub fn new() -> Self {
        // Capacity bounds how far a slow client can lag before it drops events.
        let (tx, _rx) = broadcast::channel(512);
        Self { tx }
    }

    /// Fan an event out to all subscribers. No-op when there are none.
    pub fn publish(&self, event: ServerEvent) {
        self.send(Audience::Everyone, &event);
    }

    /// Fan an event out to one user's sockets only. Used for notifications, whose
    /// content is personal; every other connected client drops it in `ws.rs`.
    pub fn publish_to(&self, user_id: &str, event: ServerEvent) {
        self.send(Audience::User(user_id.into()), &event);
    }

    /// Fan a pre-shaped module event out (already a `{ "type": ..., ... }` object).
    /// The generic path modules reach through `HostCtx::publish(Event)`, so the bus
    /// carries module events without the core naming their types.
    pub fn publish_value(&self, value: serde_json::Value) {
        self.send(Audience::Everyone, &value);
    }

    /// [`Self::publish_value`], addressed to one user. The notification service
    /// reaches this through `HostCtx::publish_to`.
    pub fn publish_value_to(&self, user_id: &str, value: serde_json::Value) {
        self.send(Audience::User(user_id.into()), &value);
    }

    fn send<T: Serialize>(&self, audience: Audience, payload: &T) {
        if self.tx.receiver_count() == 0 {
            return;
        }
        if let Ok(json) = serde_json::to_string(payload) {
            let _ = self.tx.send(Envelope {
                audience,
                json: json.into(),
            });
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Envelope> {
        self.tx.subscribe()
    }
}

impl Default for Bus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> ServerEvent {
        ServerEvent::ItemUpdated { id: id.to_string() }
    }

    #[test]
    fn broadcast_events_reach_every_subscriber() {
        let bus = Bus::new();
        let mut a = bus.subscribe();
        let mut b = bus.subscribe();
        bus.publish(item("x"));
        for rx in [&mut a, &mut b] {
            let env = rx.try_recv().expect("published to all subscribers");
            assert!(env.visible_to("alice"));
            assert!(env.visible_to("bob"));
        }
    }

    #[test]
    fn addressed_events_are_visible_only_to_their_user() {
        let bus = Bus::new();
        let mut rx = bus.subscribe();
        bus.publish_to("alice", item("x"));
        let env = rx.try_recv().expect("published");
        // Every socket still RECEIVES it (one broadcast channel), but only
        // alice's pump is allowed to forward it.
        assert!(env.visible_to("alice"));
        assert!(!env.visible_to("bob"));
        assert_eq!(env.audience, Audience::User("alice".into()));
    }

    #[test]
    fn the_payload_is_reachable_for_its_viewer_only() {
        let bus = Bus::new();
        let mut rx = bus.subscribe();
        bus.publish(item("abc"));
        let env = rx.try_recv().expect("published");
        assert!(
            env.payload_unrouted().contains("item.updated"),
            "{}",
            env.payload_unrouted()
        );
        assert!(env.payload_unrouted().contains("abc"));
    }

    #[test]
    fn publishing_without_subscribers_is_a_noop() {
        let bus = Bus::new();
        bus.publish(item("x"));
        bus.publish_to("alice", item("x"));
        // Subscribing afterwards sees nothing: nothing was ever serialized.
        let mut rx = bus.subscribe();
        assert!(rx.try_recv().is_err());
    }
}
