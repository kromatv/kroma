#![cfg(unix)]

use std::path::Path;

use kroma_module_host::NetworkAction;
use kroma_module_supervisor::MODULE_COMPONENT;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{DECLARES, FIRST_PARTY, GUEST, STORES, Server, place_component, seed_core};

const HOST_FILES: [&str; 5] = ["module.json", "origin.json", MODULE_COMPONENT, "module.cwasm", "module.stamp"];

fn ask(server: &Server, how: &str, path: &Path) -> String {
    let endpoint = server.supervisor.endpoint_of(GUEST).unwrap();
    server
        .get(&endpoint, &format!("/{how}?{}", path.display()))
        .text()
}

#[test]
fn a_module_holding_its_own_folder_reaches_none_of_what_the_host_installed() {
    let server = Server::new("component-installed-apart", NetworkAction::Direct);
    seed_core(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);
    let installed = server.installed_dir(GUEST);
    let before: Vec<Vec<u8>> = HOST_FILES
        .iter()
        .map(|name| std::fs::read(installed.join(name)).unwrap())
        .collect();

    let kept = server.get(&endpoint, "/keep").text();
    let reached: Vec<String> = HOST_FILES
        .iter()
        .flat_map(|name| ["read", "write"].map(|how| ask(&server, how, &installed.join(name))))
        .collect();

    assert_eq!(kept, r#"Ok("kept")"#);
    assert!(reached.iter().all(|answer| answer.starts_with("Err(")), "{reached:?}");
    let after: Vec<Vec<u8>> = HOST_FILES
        .iter()
        .map(|name| std::fs::read(installed.join(name)).unwrap())
        .collect();
    assert_eq!(before, after);
}

#[test]
fn a_component_changed_after_its_install_does_not_start() {
    let server = Server::new("component-installed-changed", NetworkAction::Direct);
    let installed = server.installed(GUEST, DECLARES, FIRST_PARTY);
    place_component(&installed, guest_component(), FIRST_PARTY);
    let mut changed = guest_component().to_vec();
    changed.extend_from_slice(b"\0");
    std::fs::write(installed.join(MODULE_COMPONENT), changed).unwrap();

    let refused = server.supervisor.spawn(GUEST).unwrap_err().to_string();

    assert!(
        refused.contains("does not match the sha256 recorded when it was installed"),
        "{refused}"
    );
    assert!(!server.supervisor.is_running(GUEST));
}

#[test]
fn a_compiled_copy_changed_after_it_was_kept_is_compiled_again() {
    let server = Server::new("component-installed-copy", NetworkAction::Direct);
    server.started(GUEST, guest_component(), DECLARES);
    server.supervisor.stop(GUEST);
    let copy = server.installed_dir(GUEST).join("module.cwasm");
    let mut changed = std::fs::read(&copy).unwrap();
    let last = changed.len() - 1;
    changed[last] ^= 0xff;
    std::fs::write(&copy, changed).unwrap();

    let endpoint = server.supervisor.spawn(GUEST).unwrap();
    let answered = server.get(&endpoint, "/echo");

    assert_eq!(answered.text(), "still here");
    let said = server.said.lock().unwrap();
    assert!(
        said.iter().any(|line| line.contains("is not the one recorded beside it")),
        "{said:?}"
    );
    assert!(!said.iter().any(|line| line.contains("from its compiled copy")), "{said:?}");
}

#[test]
fn a_module_installed_before_the_host_kept_its_files_apart_starts_with_its_database() {
    let server = Server::laid_out("component-installed-moved", |data_dir| {
        let old = data_dir.join("modules").join(GUEST);
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(
            old.join("module.json"),
            format!(
                r#"{{ "schemaVersion": {}, "id": "{GUEST}", "name": "Stub", "version": "1.0.0" {STORES} }}"#,
                kroma_module_manifest::MODULE_SCHEMA_VERSION
            ),
        )
        .unwrap();
        std::fs::write(old.join("origin.json"), FIRST_PARTY).unwrap();
        std::fs::write(old.join(MODULE_COMPONENT), guest_component()).unwrap();
        rusqlite::Connection::open(old.join("module.sqlite"))
            .unwrap()
            .execute_batch(
                "CREATE TABLE mine (id INTEGER PRIMARY KEY, name TEXT);
                 INSERT INTO mine (name) VALUES ('before'), ('the move');",
            )
            .unwrap();
    });
    seed_core(&server);

    let endpoint = server.supervisor.spawn(GUEST).unwrap();
    let counted = server.get(&endpoint, "/own").text();

    assert_eq!(counted, "Ok(3)");
    assert!(server.supervisor.origin(GUEST).official);
    assert!(!server.own_dir(GUEST).join("module.json").exists());
}
