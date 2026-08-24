use serde_json::json;

use super::*;
use crate::services::requests::test_fixtures::{
    breaking_bad, detail, movie_detail, raw_detail, req, show_detail, wanted,
};
use crate::services::requests::test_support::{
    host_without_tmdb, insert_req, test_host, wanted_pairs,
};
use crate::test_support::FakeTmdb;

#[test]
fn is_ended_recognizes_terminal_states() {
    assert!(is_ended(Some("Ended")));
    assert!(is_ended(Some("Canceled")));
    assert!(!is_ended(Some("Returning Series")));
    assert!(!is_ended(Some("In Production")));
    assert!(!is_ended(None));
}

#[test]
fn needs_refresh_skips_terminal_and_throttles() {
    let now = 1_000_000_000_000i64;
    assert!(!needs_refresh(
        &req(RequestKind::Movie, RequestStatus::Denied),
        now
    ));
    assert!(!needs_refresh(
        &req(RequestKind::Show, RequestStatus::Failed),
        now
    ));
    let mut recent = req(RequestKind::Movie, RequestStatus::Approved);
    recent.last_refresh_at = Some(now - 1000);
    assert!(!needs_refresh(&recent, now));
    let mut old = req(RequestKind::Movie, RequestStatus::Approved);
    old.last_refresh_at = Some(now - REFRESH_MIN_INTERVAL_MS - 1);
    assert!(needs_refresh(&old, now));
}

#[test]
fn needs_refresh_movie_and_show_rules() {
    let now = 1_000_000_000_000i64;
    assert!(!needs_refresh(
        &req(RequestKind::Movie, RequestStatus::Available),
        now
    ));
    assert!(needs_refresh(
        &req(RequestKind::Movie, RequestStatus::Approved),
        now
    ));
    let mut ended = req(RequestKind::Show, RequestStatus::Approved);
    ended.air_status = Some("Ended".into());
    assert!(!needs_refresh(&ended, now));
    let mut ongoing = req(RequestKind::Show, RequestStatus::Approved);
    ongoing.air_status = Some("Returning Series".into());
    assert!(needs_refresh(&ongoing, now));
    assert!(needs_refresh(
        &req(RequestKind::Show, RequestStatus::Approved),
        now
    ));
}

#[test]
fn refresh_wanted_noop_on_empty_ledger() {
    let host = test_host();
    let request = req(RequestKind::Show, RequestStatus::Approved);
    let detail = raw_detail(None, None);
    refresh_wanted(&host, &request, &detail, "2026-07-16").unwrap();
    let conn = host.db().get().unwrap();
    assert!(db::wanted_for_request(&conn, &request.id)
        .unwrap()
        .is_empty());
}

#[test]
fn refresh_pass_skips_all_terminal_and_settled_requests() {
    let host = test_host();
    insert_req(&host, "r1", RequestKind::Movie, 1, RequestStatus::Denied);
    insert_req(&host, "r2", RequestKind::Show, 2, RequestStatus::Failed);
    insert_req(&host, "r3", RequestKind::Movie, 3, RequestStatus::Available);
    assert_eq!(refresh_pass(&host).unwrap(), 0);
}

#[test]
fn a_refresh_pass_survives_a_request_it_cannot_refresh() {
    // No TMDB key, so every refresh_one fails at the first step.
    let host = host_without_tmdb();
    insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Approved);
    insert_req(&host, "r2", RequestKind::Movie, 43, RequestStatus::Approved);
    assert_eq!(refresh_pass(&host).unwrap(), 0);

    let host2 = test_host();
    insert_req(&host2, "r3", RequestKind::Movie, 44, RequestStatus::Denied);
    assert_eq!(refresh_pass(&host2).unwrap(), 0);
}

#[test]
fn refresh_never_creates_a_ledger_for_a_request_nobody_approved() {
    let host = test_host();
    insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Pending);
    let req = req(RequestKind::Movie, RequestStatus::Pending);
    refresh_wanted(
        &host,
        &req,
        &detail(RequestKind::Movie, 42, Some("2026-01-01")),
        "2026-07-16",
    )
    .unwrap();

    let conn = host.db().get().unwrap();
    assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
}

#[test]
fn refresh_backfills_a_missing_air_date_and_leaves_the_row_alone_otherwise() {
    let host = test_host();
    insert_req(&host, "r1", RequestKind::Movie, 42, RequestStatus::Approved);
    let undated = wanted("w1", "r1", None, None, None, "grabbed");
    db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

    let req = req(RequestKind::Movie, RequestStatus::Approved);
    refresh_wanted(
        &host,
        &req,
        &detail(RequestKind::Movie, 42, Some("2026-03-04")),
        "2026-07-16",
    )
    .unwrap();

    let conn = host.db().get().unwrap();
    let rows = db::wanted_for_request(&conn, "r1").unwrap();
    drop(conn);
    assert_eq!(rows.len(), 1, "the movie row is matched, not duplicated");
    assert_eq!(rows[0].air_date.as_deref(), Some("2026-03-04"));
    assert_eq!(
        rows[0].status, "grabbed",
        "an in-flight download is untouched"
    );

    refresh_wanted(
        &host,
        &req,
        &detail(RequestKind::Movie, 42, Some("2030-01-01")),
        "2026-07-16",
    )
    .unwrap();
    let conn = host.db().get().unwrap();
    let rows = db::wanted_for_request(&conn, "r1").unwrap();
    assert_eq!(rows[0].air_date.as_deref(), Some("2026-03-04"));
}

#[test]
fn the_refresh_pass_backfills_a_release_date_tmdb_did_not_have_before() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|_| {
        let mut d = movie_detail("Dune: Part Three", "2027-03-04");
        d["release_dates"] = json!({
            "results": [{
                "iso_3166_1": "US",
                "release_dates": [{ "type": 4, "release_date": "2027-05-01T00:00:00.000Z" }],
            }]
        });
        (200, d)
    });
    insert_req(
        &host,
        "r-1",
        RequestKind::Movie,
        603,
        RequestStatus::Approved,
    );
    let undated = wanted("w1", "r-1", None, None, None, "wanted");
    db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

    assert_eq!(refresh_pass(&host).unwrap(), 1);

    let conn = host.db().get().unwrap();
    let rows = db::wanted_for_request(&conn, "r-1").unwrap();
    assert!(
        rows[0].air_date.is_some(),
        "the release date was not backfilled"
    );
}

#[test]
fn the_refresh_pass_extends_a_shows_ledger_with_the_episodes_tmdb_has_since_listed() {
    let host = test_host();
    let _tmdb = breaking_bad();
    insert_req(
        &host,
        "r-show",
        RequestKind::Show,
        1396,
        RequestStatus::Approved,
    );
    db::insert_wanted(
        host.db(),
        &[wanted("w1", "r-show", Some(1), Some(1), None, "wanted")],
        now_ms(),
    )
    .unwrap();

    assert_eq!(refresh_pass(&host).unwrap(), 1);

    assert_eq!(
        wanted_pairs(&host, "r-show"),
        [(1, 1), (1, 2), (1, 3), (2, 1), (2, 2)],
        "additive: the existing row stays and the new ones join it"
    );
    let conn = host.db().get().unwrap();
    let rows = db::wanted_for_request(&conn, "r-show").unwrap();
    let first = rows
        .iter()
        .find(|w| w.season == Some(1) && w.episode == Some(1))
        .unwrap();
    assert_eq!(
        first.id, "w1",
        "matched on (season, episode), not on the id formula"
    );
    assert_eq!(
        first.air_date.as_deref(),
        Some("2008-01-20"),
        "its air date was backfilled"
    );
}

#[test]
fn a_film_tmdb_has_no_date_for_gets_its_airing_signals_and_nothing_else() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|_| {
        let mut d = movie_detail("Untitled Villeneuve Project", "");
        d["release_date"] = json!("");
        d["status"] = json!("In Production");
        (200, d)
    });
    insert_req(
        &host,
        "r-1",
        RequestKind::Movie,
        603,
        RequestStatus::Approved,
    );
    let undated = wanted("w1", "r-1", None, None, None, "wanted");
    db::insert_wanted(host.db(), std::slice::from_ref(&undated), now_ms()).unwrap();

    assert_eq!(refresh_pass(&host).unwrap(), 1);

    let conn = host.db().get().unwrap();
    assert!(db::wanted_for_request(&conn, "r-1").unwrap()[0]
        .air_date
        .is_none());
    assert_eq!(
        db::get_request(&conn, "r-1")
            .unwrap()
            .unwrap()
            .air_status
            .as_deref(),
        Some("In Production")
    );
}

#[test]
fn an_episode_tmdb_still_has_no_air_date_for_keeps_its_undated_row() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/1396" => (200, show_detail("Breaking Bad", &[1])),
        _ => (
            200,
            json!({ "episodes": [{ "episode_number": 1, "name": "E1" }] }),
        ),
    });
    insert_req(
        &host,
        "r-show",
        RequestKind::Show,
        1396,
        RequestStatus::Approved,
    );
    db::insert_wanted(
        host.db(),
        &[wanted("w1", "r-show", Some(1), Some(1), None, "wanted")],
        now_ms(),
    )
    .unwrap();

    assert_eq!(refresh_pass(&host).unwrap(), 1);

    let conn = host.db().get().unwrap();
    let rows = db::wanted_for_request(&conn, "r-show").unwrap();
    assert_eq!(rows.len(), 1, "nothing new to insert");
    assert!(
        rows[0].air_date.is_none(),
        "there was no date to backfill with"
    );
}

#[test]
fn a_refresh_that_cannot_store_the_airing_signals_is_not_counted_as_refreshed() {
    let host = test_host();
    let _tmdb = FakeTmdb::start(|_| (200, movie_detail("The Matrix", "1999-03-31")));
    insert_req(
        &host,
        "r-1",
        RequestKind::Movie,
        603,
        RequestStatus::Approved,
    );
    host.db()
        .get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER no_request_update BEFORE UPDATE ON requests \
             BEGIN SELECT RAISE(ABORT, 'refused'); END",
        )
        .unwrap();

    assert_eq!(
        refresh_pass(&host).unwrap(),
        0,
        "the pass survives, the request does not count"
    );
}
