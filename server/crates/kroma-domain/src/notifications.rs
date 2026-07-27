//! Notifications: durable, per-user messages about things the user asked to be
//! told about (a request they filed was approved, a film they wanted arrived, a
//! report they need to triage). Pure data (serde); persistence lives in
//! `crate::db::notifications`, delivery in `crate::services::notify`.
//!
//! A stored notification holds an **i18n key plus params**, never rendered text,
//! so a user who switches language re-reads their whole history in the new one.
//! The wire shape below is the RENDERED form: the server resolves keys against
//! the recipient's locale on the way out, exactly like `api::error::lerr` does.
//!
//! The JSON shape here is a public contract web/mobile/TV clients depend on it,
//! so field names and casing must not drift. Timestamps are epoch milliseconds.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// What a notification is about. Users switch delivery on and off per category
/// (`notification_prefs`), so these are the knobs in the settings UI and must
/// stay coarse enough to be meaningful choices.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationCategory {
    /// Media requests: yours were reviewed, or one needs your review.
    Requests,
    /// New films / shows / episodes in the library.
    Media,
    /// Problem reports: yours was triaged, or one needs triage.
    Reports,
    /// Acquisition: a download landed and was imported.
    Downloads,
    /// Server health. Admin-only (`settings.manage`).
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

    /// Every category, for seeding the preferences matrix in the settings UI.
    pub const ALL: [NotificationCategory; 5] = [
        NotificationCategory::Requests,
        NotificationCategory::Media,
        NotificationCategory::Reports,
        NotificationCategory::Downloads,
        NotificationCategory::System,
    ];
}

/// The specific thing that happened. Producers name one of these instead of a
/// free string, so the category mapping below is exhaustive and a new event
/// can't silently land in the wrong preference bucket.
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
    #[serde(rename = "system.vpn.down")]
    SystemVpnDown,
    #[serde(rename = "system.disk.low")]
    SystemDiskLow,
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
            NotificationEvent::SystemVpnDown => "system.vpn.down",
            NotificationEvent::SystemDiskLow => "system.disk.low",
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
            "system.vpn.down" => Some(NotificationEvent::SystemVpnDown),
            "system.disk.low" => Some(NotificationEvent::SystemDiskLow),
            _ => None,
        }
    }

    /// Which preference bucket this event answers to.
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
            | NotificationEvent::SystemVpnDown
            | NotificationEvent::SystemDiskLow => NotificationCategory::System,
        }
    }
}

/// What an action button does when tapped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionKind {
    /// Navigate to an in-app route (`href` is a client route, e.g. `/movie/ab12`).
    Link,
    /// Call the server directly from the notification (`href` is an API path).
    /// Lets an admin approve a request from the row without opening the console.
    Api,
}

/// How prominently a client should render the button.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionStyle {
    #[default]
    Default,
    Primary,
    Danger,
}

/// One button on a notification. `label` is rendered from an i18n key before it
/// goes out (see [`NotificationSpec`], which carries `label_key` instead).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    /// Stable id, so a client (and a service worker's `notificationclick`) can
    /// tell which button was pressed.
    pub id: String,
    pub label: String,
    pub kind: ActionKind,
    /// Client route for [`ActionKind::Link`], API path for [`ActionKind::Api`].
    pub href: String,
    /// HTTP method for [`ActionKind::Api`]. Ignored for links.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(default)]
    pub style: ActionStyle,
}

/// The unrendered half of an action, as producers declare it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSpec {
    pub id: String,
    /// i18n key, resolved against the recipient's locale at read/push time.
    pub label_key: String,
    pub kind: ActionKind,
    pub href: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(default)]
    pub style: ActionStyle,
}

/// A set of action buttons the MOBILE app registers at launch.
///
/// Unlike Web Push (which takes arbitrary buttons per message), APNs can only
/// show actions belonging to a `UNNotificationCategory` the app registered up
/// front so the push payload names one of these instead of carrying buttons.
/// Adding a variant here means adding the matching category in the client.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PushCategory {
    /// Approve / Deny, for a moderator.
    RequestReview,
    /// Watch now.
    MediaAvailable,
}

impl PushCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            PushCategory::RequestReview => "request_review",
            PushCategory::MediaAvailable => "media_available",
        }
    }

    pub fn parse(s: &str) -> Option<PushCategory> {
        match s {
            "request_review" => Some(PushCategory::RequestReview),
            "media_available" => Some(PushCategory::MediaAvailable),
            _ => None,
        }
    }
}

/// What a producer hands to `services::notify::emit`: keys, not text.
#[derive(Debug, Clone)]
pub struct NotificationSpec {
    pub event: NotificationEvent,
    pub title_key: String,
    pub body_key: String,
    /// Interpolation vars for both keys (`{title}`, `{count}`, …).
    pub params: BTreeMap<String, String>,
    /// In-app route a tap opens.
    pub link: Option<String>,
    /// Poster / backdrop shown on the row and in a rich push.
    pub image_url: Option<String>,
    pub actions: Vec<ActionSpec>,
    /// Which registered action set a native push should use.
    pub push_category: Option<PushCategory>,
}

impl NotificationSpec {
    /// A notification with no image, link or actions the minimum a producer
    /// must state. Chain the builders below for the rest.
    pub fn new(event: NotificationEvent, title_key: &str, body_key: &str) -> Self {
        Self {
            event,
            title_key: title_key.to_string(),
            body_key: body_key.to_string(),
            params: BTreeMap::new(),
            link: None,
            image_url: None,
            actions: Vec::new(),
            push_category: None,
        }
    }

    pub fn param(mut self, key: &str, value: impl Into<String>) -> Self {
        self.params.insert(key.to_string(), value.into());
        self
    }

    pub fn link(mut self, href: impl Into<String>) -> Self {
        self.link = Some(href.into());
        self
    }

    pub fn image(mut self, url: Option<String>) -> Self {
        self.image_url = url;
        self
    }

    pub fn action(mut self, action: ActionSpec) -> Self {
        self.actions.push(action);
        self
    }

    pub fn push_category(mut self, category: PushCategory) -> Self {
        self.push_category = Some(category);
        self
    }

    pub fn category(&self) -> NotificationCategory {
        self.event.category()
    }
}

/// One notification as a client sees it: fully rendered in the reader's locale.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub category: NotificationCategory,
    pub event: NotificationEvent,
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    pub actions: Vec<NotificationAction>,
    pub read: bool,
    pub created_at: i64,
}

/// `GET /api/notifications`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsView {
    pub notifications: Vec<Notification>,
    /// Drives the bell badge.
    pub unread: u32,
}

/// One row of the per-category delivery matrix. A missing DB row means "on", so
/// a new category starts enabled without a migration touching every user.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryPref {
    pub category: NotificationCategory,
    pub in_app: bool,
    pub push: bool,
}

/// `GET`/`PUT /api/notifications/prefs`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrefs {
    pub categories: Vec<CategoryPref>,
}

/// How a push subscription reaches its device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushTransport {
    /// Browser / installed PWA, RFC 8291. Fully self-hosted: the server signs
    /// with its own VAPID key and posts straight to the browser's push endpoint.
    WebPush,
    /// Raw APNs device token (iOS).
    Apns,
    /// Raw FCM registration token (Android).
    Fcm,
}

impl PushTransport {
    pub fn as_str(self) -> &'static str {
        match self {
            PushTransport::WebPush => "webpush",
            PushTransport::Apns => "apns",
            PushTransport::Fcm => "fcm",
        }
    }

    pub fn parse(s: &str) -> Option<PushTransport> {
        match s {
            "webpush" => Some(PushTransport::WebPush),
            "apns" => Some(PushTransport::Apns),
            "fcm" => Some(PushTransport::Fcm),
            _ => None,
        }
    }
}

/// `POST /api/push/subscribe`. Web Push sends `endpoint` + both keys; the native
/// clients send the device token as `endpoint` and omit the keys.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeBody {
    pub transport: PushTransport,
    pub endpoint: String,
    #[serde(default)]
    pub p256dh: Option<String>,
    #[serde(default)]
    pub auth: Option<String>,
    /// Human label for the "your devices" list (e.g. "iPhone", "Firefox on Mac").
    #[serde(default)]
    pub device: Option<String>,
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
        // Exhaustive by construction: adding a variant without extending this
        // list leaves it untested, so keep it in sync with the enum.
        let all = [
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
            NotificationEvent::SystemVpnDown,
            NotificationEvent::SystemDiskLow,
        ];
        for e in all {
            assert_eq!(NotificationEvent::parse(e.as_str()), Some(e), "{}", e.as_str());
            // The serde rename and as_str must agree they are two spellings of
            // one wire contract.
            let json = serde_json::to_string(&e).unwrap();
            assert_eq!(json, format!("\"{}\"", e.as_str()));
        }
        assert_eq!(NotificationEvent::RequestDenied.category(), NotificationCategory::Requests);
        assert_eq!(NotificationEvent::MediaEpisode.category(), NotificationCategory::Media);
        assert_eq!(NotificationEvent::SystemDiskLow.category(), NotificationCategory::System);
    }

    #[test]
    fn transports_and_push_categories_round_trip() {
        for t in [PushTransport::WebPush, PushTransport::Apns, PushTransport::Fcm] {
            assert_eq!(PushTransport::parse(t.as_str()), Some(t));
        }
        for c in [PushCategory::RequestReview, PushCategory::MediaAvailable] {
            assert_eq!(PushCategory::parse(c.as_str()), Some(c));
        }
        assert_eq!(PushTransport::parse("expo"), None);
    }

    #[test]
    fn spec_builders_accumulate_without_clobbering() {
        let spec = NotificationSpec::new(
            NotificationEvent::RequestAvailable,
            "notifications.request.available.title",
            "notifications.request.available.body",
        )
        .param("title", "Dune")
        .param("year", "2021")
        .link("/movie/ab12")
        .image(Some("https://img/x.jpg".into()))
        .push_category(PushCategory::MediaAvailable)
        .action(ActionSpec {
            id: "watch".into(),
            label_key: "notifications.action.watch".into(),
            kind: ActionKind::Link,
            href: "/watch/ab12".into(),
            method: None,
            style: ActionStyle::Primary,
        });

        assert_eq!(spec.params.get("title").map(String::as_str), Some("Dune"));
        assert_eq!(spec.params.get("year").map(String::as_str), Some("2021"));
        assert_eq!(spec.category(), NotificationCategory::Requests);
        assert_eq!(spec.actions.len(), 1);
        assert_eq!(spec.push_category, Some(PushCategory::MediaAvailable));
    }
}
