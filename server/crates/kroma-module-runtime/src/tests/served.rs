use std::time::{Duration, Instant};

use axum::http::StatusCode;
use kroma_module_host::{Audience, Event, HostCtx, NotificationSpec};
use kroma_module_wire::Permission;

use super::{running, user, EVENTS, HOST_TOKEN, UNDECLARED};

#[test]
fn settings_are_asked_of_the_core_by_kind() {
    let running = running();

    let text = running.host.setting_str("greeting", "bye");
    let flag = running.host.setting_bool("loud", false);
    let count = running.host.setting_i64("retries", 1);

    assert_eq!((text.as_str(), flag, count), ("hello", true, 42));
    let asked = running.core.to("/api/_host/setting");
    assert!(asked
        .iter()
        .any(|c| c.query.contains("key=greeting") && c.query.contains("default=bye")));
}

#[test]
fn a_settings_patch_and_events_are_posted_to_the_core() {
    let running = running();
    let patch = [("theme".to_string(), serde_json::json!("dark"))].into();

    running.host.set_settings(patch);
    running
        .host
        .publish(Event::new("demo.made", serde_json::json!({ "n": 1 })));
    running
        .host
        .publish_to("u9", Event::new("demo.private", serde_json::json!(null)));
    running.host.trigger_job("demo.job", "because");

    assert!(running.core.to("/api/_host/settings")[0]
        .body
        .contains("dark"));
    assert!(running.core.to("/api/_host/events")[0]
        .body
        .contains("demo.made"));
    assert!(running.core.to("/api/_host/events_to")[0]
        .body
        .contains("u9"));
    assert!(running
        .core
        .to("/api/_host/job")
        .iter()
        .any(|c| c.body.contains("because")));
}

#[test]
fn a_notification_returns_how_many_the_core_sent() {
    let running = running();
    let spec: NotificationSpec = serde_json::from_value(serde_json::json!({
        "event": "media.added",
        "titleKey": "a",
        "bodyKey": "b",
    }))
    .expect("a spec");

    let sent = running.host.notify(&Audience::Everyone, &spec);

    assert_eq!(sent, 3);
}

#[test]
fn a_type_the_core_refuses_tells_nobody() {
    let running = running();

    let sent = running
        .host
        .notify(&Audience::Everyone, &NotificationSpec::declared(UNDECLARED));

    assert_eq!(sent, 0);
}

#[test]
fn a_module_names_its_own_subject_and_the_core_forwards_it() {
    let running = running();
    let spec: NotificationSpec = serde_json::from_value(serde_json::json!({
        "event": "custom",
        "titleKey": "a",
        "bodyKey": "b",
        "subject": { "kind": "tv.kroma.torrents/torrent", "id": "abc" },
        "actorId": "u9",
        "data": { "ratio": 1.5 },
    }))
    .expect("a spec");

    running.host.notify(&Audience::Everyone, &spec);

    let calls = running.core.to("/api/_host/notify");
    assert!(
        calls.iter().any(|call| {
            call.body.contains("tv.kroma.torrents/torrent")
                && call.body.contains("\"actorId\":\"u9\"")
                && call.body.contains("ratio")
        }),
        "{calls:?}"
    );
}

#[test]
fn lookups_fall_through_to_the_core_answer() {
    let running = running();

    let enabled = running.host.module_enabled("tv.kroma.other");
    let folders = running.host.library_folders();
    let secret = running.host.secret("api");
    let contributions = running.host.contributions("acquisition");

    assert!(!enabled);
    assert_eq!(folders[0].folders, vec!["/films".to_string()]);
    assert_eq!(secret.as_deref(), Some("s3cret"));
    assert_eq!(contributions[0].module_id, "tv.kroma.peer");
}

#[test]
fn the_metadata_language_is_cached_after_the_first_answer() {
    let running = running();

    let first = running.host.metadata_language();
    let second = running.host.metadata_language();

    assert_eq!((first.as_str(), second.as_str()), ("fr-FR", "fr-FR"));
    assert_eq!(running.core.to("/api/_host/metadata-language").len(), 1);
}

#[test]
fn a_session_is_resolved_by_the_core() {
    let running = running();

    let resolved = running.host.session_user("tok");

    assert_eq!(resolved.map(|u| u.username), Some("ann".to_string()));
    assert!(running.core.to("/api/_host/session")[0]
        .body
        .contains("tok"));
}

#[test]
fn permissions_are_checked_locally() {
    let running = running();
    let admin = user(&["library.manage"]);
    let viewer = user(&["playback"]);

    let allowed = running.host.require(&admin, Permission::LibraryManage);
    let refused = running.host.require(&viewer, Permission::LibraryManage);
    let any_admin = running.host.require_any_admin(&admin);
    let not_admin = running.host.require_any_admin(&viewer);

    assert!(allowed.is_ok() && any_admin.is_ok());
    assert_eq!(refused.unwrap_err().status(), StatusCode::FORBIDDEN);
    assert_eq!(not_admin.unwrap_err().status(), StatusCode::FORBIDDEN);
    assert_eq!(
        running
            .host
            .lerr(&viewer, StatusCode::NOT_FOUND, "gone")
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[test]
fn a_registered_service_resolves_by_type() {
    let running = running();
    running.host.register_service(std::sync::Arc::new(7_u32));

    let found = running.host.get_service(std::any::TypeId::of::<u32>());
    let missing = running.host.get_service(std::any::TypeId::of::<u64>());

    assert_eq!(
        found.and_then(|s| s.downcast::<u32>().ok()).as_deref(),
        Some(&7)
    );
    assert!(missing.is_none());
    assert_eq!(running.host.module_id(), "tv.kroma.demo");
}

#[test]
fn the_core_is_told_about_jobs_and_topics_once_listening() {
    let running = running();

    let jobs = running.core.wait_for("/api/_host/register-job", 3);
    let topics = running.core.wait_for("/api/_host/register-events", 1);

    assert_eq!(jobs.len(), 3);
    assert!(jobs.iter().any(|c| c.body.contains("0 * * * *")));
    assert_eq!(topics.len(), 1);
    assert!(topics[0].body.contains("demo.ping") && topics[0].body.contains("demo.other"));
}

#[test]
fn a_job_run_reports_its_outcome_to_the_scheduler() {
    let running = running();

    let done = running.post("/_job/run/demo.ping", HOST_TOKEN, serde_json::json!({}));
    let failed = running.post("/_job/run/demo.fail", HOST_TOKEN, serde_json::json!({}));
    let panicked = running.post("/_job/run/demo.explode", HOST_TOKEN, serde_json::json!({}));
    let unknown = running.post("/_job/run/demo.nope", HOST_TOKEN, serde_json::json!({}));
    let unauthorised = running.post("/_job/run/demo.ping", "wrong", serde_json::json!({}));

    assert_eq!(
        (done, failed, panicked, unknown, unauthorised),
        (200, 500, 500, 404, 401)
    );
    assert!(running
        .core
        .to("/api/_host/job")
        .iter()
        .any(|c| c.body.contains("demo.ran")));
}

#[test]
fn an_event_is_delivered_to_the_module_that_asked_for_its_topic() {
    let running = running();

    let accepted = running.post(
        "/_event/demo.ping",
        HOST_TOKEN,
        serde_json::json!({ "n": 5 }),
    );
    let unknown = running.post("/_event/demo.unasked", HOST_TOKEN, serde_json::json!({}));
    let unauthorised = running.post("/_event/demo.ping", "wrong", serde_json::json!({}));

    assert_eq!((accepted, unknown, unauthorised), (202, 404, 401));
    let deadline = Instant::now() + Duration::from_secs(10);
    while EVENTS.lock().unwrap().is_empty() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(EVENTS.lock().unwrap()[0].0, "demo.ping");
}

#[cfg(not(feature = "storage"))]
#[test]
fn a_module_with_a_schema_is_refused_without_the_storage_capability() {
    let dir = super::scratch("needs-schema");
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");

    let outcome = rt.block_on(crate::serve::started(
        super::env(
            dir.path(),
            "tv.kroma.needs-schema",
            &dir.path().join("core.sock"),
        ),
        |_| axum::Router::new(),
        vec![Box::new(super::NeedsSchema)],
    ));

    let message = format!("{:#}", outcome.map(|_| ()).unwrap_err());
    assert!(
        message.contains("without the storage capability"),
        "{message}"
    );
}
