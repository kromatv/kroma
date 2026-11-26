use kroma_module_sdk::db::{self, WantedRow};
use kroma_module_sdk::host::testing::StubHost;

use super::*;

fn host() -> StubHost {
    let host = StubHost::with_core(db::testing::temp_pool("acq-failures"))
        .with_setting("acqStallHours", serde_json::json!(0));
    crate::rules::schema::install(host.store());
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
                 release_title, magnet_or_url, status, error, progress, grabbed_at) \
             VALUES (?1, 'embedded', '', 'episode', 77, 1, ?2, ?3, 'magnet:?x', ?4, 'tracker gone', 0.4, 1)",
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
    assert!(
        host.jobs()
            .iter()
            .any(|(key, _)| *key == "acquisition.search")
    );
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
fn a_download_that_has_not_moved_for_the_limit_has_stalled() {
    let d = Download {
        id: "d".into(),
        kind: "movie".into(),
        tmdb_id: 1,
        season: None,
        episodes: None,
        release_title: "M".into(),
        info_hash: None,
        indexer_id: None,
        client_ref: String::new(),
        status: "downloading".into(),
        error: None,
        progress: 0.4,
        grabbed_at: 0,
    };

    assert!(stalled(&d, Some(0), 72 * HOUR_MS, 72));
    assert!(!stalled(&d, Some(0), 71 * HOUR_MS, 72));
    assert!(!stalled(&d, Some(0), 1000 * HOUR_MS, 0));
    assert!(!stalled(
        &Download {
            status: "completed".into(),
            ..d
        },
        Some(0),
        1000 * HOUR_MS,
        72
    ));
}

#[test]
fn a_download_still_moving_is_not_given_up_on_however_long_ago_it_was_grabbed() {
    let d = Download {
        id: "d".into(),
        kind: "movie".into(),
        tmdb_id: 1,
        season: None,
        episodes: None,
        release_title: "M".into(),
        info_hash: None,
        indexer_id: None,
        client_ref: String::new(),
        status: "downloading".into(),
        error: None,
        progress: 0.9,
        grabbed_at: 0,
    };

    assert!(!stalled(&d, Some(1000 * HOUR_MS), 1001 * HOUR_MS, 72));
}

#[test]
fn a_download_grabbed_long_ago_but_still_moving_survives_the_pass() {
    let host = host().with_setting("acqStallHours", serde_json::json!(72));
    download(&host, "d1", "[1]", "downloading");

    let summary = failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(summary.stalled, 0);
}

fn handed_to(host: &StubHost, id: &str, client_ref: &str) {
    host.db()
        .get()
        .unwrap()
        .execute(
            "UPDATE downloads SET client_ref = ?2 WHERE id = ?1",
            rusqlite::params![id, client_ref],
        )
        .unwrap();
}

fn schedule_of(host: &StubHost, id: &str) -> (Option<i64>, i64) {
    host.db()
        .get()
        .unwrap()
        .query_row(
            "SELECT next_search_at, search_attempts FROM wanted WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap()
}

#[test]
fn a_download_the_client_never_took_is_searched_again_after_a_wait_not_at_once() {
    let host = host();
    grabbed(&host, "w1", 1);
    download(&host, "d1", "[1]", "failed");

    let summary = failure_pass(&host, &|_| {}).unwrap();

    let (next, attempts) = schedule_of(&host, "w1");
    assert_eq!(status_of(&host, "w1"), "wanted");
    assert_eq!(summary.held_back, 1);
    assert_eq!(attempts, 1);
    assert!(next.is_some_and(|at| at > now_ms()), "{next:?}");
}

#[test]
fn each_failure_before_the_client_waits_longer_than_the_last() {
    let host = host();
    grabbed(&host, "w1", 1);
    download(&host, "d1", "[1]", "failed");
    failure_pass(&host, &|_| {}).unwrap();
    let (first, _) = schedule_of(&host, "w1");
    kroma_module_sdk::db::set_wanted_status(host.db(), &["w1".into()], "grabbed", 2).unwrap();
    download(&host, "d2", "[1]", "failed");
    host.db()
        .get()
        .unwrap()
        .execute("UPDATE downloads SET grabbed_at = 2 WHERE id = 'd2'", [])
        .unwrap();

    failure_pass(&host, &|_| {}).unwrap();

    let (second, attempts) = schedule_of(&host, "w1");
    assert_eq!(attempts, 2);
    assert!(
        second.unwrap() > first.unwrap(),
        "{first:?} then {second:?}"
    );
}

#[test]
fn a_download_the_client_took_and_lost_is_searched_again_at_once() {
    let host = host();
    grabbed(&host, "w1", 1);
    download(&host, "d1", "[1]", "failed");
    handed_to(&host, "d1", "abc123");

    let summary = failure_pass(&host, &|_| {}).unwrap();

    assert_eq!(status_of(&host, "w1"), "wanted");
    assert_eq!(summary.held_back, 0);
    assert_eq!(schedule_of(&host, "w1"), (None, 0));
}
