//! Turning a stored notification into the shape a client renders.
//!
//! Rows hold i18n keys and their interpolation vars, never text, so this is
//! where "who is reading, and in which language" is finally answered. Both the
//! inbox (`GET /api/notifications`) and push delivery go through here, which is
//! what keeps a pushed title and its in-app row saying the same thing.

use kroma_db::notifications::StoredNotification;
use kroma_domain::{Notification, NotificationAction};

use super::subject::Subjects;
use super::types::{NotificationTypes, Wording};

/// The locale to render for: the account's preference, else the server default.
pub use crate::i18n::user_locale as locale_of;

// Which vars are translatable is stated by the producer (`ParamValue`), not
// inferred from the text. A title or a username is interpolated exactly as
// given, even if it happens to spell a catalog key.
fn vars_for(stored: &StoredNotification, locale: &str, wording: &Wording) -> Vec<(String, String)> {
    stored
        .params
        .iter()
        .map(|(k, v)| {
            // `None` for anything the catalogs do not know, which is what keeps a
            // legacy bare string literal unless it really was a key.
            (
                k.clone(),
                v.resolve(|key| wording.knows(key).then(|| wording.t(locale, key, &[]))),
            )
        })
        .collect()
}

/// Render one stored notification into its wire shape.
///
/// `subjects` carries what the row's subject needs looked up: the route and the
/// actor come from it, so a route rename or a renamed account shows on rows
/// already written. `types` holds the catalogs of the module that raised it,
/// read before the core's.
pub fn render(
    stored: &StoredNotification,
    locale: &str,
    subjects: &Subjects,
    types: &NotificationTypes,
) -> Notification {
    let wording = types.wording(stored.module_type.as_deref());
    let interpolated = vars_for(stored, locale, &wording);
    let vars: Vec<(&str, &str)> = interpolated
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    let settled = stored.resolved_at.is_some();
    Notification {
        id: stored.id.clone(),
        category: stored.category,
        event: stored.event,
        title: wording.t(locale, &stored.title_key, &vars),
        body: wording.t(locale, &stored.body_key, &vars),
        subject: stored.subject.clone(),
        actor: subjects.actor(stored),
        data: stored.data.clone(),
        group_key: stored.group_key.clone(),
        link: subjects.link(stored),
        image_url: stored.image_url.clone(),
        actions: if settled {
            Vec::new()
        } else {
            rendered_actions(stored, locale, &vars, &wording)
        },
        push_category: stored.push_category,
        read: stored.read,
        resolved: settled,
        resolved_by: subjects.resolver(stored),
        count: stored.count,
        created_at: stored.created_at,
        updated_at: stored.updated_at,
    }
}

fn rendered_actions(
    stored: &StoredNotification,
    locale: &str,
    vars: &[(&str, &str)],
    wording: &Wording,
) -> Vec<NotificationAction> {
    stored
        .actions
        .iter()
        .map(|a| NotificationAction {
            id: a.id.clone(),
            label: wording.t(locale, &a.label_key, vars),
            kind: a.kind,
            href: a.href.clone(),
            method: a.method.clone(),
            style: a.style,
        })
        .collect()
}

#[cfg(test)]
mod tests;
