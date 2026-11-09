//! What the server pushes to its clients, and which of it changes the catalogue.

use serde::Serialize;

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

impl ServerEvent {
    /// Whether this event announces a change to what the catalogue holds or how
    /// it is presented: titles, their metadata and art, the probed streams, the
    /// generated rows, or the settings that shape them.
    pub fn changes_catalog(&self) -> bool {
        matches!(
            self,
            Self::ScanCompleted { .. }
                | Self::LibraryUpdated
                | Self::ItemUpdated { .. }
                | Self::ShowUpdated { .. }
                | Self::EnrichCompleted { .. }
                | Self::ProbeCompleted { .. }
                | Self::SettingsUpdated
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_title_updated_by_enrichment_changes_the_catalogue() {
        assert!(ServerEvent::ItemUpdated { id: "m1".into() }.changes_catalog());
        assert!(ServerEvent::ShowUpdated { id: "s1".into() }.changes_catalog());
    }

    #[test]
    fn a_scan_changes_the_catalogue_only_once_it_completes() {
        let completed = ServerEvent::ScanCompleted {
            items: 1,
            shows: 0,
            libraries: 1,
        };

        assert!(!ServerEvent::ScanStarted.changes_catalog());
        assert!(completed.changes_catalog());
    }

    #[test]
    fn progress_ticks_do_not_change_the_catalogue() {
        assert!(!ServerEvent::ProbeProgress { done: 1, total: 2 }.changes_catalog());
        assert!(!ServerEvent::PlaybackStarted { count: 1 }.changes_catalog());
    }
}
