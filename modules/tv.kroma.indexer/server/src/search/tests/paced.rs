use std::time::{Duration, Instant};

use kroma_module_sdk::db::migrate_store;
use kroma_module_sdk::db::testing::{temp_pool, TempPool};
use kroma_module_sdk::primitives::now_ms;

use super::builtin::{builtin_row, install_definition, serve};
use super::{port_query, DbHost};
use crate::{admin, db, MODULE_ID};

const PACED_DEF: &str = r#"
id: local
name: Local Tracker
requestDelay: 0.3
caps:
  modes:
    search: [q]
search:
  paths:
    - path: /search
  rows:
    selector: "tr.r"
  fields:
    title:
      selector: "td.title"
    guid:
      selector: "td.title"
"#;

fn paced_pool() -> TempPool {
    let pool = temp_pool("indexer-lib-paced");
    migrate_store(&pool, MODULE_ID, db::MIGRATIONS, db::STEPS).unwrap();
    pool
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn a_tracker_that_answers_429_is_left_alone_by_the_next_instance_too() {
    let pool = paced_pool();
    let host = DbHost::with_store((*pool).clone());
    install_definition(&host, "paced-def", PACED_DEF);
    let base = serve(
        br#"<error code="429" description="slow down"/>"#,
        "text/xml",
    );
    let row = builtin_row("builtin-429", "paced-def", base);
    let one_instance = admin::build_builtin_session(&host, &pool, &row, None).unwrap();

    let outcome = one_instance.search(&port_query(), &[2000]);

    let next_allowed: i64 = pool
        .get()
        .unwrap()
        .query_row(
            "SELECT next_allowed_at FROM indexer_pace WHERE id = 'builtin-429'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(outcome.errors.len(), 1, "{:?}", outcome.errors);
    assert!(next_allowed > now_ms() + 50_000);
}

#[test]
#[cfg_attr(target_family = "wasm", ignore = "binds a test server, and a component holds no socket")]
fn two_instances_keep_a_trackers_request_delay_between_them() {
    let pool = paced_pool();
    let host = DbHost::with_store((*pool).clone());
    install_definition(&host, "paced-def", PACED_DEF);
    let base = serve(b"d8:announce9:udp://x:0e", "application/x-bittorrent");
    let row = builtin_row("builtin-paced", "paced-def", base.clone());
    let url = format!("{base}/dl/1.torrent");
    let one_instance = admin::build_builtin_session(&host, &pool, &row, None).unwrap();
    let another_instance = admin::build_builtin_session(&host, &pool, &row, None).unwrap();

    let started = Instant::now();
    one_instance.fetch_torrent(&url).unwrap();
    another_instance.fetch_torrent(&url).unwrap();
    let elapsed = started.elapsed();

    assert!(elapsed >= Duration::from_millis(250), "{elapsed:?}");
}
