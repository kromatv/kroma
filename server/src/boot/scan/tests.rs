use super::*;

mod no_folder;
mod stored_list;

fn cfg() -> kroma_config::Config {
    kroma_config::Config {
        demo_media: true,
        ..Default::default()
    }
}

fn settings() -> (kroma_db::testing::TempPool, services::settings::Settings) {
    let pool = kroma_db::testing::temp_pool("boot-demo");
    let settings = services::settings::Settings::load(&pool);
    (pool, settings)
}

#[test]
fn a_server_with_nothing_configured_writes_the_demo_library() {
    let (_pool, s) = settings();

    assert!(demo_media_wanted(&cfg(), &s));
}

#[test]
fn a_configured_root_of_any_kind_means_the_operator_has_a_library() {
    let (_pool, s) = settings();
    let dir = std::path::PathBuf::from("/media");
    for c in [
        kroma_config::Config {
            media_dirs: vec![dir.clone()],
            ..cfg()
        },
        kroma_config::Config {
            movies_dirs: vec![dir.clone()],
            ..cfg()
        },
        kroma_config::Config {
            series_dirs: vec![dir],
            ..cfg()
        },
    ] {
        assert!(!demo_media_wanted(&c, &s));
    }
}

#[test]
fn libraries_defined_in_settings_are_the_operators_too() {
    // Even an EMPTY list: it means they went to the Libraries page and left
    // it empty, which is a decision, not an unconfigured server.
    let (pool, s) = settings();
    s.set_patch(
        &pool,
        std::collections::BTreeMap::from([("libraries".to_string(), serde_json::json!([]))]),
    );

    assert!(!demo_media_wanted(&cfg(), &s));
}

#[test]
fn the_operator_can_turn_the_written_demo_off() {
    let (_pool, s) = settings();
    let off = kroma_config::Config {
        demo_media: false,
        ..cfg()
    };

    assert!(!demo_media_wanted(&off, &s));
}

fn library(root: &std::path::Path) -> Vec<services::settings::LibraryDef> {
    vec![services::settings::LibraryDef {
        id: "lib-1".into(),
        name: "Films".into(),
        kind: "movies".into(),
        folders: vec![root.to_string_lossy().into_owned()],
        auto_scan: true,
    }]
}

fn one_film(tag: &str) -> kroma_testing::TempDir {
    let root = kroma_testing::temp_dir(&format!("boot-scan-{tag}"));
    std::fs::write(root.path().join("Heat (1995).mkv"), b"x").unwrap();
    root
}

fn stored_items(pool: &db::Pool) -> usize {
    db::counts(pool).unwrap().1
}

fn walked_at_startup(
    pool: &db::Pool,
    defs: &[services::settings::LibraryDef],
) -> services::scan::Scanned {
    let turn = services::scan::WalkTurn::wait();
    startup_scan(&turn, pool, defs, &mut services::scan::uninterrupted).unwrap()
}

#[test]
fn a_library_on_disk_is_indexed_by_the_startup_walk() {
    let pool = kroma_db::testing::temp_pool("boot-scan");
    let root = one_film("indexed");

    let scanned = walked_at_startup(&pool, &library(root.path()));

    assert!(matches!(scanned, services::scan::Scanned::Applied(data) if data.items.len() == 1));
    assert_eq!(stored_items(&pool), 1);
}

#[test]
fn configured_folders_that_read_empty_at_startup_keep_the_stored_index() {
    let pool = kroma_db::testing::temp_pool("boot-scan");
    let root = one_film("outage");
    let defs = library(root.path());
    walked_at_startup(&pool, &defs);
    std::fs::remove_file(root.path().join("Heat (1995).mkv")).unwrap();

    let scanned = walked_at_startup(&pool, &defs);

    assert!(matches!(
        scanned,
        services::scan::Scanned::MountOffline { dropped: 0 }
    ));
    assert_eq!(stored_items(&pool), 1);
}

#[test]
fn a_server_with_no_library_is_seeded_with_the_demo_catalogue() {
    let pool = kroma_db::testing::temp_pool("boot-scan");

    let scanned = walked_at_startup(&pool, &[]);

    assert!(matches!(scanned, services::scan::Scanned::Applied(_)));
    assert!(stored_items(&pool) > 0);
}

#[test]
fn a_startup_walk_that_is_stopped_keeps_the_batch_it_wrote() {
    let pool = kroma_db::testing::temp_pool("boot-scan");
    let root = one_film("stopped");

    let turn = services::scan::WalkTurn::wait();
    let scanned = startup_scan(&turn, &pool, &library(root.path()), &mut |_| {
        std::ops::ControlFlow::Break(())
    })
    .unwrap();

    assert!(matches!(
        scanned,
        services::scan::Scanned::Cancelled { dropped: 0 }
    ));
    assert_eq!(stored_items(&pool), 1);
}

fn config_reading(root: &std::path::Path) -> kroma_config::Config {
    kroma_config::Config {
        demo_media: false,
        media_dirs: vec![root.to_path_buf()],
        ..Default::default()
    }
}

#[test]
fn a_server_with_nothing_indexed_waits_for_the_walk_and_takes_what_it_found() {
    let (pool, s) = settings();
    let root = one_film("plan-applied");

    let plan = plan(&pool, &config_reading(root.path()), &s).unwrap();

    assert!(matches!(plan, Plan::Applied(data) if data.items.len() == 1));
}

#[test]
fn a_server_whose_folders_read_empty_plans_no_catalogue() {
    let (pool, s) = settings();
    let root = kroma_testing::temp_dir("boot-scan-plan-offline");

    let plan = plan(&pool, &config_reading(root.path()), &s).unwrap();

    assert!(matches!(plan, Plan::Offline));
}

async fn announced_until_the_scan_ends(
    events: &mut tokio::sync::broadcast::Receiver<infra::events::Envelope>,
) -> Vec<serde_json::Value> {
    let mut seen: Vec<serde_json::Value> = Vec::new();
    while seen
        .last()
        .is_none_or(|event| event["type"] != "scan.completed")
    {
        let envelope = tokio::time::timeout(std::time::Duration::from_secs(30), events.recv())
            .await
            .expect("the startup walk announced its end")
            .unwrap();
        seen.push(serde_json::from_str(envelope.payload_unrouted()).unwrap());
    }
    seen
}

#[tokio::test]
async fn the_walk_behind_the_open_port_announces_a_title_before_it_completes() {
    let app = crate::api::test_support::test_app();
    let root = one_film("deferred");
    services::settings::set_library_defs(&app.state.settings, &app.state.db, &library(root.path()));
    let mut events = app.state.events.subscribe();

    spawn_startup_scan(app.state.clone());

    let seen = announced_until_the_scan_ends(&mut events).await;
    assert!(
        seen.iter().any(|event| event["type"] == "library.updated"),
        "{seen:?}"
    );
    assert_eq!(seen.last().unwrap()["items"], 1);
}

#[tokio::test]
async fn the_walk_behind_the_open_port_ends_a_scan_whose_folders_read_empty() {
    let app = crate::api::test_support::test_app();
    let root = kroma_testing::temp_dir("boot-scan-deferred-outage");
    services::settings::set_library_defs(&app.state.settings, &app.state.db, &library(root.path()));
    let mut events = app.state.events.subscribe();

    spawn_startup_scan(app.state.clone());

    let seen = announced_until_the_scan_ends(&mut events).await;
    assert_eq!(seen.last().unwrap()["items"], 0);
    let activity = services::activity::snapshot(&app.state.activity);
    assert!(!activity.scanning);
}
