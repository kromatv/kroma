use super::*;
use crate::services::requests::test_fixtures::{param, req, req_by, user};
use crate::services::requests::test_support::{seed_movie_item, seed_show, test_host};

#[test]
fn only_the_four_outcomes_worth_interrupting_someone_for_notify() {
    let host = test_host();
    let silent = [
        RequestStatus::Pending,
        RequestStatus::Searching,
        RequestStatus::Downloading,
        RequestStatus::Importing,
        RequestStatus::Failed,
    ];
    for status in silent {
        notify_requester(
            &host,
            &req_by(RequestKind::Movie, status, "u1"),
            status,
            "/requests",
        );
    }
    assert!(
        host.notifications().is_empty(),
        "{silent:?} must stay quiet"
    );

    for status in [
        RequestStatus::Approved,
        RequestStatus::Denied,
        RequestStatus::Available,
        RequestStatus::PartiallyAvailable,
    ] {
        notify_requester(
            &host,
            &req_by(RequestKind::Movie, status, "u1"),
            status,
            "/requests",
        );
    }
    let sent = host.notifications();
    assert_eq!(sent.len(), 4);
    let events: Vec<NotificationEvent> = sent.iter().map(|(_, s)| s.event).collect();
    assert_eq!(
        events,
        [
            NotificationEvent::RequestApproved,
            NotificationEvent::RequestDenied,
            NotificationEvent::RequestAvailable,
            // Partially available still means "there is something to watch now".
            NotificationEvent::RequestAvailable,
        ]
    );
    for (audience, _) in &sent {
        assert_eq!(audience, &Audience::user("u1"));
    }
    assert_eq!(sent[0].1.title_key, "notifications.request.approved.title");
    assert_eq!(sent[1].1.body_key, "notifications.request.denied.body");
    assert_eq!(sent[2].1.title_key, "notifications.request.available.title");
}

#[test]
fn a_request_filed_before_accounts_existed_has_nobody_to_tell() {
    let host = test_host();
    let orphan = req(RequestKind::Movie, RequestStatus::Approved);
    assert!(orphan.requested_by.is_none());
    notify_requester(&host, &orphan, RequestStatus::Approved, "/requests");
    assert!(host.notifications().is_empty());
}

#[test]
fn a_denial_carries_the_moderators_note_and_only_a_denial_does() {
    let host = test_host();
    let mut denied = req_by(RequestKind::Movie, RequestStatus::Denied, "u1");
    denied.note = Some("we already have this in 4K".into());
    notify_requester(&host, &denied, RequestStatus::Denied, "/requests");

    let mut approved = denied.clone();
    approved.status = RequestStatus::Approved;
    notify_requester(&host, &approved, RequestStatus::Approved, "/requests");

    let sent = host.notifications();
    assert_eq!(
        param(&sent[0].1.params, "note").as_deref(),
        Some("we already have this in 4K")
    );
    assert_eq!(param(&sent[1].1.params, "note"), None);
    assert_eq!(param(&sent[0].1.params, "title").as_deref(), Some("Title"));
    assert_eq!(param(&sent[1].1.params, "title").as_deref(), Some("Title"));
}

#[test]
fn only_a_ready_to_watch_notification_gets_a_button() {
    let host = test_host();
    let mut ready = req_by(RequestKind::Movie, RequestStatus::Available, "u1");
    ready.poster_url = Some("https://img.example/p.jpg".into());
    notify_requester(&host, &ready, RequestStatus::Available, "/movie/abc");
    notify_requester(
        &host,
        &req_by(RequestKind::Movie, RequestStatus::Approved, "u1"),
        RequestStatus::Approved,
        "/requests",
    );

    let sent = host.notifications();
    let available = &sent[0].1;
    assert_eq!(available.push_category, Some(PushCategory::MediaAvailable));
    assert_eq!(available.actions.len(), 1);
    let watch = &available.actions[0];
    assert_eq!(watch.id, "watch");
    assert_eq!(watch.kind, ActionKind::Link);
    assert_eq!(watch.href, "/movie/abc");
    assert_eq!(watch.method, None);
    assert_eq!(available.link.as_deref(), Some("/movie/abc"));
    assert_eq!(
        available.image_url.as_deref(),
        Some("https://img.example/p.jpg")
    );

    assert!(sent[1].1.actions.is_empty());
    assert_eq!(sent[1].1.push_category, None);
}

#[test]
fn moderators_can_decide_from_the_notification_itself() {
    let host = test_host();
    let mut pending = req(RequestKind::Show, RequestStatus::Pending);
    pending.id = "req-7".into();
    notify_moderators(&host, &pending, &user("alice", vec![Permission::Playback]));

    let sent = host.notifications();
    assert_eq!(sent.len(), 1);
    let (audience, spec) = &sent[0];
    assert_eq!(audience, &Audience::permission(Permission::RequestsManage));
    assert_eq!(spec.event, NotificationEvent::RequestSubmitted);
    assert_eq!(param(&spec.params, "user").as_deref(), Some("alice"));
    assert_eq!(spec.link.as_deref(), Some("/admin/requests/req-7"));
    assert_eq!(
        spec.subject,
        Some(crate::model::NotificationSubject::request("req-7"))
    );
    assert_eq!(spec.push_category, Some(PushCategory::RequestReview));

    let ids: Vec<&str> = spec.actions.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(ids, ["approve", "deny"]);
    for action in &spec.actions {
        assert_eq!(action.kind, ActionKind::Api);
        assert_eq!(action.method.as_deref(), Some("POST"));
        assert!(action.href.contains("req-7"), "{}", action.href);
    }
    assert_eq!(sent[0].1.actions[0].style, ActionStyle::Primary);
    assert_eq!(sent[0].1.actions[1].style, ActionStyle::Danger);
}

#[test]
fn a_notification_links_to_the_title_once_it_is_in_the_library() {
    let host = test_host();
    let away = req(RequestKind::Movie, RequestStatus::Pending);
    assert_eq!(request_link(&host, &away), "/requests");

    seed_movie_item(&host, "item-9", 42);
    assert_eq!(request_link(&host, &away), "/movies/item-9");

    let show = req(RequestKind::Show, RequestStatus::Pending);
    assert_eq!(
        request_link(&host, &show),
        "/requests",
        "no show with that tmdb id yet"
    );
    seed_show(&host, "show-9", 42, &[]);
    assert_eq!(request_link(&host, &show), "/shows/show-9");
}

#[test]
fn a_moderators_row_names_the_request_and_the_account_that_filed_it() {
    let host = test_host();
    let mut pending = req(RequestKind::Show, RequestStatus::Pending);
    pending.id = "req-7".into();
    let requester = user("alice", vec![Permission::Playback]);

    notify_moderators(&host, &pending, &requester);

    let spec = &host.notifications()[0].1;
    assert_eq!(spec.actor_id.as_deref(), Some(requester.id.as_str()));
    assert_eq!(
        spec.data,
        Some(serde_json::json!({
            "requestId": "req-7",
            "kind": "show",
            "tmdbId": 42,
            "status": "pending",
        }))
    );
}

#[test]
fn a_requesters_row_names_the_request_and_the_moderator_who_decided_it() {
    let host = test_host();
    let mut denied = req_by(RequestKind::Movie, RequestStatus::Denied, "u1");
    denied.id = "req-7".into();
    denied.reviewed_by = Some("mod-1".into());

    notify_requester(&host, &denied, RequestStatus::Denied, "/requests");

    let spec = &host.notifications()[0].1;
    assert_eq!(
        spec.subject,
        Some(crate::model::NotificationSubject::request("req-7"))
    );
    assert_eq!(spec.actor_id.as_deref(), Some("mod-1"));
    assert_eq!(spec.data.as_ref().unwrap()["status"], "denied");
}

#[test]
fn an_arrival_the_server_reached_on_its_own_names_no_actor() {
    let host = test_host();
    let arrived = req_by(RequestKind::Movie, RequestStatus::Available, "u1");

    notify_requester(&host, &arrived, RequestStatus::Available, "/requests");

    assert_eq!(host.notifications()[0].1.actor_id, None);
}

fn delivering_state() -> (crate::state::SharedState, String) {
    let state = crate::test_support::test_state();
    let user = kroma_db::create_user(&state.db, "ana@test.dev", "Ana", "h", &[])
        .unwrap()
        .id;
    (state, user)
}

fn told(state: &crate::state::SharedState, user: &str) -> usize {
    let conn = state.db.get().unwrap();
    db::notifications::list_notifications(&conn, user, 50, false)
        .unwrap()
        .len()
}

#[test]
fn a_request_flapping_between_partial_and_available_is_told_once_per_status() {
    let (state, user) = delivering_state();
    let mut req = req_by(RequestKind::Show, RequestStatus::PartiallyAvailable, &user);
    req.id = "req-flap".into();

    for status in [
        RequestStatus::PartiallyAvailable,
        RequestStatus::Available,
        RequestStatus::PartiallyAvailable,
        RequestStatus::Available,
    ] {
        notify_requester(&state, &req, status, "/requests");
    }

    assert_eq!(told(&state, &user), 2);
}

#[test]
fn two_requests_reaching_the_same_status_are_two_pieces_of_news() {
    let (state, user) = delivering_state();
    let mut dune = req_by(RequestKind::Movie, RequestStatus::Available, &user);
    dune.id = "req-dune".into();
    let mut arrival = req_by(RequestKind::Movie, RequestStatus::Available, &user);
    arrival.id = "req-arrival".into();

    notify_requester(&state, &dune, RequestStatus::Available, "/requests");
    notify_requester(&state, &arrival, RequestStatus::Available, "/requests");

    assert_eq!(told(&state, &user), 2);
}

#[test]
fn a_key_names_the_event_the_request_and_the_status_it_reached() {
    let host = test_host();
    let mut req = req_by(RequestKind::Movie, RequestStatus::Denied, "u1");
    req.id = "req-7".into();

    notify_requester(&host, &req, RequestStatus::Denied, "/requests");

    assert_eq!(
        host.notifications()[0].1.dedupe_key.as_deref(),
        Some("request.denied:req-7:denied")
    );
}
