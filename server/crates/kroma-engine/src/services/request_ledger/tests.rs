use super::*;
use crate::model::RequestStatus;
use crate::test_support::FakeTmdb;
use kroma_module_host::testing::StubHost;

fn host(key: Option<&str>) -> StubHost {
    let host = StubHost::with_core(crate::db::testing::temp_pool("ledger"))
        .with_metadata_language("en-US");
    match key {
        Some(k) => host.with_tmdb_key(k),
        None => host,
    }
}

fn exec(host: &StubHost, sql: &str) {
    host.db().get().unwrap().execute(sql, []).unwrap();
}

fn seed_show(host: &StubHost, show_id: &str, tmdb: u64, present: &[(u32, u32)]) {
    exec(
        host,
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','mixed','/x','now')",
    );
    exec(
        host,
        &format!(
            "INSERT INTO shows (id,library,title,added_at) VALUES ('{show_id}','lib1','Show','now')"
        ),
    );
    exec(
        host,
        &format!(
            "INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','{show_id}',{tmdb},0)"
        ),
    );
    for (s, e) in present {
        exec(
            host,
            &format!(
                "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,duration_ms,added_at) \
             VALUES ('{show_id}-s{s}e{e}','episode','E','mkv','lib1','{show_id}',{s},{e},1200000,'now')"
            ),
        );
        exec(
            host,
            &format!(
                "INSERT INTO files (id,item_id,abs_path,rel_path,container,probed,duration_ms,v_codec,v_width,v_height) \
             VALUES ('{show_id}-f{s}{e}','{show_id}-s{s}e{e}','/x/{show_id}-{s}-{e}.mkv','x.mkv','mkv',1,1200000,'hevc',3840,2160)"
            ),
        );
    }
}

fn seed_request(
    host: &StubHost,
    id: &str,
    kind: RequestKind,
    tmdb: u64,
    seasons: Option<Vec<u32>>,
) {
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: id.into(),
            kind,
            tmdb_id: tmdb,
            title: "Show".into(),
            year: Some(2020),
            poster_url: None,
            seasons,
            episodes: None,
            status: RequestStatus::Approved,
            requested_by: None,
        },
        0,
    )
    .unwrap();
}

fn wanted(host: &StubHost, request_id: &str, eps: &[(u32, u32, &str)]) {
    let rows: Vec<db::WantedRow> = eps
        .iter()
        .map(|(s, e, status)| db::WantedRow {
            id: format!("w-{s}-{e}"),
            request_id: Some(request_id.into()),
            kind: "episode".into(),
            tmdb_id: 1,
            imdb_id: None,
            title: "Show".into(),
            year: None,
            season: Some(*s),
            episode: Some(*e),
            air_date: None,
            status: (*status).into(),
            last_search_at: None,
        })
        .collect();
    db::claim_wanted(host.db(), request_id, &rows, 0).unwrap();
}

fn show_json(seasons: &[(u32, u32)]) -> serde_json::Value {
    serde_json::json!({
        "name": "Show",
        "first_air_date": "2020-01-01",
        "seasons": seasons
            .iter()
            .map(|(n, count)| serde_json::json!({ "season_number": n, "episode_count": count }))
            .collect::<Vec<_>>(),
    })
}

fn episodes_json(eps: &[u32]) -> serde_json::Value {
    serde_json::json!({
        "episodes": eps
            .iter()
            .map(|n| serde_json::json!({
                "episode_number": n,
                "name": format!("E{n}"),
                "air_date": "2020-02-01",
            }))
            .collect::<Vec<_>>(),
    })
}

#[test]
fn a_ledger_needs_tmdb_to_describe_anything() {
    let host = host(None);
    seed_request(&host, "r1", RequestKind::Show, 42, None);
    let err = ledger(&host, "r1").unwrap_err();
    assert!(err.to_string().contains("TMDB is not configured"), "{err}");
}

#[test]
fn an_unknown_request_is_an_error_not_an_empty_ledger() {
    let host = host(Some("k"));
    assert!(
        ledger(&host, "nope")
            .unwrap_err()
            .to_string()
            .contains("request not found")
    );
}

#[test]
fn a_season_is_tallied_against_the_request_and_the_library() {
    let host = host(Some("k"));
    seed_show(&host, "show1", 42, &[(1, 1), (1, 2)]);
    seed_request(&host, "r1", RequestKind::Show, 42, Some(vec![1]));
    wanted(
        &host,
        "r1",
        &[(1, 1, "available"), (1, 2, "available"), (1, 3, "wanted")],
    );
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/42" => (200, show_json(&[(1, 3), (2, 8)])),
        _ => (404, serde_json::json!({})),
    });

    let view = ledger(&host, "r1").unwrap();
    let s1 = view
        .seasons
        .iter()
        .find(|s| s.season == 1)
        .expect("season 1");
    assert_eq!(s1.episode_count, 3, "what TMDB says the season holds");
    assert_eq!(s1.requested, 3, "the request covers three of them");
    assert_eq!(s1.on_disk, 2, "the library holds two");

    let s2 = view
        .seasons
        .iter()
        .find(|s| s.season == 2)
        .expect("season 2");
    assert_eq!(
        (s2.requested, s2.on_disk),
        (0, 0),
        "a season outside the request still shows"
    );

    assert_eq!(
        view.coverage.seasons,
        Some(vec![1]),
        "the editor reads the coverage back"
    );
    assert_eq!(
        view.local_id.as_deref(),
        Some("show1"),
        "linked to the show it already is"
    );
    assert!(
        !view.on_disk,
        "on_disk answers for a movie, never for a show"
    );
}

#[test]
fn a_movie_ledger_has_no_seasons_and_says_whether_the_film_is_held() {
    let host = host(Some("k"));
    exec(
        &host,
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','mixed','/x','now')",
    );
    exec(
        &host,
        "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','T','mkv','lib1','now')",
    );
    exec(
        &host,
        "INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('item','m1',7,0)",
    );
    seed_request(&host, "r1", RequestKind::Movie, 7, None);
    let _tmdb = FakeTmdb::start(|path| match path {
        "/movie/7" => (
            200,
            serde_json::json!({ "title": "Film", "release_date": "2020-01-01" }),
        ),
        _ => (404, serde_json::json!({})),
    });

    let view = ledger(&host, "r1").unwrap();
    assert!(view.seasons.is_empty());
    assert!(view.on_disk, "the library holds the film");
    assert_eq!(view.local_id.as_deref(), Some("m1"));
}

#[test]
fn a_season_row_carries_what_the_request_and_the_library_know() {
    let host = host(Some("k"));
    seed_show(&host, "show1", 42, &[(1, 1)]);
    seed_request(&host, "r1", RequestKind::Show, 42, Some(vec![1]));
    wanted(&host, "r1", &[(1, 1, "available"), (1, 2, "grabbed")]);
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/42" => (200, show_json(&[(1, 3)])),
        "/tv/42/season/1" => (200, episodes_json(&[1, 2, 3])),
        _ => (404, serde_json::json!({})),
    });

    let view = season_ledger(&host, "r1", 1).unwrap();
    assert_eq!(view.episodes.len(), 3);

    let e1 = &view.episodes[0];
    assert!(e1.on_disk, "on disk");
    assert_eq!(
        e1.item_id.as_deref(),
        Some("show1-s1e1"),
        "links to the file it already is"
    );
    assert_eq!(e1.video.as_ref().map(|v| v.codec.as_str()), Some("hevc"));
    assert_eq!(e1.duration_ms, Some(1_200_000));
    assert_eq!(e1.wanted_status.as_deref(), Some("available"));

    let e2 = &view.episodes[1];
    assert!(!e2.on_disk);
    assert_eq!(
        e2.wanted_status.as_deref(),
        Some("grabbed"),
        "a download is queued for it"
    );
    assert!(e2.item_id.is_none());

    let e3 = &view.episodes[2];
    assert!(
        e3.wanted_id.is_none(),
        "the request does not cover it, so it is untracked"
    );
    assert_eq!(e3.name.as_deref(), Some("E3"), "TMDB still describes it");
}

#[test]
fn a_movie_has_no_season_to_open() {
    let host = host(Some("k"));
    seed_request(&host, "r1", RequestKind::Movie, 7, None);
    assert!(season_ledger(&host, "r1", 1).unwrap().episodes.is_empty());
}

#[test]
fn preview_rows_describe_a_season_the_request_never_covered() {
    let host = host(Some("k"));
    seed_request(&host, "r1", RequestKind::Show, 42, Some(vec![1]));
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/42" => (200, show_json(&[(1, 3), (2, 2)])),
        "/tv/42/season/2" => (200, episodes_json(&[1, 2])),
        _ => (404, serde_json::json!({})),
    });
    let conn = host.db().get().unwrap();
    let req = db::get_request(&conn, "r1").unwrap().unwrap();
    drop(conn);

    let rows = preview_season_rows(&host, &req, 2).unwrap();
    assert_eq!(rows.len(), 2, "a searchable row per episode of the season");
    assert!(
        rows.iter()
            .all(|r| r.season == Some(2) && r.status == "wanted")
    );
    // Never persisted: the request still covers only what it covered.
    let conn = host.db().get().unwrap();
    assert!(db::wanted_for_request(&conn, "r1").unwrap().is_empty());
}

#[test]
fn a_movie_request_previews_no_season_rows() {
    let host = host(Some("k"));
    seed_request(&host, "r1", RequestKind::Movie, 7, None);
    let conn = host.db().get().unwrap();
    let req = db::get_request(&conn, "r1").unwrap().unwrap();
    drop(conn);
    assert!(preview_season_rows(&host, &req, 1).unwrap().is_empty());
}

#[test]
fn a_title_ledger_counts_every_row_whatever_it_answers_to() {
    let host = host(Some("k"));
    seed_show(&host, "show1", 42, &[(1, 1)]);
    let row = |episode: u32| db::WantedRow {
        id: db::unit_id("episode", 42, Some(1), Some(episode)),
        request_id: None,
        kind: "episode".into(),
        tmdb_id: 42,
        imdb_id: None,
        title: "Show".into(),
        year: None,
        season: Some(1),
        episode: Some(episode),
        air_date: None,
        status: "wanted".into(),
        last_search_at: None,
    };
    db::insert_wanted(host.db(), &[row(1), row(2)], 0).unwrap();
    let _tmdb = FakeTmdb::start(|path| match path {
        "/tv/42" => (200, show_json(&[(1, 3)])),
        "/tv/42/season/1" => (200, episodes_json(&[1, 2, 3])),
        _ => (404, serde_json::json!({})),
    });

    let view = title_ledger(&host, RequestKind::Show, 42).unwrap();
    let season = title_season_ledger(&host, 42, 1).unwrap();

    assert_eq!(view.title, "Show");
    assert_eq!(view.seasons[0].requested, 2);
    assert_eq!(view.seasons[0].on_disk, 1);
    let monitored: Vec<bool> = season
        .episodes
        .iter()
        .map(|e| e.wanted_id.is_some())
        .collect();
    assert_eq!(monitored, [true, true, false]);
}
