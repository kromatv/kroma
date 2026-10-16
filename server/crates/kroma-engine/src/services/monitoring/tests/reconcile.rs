use super::*;

fn monitored_show(host: &StubHost, on_disk: &[(u32, u32)]) -> FakeTmdb {
    let tmdb = tmdb();
    seed_show_on_disk(host, on_disk);
    monitor(host, RequestKind::Show, SHOW, &MonitorBody::default(), None).unwrap();
    tmdb
}

fn settle(host: &StubHost) {
    exec(host, "UPDATE wanted SET updated_at = 0");
}

fn status_of(host: &StubHost, season: u32, episode: u32) -> String {
    units(host, RequestKind::Show, SHOW)
        .into_iter()
        .find(|(s, e, _)| *s == Some(season) && *e == Some(episode))
        .unwrap()
        .2
}

#[test]
fn an_episode_that_lands_on_disk_becomes_available() {
    let host = host();
    let _tmdb = monitored_show(&host, &[]);
    seed_show_on_disk(&host, &[(1, 2)]);

    let summary = reconcile_pass(&host).unwrap();

    assert_eq!(status_of(&host, 1, 2), "available");
    assert_eq!(summary.available, 1);
}

#[test]
fn an_episode_whose_file_is_gone_is_missing_again_once_settled() {
    let host = host();
    let _tmdb = monitored_show(&host, &[(1, 1), (1, 2)]);
    exec(&host, "DELETE FROM items WHERE id = 'e12'");
    settle(&host);

    let summary = reconcile_pass(&host).unwrap();

    assert_eq!(status_of(&host, 1, 2), "wanted");
    assert_eq!(status_of(&host, 1, 1), "available");
    assert_eq!(summary.missing_again, 1);
}

#[test]
fn a_file_gone_moments_after_it_landed_is_left_alone() {
    let host = host();
    let _tmdb = monitored_show(&host, &[(1, 1), (1, 2)]);
    exec(&host, "DELETE FROM items WHERE id = 'e12'");

    reconcile_pass(&host).unwrap();

    assert_eq!(status_of(&host, 1, 2), "available");
}

#[test]
fn a_show_the_catalogue_lost_entirely_keeps_its_episodes() {
    let host = host();
    let _tmdb = monitored_show(&host, &[(1, 1)]);
    exec(&host, "DELETE FROM items");
    exec(&host, "DELETE FROM shows");
    settle(&host);

    reconcile_pass(&host).unwrap();

    assert_eq!(status_of(&host, 1, 1), "available");
}

#[test]
fn many_files_vanishing_at_once_are_held_back() {
    let host = host();
    exec(
        &host,
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','movies','/x','now')",
    );
    let rows: Vec<db::WantedRow> = (0..30)
        .map(|n| db::WantedRow {
            id: format!("m{n}"),
            request_id: None,
            kind: "movie".into(),
            tmdb_id: 1000 + n,
            imdb_id: None,
            title: "M".into(),
            year: None,
            season: None,
            episode: None,
            air_date: None,
            status: "available".into(),
            last_search_at: None,
        })
        .collect();
    db::insert_wanted(host.db(), &rows, 0).unwrap();
    for n in 0..30 {
        exec(
            &host,
            &format!(
                "INSERT INTO monitored (kind,tmdb_id,title,added_at,updated_at) VALUES ('movie',{},'M',0,0)",
                1000 + n
            ),
        );
    }

    let summary = reconcile_pass(&host).unwrap();

    assert_eq!(summary.held_back, 30);
    assert_eq!(summary.missing_again, 0);
}

#[test]
fn an_imported_film_is_on_disk_before_enrichment_matches_it() {
    let host = host();
    let _tmdb = tmdb();
    monitor(
        &host,
        RequestKind::Movie,
        MOVIE,
        &MonitorBody::default(),
        None,
    )
    .unwrap();
    exec(
        &host,
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','movies','/x','now')",
    );
    exec(
        &host,
        "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('m1','movie','The Matrix','mkv','lib1','now')",
    );
    exec(
        &host,
        "INSERT INTO files (id,item_id,abs_path,rel_path,container) VALUES ('f1','m1','/x/m.mkv','m.mkv','mkv')",
    );
    db::set_file_tmdb(host.db(), "/x/m.mkv", MOVIE).unwrap();

    reconcile_pass(&host).unwrap();

    assert_eq!(units(&host, RequestKind::Movie, MOVIE)[0].2, "available");
}
