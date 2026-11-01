use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use kroma_domain::{NotificationCategory, NotificationEvent, NotificationSpec};
use kroma_module_host::ModuleNotifications;

use super::test_support::{completed, declaring_torrents, torrents, COMPLETED, MODULE};
use super::*;

#[test]
fn a_declared_spec_takes_its_category_and_keys_from_the_declaration() {
    let types = declaring_torrents();
    let spec = NotificationSpec::declared(COMPLETED).param("title", "Dune");

    let completed = types.complete(&spec).unwrap();

    assert_eq!(completed.category(), NotificationCategory::Downloads);
    assert_eq!(completed.title_key, "notifications.completed.title");
    assert_eq!(completed.body_key, "notifications.completed.body");
}

#[test]
fn a_type_no_installed_module_declares_completes_to_nothing() {
    let types = declaring_torrents();

    let spec = NotificationSpec::declared("tv.kroma.torrents/download.vanished");

    assert!(types.complete(&spec).is_none());
}

#[test]
fn a_spec_that_names_no_type_is_left_as_it_was() {
    let spec = NotificationSpec::custom(NotificationCategory::Downloads, "Hi", "There");

    let completed = NotificationTypes::default().complete(&spec).unwrap();

    assert!(matches!(completed, Cow::Borrowed(_)));
}

#[test]
fn a_core_event_is_weighed_as_its_own_type_and_pushes_unasked() {
    let spec = NotificationSpec::new(NotificationEvent::SystemJobFailed, "t", "b");

    let types = NotificationTypes::default();

    let kind = types.kind_of(&spec).unwrap();

    assert_eq!(kind.name, "system.job.failed");
    assert!(kind.pushes);
}

#[test]
fn a_declared_type_is_weighed_with_the_push_its_module_declared() {
    let types = declaring_torrents();
    let spec = NotificationSpec::declared(COMPLETED);

    let kind = types.kind_of(&spec).unwrap();

    assert_eq!(kind.name, COMPLETED);
    assert!(!kind.pushes);
}

#[test]
fn free_text_from_a_module_has_no_type_and_follows_its_category() {
    let spec = NotificationSpec::custom(NotificationCategory::Downloads, "Hi", "There");

    assert!(declaring_torrents().kind_of(&spec).is_none());
}

#[test]
fn the_list_holds_every_core_event_a_reader_can_get_and_the_types_of_enabled_modules() {
    let types = declaring_torrents();

    let listed = types.listed(|_| true);

    let names: Vec<&str> = listed.iter().map(|l| l.name).collect();
    assert!(names.contains(&"system.job.failed"));
    assert!(names.contains(&"system.disk.low"));
    assert!(names.contains(&COMPLETED));
    assert!(!names.contains(&"system.test"));
    assert!(!names.contains(&"custom"));
}

#[test]
fn a_disabled_modules_types_are_not_listed() {
    let types = declaring_torrents();

    let listed = types.listed(|id| id != MODULE);

    assert!(listed.iter().all(|l| l.name != COMPLETED));
}

#[test]
fn a_kind_is_labelled_in_its_readers_language_from_its_own_catalog() {
    let types = declaring_torrents();
    let listed = types.listed(|_| true);
    let job = listed
        .iter()
        .find(|l| l.name == "system.job.failed")
        .unwrap();
    let completed = listed.iter().find(|l| l.name == COMPLETED).unwrap();

    assert_eq!(types.label(job, "en"), "Task failed");
    assert_eq!(types.label(completed, "en"), "Finished downloads");
    assert_eq!(types.label(completed, "fr"), "Finished downloads");
}

#[test]
fn a_module_whose_catalogs_do_not_load_still_declares_its_types() {
    let broken = ModuleNotifications {
        catalogs: vec![("en".into(), "{ not json".into())],
        ..torrents()
    };

    let types = NotificationTypes::from_modules(&[broken]);

    assert_eq!(types.declared(COMPLETED), Some(&completed()));
    assert!(!types
        .wording(Some(COMPLETED))
        .knows("notifications.completed.title"));
}

#[test]
fn the_declared_types_are_built_again_only_once_the_listing_changes() {
    let reads = Arc::new(AtomicUsize::new(0));
    let listing = Arc::new(vec![torrents()]);
    let declared = {
        let reads = reads.clone();
        let listing = listing.clone();
        DeclaredTypes::new(move || {
            reads.fetch_add(1, Ordering::Relaxed);
            listing.clone()
        })
    };

    let first = declared.current();
    let second = declared.current();

    assert!(Arc::ptr_eq(&first, &second));
    assert_eq!(reads.load(Ordering::Relaxed), 2);
    assert!(first.declared(COMPLETED).is_some());
}

#[test]
fn a_host_with_nothing_registered_knows_the_core_alone() {
    let host = crate::test_support::test_state();

    let types = types_of(&host);

    assert!(types.declared(COMPLETED).is_none());
    assert!(types.listed(|_| true).iter().all(|l| l.module.is_none()));
}

fn declaring_state() -> crate::state::SharedState {
    let listing = Arc::new(vec![torrents()]);
    crate::test_support::test_state_with_service(DeclaredTypes::new(move || listing.clone()))
}

fn reader(state: &crate::state::SharedState, email: &str, language: Option<&str>) -> String {
    let id = kroma_db::create_user(&state.db, email, email, "h", &[])
        .unwrap()
        .id;
    state
        .db
        .get()
        .unwrap()
        .execute(
            "UPDATE users SET language = ?1 WHERE id = ?2",
            [language, Some(id.as_str())],
        )
        .unwrap();
    id
}

fn rendered_titles(state: &crate::state::SharedState, user: &str, locale: &str) -> Vec<String> {
    let conn = state.db.get().unwrap();
    let rows = kroma_db::notifications::list_notifications(&conn, user, 10, false).unwrap();
    let types = types_of(state);
    rows.iter()
        .map(|row| {
            crate::services::notify::render::render(
                row,
                locale,
                &crate::services::notify::subject::Subjects::default(),
                &types,
            )
            .title
        })
        .collect()
}

#[test]
fn a_declared_type_reaches_each_reader_in_their_own_language() {
    let state = declaring_state();
    let ana = reader(&state, "ana@t.dev", Some("fr"));
    let bo = reader(&state, "bo@t.dev", Some("en"));
    let spec = NotificationSpec::declared(COMPLETED).param("title", "Dune.2021");

    let sent = crate::services::notify::emit(&state, &kroma_domain::Audience::Everyone, &spec);

    assert_eq!(sent, 2);
    assert_eq!(
        rendered_titles(&state, &ana, "fr"),
        ["Téléchargement terminé"]
    );
    assert_eq!(rendered_titles(&state, &bo, "en"), ["Download finished"]);
}

#[test]
fn a_type_no_installed_module_declares_tells_nobody() {
    let state = declaring_state();
    let ana = reader(&state, "ana@t.dev", None);
    let spec = NotificationSpec::declared("tv.kroma.torrents/download.vanished");

    let sent =
        crate::services::notify::emit(&state, &kroma_domain::Audience::user(ana.clone()), &spec);

    assert_eq!(sent, 0);
    assert!(rendered_titles(&state, &ana, "fr").is_empty());
}

#[test]
fn a_module_settles_its_declared_rows_by_their_subject() {
    let state = declaring_state();
    let ana = reader(&state, "ana@t.dev", None);
    let subject = kroma_domain::NotificationSubject::new("tv.kroma.torrents/download", "d1");
    let spec = NotificationSpec::declared(COMPLETED).subject(subject.clone());
    crate::services::notify::emit(&state, &kroma_domain::Audience::user(ana.clone()), &spec);

    let settled =
        crate::services::notify::resolve(&state, &subject, NotificationEvent::Custom, None);

    assert_eq!(settled, 1);
    let conn = state.db.get().unwrap();
    let rows = kroma_db::notifications::list_notifications(&conn, &ana, 10, false).unwrap();
    assert!(rows[0].resolved_at.is_some());
}
