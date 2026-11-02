use std::time::{Duration, Instant};

use super::*;
use crate::TorrentFileEntry;
use crate::rqbit::RqbitConfig;
use crate::rqbit::test_support::{StubApi, engine_over};

const HASH: &str = "192202572932341be69b679e0c4997fb28aea0d7";
const LIST: &str = "GET /torrents";
const ADD: &str = "POST /torrents";
const DETAILS: &str = "GET /torrents/192202572932341be69b679e0c4997fb28aea0d7";
const FILES: &str = r#"{"info_hash":"192202572932341be69b679e0c4997fb28aea0d7","files":[
    {"components":["sub","note.txt"],"length":6},{"components":["sample.bin"],"length":64}]}"#;
const ADDED: &str = r#"{"id":0,"details":{"info_hash":"192202572932341be69b679e0c4997fb28aea0d7","files":[
    {"components":["sub","note.txt"],"length":6},{"components":["sample.bin"],"length":64}]},"seen_peers":null}"#;
const MAGNET: &str = "magnet:?xt=urn:btih:192202572932341be69b679e0c4997fb28aea0d7";

fn listed(stats: &str) -> String {
    format!(r#"{{"torrents":[{{"info_hash":"{HASH}","name":"data","stats":{stats}}}]}}"#)
}

fn client_over(stub: &StubApi) -> Box<dyn DownloadClient> {
    engine_over(stub, RqbitConfig::default()).client()
}

fn status_when(stats: &str) -> TorrentStatus {
    let body = listed(stats);
    let stub = StubApi::serving(&[(LIST, 200, &body), (DETAILS, 200, FILES)]);

    client_over(&stub).status(HASH).unwrap().unwrap()
}

fn request<'a>(bytes: Option<&'a [u8]>) -> AddTorrentReq<'a> {
    AddTorrentReq {
        magnet_or_url: MAGNET,
        download_dir: Some("/downloads/one"),
        label: "kroma",
        only_files: Some(&[0, 2]),
        torrent_bytes: bytes,
    }
}

fn answer_to_add(client: &dyn DownloadClient, req: &AddTorrentReq) -> Result<String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match client.add(req) {
            Err(error) if error.is::<StillAdding>() && Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(20));
            }
            answer => return answer,
        }
    }
}

#[test]
fn every_state_rqbit_reports_reads_as_the_state_the_ledger_knows() {
    for (stats, expected) in [
        (r#"{"state":"initializing"}"#, TorrentState::Queued),
        (
            r#"{"state":"live","finished":false}"#,
            TorrentState::Downloading,
        ),
        (r#"{"state":"live","finished":true}"#, TorrentState::Seeding),
        (
            r#"{"state":"paused","finished":false}"#,
            TorrentState::Paused,
        ),
        (
            r#"{"state":"paused","finished":true}"#,
            TorrentState::Completed,
        ),
        (r#"{"state":"error","error":"disk"}"#, TorrentState::Error),
        (
            r#"{"state":"a-state-from-a-later-release"}"#,
            TorrentState::Queued,
        ),
    ] {
        assert_eq!(status_when(stats).state, expected, "{stats}");
    }
}

#[test]
fn a_status_carries_progress_speed_peers_and_files() {
    let status = status_when(
        r#"{"state":"live","progress_bytes":25,"uploaded_bytes":7,"total_bytes":100,"finished":false,
            "live":{"snapshot":{"peer_stats":{"live":3,"seen":9}},
            "download_speed":{"mbps":2.0},"upload_speed":{"mbps":0.5}}}"#,
    );

    assert_eq!(status.client_ref, HASH);
    assert_eq!(status.info_hash.as_deref(), Some(HASH));
    assert_eq!(status.name, "data");
    assert_eq!(status.progress, 0.25);
    assert_eq!(status.down_bps, 2 * 1024 * 1024);
    assert_eq!(status.up_bps, 512 * 1024);
    assert_eq!((status.peers, status.peers_seen), (3, 9));
    assert_eq!(status.size_bytes, 100);
    assert_eq!(status.lifetime_downloaded_bytes, 25);
    assert_eq!(status.lifetime_uploaded_bytes, 7);
    assert_eq!(status.files, ["sub/note.txt", "sample.bin"]);
    assert_eq!(status.save_path, None);
}

#[test]
fn a_torrent_with_no_length_yet_is_at_no_progress_rather_than_a_division_by_zero() {
    let status = status_when(r#"{"state":"initializing","progress_bytes":0,"total_bytes":0}"#);

    assert_eq!(status.progress, 0.0);
}

#[test]
fn a_torrent_the_engine_does_not_hold_is_none_rather_than_an_error() {
    let stub = StubApi::serving(&[(LIST, 200, r#"{"torrents":[]}"#)]);

    assert!(client_over(&stub).status(HASH).unwrap().is_none());
}

#[test]
fn an_engine_that_cannot_answer_is_an_error_so_the_row_is_not_failed_for_it() {
    let stub = StubApi::serving(&[(LIST, 500, "{}")]);

    assert!(client_over(&stub).status(HASH).is_err());
}

#[test]
fn every_download_on_one_tick_shares_one_listing_and_a_file_list_is_asked_once() {
    let body = listed(r#"{"state":"live"}"#);
    let stub = StubApi::serving(&[(LIST, 200, &body), (DETAILS, 200, FILES)]);
    let client = client_over(&stub);

    client.status(HASH).unwrap();
    client.status(HASH).unwrap();

    assert_eq!(stub.seen(LIST).len(), 1);
    assert_eq!(stub.seen(DETAILS).len(), 1);
}

#[test]
fn every_call_carries_the_credential_and_the_password_never_reaches_a_url() {
    let body = listed(r#"{"state":"live"}"#);
    let stub = StubApi::serving(&[(LIST, 200, &body), (DETAILS, 200, FILES)]);

    client_over(&stub).status(HASH).unwrap();

    let seen = stub.seen(LIST).remove(0);
    assert!(
        seen.head.to_lowercase().contains("authorization: basic "),
        "{}",
        seen.head
    );
    assert!(!seen.path_and_query.contains("password"));
}

#[test]
fn a_listing_asks_for_no_add_and_numbers_the_files_in_order() {
    let stub = StubApi::serving(&[(ADD, 200, ADDED)]);

    let files = client_over(&stub)
        .list_files("", Some(b"d4:infoe"))
        .unwrap();

    let seen = stub.seen(ADD).remove(0);
    let paths: Vec<(usize, &str, u64)> = files
        .iter()
        .map(
            |TorrentFileEntry {
                 index,
                 path,
                 size_bytes,
             }| (*index, path.as_str(), *size_bytes),
        )
        .collect();
    assert_eq!(paths, [(0, "sub/note.txt", 6), (1, "sample.bin", 64)]);
    assert!(
        seen.path_and_query.contains("list_only=true"),
        "{}",
        seen.path_and_query
    );
    assert!(
        !seen.path_and_query.contains("overwrite"),
        "{}",
        seen.path_and_query
    );
}

fn removal_asks_for(delete_data: bool) -> (usize, usize) {
    let delete = format!("POST /torrents/{HASH}/delete");
    let forget = format!("POST /torrents/{HASH}/forget");
    let stub = StubApi::serving(&[(delete.as_str(), 200, "{}"), (forget.as_str(), 200, "{}")]);

    client_over(&stub).remove(HASH, delete_data).unwrap();

    (stub.seen(&delete).len(), stub.seen(&forget).len())
}

#[test]
fn removing_with_the_data_deletes_it() {
    assert_eq!(removal_asks_for(true), (1, 0));
}

#[test]
fn removing_without_the_data_only_forgets_the_torrent() {
    assert_eq!(removal_asks_for(false), (0, 1));
}

#[test]
fn a_pause_reaches_the_torrent_it_names() {
    let pause = format!("POST /torrents/{HASH}/pause");
    let stub = StubApi::serving(&[(pause.as_str(), 200, "{}")]);

    client_over(&stub).pause(HASH).unwrap();

    assert_eq!(stub.seen(&pause).len(), 1);
}

#[test]
fn a_resume_starts_the_torrent_it_names() {
    let start = format!("POST /torrents/{HASH}/start");
    let stub = StubApi::serving(&[(start.as_str(), 200, "{}")]);

    client_over(&stub).resume(HASH).unwrap();

    assert_eq!(stub.seen(&start).len(), 1);
}

fn reannounce_when(state: &str) -> (usize, usize) {
    let pause = format!("POST /torrents/{HASH}/pause");
    let start = format!("POST /torrents/{HASH}/start");
    let body = listed(&format!(r#"{{"state":"{state}"}}"#));
    let stub = StubApi::serving(&[
        (LIST, 200, &body),
        (pause.as_str(), 200, "{}"),
        (start.as_str(), 200, "{}"),
    ]);

    client_over(&stub).reannounce(HASH).unwrap();

    (stub.seen(&pause).len(), stub.seen(&start).len())
}

#[test]
fn a_reannounce_cycles_a_running_torrent() {
    assert_eq!(reannounce_when("live"), (1, 1));
}

#[test]
fn a_reannounce_leaves_a_paused_torrent_paused() {
    assert_eq!(reannounce_when("paused"), (0, 0));
}

#[test]
fn a_test_of_the_engine_names_the_helper_and_its_version() {
    let stub = StubApi::serving(&[]);

    assert_eq!(client_over(&stub).test().unwrap(), "rqbit 9.1.0 (helper)");
}

mod adding;
