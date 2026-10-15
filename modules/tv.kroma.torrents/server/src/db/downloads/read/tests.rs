use super::super::write::*;
use super::*;
use crate::db::test_support::{download, seed_request, test_db};

#[test]
fn active_completed_and_dedup_queries() {
    let pool = test_db();
    for (id, status, at) in [
        ("d_q", "queued", 10),
        ("d_d", "downloading", 20),
        ("d_s", "seeding", 30),
        ("d_p", "paused", 40),
        ("d_c", "completed", 50),
        ("d_f", "failed", 60),
        ("d_r", "removed", 70),
        ("d_i", "imported", 80),
    ] {
        insert_download(&pool, &download(id, status, at)).unwrap();
    }
    let conn = pool.get().unwrap();

    let active: Vec<String> = active_downloads(&conn)
        .unwrap()
        .into_iter()
        .map(|d| d.id)
        .collect();
    assert_eq!(
        active,
        vec!["d_q".to_string(), "d_d".into(), "d_s".into(), "d_p".into()]
    );

    let completed: Vec<String> = completed_downloads(&conn)
        .unwrap()
        .into_iter()
        .map(|d| d.id)
        .collect();
    assert_eq!(completed, vec!["d_c".to_string()]);

    assert_eq!(
        active_download_by_url(&conn, "magnet:?xt=urn:btih:d_d")
            .unwrap()
            .map(|d| d.id),
        Some("d_d".to_string())
    );
    assert!(active_download_by_url(&conn, "magnet:?xt=urn:btih:d_f")
        .unwrap()
        .is_none());
    assert!(active_download_by_url(&conn, "magnet:?xt=urn:btih:none")
        .unwrap()
        .is_none());
}

#[test]
fn other_active_download_with_ref_dedups_by_engine_ref() {
    let pool = test_db();
    let mut a = download("a", "downloading", 10);
    a.client_ref = "ref-a".into();
    let mut b = download("b", "downloading", 20);
    b.client_ref = "ref-a".into();
    let mut c = download("c", "failed", 30);
    c.client_ref = "ref-b".into();
    insert_download(&pool, &a).unwrap();
    insert_download(&pool, &b).unwrap();
    insert_download(&pool, &c).unwrap();

    let conn = pool.get().unwrap();
    assert_eq!(
        other_active_download_with_ref(&conn, "a", "ref-a")
            .unwrap()
            .map(|d| d.id),
        Some("b".to_string())
    );
    assert!(other_active_download_with_ref(&conn, "a", "")
        .unwrap()
        .is_none());
    assert!(other_active_download_with_ref(&conn, "x", "ref-b")
        .unwrap()
        .is_none());
}

#[test]
fn a_title_is_live_while_its_own_client_still_holds_a_download_of_it() {
    let pool = test_db();
    let seeded = [
        (1, "queued", "embedded", "movie"),
        (2, "downloading", "embedded", "movie"),
        (3, "seeding", "embedded", "movie"),
        (4, "completed", "embedded", "movie"),
        (5, "paused", "embedded", "movie"),
        (6, "failed", "embedded", "movie"),
        (7, "removed", "embedded", "movie"),
        (8, "imported", "embedded", "movie"),
        (9, "downloading", "qbittorrent", "movie"),
        (10, "downloading", "embedded", "season"),
        (1, "paused", "embedded", "movie"),
    ];
    for (at, (tmdb_id, status, client_id, kind)) in (0..).zip(seeded) {
        let row = DownloadRow {
            tmdb_id: Some(tmdb_id),
            client_id: client_id.into(),
            kind: kind.into(),
            ..download(&format!("d{at}"), status, at)
        };
        insert_download(&pool, &row).unwrap();
    }
    let conn = pool.get().unwrap();

    let live: Vec<Option<String>> = (1..=10)
        .map(|tmdb_id| live_downloads_for_title(&conn, tmdb_id, "embedded").unwrap())
        .map(|rows| {
            rows.into_iter()
                .find(|row| covers(row, "movie", None) == Covers::Yes)
                .map(|row| row.id)
        })
        .collect();

    let newest_live = ["d10", "d1", "d2", "d3", "d4"].map(|id| Some(id.to_string()));
    assert_eq!(live[..5], newest_live);
    assert!(live[5..].iter().all(Option::is_none));
}

#[test]
fn an_episode_is_live_in_its_own_release_and_a_pack_answers_for_its_files_alone() {
    let pack = DownloadRow {
        kind: "season".into(),
        season: Some(1),
        episodes: Some(Vec::new()),
        ..download("p1", "downloading", 1)
    };
    let named = DownloadRow {
        kind: "episode".into(),
        season: Some(2),
        episodes: Some(vec![3, 4]),
        ..download("e3", "downloading", 2)
    };

    let verdicts = [
        covers(&pack, "show", Some((1, 5))),
        covers(&pack, "show", Some((2, 5))),
        covers(&named, "show", Some((2, 4))),
        covers(&named, "show", Some((2, 9))),
    ];

    assert_eq!(
        verdicts,
        [
            Covers::IfItsFilesHold(5),
            Covers::No,
            Covers::Yes,
            Covers::No
        ]
    );
}

#[test]
fn a_title_with_no_episode_asked_for_is_covered_by_its_own_kind() {
    let film = download("d1", "downloading", 1);

    assert_eq!(covers(&film, "movie", None), Covers::Yes);
    assert_eq!(covers(&film, "show", None), Covers::No);
}

#[test]
fn requests_with_active_downloads_rollup() {
    let pool = test_db();
    seed_request(&pool, "req1", "T");
    seed_request(&pool, "req2", "T");

    let mut a = download("a", "downloading", 10);
    a.request_id = Some("req1".into());
    a.progress = 0.5;
    let mut b = download("b", "completed", 20);
    b.request_id = Some("req1".into());
    b.progress = 1.0;
    let mut c = download("c", "failed", 30);
    c.request_id = Some("req1".into());
    c.progress = 0.9;
    let mut e = download("e", "downloading", 40);
    e.request_id = Some("req2".into());
    e.progress = 0.2;
    let f = download("f", "downloading", 50);
    for d in [a, b, c, e, f] {
        insert_download(&pool, &d).unwrap();
    }

    let conn = pool.get().unwrap();
    let by_req: std::collections::HashMap<String, ActiveDownload> =
        requests_with_active_downloads(&conn)
            .unwrap()
            .into_iter()
            .map(|r| (r.request_id.clone(), r))
            .collect();
    assert_eq!(by_req.len(), 2);

    let r1 = &by_req["req1"];
    assert!(r1.importing);
    // AVG over live+completed only (the failed row is excluded): (0.5 + 1.0)/2.
    assert!((r1.progress - 0.75).abs() < 1e-9);

    let r2 = &by_req["req2"];
    assert!(!r2.importing);
    assert!((r2.progress - 0.2).abs() < 1e-9);
}

#[test]
fn deriving_request_status_from_a_missing_downloads_table_errors_rather_than_reading_as_idle() {
    let pool = test_db();
    let conn = pool.get().unwrap();
    conn.execute_batch("DROP TABLE downloads").unwrap();

    assert!(requests_with_active_downloads(&conn).is_err());
}
