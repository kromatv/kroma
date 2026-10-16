use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::HostStorage;
use kroma_scene::{Quality, Res};

use super::*;

fn host() -> StubHost {
    let host = StubHost::with_core(kroma_module_sdk::db::testing::temp_pool("acq-rules"));
    kroma_module_sdk::db::apply_migrations(&host.store().get().unwrap(), store::MIGRATIONS).unwrap();
    host
}

#[test]
fn the_first_read_seeds_a_profile_from_the_old_settings() {
    let host = host()
        .with_setting("acqResolution", serde_json::json!("2160p"))
        .with_setting("acqForbiddenKeywords", serde_json::json!("cam, ts"));

    let book = load(&host).unwrap();

    let profile = book.profile(None);
    assert_eq!(profile.id, DEFAULT_PROFILE_ID);
    assert_eq!(profile.cutoff, Quality::Bluray2160);
    assert_eq!(profile.must_not_contain, ["cam", "ts"]);
    assert!(book.formats.iter().any(|f| f.id == "vff"));
    assert_eq!(legacy(&host).resolution, Res::R2160);
}

#[test]
fn emptying_the_formats_never_brings_the_defaults_back() {
    let host = host();
    for format in load(&host).unwrap().formats {
        store::delete_format(host.store(), &format.id).unwrap();
    }

    let book = load(&host).unwrap();

    assert!(book.formats.is_empty());
}

#[test]
fn a_title_can_be_judged_by_another_profile() {
    let host = host();
    let mut strict = load(&host).unwrap().profile(None).clone();
    strict.id = "strict".into();
    strict.name = "Strict".into();
    strict.min_seeders = 50;
    store::save_profile(host.store(), &strict, 1).unwrap();
    store::set_title_profile(host.store(), RequestKind::Show, 77, Some("strict")).unwrap();

    let book = load(&host).unwrap();

    assert_eq!(book.profile_for(&host, RequestKind::Show, 77).unwrap().id, "strict");
    assert_eq!(book.profile_for(&host, RequestKind::Show, 78).unwrap().id, DEFAULT_PROFILE_ID);
}

#[test]
fn deleting_a_profile_puts_its_titles_back_on_the_default() {
    let host = host();
    let mut other = load(&host).unwrap().profile(None).clone();
    other.id = "other".into();
    store::save_profile(host.store(), &other, 1).unwrap();
    store::set_title_profile(host.store(), RequestKind::Movie, 603, Some("other")).unwrap();

    store::delete_profile(host.store(), "other").unwrap();

    assert_eq!(store::title_profile(host.store(), RequestKind::Movie, 603).unwrap(), None);
}

#[test]
fn an_unknown_profile_name_falls_back_to_the_default() {
    let host = host();
    let book = load(&host).unwrap();

    assert_eq!(book.profile(Some("gone")).id, DEFAULT_PROFILE_ID);
}

#[test]
fn another_profile_can_become_the_default() {
    let host = host();
    let mut other = load(&host).unwrap().profile(None).clone();
    other.id = "other".into();
    store::save_profile(host.store(), &other, 1).unwrap();

    set_default_profile(&host, "other").unwrap();

    assert_eq!(load(&host).unwrap().profile(None).id, "other");
}

#[test]
fn a_saved_size_table_is_read_back() {
    let host = host();
    let mut sizes = load(&host).unwrap().sizes;
    sizes.episode_runtime = 22;

    store::save_sizes(host.store(), &sizes).unwrap();

    assert_eq!(load(&host).unwrap().sizes.episode_runtime, 22);
}

#[test]
fn the_release_an_import_placed_is_remembered_by_path() {
    let host = host();

    store::record_release(host.store(), "/x/a.mkv", "A.2020.1080p.WEB-DL-GRP", 1).unwrap();

    assert_eq!(
        store::release_of(host.store(), "/x/a.mkv").unwrap().as_deref(),
        Some("A.2020.1080p.WEB-DL-GRP")
    );
    assert_eq!(store::release_of(host.store(), "/x/b.mkv").unwrap(), None);
}

#[test]
fn a_copy_beside_is_remembered_by_download() {
    let host = host();

    store::place_beside(host.store(), "d1").unwrap();

    assert!(store::is_beside(host.store(), "d1").unwrap());
    assert!(!store::is_beside(host.store(), "d2").unwrap());
}

#[test]
fn an_upgrade_search_that_found_nothing_waits_longer_each_time() {
    let host = host();
    let title = kroma_module_sdk::engine::model::MonitoredTitle {
        kind: RequestKind::Movie,
        tmdb_id: 603,
        title: "M".into(),
        year: None,
        poster_url: None,
        seasons: Vec::new(),
        monitor_new_seasons: false,
        min_availability: Default::default(),
        last_season: None,
        added_by: None,
        added_at: 0,
        updated_at: 0,
        original_language: None,
        air_status: None,
        refreshed_at: None,
        known_episodes: Default::default(),
    };
    const HOUR: i64 = 60 * 60 * 1000;
    let due = |at: i64| store::upgrade_due(host.store(), RequestKind::Movie, 603, at).unwrap();

    let never_searched = due(0);
    store::record_upgrade_search(host.store(), &title, 0, false).unwrap();
    let after_one_miss = (due(23 * HOUR), due(24 * HOUR));
    store::record_upgrade_search(host.store(), &title, 0, true).unwrap();
    let after_a_grab = due(12 * HOUR);

    assert!(never_searched);
    assert_eq!(after_one_miss, (false, true));
    assert!(after_a_grab);
}
