#![cfg(unix)]

use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{GUEST, STORES, Server, seed_core};

const KEEPS_VPN: &str = r#", "storage": {}, "dataDirs": ["vpn"]"#;

fn core_tables(server: &Server) -> Vec<String> {
    server
        .core_database()
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn mode(path: &Path) -> u32 {
    std::fs::metadata(path).unwrap().permissions().mode() & 0o777
}

#[test]
fn links_a_module_plants_where_its_databases_used_to_be_reach_nothing() {
    let server = Server::new("component-planted", NetworkAction::Direct);
    seed_core(&server);
    let elsewhere = server.data_dir.join("elsewhere");
    std::fs::write(&elsewhere, "untouched").unwrap();
    let tables = core_tables(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);
    let before = server.get(&endpoint, "/own").text();

    let planted: Vec<String> = [
        ("module.sqlite", "../../kroma.db"),
        ("module.sqlite-wal", "../../elsewhere"),
        ("module.sqlite-shm", "../../elsewhere"),
    ]
    .into_iter()
    .map(|(name, target)| server.get(&endpoint, &format!("/plant/{name}?{target}")).text())
    .collect();
    server.supervisor.stop(GUEST);
    let endpoint = server.supervisor.spawn(GUEST).unwrap();
    let after = server.get(&endpoint, "/own").text();

    assert_eq!(planted, ["Some(Ok(()))"; 3]);
    assert_eq!(core_tables(&server), tables);
    assert_eq!(std::fs::read_to_string(&elsewhere).unwrap(), "untouched");
    assert_eq!((before.as_str(), after.as_str()), ("Ok(1)", "Ok(2)"));
}

#[test]
fn a_module_reaches_none_of_the_files_its_databases_are_kept_in() {
    let server = Server::new("component-kept-out", NetworkAction::Direct);
    seed_core(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);
    server.get(&endpoint, "/own");
    let kept = server.databases_dir(GUEST).join("module.sqlite");

    let read = server.get(&endpoint, &format!("/read?{}", kept.display())).text();
    let written = server.get(&endpoint, &format!("/write?{}", kept.display())).text();

    assert!(read.starts_with("Err("), "{read}");
    assert!(written.starts_with("Err("), "{written}");
    assert_eq!(server.get(&endpoint, "/own").text(), "Ok(2)");
}

#[test]
fn a_modules_folders_are_open_to_the_server_alone() {
    let server = Server::laid_out("component-private", |data_dir| {
        let vpn = data_dir.join("vpn");
        std::fs::create_dir_all(&vpn).unwrap();
        std::fs::set_permissions(&vpn, std::fs::Permissions::from_mode(0o755)).unwrap();
    });

    server.started(GUEST, guest_component(), KEEPS_VPN);

    assert_eq!(mode(&server.own_dir(GUEST)), 0o700);
    assert_eq!(mode(&server.data_dir.join("vpn")), 0o700);
    assert_eq!(mode(&server.databases_dir(GUEST)), 0o700);
}
