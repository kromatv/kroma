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
    assert_eq!(spec.link.as_deref(), Some("/admin/requests"));
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
