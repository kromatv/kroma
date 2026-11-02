use super::{db_pool, port_query, seed_row, DbHost};
use crate::port::DownloadTarget;
use crate::{admin, db, search};

#[test]
fn a_builtin_search_for_a_definition_that_is_not_installed_fails_loudly() {
    let pool = db_pool();
    let mut row = seed_row("builtin-gone", admin::KIND_BUILTIN, true, 100);
    row.definition_id = Some("a-tracker-that-does-not-exist".into());
    db::insert_indexer(&pool, &row).unwrap();
    let host = DbHost::with_store(pool.clone());

    assert!(search::run(&host, &row, &port_query(), &[2000]).is_err());
}

#[test]
fn resolving_a_plain_url_needs_the_indexers_session() {
    let pool = db_pool();
    let mut row = seed_row("builtin-nodef", admin::KIND_BUILTIN, true, 100);
    row.definition_id = Some("also-missing".into());
    db::insert_indexer(&pool, &row).unwrap();
    let host = DbHost::with_store(pool.clone());

    assert!(search::resolve_download(
        &host,
        &row,
        "Some.Release",
        None,
        "http://tracker.invalid/dl/1"
    )
    .is_err());
}

#[test]
fn fetching_a_torrent_from_a_builtin_indexer_reports_a_session_failure() {
    let pool = db_pool();
    let mut row = seed_row("builtin-fetch", admin::KIND_BUILTIN, true, 100);
    row.definition_id = Some("nowhere-to-be-found".into());
    db::insert_indexer(&pool, &row).unwrap();
    let host = DbHost::with_store(pool.clone());

    let outcome = search::fetch_torrent(&host, "builtin-fetch", "http://x/f.torrent");
    assert!(
        outcome.is_err(),
        "a built-in grab must not degrade to a plain fetch"
    );
}

#[test]
fn a_grab_whose_database_is_gone_reports_the_failure_instead_of_no_such_indexer() {
    let dir = kroma_module_sdk::testing::temp_dir("indexer-lib-nopool");
    let pool = kroma_module_sdk::db::open(&dir.path().join("module.sqlite")).unwrap();
    let held = pool.get().unwrap();
    std::fs::remove_dir_all(dir.path()).unwrap();
    let host = DbHost::with_store(pool.clone());

    let outcome = search::fetch_torrent(&host, "any", "http://x/f.torrent");

    assert!(outcome.is_err());
    drop(held);
}

#[test]
fn a_grab_whose_indexers_table_is_gone_reports_the_failure() {
    let pool = db_pool();
    pool.get()
        .unwrap()
        .execute_batch("DROP TABLE indexers")
        .unwrap();
    let host = DbHost::with_store(pool.clone());

    let outcome = search::fetch_torrent(&host, "any", "http://x/f.torrent");

    assert!(outcome.is_err());
}

const SEARCH_DEF: &str = r#"
id: local
name: Local Tracker
caps:
  modes:
    search: [q]
search:
  paths:
    - path: /search
  rows:
    selector: "tr.r"
  fields:
    title:
      selector: "td.title"
    guid:
      selector: "td.title"
"#;

const DOWNLOAD_DEF: &str = r#"
id: local
name: Local Tracker
caps:
  modes:
    search: [q]
search:
  rows:
    selector: "tr.r"
download:
  selectors:
    - selector: "a.dl"
      attribute: href
"#;

pub(super) fn serve(body: &'static [u8], content_type: &'static str) -> String {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            use std::io::{BufRead as _, Write as _};
            let Ok(mut stream) = stream else { break };
            let mut reader = std::io::BufReader::new(stream.try_clone().unwrap());
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
            }
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: {content_type}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body);
            let _ = stream.flush();
        }
    });
    format!("http://127.0.0.1:{port}")
}

pub(super) fn install_definition(host: &DbHost, id: &str, yaml: &str) {
    use kroma_module_sdk::host::HostCtx as _;
    let dir = host.data_dir().join("indexer-defs");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(format!("{id}.yml")), yaml).unwrap();
}

pub(super) fn builtin_row(id: &str, definition_id: &str, url: String) -> db::IndexerRow {
    let mut row = seed_row(id, admin::KIND_BUILTIN, true, 100);
    row.definition_id = Some(definition_id.into());
    row.url = url;
    row
}

#[test]
fn a_builtin_search_runs_the_definition_and_hands_back_the_rows_it_parsed() {
    let pool = db_pool();
    let host = DbHost::with_store(pool.clone());
    install_definition(&host, "search-def", SEARCH_DEF);
    let row = builtin_row(
        "builtin-search",
        "search-def",
        serve(
            br#"<table><tr class="r"><td class="title">The.Matrix.1999.1080p</td></tr></table>"#,
            "text/html",
        ),
    );

    let outcome = search::run(&host, &row, &port_query(), &[2000]).unwrap();

    assert!(outcome.errors.is_empty(), "{:?}", outcome.errors);
    assert_eq!(outcome.releases.len(), 1);
    assert_eq!(outcome.releases[0].title, "The.Matrix.1999.1080p");
}

#[test]
fn a_details_page_that_only_carries_a_magnet_resolves_to_that_magnet() {
    let pool = db_pool();
    let host = DbHost::with_store(pool.clone());
    install_definition(&host, "download-def", DOWNLOAD_DEF);
    let base = serve(
        br#"<html><body><a class="dl" href="magnet:?xt=urn:btih:cafebabe">grab</a></body></html>"#,
        "text/html",
    );
    let details = format!("{base}/details/1");
    let row = builtin_row("builtin-details", "download-def", base);

    let out =
        search::resolve_download(&host, &row, "Some.Release", Some(&details), &details).unwrap();

    assert!(
        matches!(out, DownloadTarget::Magnet(ref m) if m == "magnet:?xt=urn:btih:cafebabe"),
        "{out:?}"
    );
}

#[test]
fn a_definition_with_no_download_rule_hands_the_url_back_untouched() {
    let pool = db_pool();
    let host = DbHost::with_store(pool.clone());
    install_definition(&host, "search-def", SEARCH_DEF);
    let row = builtin_row(
        "builtin-plain",
        "search-def",
        "http://tracker.invalid".into(),
    );

    let out = search::resolve_download(
        &host,
        &row,
        "Some.Release",
        None,
        "http://tracker.invalid/dl/1",
    )
    .unwrap();

    assert!(
        matches!(out, DownloadTarget::TorrentUrl(ref u) if u == "http://tracker.invalid/dl/1"),
        "{out:?}"
    );
}

#[test]
fn a_builtin_grab_goes_out_through_the_indexers_own_session() {
    let pool = db_pool();
    let base = serve(b"d8:announce9:udp://x:0e", "application/x-bittorrent");
    let row = builtin_row("builtin-ok", "search-def", base.clone());
    db::insert_indexer(&pool, &row).unwrap();
    let host = DbHost::with_store(pool.clone());
    install_definition(&host, "search-def", SEARCH_DEF);

    let bytes = search::fetch_torrent(&host, "builtin-ok", &format!("{base}/dl/1.torrent"))
        .expect("a built-in row is this port's to answer")
        .expect("the fake tracker served the file");

    assert_eq!(bytes, b"d8:announce9:udp://x:0e");
}
