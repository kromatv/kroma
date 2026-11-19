use std::collections::BTreeMap;

use super::*;

fn save_a_list_that_does_not_read(pool: &db::Pool, settings: &services::settings::Settings) {
    settings.set_patch(
        pool,
        BTreeMap::from([(
            "libraries".to_string(),
            serde_json::json!([{ "name": "Films" }]),
        )]),
    );
}

#[test]
fn a_saved_list_that_cannot_be_read_is_not_a_server_with_no_library() {
    let (pool, s) = settings();
    save_a_list_that_does_not_read(&pool, &s);

    assert!(!demo_media_wanted(&cfg(), &s));
}

#[test]
fn a_server_whose_saved_list_cannot_be_read_boots_with_no_scan_and_no_demo() {
    let (pool, s) = settings();
    let root = one_film("plan-unreadable");
    save_a_list_that_does_not_read(&pool, &s);

    let plan = plan(&pool, &config_reading(root.path()), &s).unwrap();

    assert!(matches!(plan, Plan::Offline));
    assert_eq!(db::counts(&pool).unwrap(), (0, 0, 0));
}

#[tokio::test]
async fn the_walk_behind_the_open_port_keeps_every_library_when_the_saved_list_cannot_be_read() {
    let app = crate::api::test_support::test_app();
    let stored = db::counts(&app.state.db).unwrap();
    save_a_list_that_does_not_read(&app.state.db, &app.state.settings);
    let mut events = app.state.events.subscribe();

    spawn_startup_scan(app.state.clone());

    let seen = announced_until_the_scan_ends(&mut events).await;
    assert_eq!(seen.last().unwrap()["items"], stored.1);
    assert!(stored.0 > 0);
    assert_eq!(db::counts(&app.state.db).unwrap(), stored);
}
