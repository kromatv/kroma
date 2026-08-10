use kroma_engine::services::settings::{self, SettingGroup, Settings};

fn version_row(groups: &[SettingGroup]) -> String {
    groups
        .iter()
        .flat_map(|g| &g.rows)
        .find(|r| r.key == "version")
        .and_then(|r| r.value.as_str())
        .expect("the general view carries a version row")
        .to_string()
}

#[test]
fn the_console_reports_the_build_the_binary_handed_it_and_only_the_first_one() {
    let dir = kroma_testing::temp_dir("build-info");
    let pool = kroma_db::init(&dir.path().join("kroma.db")).unwrap();
    let store = Settings::load(&pool);
    let config = kroma_config::Config {
        host: "127.0.0.1".into(),
        port: 0,
        data_dir: dir.path().to_path_buf(),
        tmdb_language: "en-US".into(),
        ..Default::default()
    };

    settings::set_build_info("9.9.9", "cafed00d", "2026-08-10");
    settings::set_build_info("0.0.0", "ffffffff", "1970-01-01");

    let shown = version_row(&settings::groups("general", &store, &config, "en"));
    assert_eq!(shown, "9.9.9 (cafed00d · 2026-08-10)");
}
