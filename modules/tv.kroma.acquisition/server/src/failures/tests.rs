use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::host::testing::StubHost;

use super::*;

fn host() -> StubHost {
    let host = StubHost::with_core(db::testing::temp_pool("acq-failures"))
        .with_setting("acqStallHours", serde_json::json!(0));
    db::apply_migrations(&host.store().get().unwrap(), crate::rules::store::MIGRATIONS).unwrap();
    host
}

fn grabbed(host: &StubHost, id: &str, episode: u32) {
    let row = WantedRow {
        id: id.into(),
        request_id: None,
        kind: "episode".into(),
        tmdb_id: 77,
        imdb_id: None,
        title: "Show".into(),
        year: None,
        season: Some(1),
        episode: Some(episode),
        air_date: None,
        status: "grabbed".into(),
        last_search_at: None,
    };
    db::insert_wanted(host.db(), &[row], 1).unwrap();
}

fn download(host: &StubHost, id: &str, episodes: &str, status: &str) {
    host.db()
        .get()
        .unwrap()
        .execute(
            "INSERT INTO downloads (id, client_id, client_ref, kind, tmdb_id, season, episodes, \
                 release_title, magnet_or_url, status, error, grabbed_at) \
             VALUES (?1, 'embedded', '', 'episode', 77, 1, ?2, ?3, 'magnet:?x', ?4, 'tracker gone', 1)",
            rusqlite::params![id, episodes, format!("Show.S01.{id}.1080p-GRP"), status],
        )
        .unwrap();
}

fn status_of(host: &StubHost, id: &str) -> String {
    let conn = host.db().get().unwrap();
    db::wanted_for_title(&conn, RequestKind::Show, 77)
        .unwrap()
        .into_iter()
        .find(|w| w.id == id)
        .unwrap()
        .status
}

#[test]
fn an_episode_whose_download_failed_is_missing_again_and_its_release_blocked() {
    let host = host();
    grabbed(&host, "w1", 1);
    download(&host, "d1", "[1]", "failed");

    let summary = failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(status_of(&host, "w1"), "wanted");
    assert_eq!(summary.blocklisted, 1);
    let blocked = blocklist::for_title(host.store(), RequestKind::Show, 77).unwrap();
    assert_eq!(blocked[0].release_title, "Show.S01.d1.1080p-GRP");
    assert_eq!(blocked[0].reason, "tracker gone");
}

#[test]
fn a_failure_is_blocklisted_once() {
    let host = host();
    download(&host, "d1", "[1]", "failed");

    failure_pass(&host, &|_| {}).unwrap();
    let again = failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(again.blocklisted, 0);
}

#[test]
fn an_episode_still_downloading_stays_grabbed() {
    let host = host();
    grabbed(&host, "w1", 1);
    download(&host, "d1", "[1]", "downloading");

    let summary = failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(status_of(&host, "w1"), "grabbed");
    assert_eq!(summary.missing_again, 0);
}

#[test]
fn an_episode_whose_download_was_removed_is_missing_again() {
    let host = host();
    grabbed(&host, "w1", 1);
    grabbed(&host, "w2", 2);
    download(&host, "d1", "[2]", "downloading");

    failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(status_of(&host, "w1"), "wanted");
    assert_eq!(status_of(&host, "w2"), "grabbed");
    assert!(host.jobs().iter().any(|(key, _)| *key == "acquisition.search"));
}

#[test]
fn a_season_pack_covers_every_episode_of_its_season() {
    let host = host();
    grabbed(&host, "w1", 1);
    grabbed(&host, "w2", 2);
    host.db()
        .get()
        .unwrap()
        .execute(
            "INSERT INTO downloads (id, client_id, client_ref, kind, tmdb_id, season, \
                 release_title, magnet_or_url, status, grabbed_at) \
             VALUES ('p1', 'embedded', '', 'season', 77, 1, 'Show.S01', 'magnet:?x', 'queued', 1)",
            [],
        )
        .unwrap();

    failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(status_of(&host, "w1"), "grabbed");
    assert_eq!(status_of(&host, "w2"), "grabbed");
}

#[test]
fn a_download_unfinished_past_the_limit_has_stalled() {
    let d = Download {
        id: "d".into(),
        kind: "movie".into(),
        tmdb_id: 1,
        season: None,
        episodes: None,
        release_title: "M".into(),
        info_hash: None,
        indexer_id: None,
        status: "downloading".into(),
        error: None,
        grabbed_at: 0,
    };

    assert!(stalled(&d, 72 * HOUR_MS, 72));
    assert!(!stalled(&d, 71 * HOUR_MS, 72));
    assert!(!stalled(&d, 1000 * HOUR_MS, 0));
    assert!(!stalled(&Download { status: "completed".into(), ..d }, 1000 * HOUR_MS, 72));
}
