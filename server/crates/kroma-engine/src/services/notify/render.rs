//! Turning a stored notification into the shape a client renders.
//!
//! Rows hold i18n keys and their interpolation vars, never text, so this is
//! where "who is reading, and in which language" is finally answered. Both the
//! inbox (`GET /api/notifications`) and push delivery go through here, which is
//! what keeps a pushed title and its in-app row saying the same thing.

use kroma_db::notifications::StoredNotification;
use kroma_domain::{Notification, NotificationAction};

use crate::i18n;

/// The locale to render for: the account's preference, else the server default.
pub use crate::i18n::user_locale as locale_of;

/// Resolve the interpolation vars for `locale`.
///
/// A param value that is itself a catalog key is translated first, so a producer
/// can pass a localizable value (a job's `jobs.{key}.name`) the same way it
/// passes a literal one (a film title). Ordinary text never collides with this:
/// a real title is not a message key.
fn vars_for(stored: &StoredNotification, locale: &str) -> Vec<(String, String)> {
    stored
        .params
        .iter()
        .map(|(k, v)| {
            let value =
                if i18n::is_message_key(v) { i18n::t(locale, v, &[]) } else { v.clone() };
            (k.clone(), value)
        })
        .collect()
}

/// Render one stored notification into its wire shape.
pub fn render(stored: &StoredNotification, locale: &str) -> Notification {
    let resolved = vars_for(stored, locale);
    let vars: Vec<(&str, &str)> =
        resolved.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    Notification {
        id: stored.id.clone(),
        category: stored.category,
        event: stored.event,
        title: i18n::t(locale, &stored.title_key, &vars),
        body: i18n::t(locale, &stored.body_key, &vars),
        link: stored.link.clone(),
        image_url: stored.image_url.clone(),
        actions: stored
            .actions
            .iter()
            .map(|a| NotificationAction {
                id: a.id.clone(),
                // Action labels are keys too, so a button reads in the same
                // language as the row it sits on.
                label: i18n::t(locale, &a.label_key, &vars),
                kind: a.kind,
                href: a.href.clone(),
                method: a.method.clone(),
                style: a.style,
            })
            .collect(),
        read: stored.read,
        created_at: stored.created_at,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use kroma_domain::{ActionKind, ActionSpec, ActionStyle, NotificationCategory, NotificationEvent};

    use super::*;

    fn stored() -> StoredNotification {
        StoredNotification {
            id: "n1".into(),
            category: NotificationCategory::Requests,
            event: NotificationEvent::RequestAvailable,
            title_key: "notifications.request.available.title".into(),
            body_key: "notifications.request.available.body".into(),
            params: BTreeMap::from([("title".to_string(), "Dune".to_string())]),
            link: Some("/movie/ab12".into()),
            image_url: Some("https://img/p.jpg".into()),
            actions: vec![ActionSpec {
                id: "watch".into(),
                label_key: "notifications.action.watch".into(),
                kind: ActionKind::Link,
                href: "/watch/ab12".into(),
                method: None,
                style: ActionStyle::Primary,
            }],
            push_category: None,
            read: false,
            created_at: 1_700_000_000_000,
        }
    }

    #[test]
    fn interpolates_params_into_title_and_body() {
        let out = render(&stored(), "en");
        // The catalogs carry these keys, so the title must not come back as the
        // raw key and must have the film's name substituted in.
        assert!(out.title.contains("Dune") || out.body.contains("Dune"), "{out:?}");
        assert!(!out.title.starts_with("notifications."), "unresolved key: {}", out.title);
    }

    #[test]
    fn renders_the_same_notification_differently_per_locale() {
        let s = stored();
        let fr = render(&s, "fr");
        let en = render(&s, "en");
        // Same row, two readers, two languages this is why text is not stored.
        assert_ne!(fr.body, en.body, "fr/en catalogs should differ for this key");
    }

    #[test]
    fn carries_image_link_and_actions_through_untouched() {
        let out = render(&stored(), "en");
        assert_eq!(out.link.as_deref(), Some("/movie/ab12"));
        assert_eq!(out.image_url.as_deref(), Some("https://img/p.jpg"));
        assert_eq!(out.actions.len(), 1);
        assert_eq!(out.actions[0].id, "watch");
        assert_eq!(out.actions[0].href, "/watch/ab12");
        assert_eq!(out.actions[0].style, ActionStyle::Primary);
        // The button label is resolved, not left as a key.
        assert!(!out.actions[0].label.starts_with("notifications."));
    }

    #[test]
    fn a_param_that_is_itself_a_catalog_key_gets_translated() {
        let mut s = stored();
        s.title_key = "notifications.system.job.failed.title".into();
        s.body_key = "notifications.system.job.failed.body".into();
        // The jobs domain names its display strings by key; a notification about
        // a failed job passes that key through as a param.
        s.params = BTreeMap::from([("job".to_string(), "jobs.library.scan.name".to_string())]);
        let out = render(&s, "en");
        assert!(!out.body.contains("jobs.library.scan.name"), "raw key leaked: {}", out.body);
    }

    #[test]
    fn ordinary_param_text_is_left_alone() {
        // A film title must never be mistaken for a key and rewritten.
        let out = render(&stored(), "en");
        assert!(out.body.contains("Dune"), "{}", out.body);
    }

    #[test]
    fn an_unknown_key_degrades_to_the_key_itself() {
        let mut s = stored();
        s.title_key = "notifications.does.not.exist".into();
        let out = render(&s, "en");
        // i18n falls back to the raw key rather than panicking or emptying the
        // row: a notification with an odd title still beats a missing one.
        assert_eq!(out.title, "notifications.does.not.exist");
    }
}
