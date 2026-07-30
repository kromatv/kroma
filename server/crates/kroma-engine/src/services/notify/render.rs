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

// Which vars are translatable is stated by the producer (`ParamValue`), not
// inferred from the text. A title or a username is interpolated exactly as
// given, even if it happens to spell a catalog key.
fn vars_for(stored: &StoredNotification, locale: &str) -> Vec<(String, String)> {
    stored
        .params
        .iter()
        .map(|(k, v)| {
            // `None` for anything the catalogs do not know, which is what keeps a
            // legacy bare string literal unless it really was a key.
            (k.clone(), v.resolve(|key| i18n::is_message_key(key).then(|| i18n::t(locale, key, &[]))))
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
        push_category: stored.push_category,
        read: stored.read,
        created_at: stored.created_at,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use kroma_domain::{
        ActionKind, ActionSpec, ActionStyle, NotificationCategory, NotificationEvent, ParamValue,
    };

    use super::*;

    fn stored() -> StoredNotification {
        StoredNotification {
            id: "n1".into(),
            category: NotificationCategory::Requests,
            event: NotificationEvent::RequestAvailable,
            title_key: "notifications.request.available.title".into(),
            body_key: "notifications.request.available.body".into(),
            params: BTreeMap::from([("title".to_string(), ParamValue::Text("Dune".into()))]),
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
    fn a_key_param_is_translated_into_the_readers_locale() {
        let mut s = stored();
        s.title_key = "notifications.system.job.failed.title".into();
        s.body_key = "notifications.system.job.failed.body".into();
        // The jobs domain names its display strings by key, and says so.
        s.params =
            BTreeMap::from([("job".to_string(), ParamValue::Key("jobs.library.scan.name".into()))]);
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
    fn text_that_happens_to_spell_a_catalog_key_is_still_interpolated_verbatim() {
        // The whole point of the typed param. A username or a moderator's note
        // that collides with a real catalog key used to be silently replaced by
        // that key's UI string; declared as Text, it survives untouched.
        let mut s = stored();
        s.body_key = "notifications.report.submitted.body".into();
        s.params = BTreeMap::from([
            ("user".to_string(), ParamValue::Text("reports.sheet".into())),
            ("title".to_string(), ParamValue::Text("Dune".into())),
        ]);
        let out = render(&s, "en");
        assert!(out.body.contains("reports.sheet"), "collided param was rewritten: {}", out.body);
        // Sanity: that key really does resolve to something else, so the test
        // would fail under the old value-shape heuristic.
        assert_ne!(crate::i18n::t("en", "reports.sheet", &[]), "reports.sheet");
    }

    #[test]
    fn a_row_written_before_params_were_typed_still_resolves_its_key() {
        // Rows from before the upgrade stored a key as a bare string, and there
        // are up to 200 of them per user with nothing to migrate them. Read back
        // as plain Text they rendered "Job jobs.library.scan.name failed".
        let mut s = stored();
        s.body_key = "notifications.report.submitted.body".into();
        s.params = BTreeMap::from([
            ("user".to_string(), ParamValue::Legacy("reports.sheet".into())),
            ("title".to_string(), ParamValue::Text("Dune".into())),
        ]);
        let out = render(&s, "en");
        let resolved = crate::i18n::t("en", "reports.sheet", &[]);
        assert!(out.body.contains(&resolved), "legacy key left raw: {}", out.body);
    }

    #[test]
    fn a_legacy_param_that_is_not_a_key_is_left_exactly_as_it_was() {
        // The other half: most of those bare strings were ordinary text (a film
        // title, a note), and resolving is only ever a lookup, never a guess.
        let mut s = stored();
        s.params = BTreeMap::from([("title".to_string(), ParamValue::Legacy("Dune".into()))]);
        let out = render(&s, "en");
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
