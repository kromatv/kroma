#![cfg(unix)]

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{GUEST, Server};

const HOLDS_DOWNLOADS: &str = r#", "storage": {}, "permissions": { "fs": { "read": ["downloads"], "write": ["downloads"] } }"#;

#[test]
fn a_component_holding_the_machine_lists_a_download_behind_an_absolute_link() {
    let server = Server::behind_an_absolute_link("component-linked-data", NetworkAction::Direct);
    let download = server.data_dir.join("torrents/downloads/54ed71fbe0318163");
    std::fs::create_dir_all(&download).unwrap();
    std::fs::write(
        download.join("FEAR THE WALKING DEAD S07 E05 - Jusqu'à la mort.mkv"),
        "x",
    )
    .unwrap();
    let endpoint = server.started(GUEST, guest_component(), HOLDS_DOWNLOADS);

    let listed = server.get(&endpoint, "/downloads/54ed71fbe0318163");

    assert_eq!(
        listed.text(),
        r#"Ok(["FEAR THE WALKING DEAD S07 E05 - Jusqu'à la mort.mkv"])"#
    );
}
