use kroma_module_host::HostStorage;

use crate::db;
use crate::model::{RequestKind, RequestStatus};
use crate::services::jobs::now_ms;

pub(super) type TestHost = kroma_module_host::testing::StubHost;

pub(super) fn test_host() -> TestHost {
    host_with_tmdb(Some("test-key"))
}

pub(super) fn host_without_tmdb() -> TestHost {
    host_with_tmdb(None)
}

pub(super) fn host_with_tmdb(key: Option<&str>) -> TestHost {
    // `en-US`, not the stub's bare `en`: a test asserts the exact `language=`
    // sent to TMDB.
    let host = TestHost::with_db("requests")
        .with_module_enabled(false)
        .with_metadata_language("en-US");
    match key {
        Some(k) => host.with_tmdb_key(k),
        None => host,
    }
}

pub(super) fn exec(host: &TestHost, sql: &str) {
    host.db().get().unwrap().execute(sql, []).unwrap();
}

pub(super) fn seed_library(host: &TestHost) {
    exec(host, "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib1','L','mixed','/x','now')");
}

pub(super) fn seed_movie_item(host: &TestHost, item_id: &str, tmdb: u64) {
    seed_library(host);
    exec(host, &format!("INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('{item_id}','movie','T','mkv','lib1','now')"));
    exec(host, &format!("INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('item','{item_id}',{tmdb},0)"));
}

pub(super) fn seed_show(host: &TestHost, show_id: &str, tmdb: u64, present: &[(u32, u32)]) {
    seed_library(host);
    exec(host, &format!("INSERT INTO shows (id,library,title,added_at) VALUES ('{show_id}','lib1','Show','now')"));
    exec(host, &format!("INSERT INTO metadata_core (subject_kind,subject_id,tmdb_id,updated_at) VALUES ('show','{show_id}',{tmdb},0)"));
    for (s, e) in present {
        exec(host, &format!("INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) VALUES ('{show_id}-s{s}e{e}','episode','E','mkv','lib1','{show_id}',{s},{e},'now')"));
    }
}

pub(super) fn insert_req(
    host: &TestHost,
    id: &str,
    kind: RequestKind,
    tmdb: u64,
    status: RequestStatus,
) {
    insert_req_by(host, id, kind, tmdb, status, None);
}

pub(super) fn seed_user(host: &TestHost, id: &str) {
    exec(host, &format!("INSERT OR IGNORE INTO users (id,email,username,password_hash,created_at) VALUES ('{id}','{id}@example.test','{id}','x','now')"));
}

pub(super) fn insert_req_by(
    host: &TestHost,
    id: &str,
    kind: RequestKind,
    tmdb: u64,
    status: RequestStatus,
    requested_by: Option<&str>,
) {
    if let Some(uid) = requested_by {
        seed_user(host, uid);
    }
    db::insert_request(
        host.db(),
        &db::NewRequest {
            id: id.into(),
            kind,
            tmdb_id: tmdb,
            title: "T".into(),
            year: Some(2020),
            poster_url: None,
            seasons: None,
            episodes: None,
            status,
            requested_by: requested_by.map(str::to_string),
        },
        now_ms(),
    )
    .unwrap();
}

pub(super) fn status_of_req(host: &TestHost, id: &str) -> RequestStatus {
    let conn = host.db().get().unwrap();
    db::get_request(&conn, id).unwrap().unwrap().status
}

pub(super) fn wanted_pairs(host: &TestHost, id: &str) -> Vec<(u32, u32)> {
    let conn = host.db().get().unwrap();
    let mut pairs: Vec<(u32, u32)> = db::wanted_for_request(&conn, id)
        .unwrap()
        .iter()
        .filter_map(|w| Some((w.season?, w.episode?)))
        .collect();
    pairs.sort_unstable();
    pairs
}
