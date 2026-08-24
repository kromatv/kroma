use super::*;
use crate::testing::TempPool;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("req")
}

pub(super) fn seed_library(conn: &Connection) {
    conn.execute(
        "INSERT INTO libraries (id, name, kind, path, added_at) VALUES ('lib1','Films','movies','/x','now')",
        [],
    )
    .unwrap();
}

pub(super) fn insert_movie_item(conn: &Connection, id: &str, tmdb: u64) {
    conn.execute(
        "INSERT INTO items (id, kind, title, container, library, added_at) \
         VALUES (?1, 'movie', 'T', 'mkv', 'lib1', 'now')",
        params![id],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO metadata_core (subject_kind, subject_id, tmdb_id, updated_at) \
         VALUES ('item', ?1, ?2, 0)",
        params![id, tmdb as i64],
    )
    .unwrap();
}

pub(super) fn new_req(
    id: &str,
    kind: RequestKind,
    tmdb: u64,
    seasons: Option<Vec<u32>>,
) -> NewRequest {
    NewRequest {
        id: id.into(),
        kind,
        tmdb_id: tmdb,
        title: "T".into(),
        year: Some(2020),
        poster_url: None,
        seasons,
        episodes: None,
        status: RequestStatus::Pending,
        requested_by: None,
    }
}

pub(super) fn ep_row(id: &str, season: u32, episode: u32, status: &str) -> WantedRow {
    WantedRow {
        id: id.into(),
        request_id: "r1".into(),
        kind: "episode".into(),
        tmdb_id: 1396,
        imdb_id: None,
        title: "T".into(),
        year: None,
        season: Some(season),
        episode: Some(episode),
        air_date: None,
        status: status.into(),
        last_search_at: None,
    }
}

pub(super) fn seed_show(p: &Pool, show_id: &str) {
    let conn = p.get().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO libraries (id, name, kind, path, added_at) \
         VALUES ('lib1','Films','movies','/x','now')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO shows (id, library, title, added_at) VALUES (?1,'lib1','S','now')",
        params![show_id],
    )
    .unwrap();
}

pub(super) fn gap(season: u32, episode: u32, air: &str) -> (u32, u32, Option<String>) {
    (season, episode, Some(air.to_string()))
}

pub(super) fn seed_user(conn: &Connection, id: &str) {
    conn.execute(
        "INSERT OR IGNORE INTO users (id,email,username,password_hash,created_at) \
         VALUES (?1, ?1 || '@t.dev', ?1, 'h', 'now')",
        params![id],
    )
    .unwrap();
}

pub(super) fn req_by(pool: &Pool, id: &str, tmdb: u64, status: RequestStatus, owner: Option<&str>) {
    {
        let conn = pool.get().unwrap();
        if let Some(o) = owner {
            seed_user(&conn, o);
        }
    }
    let mut new = new_req(id, RequestKind::Movie, tmdb, None);
    new.status = status;
    new.requested_by = owner.map(str::to_string);
    new.title = format!("Title {id}");
    insert_request(pool, &new, 1_000).unwrap();
}

pub(super) fn wanted_row(id: &str, request_id: &str, air: Option<&str>, status: &str) -> WantedRow {
    WantedRow {
        id: id.into(),
        request_id: request_id.into(),
        kind: "movie".into(),
        tmdb_id: 1,
        imdb_id: None,
        title: "T".into(),
        year: Some(2020),
        season: None,
        episode: None,
        air_date: air.map(str::to_string),
        status: status.into(),
        last_search_at: None,
    }
}

#[test]
fn request_roundtrip_merge_and_cascade() {
    let p = pool();
    insert_request(
        &p,
        &new_req("r1", RequestKind::Show, 1396, Some(vec![1])),
        1000,
    )
    .unwrap();

    let conn = p.get().unwrap();
    let open = find_open_request(&conn, RequestKind::Show, 1396)
        .unwrap()
        .unwrap();
    assert_eq!(open.id, "r1");
    assert_eq!(open.seasons.as_deref(), Some(&[1u32][..]));
    assert_eq!(open.status, RequestStatus::Pending);
    drop(conn);

    set_request_seasons(&p, "r1", Some(&[1, 2]), 2000).unwrap();
    let conn = p.get().unwrap();
    assert_eq!(
        get_request(&conn, "r1")
            .unwrap()
            .unwrap()
            .seasons
            .as_deref(),
        Some(&[1u32, 2][..])
    );
    drop(conn);

    set_request_episodes(
        &p,
        "r1",
        Some(&[EpisodeRef {
            season: 3,
            episode: 5,
        }]),
        2100,
    )
    .unwrap();
    let conn = p.get().unwrap();
    assert_eq!(
        get_request(&conn, "r1")
            .unwrap()
            .unwrap()
            .episodes
            .as_deref(),
        Some(
            &[EpisodeRef {
                season: 3,
                episode: 5
            }][..]
        )
    );
    drop(conn);

    set_request_status(
        &p,
        "r1",
        RequestStatus::Denied,
        Some("boss"),
        Some("non"),
        3000,
    )
    .unwrap();
    let conn = p.get().unwrap();
    assert!(find_open_request(&conn, RequestKind::Show, 1396)
        .unwrap()
        .is_none());
    let denied = get_request(&conn, "r1").unwrap().unwrap();
    assert_eq!(denied.status, RequestStatus::Denied);
    assert_eq!(denied.note.as_deref(), Some("non"));
    drop(conn);

    let rows = vec![WantedRow {
        id: "w1".into(),
        request_id: "r1".into(),
        kind: "episode".into(),
        tmdb_id: 1396,
        imdb_id: None,
        title: "T".into(),
        year: None,
        season: Some(1),
        episode: Some(1),
        air_date: Some("2020-01-01".into()),
        status: "wanted".into(),
        last_search_at: None,
    }];
    replace_wanted(&p, "r1", &rows, 4000).unwrap();
    let conn = p.get().unwrap();
    assert_eq!(wanted_for_request(&conn, "r1").unwrap().len(), 1);
    drop(conn);
    assert!(delete_request(&p, "r1").unwrap());
    let conn = p.get().unwrap();
    assert!(wanted_for_request(&conn, "r1").unwrap().is_empty());
}

#[test]
fn set_request_air_roundtrips_and_last_refresh_is_internal() {
    let p = pool();
    insert_request(&p, &new_req("r1", RequestKind::Show, 1396, None), 1000).unwrap();
    set_request_air(&p, "r1", Some("Returning Series"), Some("2026-01-17"), 5000).unwrap();
    let conn = p.get().unwrap();
    let req = get_request(&conn, "r1").unwrap().unwrap();
    assert_eq!(req.air_status.as_deref(), Some("Returning Series"));
    assert_eq!(req.next_air_date.as_deref(), Some("2026-01-17"));
    assert_eq!(req.last_refresh_at, Some(5000));
    assert_eq!(req.updated_at, 1000);
    drop(conn);
    set_request_air(&p, "r1", Some("Ended"), None, 6000).unwrap();
    let conn = p.get().unwrap();
    let req = get_request(&conn, "r1").unwrap().unwrap();
    assert_eq!(req.air_status.as_deref(), Some("Ended"));
    assert_eq!(req.next_air_date, None);
    let json = serde_json::to_value(&req).unwrap();
    assert!(json.get("lastRefreshAt").is_none());
    assert_eq!(
        json.get("airStatus").and_then(serde_json::Value::as_str),
        Some("Ended")
    );
}

#[test]
fn a_users_own_requests_are_the_only_ones_they_see() {
    // Per-account: seeing another user's asks leaks what the household watches.
    let pool = pool();
    req_by(&pool, "r-ana", 1, RequestStatus::Pending, Some("ana"));
    req_by(&pool, "r-bo", 2, RequestStatus::Pending, Some("bo"));
    req_by(&pool, "r-old", 3, RequestStatus::Pending, None);

    let conn = pool.get().unwrap();
    let ana = list_requests(&conn, Some("ana")).unwrap();
    assert_eq!(ana.len(), 1);
    assert_eq!(ana[0].id, "r-ana");

    assert_eq!(list_requests(&conn, None).unwrap().len(), 3);
}

#[test]
fn the_latest_request_for_a_title_is_the_newest_one() {
    let pool = pool();
    let mut denied = new_req("r-old", RequestKind::Movie, 603, None);
    denied.status = RequestStatus::Denied;
    insert_request(&pool, &denied, 1_000).unwrap();
    let mut fresh = new_req("r-new", RequestKind::Movie, 603, None);
    fresh.status = RequestStatus::Pending;
    insert_request(&pool, &fresh, 2_000).unwrap();

    let conn = pool.get().unwrap();
    let found = latest_request_for(&conn, RequestKind::Movie, 603)
        .unwrap()
        .unwrap();
    assert_eq!(found.0, "r-new");
    assert_eq!(found.1, RequestStatus::Pending);

    assert!(latest_request_for(&conn, RequestKind::Movie, 999)
        .unwrap()
        .is_none());
    assert!(latest_request_for(&conn, RequestKind::Show, 603)
        .unwrap()
        .is_none());
}
