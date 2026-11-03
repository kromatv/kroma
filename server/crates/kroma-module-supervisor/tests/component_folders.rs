#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::sync::Arc;

use kroma_module_host::NetworkAction;
use kroma_module_supervisor::{Endpoint, FolderRoots};

mod component_support;

use component_support::wasm::guest_component;
use component_support::{GUEST, Server, THIRD_PARTY};

const HOLDS_DOWNLOADS: &str = r#", "storage": {}, "permissions": { "fs": { "read": ["downloads", "media"], "write": ["downloads", "media"] } }"#;
const ENGINE: &str = "tv.example.engine";
const KEEPS_DOWNLOADS: &str = r#", "dataDirs": ["torrents"], "permissions": { "fs": { "read": ["module", "downloads"], "write": ["module", "downloads"] } }"#;

fn on_a_machine(tag: &str) -> Server {
    let server = Server::holding(tag, |machine| {
        for folder in ["library", "incoming", "releases/7/bin", "data/helpers"] {
            std::fs::create_dir_all(machine.join(folder)).unwrap();
        }
        let named = [
            machine.join("incoming"),
            machine.to_path_buf(),
            machine.join("data/helpers"),
            machine.join("releases"),
        ];
        let libraries = [machine.join("library"), machine.join("data/helpers")];
        FolderRoots {
            media: Arc::new(move || libraries.to_vec()),
            downloads: Arc::new(move || named.to_vec()),
            server_dirs: vec![machine.join("releases")],
        }
    });
    server.installed_beside(ENGINE, KEEPS_DOWNLOADS);
    std::fs::create_dir_all(server.data_dir.join("torrents/downloads")).unwrap();
    server
}

fn ask(server: &Server, endpoint: &Endpoint, how: &str, path: &Path) -> String {
    server
        .get(endpoint, &format!("/{how}?{}", path.display()))
        .text()
}

#[test]
fn a_downloads_module_writes_in_its_download_folders_and_the_libraries() {
    let server = on_a_machine("component-download-folders");
    let machine = server.dir.path();
    let endpoint = server.started(GUEST, guest_component(), HOLDS_DOWNLOADS);

    let written: Vec<String> = [
        server.data_dir.join("torrents/downloads/engine.mkv"),
        machine.join("incoming/client.mkv"),
        machine.join("library/film.mkv"),
    ]
    .iter()
    .map(|path| ask(&server, &endpoint, "write", path))
    .collect();
    let read = ask(
        &server,
        &endpoint,
        "read",
        &machine.join("incoming/client.mkv"),
    );

    assert_eq!(written, ["Ok(())"; 3]);
    assert_eq!(read, r#"Ok("written")"#);
}

#[test]
fn a_downloads_module_opens_none_of_the_servers_own_files() {
    let server = on_a_machine("component-download-own");
    let helper = server.data_dir.join("helpers").join(ENGINE).join("rqbit");
    let database = server.databases_dir(ENGINE).join("module.sqlite");
    let binary = server.dir.path().join("releases/7/bin/kroma-server");
    for file in [&helper, &database, &binary] {
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(file, "mine").unwrap();
    }
    let endpoint = server.started(GUEST, guest_component(), HOLDS_DOWNLOADS);

    let opened: Vec<String> = [&helper, &database, &binary, &PathBuf::from("/etc/passwd")]
        .into_iter()
        .flat_map(|path| ["read", "write"].map(|how| ask(&server, &endpoint, how, path)))
        .collect();

    assert!(
        opened.iter().all(|answer| answer.starts_with("Err(")),
        "{opened:?}"
    );
    assert_eq!(std::fs::read_to_string(&helper).unwrap(), "mine");
}

#[test]
fn a_download_folder_named_over_the_servers_own_files_is_refused_on_the_modules_log() {
    let server = on_a_machine("component-download-refused");

    server.started(GUEST, guest_component(), HOLDS_DOWNLOADS);

    let said = server.said.lock().unwrap();
    let refused: Vec<&String> = said
        .iter()
        .filter(|line| line.contains("is not held"))
        .collect();
    assert_eq!(refused.len(), 3, "{said:?}");
}

#[test]
fn a_download_folder_that_leads_out_of_its_data_dir_is_not_held() {
    let server = Server::holding("component-download-escape", |_| FolderRoots::none());
    server.installed_beside(ENGINE, KEEPS_DOWNLOADS);
    std::fs::create_dir_all(server.data_dir.join("torrents")).unwrap();
    std::fs::create_dir_all(server.data_dir.join("helpers")).unwrap();
    std::os::unix::fs::symlink("../helpers", server.data_dir.join("torrents/downloads")).unwrap();
    let endpoint = server.started(GUEST, guest_component(), HOLDS_DOWNLOADS);

    let written = ask(
        &server,
        &endpoint,
        "write",
        &server.data_dir.join("torrents/downloads/x"),
    );

    assert!(written.starts_with("Err("), "{written}");
    assert!(!server.data_dir.join("helpers/x").exists());
}

#[test]
fn a_third_party_module_that_declares_downloads_holds_no_download_folder() {
    let server = on_a_machine("component-download-third-party");
    let endpoint = server.started_from(GUEST, guest_component(), HOLDS_DOWNLOADS, THIRD_PARTY);

    let written = ask(
        &server,
        &endpoint,
        "write",
        &server.dir.path().join("incoming/x"),
    );

    assert!(written.starts_with("Err("), "{written}");
}

#[test]
fn a_downloads_module_lists_a_download_behind_an_absolute_link() {
    let server = Server::behind_an_absolute_link("component-linked-data", NetworkAction::Direct);
    server.installed_beside(ENGINE, KEEPS_DOWNLOADS);
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
