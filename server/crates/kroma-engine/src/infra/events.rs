//! Real-time event bus.
//!
//! A [`tokio::sync::broadcast`] channel fans server events out to every
//! connected WebSocket client (`GET /api/events`). The server publishes when the
//! library changes a scan starts/finishes, or background TMDB enrichment
//! resolves art for a title so clients update live instead of needing a
//! refresh/relaunch. Publishing is cheap and non-blocking; with no subscribers
//! it's a no-op.

use serde::Serialize;
use tokio::sync::broadcast;

/// A server-pushed event. Serialized as `{ "type": "...", ...fields }`.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type")]
pub enum ServerEvent {
    /// Sent once on connect so the client knows the stream is live.
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
    /// The catalog changed wholesale clients should refetch lists.
    #[serde(rename = "library.updated")]
    LibraryUpdated,
    /// One movie/episode gained metadata (e.g. poster resolved).
    #[serde(rename = "item.updated")]
    ItemUpdated { id: String },
    /// One show gained metadata.
    #[serde(rename = "show.updated")]
    ShowUpdated { id: String },
    /// Background enrichment progress.
    #[serde(rename = "enrich.progress")]
    EnrichProgress { done: usize, total: usize },
    #[serde(rename = "enrich.completed")]
    EnrichCompleted { resolved: usize, total: usize },
    /// Background per-file probing (phase 2) progress.
    #[serde(rename = "probe.progress")]
    ProbeProgress { done: usize, total: usize },
    #[serde(rename = "probe.completed")]
    ProbeCompleted { total: usize },
    /// A playback session started `count` is the new active-session total.
    #[serde(rename = "playback.started")]
    PlaybackStarted { count: usize },
    /// A live playback session updated (state/position changed).
    #[serde(rename = "playback.updated")]
    PlaybackUpdated { count: usize },
    /// One or more playback sessions ended (stopped or reaped).
    #[serde(rename = "playback.stopped")]
    PlaybackStopped { count: usize },
    /// An admin terminated a playback session: the owning client must stop and
    /// show `message` (empty → the client shows a localized default).
    #[serde(rename = "playback.terminate")]
    PlaybackTerminate {
        #[serde(rename = "sessionId")]
        session_id: String,
        message: String,
    },
    /// The cast roster changed: a TV appeared, went away, or moved to another
    /// title. Senders refetch `GET /api/cast/receivers` (small, and always
    /// consistent - cheaper than mirroring the whole roster onto the bus).
    #[serde(rename = "cast.receivers")]
    CastReceivers,
    /// A receiver's scrub position advanced. Deliberately tiny and separate from
    /// `cast.receivers`: it fires on every heartbeat of a playing TV, and a
    /// sender only needs it to move a progress bar.
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
    /// An order for one receiver. Addressed to the account the receiver is signed
    /// into ([`Audience::User`]), so a command for the living-room TV is never
    /// fanned out to other households' sockets; the `receiverId` then picks the
    /// one device among that account's own.
    #[serde(rename = "cast.command")]
    CastCommandIssued {
        #[serde(rename = "receiverId")]
        receiver_id: String,
        seq: u64,
        command: crate::model::CastCommand,
    },
    /// Server settings changed via the admin console.
    #[serde(rename = "settings.updated")]
    SettingsUpdated,
    /// A background job run started.
    #[serde(rename = "job.started")]
    JobStarted {
        key: String,
        #[serde(rename = "runId")]
        run_id: String,
    },
    /// A running job reported progress (`total == 0` → indeterminate).
    #[serde(rename = "job.progress")]
    JobProgress {
        key: String,
        #[serde(rename = "runId")]
        run_id: String,
        done: usize,
        total: usize,
    },
    /// A running job appended a log line.
    #[serde(rename = "job.log")]
    JobLog {
        #[serde(rename = "runId")]
        run_id: String,
        level: &'static str,
        message: String,
    },
    /// A job run finished (`status`: success | failed | cancelled).
    #[serde(rename = "job.finished")]
    JobFinished {
        key: String,
        #[serde(rename = "runId")]
        run_id: String,
        status: String,
    },
    /// Per-element pipeline health changed (a stage drained a batch). Throttled
    /// and carries only the aggregate per-stage counts, so the admin Pipeline
    /// dashboard updates live without polling the ledger.
    #[serde(rename = "pipeline.stats")]
    PipelineStats {
        stages: Vec<crate::model::StageStat>,
    },
    /// A media request changed state (created / approved / denied / became
    /// available...). Low-frequency: clients refetch their request lists on it.
    #[serde(rename = "request.updated")]
    RequestUpdated { id: String, status: String },
    /// A problem report was filed or triaged (created / resolved / dismissed /
    /// reopened / deleted). Low-frequency: the admin "Signalements" queue refetches
    /// on it.
    #[serde(rename = "report.updated")]
    ReportUpdated { id: String, status: String },
    // Module events (download.progress / download.completed / vpn.status, ...) are
    // NOT here: modules publish them generically via `HostCtx::publish(Event)` and
    // the bus fans out the raw JSON (see `Bus::publish_value`), so the core owns no
    // module event type.
}

/// Who an event is for.
///
/// Most of the bus is server-wide activity every signed-in client may see (scans,
/// jobs, playback counts). Notifications are not: "your request was denied" names
/// its recipient, so it is addressed and the socket pump drops it for everyone
/// else. Without this the bus would leak one user's notifications to every other
/// connected client.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Audience {
    /// Any authenticated socket.
    Everyone,
    /// Only sockets authenticated as this user id.
    User(std::sync::Arc<str>),
}

/// One bus message: the pre-serialized event plus who may see it.
///
/// `Deref`s to the JSON payload, so subscribers that only care about the bytes
/// (and the tests that assert on them) read it as a `&str`.
#[derive(Clone, Debug)]
pub struct Envelope {
    pub audience: Audience,
    pub json: std::sync::Arc<str>,
}

impl Envelope {
    /// Whether a socket authenticated as `viewer` may receive this event.
    pub fn visible_to(&self, viewer: &str) -> bool {
        match &self.audience {
            Audience::Everyone => true,
            Audience::User(id) => &**id == viewer,
        }
    }
}

impl std::ops::Deref for Envelope {
    type Target = str;

    fn deref(&self) -> &str {
        &self.json
    }
}

/// An envelope prints as its payload the address is routing metadata, not
/// something a log line or an assertion message wants to see.
impl std::fmt::Display for Envelope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.json)
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

    /// Serialize once and hand the envelope to the channel. Skipped entirely
    /// while nobody is subscribed, so publishing costs nothing on a headless
    /// server.
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
        // Server-wide activity: both sockets see it, whoever they are.
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
    fn envelope_derefs_to_the_serialized_payload() {
        let bus = Bus::new();
        let mut rx = bus.subscribe();
        bus.publish(item("abc"));
        let env = rx.try_recv().expect("published");
        assert!(env.contains("item.updated"), "payload: {}", &*env);
        assert!(env.contains("abc"));
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
