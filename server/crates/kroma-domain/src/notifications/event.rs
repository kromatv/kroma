//! The notification vocabulary: what a notification is about, and which
//! preference bucket it falls in.

use serde::{Deserialize, Serialize};

/// What a notification is about. Users switch delivery on and off per category
/// (`notification_prefs`), so these are the knobs in the settings UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationCategory {
    Requests,
    Media,
    Reports,
    Downloads,
    // Admin-only (`settings.manage`).
    System,
}

impl NotificationCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            NotificationCategory::Requests => "requests",
            NotificationCategory::Media => "media",
            NotificationCategory::Reports => "reports",
            NotificationCategory::Downloads => "downloads",
            NotificationCategory::System => "system",
        }
    }

    pub fn parse(s: &str) -> Option<NotificationCategory> {
        match s {
            "requests" => Some(NotificationCategory::Requests),
            "media" => Some(NotificationCategory::Media),
            "reports" => Some(NotificationCategory::Reports),
            "downloads" => Some(NotificationCategory::Downloads),
            "system" => Some(NotificationCategory::System),
            _ => None,
        }
    }

    pub const ALL: [NotificationCategory; 5] = [
        NotificationCategory::Requests,
        NotificationCategory::Media,
        NotificationCategory::Reports,
        NotificationCategory::Downloads,
        NotificationCategory::System,
    ];
}

/// The specific thing that happened. Core events are named here; anything a
/// module raises is [`NotificationEvent::Custom`], which states its category on
/// the spec instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NotificationEvent {
    #[serde(rename = "request.submitted")]
    RequestSubmitted,
    #[serde(rename = "request.approved")]
    RequestApproved,
    #[serde(rename = "request.denied")]
    RequestDenied,
    #[serde(rename = "request.available")]
    RequestAvailable,
    #[serde(rename = "media.added")]
    MediaAdded,
    #[serde(rename = "media.episode")]
    MediaEpisode,
    #[serde(rename = "report.submitted")]
    ReportSubmitted,
    #[serde(rename = "report.resolved")]
    ReportResolved,
    #[serde(rename = "report.dismissed")]
    ReportDismissed,
    #[serde(rename = "download.imported")]
    DownloadImported,
    #[serde(rename = "download.failed")]
    DownloadFailed,
    #[serde(rename = "system.job.failed")]
    SystemJobFailed,
    #[serde(rename = "system.disk.low")]
    SystemDiskLow,
    // A "push is working" message from settings. Never persisted.
    #[serde(rename = "system.test")]
    SystemTest,
    #[serde(rename = "custom")]
    Custom,
}

impl NotificationEvent {
    pub fn as_str(self) -> &'static str {
        match self {
            NotificationEvent::RequestSubmitted => "request.submitted",
            NotificationEvent::RequestApproved => "request.approved",
            NotificationEvent::RequestDenied => "request.denied",
            NotificationEvent::RequestAvailable => "request.available",
            NotificationEvent::MediaAdded => "media.added",
            NotificationEvent::MediaEpisode => "media.episode",
            NotificationEvent::ReportSubmitted => "report.submitted",
            NotificationEvent::ReportResolved => "report.resolved",
            NotificationEvent::ReportDismissed => "report.dismissed",
            NotificationEvent::DownloadImported => "download.imported",
            NotificationEvent::DownloadFailed => "download.failed",
            NotificationEvent::SystemJobFailed => "system.job.failed",
            NotificationEvent::SystemDiskLow => "system.disk.low",
            NotificationEvent::SystemTest => "system.test",
            NotificationEvent::Custom => "custom",
        }
    }

    pub fn parse(s: &str) -> Option<NotificationEvent> {
        match s {
            "request.submitted" => Some(NotificationEvent::RequestSubmitted),
            "request.approved" => Some(NotificationEvent::RequestApproved),
            "request.denied" => Some(NotificationEvent::RequestDenied),
            "request.available" => Some(NotificationEvent::RequestAvailable),
            "media.added" => Some(NotificationEvent::MediaAdded),
            "media.episode" => Some(NotificationEvent::MediaEpisode),
            "report.submitted" => Some(NotificationEvent::ReportSubmitted),
            "report.resolved" => Some(NotificationEvent::ReportResolved),
            "report.dismissed" => Some(NotificationEvent::ReportDismissed),
            "download.imported" => Some(NotificationEvent::DownloadImported),
            "download.failed" => Some(NotificationEvent::DownloadFailed),
            "system.job.failed" => Some(NotificationEvent::SystemJobFailed),
            "system.disk.low" => Some(NotificationEvent::SystemDiskLow),
            "system.test" => Some(NotificationEvent::SystemTest),
            "custom" => Some(NotificationEvent::Custom),
            _ => None,
        }
    }

    /// The admin console's test bench walks this, so an event missing here is
    /// an event nobody can preview.
    pub const ALL: [NotificationEvent; 14] = [
        NotificationEvent::RequestSubmitted,
        NotificationEvent::RequestApproved,
        NotificationEvent::RequestDenied,
        NotificationEvent::RequestAvailable,
        NotificationEvent::MediaAdded,
        NotificationEvent::MediaEpisode,
        NotificationEvent::ReportSubmitted,
        NotificationEvent::ReportResolved,
        NotificationEvent::ReportDismissed,
        NotificationEvent::DownloadImported,
        NotificationEvent::DownloadFailed,
        NotificationEvent::SystemJobFailed,
        NotificationEvent::SystemDiskLow,
        NotificationEvent::SystemTest,
    ];

    pub fn category(self) -> NotificationCategory {
        match self {
            NotificationEvent::RequestSubmitted
            | NotificationEvent::RequestApproved
            | NotificationEvent::RequestDenied
            | NotificationEvent::RequestAvailable => NotificationCategory::Requests,
            NotificationEvent::MediaAdded | NotificationEvent::MediaEpisode => {
                NotificationCategory::Media
            }
            NotificationEvent::ReportSubmitted
            | NotificationEvent::ReportResolved
            | NotificationEvent::ReportDismissed => NotificationCategory::Reports,
            NotificationEvent::DownloadImported | NotificationEvent::DownloadFailed => {
                NotificationCategory::Downloads
            }
            NotificationEvent::SystemJobFailed
            | NotificationEvent::SystemDiskLow
            | NotificationEvent::SystemTest
            // Fallback bucket; a spec that means otherwise says so with `in_category`.
            | NotificationEvent::Custom => NotificationCategory::System,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_category_round_trips_through_its_wire_string() {
        for c in NotificationCategory::ALL {
            assert_eq!(NotificationCategory::parse(c.as_str()), Some(c));
        }
        assert_eq!(NotificationCategory::parse("nope"), None);
    }

    #[test]
    fn every_event_round_trips_and_has_a_category() {
        for e in NotificationEvent::ALL
            .into_iter()
            .chain([NotificationEvent::Custom])
        {
            assert_eq!(
                NotificationEvent::parse(e.as_str()),
                Some(e),
                "{}",
                e.as_str()
            );
            let json = serde_json::to_string(&e).unwrap();
            assert_eq!(json, format!("\"{}\"", e.as_str()));
        }
        assert_eq!(
            NotificationEvent::RequestDenied.category(),
            NotificationCategory::Requests
        );
        assert_eq!(
            NotificationEvent::MediaEpisode.category(),
            NotificationCategory::Media
        );
        assert_eq!(
            NotificationEvent::SystemDiskLow.category(),
            NotificationCategory::System
        );
        assert_eq!(
            NotificationEvent::ReportResolved.category(),
            NotificationCategory::Reports
        );
        assert_eq!(
            NotificationEvent::DownloadImported.category(),
            NotificationCategory::Downloads
        );
        assert_eq!(
            NotificationEvent::DownloadFailed.category(),
            NotificationCategory::Downloads
        );
    }
}
