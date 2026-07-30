//! Notifications as pure data (serde); persistence lives in
//! `crate::db::notifications`, delivery in `crate::services::notify`.
//!
//! Stored rows hold an i18n key plus params, never rendered text; the wire shape
//! below is the RENDERED form and is a public client contract, so field names,
//! casing and epoch-millisecond timestamps must not drift.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::push::PushCategory;

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

/// What an action button does when tapped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActionKind {
    Link,
    Api,
}

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
    pub id: String,
    pub label: String,
    pub kind: ActionKind,
    // Client route for `ActionKind::Link`, API path for `ActionKind::Api`.
    pub href: String,
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
    pub label_key: String,
    pub kind: ActionKind,
    pub href: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(default)]
    pub style: ActionStyle,
}

/// One interpolation variable on a notification. Producers tag which kind they
/// mean, so user-controlled text that collides with a catalog key is never
/// silently translated.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum ParamValue {
    Text(String),
    Key(String),
    // A bare string from a row written before params were typed, where a key
    // and a literal were the same thing on the wire. It stays ambiguous on
    // purpose: resolved only when it names a REAL catalog entry, and only for
    // these old rows. See `services::notify::render`.
    Legacy(String),
}

impl ParamValue {
    /// `translate` answers `None` for a string the catalogs do not know, which
    /// lets [`ParamValue::Legacy`] fall back to its own literal text while
    /// [`ParamValue::Key`] keeps the key visible rather than rendering blank.
    pub fn resolve(&self, translate: impl FnOnce(&str) -> Option<String>) -> String {
        match self {
            ParamValue::Text(text) => text.clone(),
            ParamValue::Key(key) => translate(key).unwrap_or_else(|| key.clone()),
            ParamValue::Legacy(text) => translate(text).unwrap_or_else(|| text.clone()),
        }
    }
}

impl<'de> Deserialize<'de> for ParamValue {
    // Accepts the tagged form AND a bare string: without the latter an existing
    // row's whole `params` map fails to parse and renders unsubstituted.
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            Tagged { kind: String, value: String },
            Legacy(String),
        }
        Ok(match Raw::deserialize(deserializer)? {
            Raw::Tagged { kind, value } if kind == "key" => ParamValue::Key(value),
            Raw::Tagged { value, .. } => ParamValue::Text(value),
            Raw::Legacy(text) => ParamValue::Legacy(text),
        })
    }
}

/// What a producer hands to `services::notify::emit`: keys, not text. Also the
/// payload a module posts to the host's callback API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSpec {
    pub event: NotificationEvent,
    pub title_key: String,
    pub body_key: String,
    #[serde(default)]
    pub params: BTreeMap<String, ParamValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(default)]
    pub actions: Vec<ActionSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push_category: Option<PushCategory>,
    // Only a `NotificationEvent::Custom` may set this; a core event's category
    // is not the producer's to override.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<NotificationCategory>,
}

impl NotificationSpec {
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
            category: None,
        }
    }

    /// Text a module supplies itself, rather than a key the core can translate.
    /// The server-side renderer does not load module catalogs, so the module's
    /// wording rides in as params through a passthrough key.
    pub fn custom(category: NotificationCategory, title: impl Into<String>, body: impl Into<String>) -> Self {
        Self::new(NotificationEvent::Custom, "notifications.custom.title", "notifications.custom.body")
            .param("title", title)
            .param("body", body)
            .in_category(category)
    }

    /// A literal interpolation var. Never translated, however much it may look
    /// like a catalog key.
    pub fn param(mut self, key: &str, value: impl Into<String>) -> Self {
        self.params.insert(key.to_string(), ParamValue::Text(value.into()));
        self
    }

    /// An interpolation var that is itself an i18n key, resolved in the reader's
    /// locale (a job's `jobs.{key}.name`).
    pub fn param_key(mut self, key: &str, message_key: impl Into<String>) -> Self {
        self.params.insert(key.to_string(), ParamValue::Key(message_key.into()));
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

    /// State the preference bucket for a [`NotificationEvent::Custom`].
    /// Deliberately ignored for the core's own events.
    pub fn in_category(mut self, category: NotificationCategory) -> Self {
        self.category = Some(category);
        self
    }

    pub fn category(&self) -> NotificationCategory {
        match self.event {
            NotificationEvent::Custom => self.category.unwrap_or(NotificationCategory::System),
            core => core.category(),
        }
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
    // APNs and Android can only show buttons from a set the app registered at
    // launch, so this names one. Ignored by the web client, which uses `actions`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_category: Option<PushCategory>,
    pub read: bool,
    pub created_at: i64,
}

/// `GET /api/notifications`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsView {
    pub notifications: Vec<Notification>,
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
        // Keep in sync with the enum: a variant missing here is untested.
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
                NotificationEvent::SystemDiskLow,
            NotificationEvent::SystemTest,
        ];
        for e in all {
            assert_eq!(NotificationEvent::parse(e.as_str()), Some(e), "{}", e.as_str());
            let json = serde_json::to_string(&e).unwrap();
            assert_eq!(json, format!("\"{}\"", e.as_str()));
        }
        assert_eq!(NotificationEvent::RequestDenied.category(), NotificationCategory::Requests);
        assert_eq!(NotificationEvent::MediaEpisode.category(), NotificationCategory::Media);
        assert_eq!(NotificationEvent::SystemDiskLow.category(), NotificationCategory::System);
    }

    #[test]
    fn param_marks_text_and_param_key_marks_a_key() {
        let spec = NotificationSpec::new(
            NotificationEvent::SystemJobFailed,
            "notifications.system.job.failed.title",
            "notifications.system.job.failed.body",
        )
        .param("who", "library.scan")
        .param_key("job", "jobs.library.scan.name");

        assert_eq!(spec.params.get("who"), Some(&ParamValue::Text("library.scan".into())));
        assert_eq!(spec.params.get("job"), Some(&ParamValue::Key("jobs.library.scan.name".into())));
    }

    #[test]
    fn a_param_round_trips_and_still_reads_the_legacy_bare_string() {
        let typed = serde_json::to_string(&ParamValue::Key("jobs.x.name".into())).unwrap();
        assert_eq!(typed, r#"{"kind":"key","value":"jobs.x.name"}"#);
        assert_eq!(
            serde_json::from_str::<ParamValue>(&typed).unwrap(),
            ParamValue::Key("jobs.x.name".into())
        );

        // Bare strings predate typed params and read back as `Legacy`.
        assert_eq!(
            serde_json::from_str::<ParamValue>(r#""Dune""#).unwrap(),
            ParamValue::Legacy("Dune".into())
        );
        let legacy: BTreeMap<String, ParamValue> =
            serde_json::from_str(r#"{"title":"Dune","job":"jobs.library.scan.name"}"#).unwrap();
        assert_eq!(legacy.get("title"), Some(&ParamValue::Legacy("Dune".into())));
        assert_eq!(legacy.get("job"), Some(&ParamValue::Legacy("jobs.library.scan.name".into())));

        assert_eq!(
            serde_json::from_str::<ParamValue>(r#"{"kind":"text","value":"jobs.library.scan.name"}"#)
                .unwrap(),
            ParamValue::Text("jobs.library.scan.name".into())
        );
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

        assert_eq!(spec.params.get("title"), Some(&ParamValue::Text("Dune".into())));
        assert_eq!(spec.params.get("year"), Some(&ParamValue::Text("2021".into())));
        assert_eq!(spec.category(), NotificationCategory::Requests);
        assert_eq!(spec.actions.len(), 1);
        assert_eq!(spec.push_category, Some(PushCategory::MediaAvailable));
    }
}
