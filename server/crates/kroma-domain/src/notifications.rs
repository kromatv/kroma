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

// The push half of this domain (transports, subscriptions, the registered mobile
// action sets) lives next door in `push.rs` and is re-exported by the crate root
// the same seam `kroma-db` and `services/notify` already cut.
use crate::push::PushCategory;

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

/// The specific thing that happened.
///
/// The core's own events are named here, so the category mapping below is
/// exhaustive and a new one can't silently land in the wrong preference bucket.
/// Anything a MODULE raises is [`NotificationEvent::Custom`]: the VPN dropping
/// is the VPN module's business, and a core that enumerated it would be naming a
/// feature it does not ship and cannot translate (module catalogs are the
/// module's own). A custom event states its category on the spec instead.
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
    /// A "push is working" message the user asked for from settings. Never
    /// persisted; it exists so the test push isn't forced to impersonate a real
    /// event (it used to borrow `system.job.failed`, which then showed up in the
    /// category preferences and the urgency mapping as a phantom failure).
    #[serde(rename = "system.test")]
    SystemTest,
    /// Raised by something the core has no name for - a module, or an admin
    /// composing one by hand. The category comes from the spec
    /// ([`NotificationSpec::in_category`]), and the text is carried as params so
    /// it survives a core that knows nothing about it.
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

    /// Every event this server can raise, in the order a person reads them:
    /// grouped by category, oldest concept first. The admin console's test bench
    /// walks this, so an event missing here is an event nobody can preview.
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
            | NotificationEvent::SystemDiskLow
            | NotificationEvent::SystemTest
            // The fallback bucket for an event the core does not know. A spec
            // that means otherwise says so with `in_category`.
            | NotificationEvent::Custom => NotificationCategory::System,
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

/// One interpolation variable on a notification.
///
/// Producers say which kind they mean rather than leaving it to be guessed. The
/// guess used to be "translate this value if it happens to be a catalog key",
/// which quietly replaced any user-controlled text that collided with one — a
/// username, or a moderator's free-text denial note — and that collision surface
/// grew with every key added to the catalogs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum ParamValue {
    /// Literal text, interpolated as-is: a film title, a username, a note.
    Text(String),
    /// An i18n key, resolved in the reader's locale first (a job's
    /// `jobs.{key}.name`, so a failed-task notification names the task in the
    /// language the reader is actually using).
    Key(String),
    /// A bare string from a row written BEFORE params were typed, where a key
    /// and a literal were the same thing on the wire.
    ///
    /// It has to stay ambiguous. Calling it `Text` renders a stored
    /// `system.job.failed` as "Job jobs.library.scan.name failed" - those rows
    /// live until the 200-per-user retention pushes them out, and nothing
    /// migrates them. Calling it `Key` re-introduces the collision this enum was
    /// added to end, where a username or a moderator's free-text note that
    /// happened to name a catalog entry was silently replaced by it.
    ///
    /// So it is resolved only when it names a REAL entry, and only for these old
    /// rows: anything written since is tagged, and a tagged `Text` is never
    /// looked up. See `services::notify::render`.
    Legacy(String),
}

impl ParamValue {
    /// The text to interpolate.
    ///
    /// `translate` answers `None` for a string the catalogs do not know, which is
    /// what lets [`ParamValue::Legacy`] fall back to its own literal text while
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
    /// Accepts the tagged form AND a bare string.
    ///
    /// Rows written before params were typed stored plain strings, and every one
    /// of them was literal text so that is what a bare string means. Without
    /// this an existing notification's whole `params` map would fail to parse and
    /// the row would render with its placeholders unsubstituted.
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

/// What a producer hands to `services::notify::emit`: keys, not text.
///
/// Serializable for the same reason as [`Audience`]: this is the payload a
/// module posts to the host's callback API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSpec {
    pub event: NotificationEvent,
    pub title_key: String,
    pub body_key: String,
    /// Interpolation vars for both keys (`{title}`, `{count}`, …).
    #[serde(default)]
    pub params: BTreeMap<String, ParamValue>,
    /// In-app route a tap opens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// Poster / backdrop shown on the row and in a rich push.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(default)]
    pub actions: Vec<ActionSpec>,
    /// Which registered action set a native push should use.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push_category: Option<PushCategory>,
    /// Which preference bucket this belongs to, when the event does not say.
    /// Only a [`NotificationEvent::Custom`] needs it - a core event's category
    /// is part of what the event MEANS and is not the producer's to override.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<NotificationCategory>,
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
            category: None,
        }
    }

    /// Text a module supplies itself, rather than a key the core can translate.
    ///
    /// The core's catalogs are the core's; a module ships its own, which the
    /// server-side renderer does not load. So a module's own wording rides in as
    /// interpolation params through a passthrough key, which is how it survives
    /// storage, rendering and push without the core knowing the words.
    pub fn custom(category: NotificationCategory, title: impl Into<String>, body: impl Into<String>) -> Self {
        Self::new(NotificationEvent::Custom, "notifications.custom.title", "notifications.custom.body")
            .param("title", title)
            .param("body", body)
            .in_category(category)
    }

    /// A literal interpolation var: a title, a username, a count. Never
    /// translated, however much it may look like a catalog key.
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

    /// State the preference bucket for a [`NotificationEvent::Custom`]. Ignored
    /// - deliberately - for the core's own events: see the field.
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
    /// The registered action set a NATIVE push should use. Absent for most
    /// notifications, and ignored by the web client (which carries its buttons
    /// in `actions`); APNs and Android can only show buttons from a set the app
    /// registered at launch, so this names one.
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
                NotificationEvent::SystemDiskLow,
            NotificationEvent::SystemTest,
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
    fn param_marks_text_and_param_key_marks_a_key() {
        let spec = NotificationSpec::new(
            NotificationEvent::SystemJobFailed,
            "notifications.system.job.failed.title",
            "notifications.system.job.failed.body",
        )
        .param("who", "library.scan")
        .param_key("job", "jobs.library.scan.name");

        // Two similar-looking strings, opposite intent and the type records it,
        // rather than the renderer guessing from how the value happens to read.
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

        // Rows written before params were typed stored a bare string, and it is
        // impossible to tell from the value alone whether it was a key or a
        // literal - so they read back as `Legacy`, which `render` resolves only
        // when the catalogs actually know it. Calling them Text here rendered a
        // stored `system.job.failed` as "Job jobs.library.scan.name failed".
        assert_eq!(
            serde_json::from_str::<ParamValue>(r#""Dune""#).unwrap(),
            ParamValue::Legacy("Dune".into())
        );
        let legacy: BTreeMap<String, ParamValue> =
            serde_json::from_str(r#"{"title":"Dune","job":"jobs.library.scan.name"}"#).unwrap();
        assert_eq!(legacy.get("title"), Some(&ParamValue::Legacy("Dune".into())));
        assert_eq!(legacy.get("job"), Some(&ParamValue::Legacy("jobs.library.scan.name".into())));

        // A tagged value is never ambiguous, whatever it spells.
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
