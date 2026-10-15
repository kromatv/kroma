use axum::http::StatusCode;
use serde_json::json;

use kroma_module_wire::Permission;

use super::super::fixtures::{candidate, episode, user};
use super::*;
use crate::{Event, HostCtx, HostStorage};

// Every crate that tests against the seam now leans on these answers, so a
// change to any of them shifts behaviour in tests that never mention this
// file. That is what makes pinning them worth doing.

#[test]
fn an_unconfigured_stub_answers_neutrally() {
    let host = StubHost::new();

    // Settings hand back the CALLER'S default, so code under test sees its
    // own fallback rather than a value this file invented.
    assert_eq!(host.setting_str("anything", "fallback"), "fallback");
    assert!(host.setting_bool("anything", true));
    assert!(!host.setting_bool("anything", false));
    assert_eq!(host.setting_i64("anything", -7), -7);

    // Gates allow: a test about a handler's behaviour should not have to
    // grant permissions first. Tests about GATING use a real host.
    assert!(host.require(&user(), Permission::LibraryManage).is_ok());
    assert!(host.require_any_admin(&user()).is_ok());

    assert!(host.module_enabled("tv.kroma.anything"));
    assert!(host.library_folders().is_empty());
    assert!(host.secret("tmdb").is_none());
    assert_eq!(host.metadata_language(), "en");
    assert!(host.metadata_candidates("Dune", "movie", None).is_empty());
    assert!(host.metadata_episodes(1399, 1).is_empty());
    assert!(host.get_service(TypeId::of::<u32>()).is_none());
    assert!(host.data_dir().is_dir());
}

#[test]
fn each_builder_overrides_exactly_its_own_answer() {
    let host = StubHost::new()
        .with_tmdb_key("k")
        .with_metadata_language("fr-FR")
        .with_metadata_candidates(vec![candidate()])
        .with_metadata_episodes(vec![episode()])
        .with_module_enabled(false)
        .with_libraries(vec![LibraryFolders {
            id: "lib1".into(),
            kind: "movies".into(),
            name: "Films".into(),
            folders: vec!["/media/films".into()],
        }])
        .with_setting("str", json!("set"))
        .with_setting("flag", json!(true))
        .with_setting("num", json!(42));

    assert_eq!(host.secret("tmdb").as_deref(), Some("k"));
    assert_eq!(host.metadata_language(), "fr-FR");
    assert_eq!(
        host.metadata_candidates("anything", "movie", None)[0].tmdb_id,
        438631
    );
    assert_eq!(host.metadata_episodes(1399, 2)[0].episode, 1);
    assert!(!host.module_enabled("tv.kroma.anything"));
    assert_eq!(host.library_folders()[0].folders, ["/media/films"]);
    assert_eq!(host.setting_str("str", "fallback"), "set");
    assert!(host.setting_bool("flag", false));
    assert_eq!(host.setting_i64("num", 0), 42);

    // An unseeded key still falls back, next to the seeded ones.
    assert_eq!(host.setting_str("other", "fallback"), "fallback");
}

#[test]
fn a_string_settings_source_takes_over_from_the_seeded_map() {
    // The source sees the CALLER'S default, so a store with its own
    // registered defaults can answer through the seam exactly as it would
    // directly - which is the only reason this hook exists.
    let host = StubHost::new()
        .with_setting("k", json!("from the map"))
        .with_string_settings(|key, default| format!("{key}/{default}"));

    assert_eq!(host.setting_str("k", "fallback"), "k/fallback");
    assert_eq!(host.setting_str("other", "d"), "other/d");
    // Only strings route through it; the map still answers the rest.
    assert!(host.setting_bool("flag", true));
}

#[test]
fn a_seeded_setting_that_is_not_a_string_still_reads_as_one() {
    // Settings are stored as JSON, and a caller asking for a string should
    // get the value rather than an empty default that hides the mismatch.
    let host = StubHost::new().with_setting("num", json!(42));
    assert_eq!(host.setting_str("num", "fallback"), "42");
}

#[test]
fn services_resolve_by_the_type_they_were_registered_under() {
    struct Manager(u32);
    struct Other;
    let host = StubHost::new().with_service(Arc::new(Manager(42)));

    let got = crate::service::<Manager>(&host).expect("registered");
    assert_eq!(got.0, 42);
    assert!(crate::service::<Other>(&host).is_none());
}

#[test]
fn a_stub_without_a_database_says_so_instead_of_handing_one_out() {
    let host = StubHost::new();
    // `Pool` is not Debug, so map the Ok side away before unwrapping.
    let err = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = host.db();
    }))
    .unwrap_err();
    let msg = err
        .downcast_ref::<String>()
        .expect("expect() panics with a String");
    assert!(msg.contains("StubHost::with_db"), "{msg}");
}

#[test]
fn a_seeded_session_resolves_and_an_unknown_token_does_not() {
    let host = StubHost::new().with_session("tok", user());
    assert_eq!(
        host.session_user("tok").map(|u| u.id),
        Some("u1".to_string())
    );
    assert!(host.session_user("other").is_none());
}

#[test]
fn with_db_hands_out_a_writable_pool_and_never_the_same_file_twice() {
    let a = StubHost::with_db("selftest");
    let b = StubHost::with_db("selftest");
    let ddl = "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)";
    for host in [&a, &b] {
        host.db().get().unwrap().execute(ddl, []).unwrap();
    }
    // Separate: a row in one is not in the other. Two tests running in
    // parallel threads of one process must not share a database.
    a.db()
        .get()
        .unwrap()
        .execute("INSERT INTO settings (key, value) VALUES ('k', 'v')", [])
        .unwrap();
    let n: i64 = b
        .db()
        .get()
        .unwrap()
        .query_row("SELECT count(*) FROM settings WHERE key = 'k'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn lerr_carries_the_status_it_was_given() {
    let host = StubHost::new();
    assert_eq!(
        host.lerr(&user(), StatusCode::NOT_FOUND, "k").status(),
        StatusCode::NOT_FOUND
    );
}

#[test]
fn the_stub_answers_every_required_method_neutrally() {
    // The seam has ~25 methods and a double is only useful if the ones a
    // test is NOT about stay out of the way: settings hand back the caller's
    // own default, gates allow, and the optional capabilities are absent.
    let host = StubHost::new();
    host.publish(Event::new("scan.finished", json!({})));
    assert_eq!(host.topics(), ["scan.finished"]);
    assert_eq!(host.setting_str("k", "fallback"), "fallback");
    assert!(host.setting_bool("k", true));
    assert_eq!(host.setting_i64("k", 9), 9);
    assert!(host.require(&user(), Permission::LibraryManage).is_ok());
    assert!(host.require_any_admin(&user()).is_ok());
    assert_eq!(
        host.lerr(&user(), StatusCode::NOT_FOUND, "k").status(),
        StatusCode::NOT_FOUND
    );
    assert!(host.module_enabled("x"));
    assert!(host.library_folders().is_empty());
    assert!(host.secret("tmdb").is_none());
    assert_eq!(host.metadata_language(), "en");
    assert!(host.get_service(TypeId::of::<u32>()).is_none());
    assert!(host.data_dir().is_dir());
    host.set_settings(BTreeMap::from([("k".to_string(), json!("v"))]));
    assert_eq!(host.setting_str("k", "fallback"), "v");
    host.trigger_job("library.scan", "test");
    assert_eq!(host.jobs(), [("library.scan", "test")]);
}

#[test]
fn the_stub_defaults_to_something_usable() {
    // `Default` exists so a double can be dropped into a `#[derive(Default)]`
    // harness; it must not differ from `new()`.
    assert_eq!(
        StubHost::default().metadata_language(),
        StubHost::new().metadata_language()
    );
    assert!(StubHost::default().published().is_empty());
}
