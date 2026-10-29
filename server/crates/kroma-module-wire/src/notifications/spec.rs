//! What a producer hands to the notify service: keys, not text.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::PushCategory;

use super::action::ActionSpec;
use super::event::{NotificationCategory, NotificationEvent};
use super::param::ParamValue;
use super::subject::NotificationSubject;

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
    /// What the notification is about. A reader's route is worked out from this
    /// when the row is read, which is why `link` below is only a fallback.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<NotificationSubject>,
    /// The account that caused the event, `None` for the system. The name and
    /// avatar are read from that account when the row is read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_id: Option<String>,
    /// The event's own facts, as a JSON object typed per event.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
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
            subject: None,
            actor_id: None,
            data: None,
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
    pub fn custom(
        category: NotificationCategory,
        title: impl Into<String>,
        body: impl Into<String>,
    ) -> Self {
        Self::new(
            NotificationEvent::Custom,
            "notifications.custom.title",
            "notifications.custom.body",
        )
        .param("title", title)
        .param("body", body)
        .in_category(category)
    }

    /// A literal interpolation var. Never translated, however much it may look
    /// like a catalog key.
    pub fn param(mut self, key: &str, value: impl Into<String>) -> Self {
        self.params
            .insert(key.to_string(), ParamValue::Text(value.into()));
        self
    }

    /// An interpolation var that is itself an i18n key, resolved in the reader's
    /// locale (a job's `jobs.{key}.name`).
    pub fn param_key(mut self, key: &str, message_key: impl Into<String>) -> Self {
        self.params
            .insert(key.to_string(), ParamValue::Key(message_key.into()));
        self
    }

    /// What the notification is about. Every reader's route is derived from it,
    /// so a route rename never strands a stored row.
    pub fn subject(mut self, subject: NotificationSubject) -> Self {
        self.subject = Some(subject);
        self
    }

    /// The account that caused the event. Leave it unset for the system.
    pub fn actor(mut self, user_id: impl Into<String>) -> Self {
        self.actor_id = Some(user_id.into());
        self
    }

    /// The event's own facts. Anything that is not a JSON object is dropped:
    /// the clients' schemas are keyed by field name.
    pub fn data(mut self, data: &impl Serialize) -> Self {
        self.data = serde_json::to_value(data).ok().filter(Value::is_object);
        self
    }

    /// Where the row points for a reader that knows no subject kind of its own,
    /// and for a row with no subject at all.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ActionKind, ActionStyle};

    #[test]
    fn param_marks_text_and_param_key_marks_a_key() {
        let spec = NotificationSpec::new(
            NotificationEvent::SystemJobFailed,
            "notifications.system.job.failed.title",
            "notifications.system.job.failed.body",
        )
        .param("who", "library.scan")
        .param_key("job", "jobs.library.scan.name");

        assert_eq!(
            spec.params.get("who"),
            Some(&ParamValue::Text("library.scan".into()))
        );
        assert_eq!(
            spec.params.get("job"),
            Some(&ParamValue::Key("jobs.library.scan.name".into()))
        );
    }
    #[test]
    fn a_subject_an_actor_and_typed_data_ride_along_as_camel_case() {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Facts {
            request_id: &'static str,
        }

        let spec = NotificationSpec::new(
            NotificationEvent::RequestSubmitted,
            "notifications.request.submitted.title",
            "notifications.request.submitted.body",
        )
        .subject(NotificationSubject::request("req-7"))
        .actor("u1")
        .data(&Facts {
            request_id: "req-7",
        });

        let json = serde_json::to_value(&spec).unwrap();

        assert_eq!(
            json["subject"],
            serde_json::json!({ "kind": "request", "id": "req-7" })
        );
        assert_eq!(json["actorId"], "u1");
        assert_eq!(json["data"], serde_json::json!({ "requestId": "req-7" }));
    }

    #[test]
    fn data_that_is_not_an_object_is_dropped_rather_than_stored() {
        let spec = NotificationSpec::new(
            NotificationEvent::Custom,
            "notifications.custom.title",
            "notifications.custom.body",
        )
        .data(&vec![1, 2, 3]);

        assert_eq!(spec.data, None);
    }

    #[test]
    fn a_spec_from_a_module_built_before_subjects_still_parses() {
        let raw = r#"{"event":"custom","titleKey":"a","bodyKey":"b"}"#;

        let spec: NotificationSpec = serde_json::from_str(raw).unwrap();

        assert_eq!(spec.subject, None);
        assert_eq!(spec.actor_id, None);
        assert_eq!(spec.data, None);
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

        assert_eq!(
            spec.params.get("title"),
            Some(&ParamValue::Text("Dune".into()))
        );
        assert_eq!(
            spec.params.get("year"),
            Some(&ParamValue::Text("2021".into()))
        );
        assert_eq!(spec.category(), NotificationCategory::Requests);
        assert_eq!(spec.actions.len(), 1);
        assert_eq!(spec.push_category, Some(PushCategory::MediaAvailable));
    }
}
