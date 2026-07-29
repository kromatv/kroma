//! Notification delivery: who gets told, and how they hear about it.
//!
//! One entry point, [`emit`]. Producers describe WHAT happened (a
//! [`NotificationSpec`] of i18n keys, an image, a link, action buttons) and WHO
//! should hear about it (an [`Audience`]); everything after that resolving the
//! recipients, honouring their preferences, persisting a row and waking their
//! open clients is handled here, so no producer has to know about the inbox.
//!
//! Emission is synchronous and does DB work: call it from a blocking context
//! (`api::util::blocking`, a job thread), never inline in an async handler the
//! same rule the requests service follows.

pub mod art;
pub mod digest;
pub mod push;
pub mod render;

use kroma_db::notifications::StoredNotification;
use kroma_module_host::{Event, HostCtx};
use serde_json::json;

use kroma_domain::{Audience, NotificationSpec, User};

use crate::db;
use crate::services::jobs::now_ms;

/// Resolve an audience to the accounts that should receive this.
///
/// Returns full [`User`]s: the caller needs `language` to render for each
/// recipient, so re-fetching per id would be a query per notification.
fn resolve<S: HostCtx>(audience: &Audience, state: &S) -> anyhow::Result<Vec<User>> {
    // The single-recipient case is by far the most common (a request approved,
    // a report triaged) and has an indexed lookup; only the set-valued audiences
    // need the whole account list.
    if let Audience::User { id } = audience {
        return Ok(db::user_by_id(state.db(), id)?.into_iter().collect());
    }
    let conn = state.db().get()?;
    let all = db::notifications::recipients(&conn)?;
    Ok(match audience {
        Audience::User { .. } => unreachable!("handled above"),
        Audience::Permission { permission } => {
            all.into_iter().filter(|u| u.can(*permission)).collect()
        }
        Audience::Everyone => all,
        Audience::Followers { show_id } => {
            let ids: std::collections::HashSet<String> =
                db::notifications::followers_of_show(&conn, show_id)?.into_iter().collect();
            all.into_iter().filter(|u| ids.contains(&u.id)).collect()
        }
    })
}

/// Tell an audience that something happened.
///
/// Per recipient: skip if they muted the category, persist a row rendered in
/// their language on read, then wake their open clients with an addressed bus
/// event. Returns how many were actually notified.
///
/// Failures are contained per recipient a notification is never the point of
/// the operation that triggered it, so one bad row must not fail an approval.
pub fn emit<S: HostCtx>(state: &S, audience: &Audience, spec: &NotificationSpec) -> usize {
    let recipients = match resolve(audience, state) {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, event = spec.event.as_str(), "notify: cannot resolve audience");
            return 0;
        }
    };
    emit_to(state, &recipients, spec)
}

/// [`emit`] with the audience already resolved.
///
/// The digest announces many shows in one run; going through `emit` each time
/// would re-read the whole user table per show, so it resolves once and calls
/// this. The VAPID key and push subject are resolved here too, for the same
/// reason: they are per-server, not per-recipient.
pub fn emit_to<S: HostCtx>(state: &S, recipients: &[User], spec: &NotificationSpec) -> usize {
    if recipients.is_empty() {
        return 0;
    }
    let push = push::sender(state);
    let mut sent = 0;
    for user in recipients {
        match deliver(state, user, spec, &push) {
            Ok(true) => sent += 1,
            Ok(false) => {}
            Err(e) => {
                tracing::warn!(
                    error = %e, user = %user.id, event = spec.event.as_str(),
                    "notify: delivery failed"
                );
            }
        }
    }
    sent
}

/// Deliver to one recipient. `Ok(false)` means they have this category muted.
fn deliver<S: HostCtx>(
    state: &S,
    user: &User,
    spec: &NotificationSpec,
    push: &push::Sender,
) -> anyhow::Result<bool> {
    let category = spec.category();
    // One connection for the whole DB half of the delivery: the checks and the
    // insert run on it instead of taking two from the pool. It is released
    // before the push, which is blocking network I/O with bookkeeping of its own.
    let conn = state.db().get()?;
    let (in_app, push_allowed) = db::notifications::allows(&conn, &user.id, category)?;
    if !in_app {
        return Ok(false);
    }

    let now = now_ms();
    let id = crate::services::scan::short_hash(&format!(
        "notification|{}|{}|{}",
        user.id,
        spec.event.as_str(),
        crate::services::auth::random_token()
    ));
    // The row we are about to write, kept in hand: rendering the push below needs
    // exactly this, and re-SELECTing it would be a query plus two JSON parses for
    // data already sitting here.
    let stored = StoredNotification {
        id: id.clone(),
        category,
        event: spec.event,
        title_key: spec.title_key.clone(),
        body_key: spec.body_key.clone(),
        params: spec.params.clone(),
        link: spec.link.clone(),
        image_url: spec.image_url.clone(),
        actions: spec.actions.clone(),
        push_category: spec.push_category,
        read: false,
        created_at: now,
    };
    let unread = db::notifications::insert_notification(&conn, user.id.as_str(), &stored)?;

    // Wake this user's open clients. Addressed, so the bell on someone else's
    // browser does not tick for a notification that isn't theirs.
    state.publish_to(
        &user.id,
        Event::new("notification.created", json!({ "id": id, "unread": unread })),
    );

    // Then the device. Rendered in the recipient's own language, exactly like
    // the row they will see in the centre. Best effort by design: the row is
    // already written, so a push service being down costs a push, not the
    // notification.
    if push_allowed {
        // Sized on the way out: the device fetches this URL itself, over its own
        // network, and a lock-screen thumbnail has no use for the master (see
        // `art`).
        let rendered = art::sized_for_push(render::render(&stored, render::locale_of(user)));
        drop(conn);
        push::deliver(state, push, &user.id, &rendered);
    }
    Ok(true)
}

/// Tell a user's clients that their unread count moved (they read or deleted
/// something elsewhere), so a second open device updates its badge.
///
/// Takes the count rather than reading it: callers have just done the write that
/// changed it and already know the answer, which keeps this a pure bus publish
/// and therefore safe to call straight from an async handler.
pub fn publish_unread<S: HostCtx>(state: &S, user_id: &str, unread: u32) {
    state.publish_to(user_id, Event::new("notification.read", json!({ "unread": unread })));
}

#[cfg(test)]
mod tests {
    use kroma_domain::{NotificationCategory, NotificationEvent, Permission};

    use super::*;
    use crate::test_support;

    /// A real app host with its bus tapped: the shared decorator forwards every
    /// method to the app state and captures what was published, which is the
    /// only thing these tests assert on.
    type RecordingHost = kroma_module_host::testing::Recording<crate::state::SharedState>;

    fn recording_host() -> RecordingHost {
        RecordingHost::new(test_support::test_state())
    }

    fn spec() -> NotificationSpec {
        NotificationSpec::new(
            NotificationEvent::RequestApproved,
            "notifications.request.approved.title",
            "notifications.request.approved.body",
        )
        .param("title", "Dune")
    }

    fn user(host: &RecordingHost, email: &str, name: &str, perms: &[Permission]) -> String {
        kroma_db::create_user(host.db(), email, name, "h", perms).unwrap().id
    }

    #[test]
    fn emit_to_one_user_writes_a_row_and_wakes_only_them() {
        let host = recording_host();
        let ana = user(&host, "ana@t.dev", "Ana", &[]);
        let bo = user(&host, "bo@t.dev", "Bo", &[]);

        assert_eq!(emit(&host, &Audience::user(ana.clone()), &spec()), 1);

        let conn = host.db().get().unwrap();
        assert_eq!(db::notifications::unread_count(&conn, &ana).unwrap(), 1);
        assert_eq!(db::notifications::unread_count(&conn, &bo).unwrap(), 0);
        // And the bus event was addressed, not broadcast.
        assert_eq!(host.published(), vec![(Some(ana), "notification.created".to_string())]);
    }

    #[test]
    fn permission_audience_reaches_only_capability_holders() {
        let host = recording_host();
        let mod_ = user(&host, "mod@t.dev", "Mod", &[Permission::RequestsManage]);
        let plain = user(&host, "plain@t.dev", "Plain", &[Permission::Playback]);

        let sent = emit(&host, &Audience::permission(Permission::RequestsManage), &spec());
        assert_eq!(sent, 1);

        let conn = host.db().get().unwrap();
        assert_eq!(db::notifications::unread_count(&conn, &mod_).unwrap(), 1);
        assert_eq!(db::notifications::unread_count(&conn, &plain).unwrap(), 0);
    }

    #[test]
    fn everyone_audience_reaches_every_account() {
        let host = recording_host();
        let a = user(&host, "a@t.dev", "A", &[]);
        let b = user(&host, "b@t.dev", "B", &[]);
        assert_eq!(emit(&host, &Audience::Everyone, &spec()), 2);
        let conn = host.db().get().unwrap();
        assert_eq!(db::notifications::unread_count(&conn, &a).unwrap(), 1);
        assert_eq!(db::notifications::unread_count(&conn, &b).unwrap(), 1);
    }

    #[test]
    fn a_muted_category_is_skipped_without_a_row_or_an_event() {
        let host = recording_host();
        let ana = user(&host, "ana@t.dev", "Ana", &[]);
        db::notifications::set_prefs(
            host.db(),
            &ana,
            &[kroma_domain::CategoryPref {
                category: NotificationCategory::Requests,
                in_app: false,
                push: false,
            }],
        )
        .unwrap();

        assert_eq!(emit(&host, &Audience::user(ana.clone()), &spec()), 0);
        let conn = host.db().get().unwrap();
        assert_eq!(db::notifications::unread_count(&conn, &ana).unwrap(), 0);
        assert!(host.published().is_empty(), "muted user should not be woken");
    }

    #[test]
    fn muting_one_category_leaves_the_others_alone() {
        let host = recording_host();
        let ana = user(&host, "ana@t.dev", "Ana", &[]);
        db::notifications::set_prefs(
            host.db(),
            &ana,
            &[kroma_domain::CategoryPref {
                category: NotificationCategory::Media,
                in_app: false,
                push: false,
            }],
        )
        .unwrap();
        // The spec is a `requests` event, which is untouched by the media mute.
        assert_eq!(emit(&host, &Audience::user(ana), &spec()), 1);
    }

    #[test]
    fn an_unknown_user_id_notifies_nobody() {
        let host = recording_host();
        user(&host, "ana@t.dev", "Ana", &[]);
        assert_eq!(emit(&host, &Audience::user("ghost"), &spec()), 0);
        assert!(host.published().is_empty());
    }

    #[test]
    fn each_emission_mints_a_distinct_id() {
        let host = recording_host();
        let ana = user(&host, "ana@t.dev", "Ana", &[]);
        emit(&host, &Audience::user(ana.clone()), &spec());
        emit(&host, &Audience::user(ana.clone()), &spec());
        let conn = host.db().get().unwrap();
        // Two rows, not one clobbered by a colliding primary key.
        assert_eq!(db::notifications::unread_count(&conn, &ana).unwrap(), 2);
    }
    /// A show plus one episode, and the three independent ways an account can
    /// come to follow it.
    fn seed_show(host: &RecordingHost) {
        let conn = host.db().get().unwrap();
        conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','now')", []).unwrap();
        conn.execute("INSERT INTO shows (id,library,title,added_at) VALUES ('shw','lib','Show','now')", []).unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES ('ep1','episode','E','mkv','lib','shw',1,1,'now')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn a_follower_is_anyone_who_listed_watched_or_started_the_show() {
        // Three separate signals, deliberately unioned: someone who added the
        // show to their list has never played it, and someone mid-season may
        // never have used the list. Missing any of them means a new episode is
        // announced to the wrong people.
        let host = recording_host();
        seed_show(&host);
        let lister = user(&host, "l@t.dev", "Lister", &[]);
        let watcher = user(&host, "w@t.dev", "Watcher", &[]);
        let viewer = user(&host, "v@t.dev", "Viewer", &[]);
        let stranger = user(&host, "s@t.dev", "Stranger", &[]);

        let conn = host.db().get().unwrap();
        conn.execute(
            "INSERT INTO my_list (user_id,item_id,added_at) VALUES (?1,'shw',0)",
            [&lister],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO watched (user_id,item_id,watched_at) VALUES (?1,'shw',0)",
            [&watcher],
        )
        .unwrap();
        // Progress is recorded against the EPISODE, and has to resolve up to the
        // show it belongs to.
        conn.execute(
            "INSERT INTO progress (user_id,item_id,position_ms,duration_ms,updated_at) VALUES (?1,'ep1',60000,600000,0)",
            [&viewer],
        )
        .unwrap();
        drop(conn);

        assert_eq!(emit(&host, &Audience::followers("shw"), &spec()), 3);
        let conn = host.db().get().unwrap();
        for follower in [&lister, &watcher, &viewer] {
            assert_eq!(
                db::notifications::unread_count(&conn, follower).unwrap(),
                1,
                "follower {follower} was missed"
            );
        }
        assert_eq!(db::notifications::unread_count(&conn, &stranger).unwrap(), 0);
    }

    #[test]
    fn following_a_show_twice_still_only_notifies_once() {
        // The three signals are a UNION, not a sum: someone who listed a show AND
        // is watching it must not get the same episode announced twice.
        let host = recording_host();
        seed_show(&host);
        let keen = user(&host, "k@t.dev", "Keen", &[]);
        let conn = host.db().get().unwrap();
        conn.execute("INSERT INTO my_list (user_id,item_id,added_at) VALUES (?1,'shw',0)", [&keen]).unwrap();
        conn.execute("INSERT INTO watched (user_id,item_id,watched_at) VALUES (?1,'shw',0)", [&keen]).unwrap();
        conn.execute(
            "INSERT INTO progress (user_id,item_id,position_ms,duration_ms,updated_at) VALUES (?1,'ep1',1,2,0)",
            [&keen],
        )
        .unwrap();
        drop(conn);

        assert_eq!(emit(&host, &Audience::followers("shw"), &spec()), 1);
        let conn = host.db().get().unwrap();
        assert_eq!(db::notifications::unread_count(&conn, &keen).unwrap(), 1);
    }

    #[test]
    fn a_show_nobody_follows_notifies_nobody() {
        let host = recording_host();
        seed_show(&host);
        user(&host, "a@t.dev", "A", &[]);
        assert_eq!(emit(&host, &Audience::followers("shw"), &spec()), 0);
        assert_eq!(emit(&host, &Audience::followers("no-such-show"), &spec()), 0);
        assert!(host.published().is_empty());
    }

    #[test]
    fn the_row_the_push_renders_from_is_the_one_just_written() {
        // `deliver` re-reads the notification it just inserted to render it for
        // the device, via `ORDER BY created_at DESC LIMIT 1`. Two notifications
        // landing in the same millisecond tie on that column, so this pins that
        // the freshly-written row is still findable - if the lookup ever stops
        // matching, the push is silently dropped while the in-app row is fine,
        // which is close to invisible in production.
        let host = recording_host();
        let ana = user(&host, "ana@t.dev", "Ana", &[]);
        emit(&host, &Audience::user(ana.clone()), &spec());
        emit(&host, &Audience::user(ana.clone()), &spec());

        let conn = host.db().get().unwrap();
        let rows = db::notifications::list_notifications(&conn, &ana, 10, false).unwrap();
        assert_eq!(rows.len(), 2);
        // Distinct ids, and the newest-first window of size 1 finds one of them
        // rather than nothing.
        assert_ne!(rows[0].id, rows[1].id);
        let newest = db::notifications::list_notifications(&conn, &ana, 1, false).unwrap();
        assert_eq!(newest.len(), 1);
        assert!(rows.iter().any(|r| r.id == newest[0].id));
    }
}
