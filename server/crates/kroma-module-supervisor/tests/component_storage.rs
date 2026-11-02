#![cfg(unix)]

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{DECLARES, GUEST, STORES, Server, seed_core};

const NO_STORAGE: &str =
    r#", "permissions": { "net": { "connect": [{ "purpose": "probe", "to": ["lan"] }] } }"#;

#[test]
fn a_component_cannot_reach_a_file_of_the_machine() {
    let server = Server::new("component-file", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);

    let read = server.get(&endpoint, "/file");

    assert!(read.text().starts_with("Err("), "{}", read.text());
}

#[test]
fn a_component_keeps_rows_in_its_own_database_across_calls() {
    let server = Server::new("component-own-db", NetworkAction::Direct);
    seed_core(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);

    let first = server.get(&endpoint, "/own");
    let second = server.get(&endpoint, "/own");

    assert_eq!(first.text(), "Ok(1)");
    assert_eq!(second.text(), "Ok(2)");
    assert!(
        server
            .dir
            .path()
            .join("modules")
            .join(GUEST)
            .join("module.sqlite")
            .exists()
    );
}

#[test]
fn a_component_reads_the_core_tables_it_declares_and_no_other() {
    let server = Server::new("component-core-db", NetworkAction::Direct);
    seed_core(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);

    let granted = server.get(&endpoint, "/core/granted");
    let secret = server.get(&endpoint, "/core/secret");

    assert_eq!(granted.text(), "rows 2");
    assert!(secret.text().starts_with("refused"), "{}", secret.text());
}

#[test]
fn a_component_that_declares_no_storage_has_no_database() {
    let server = Server::new("component-no-db", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), NO_STORAGE);

    let own = server.get(&endpoint, "/own");

    assert!(
        own.status >= 500 || own.text().starts_with("Err"),
        "{}",
        own.text()
    );
}

#[test]
fn a_component_writes_in_its_own_folder() {
    let server = Server::new("component-own-folder", NetworkAction::Direct);
    seed_core(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);

    let kept = server.get(&endpoint, "/keep");

    assert_eq!(kept.text(), "Ok(\"kept\")");
}
