#![cfg(unix)]

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{DECLARES, GUEST, STORES, Server, seed_core, wait_until};

#[test]
fn a_component_answers_on_the_modules_socket_like_any_other() {
    let server = Server::new("component-socket", NetworkAction::Direct);

    let endpoint = server.started(GUEST, guest_component(), DECLARES);
    let health = server.get(&endpoint, "/_health");
    let route = server.get(&endpoint, "/echo");

    assert_eq!(health.status, 200);
    assert_eq!(route.text(), "still here");
    assert!(server.supervisor.is_running(GUEST));
}

#[test]
fn a_component_starts_without_waiting_for_a_first_call() {
    let server = Server::new("component-eager", NetworkAction::Direct);
    seed_core(&server);
    let own = server
        .dir
        .path()
        .join("modules")
        .join(GUEST)
        .join("module.sqlite");

    server.started(GUEST, guest_component(), STORES);

    assert!(wait_until(|| own.exists()));
}

#[test]
fn a_component_hears_that_it_is_stopping() {
    let server = Server::new("component-stop-hook", NetworkAction::Direct);
    seed_core(&server);
    let endpoint = server.started(GUEST, guest_component(), STORES);
    server.get(&endpoint, "/echo");

    server.supervisor.stop(GUEST);

    let heard = server
        .dir
        .path()
        .join("modules")
        .join(GUEST)
        .join("stopped.txt");
    assert!(heard.exists());
}

#[test]
fn a_second_start_reuses_the_compiled_component() {
    let server = Server::new("component-cache", NetworkAction::Direct);
    seed_core(&server);
    server.started(GUEST, guest_component(), STORES);
    server.supervisor.stop(GUEST);

    let endpoint = server.started(GUEST, guest_component(), STORES);
    let answered = server.get(&endpoint, "/echo");

    assert_eq!(answered.text(), "still here");
    let said = server.said.lock().unwrap();
    assert!(said.iter().any(|line| line.contains("compiled in")));
    assert!(
        said.iter()
            .any(|line| line.contains("from its compiled copy"))
    );
}

#[test]
fn a_stopped_component_answers_no_more() {
    let server = Server::new("component-stop", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);

    server.supervisor.stop(GUEST);

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while server
        .as_the_core(GUEST)
        .get(&endpoint.url("/echo"))
        .is_ok()
    {
        assert!(std::time::Instant::now() < deadline, "it still answers");
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    assert!(!server.supervisor.is_running(GUEST));
}

#[test]
fn a_peer_is_reached_through_the_core_by_a_module_and_directly_by_the_core() {
    let server = Server::new("component-peers", NetworkAction::Direct);
    let engine = server.started(
        GUEST,
        guest_component(),
        r#", "storage": {}, "contributes": [{ "point": "tv.example.guest/run" }]"#,
    );
    let consumer = server.installed_dir("tv.example.consumer");
    std::fs::create_dir_all(&consumer).unwrap();
    std::fs::write(
        consumer.join("module.json"),
        format!(
            r#"{{ "schemaVersion": {}, "id": "tv.example.consumer", "name": "Consumer", "version": "1.0.0",
                  "consumes": [{{ "point": "tv.example.guest/run" }}] }}"#,
            kroma_module_manifest::MODULE_SCHEMA_VERSION
        ),
    )
    .unwrap();

    let by_a_module = server
        .supervisor
        .contributions_for("tv.example.consumer", "tv.example.guest/run");
    let by_the_core = server.supervisor.contributions("tv.example.guest/run");

    assert_eq!(
        by_a_module[0].base_url,
        format!(
            "{}/api/module/{GUEST}",
            kroma_http::loopback::unix_url(&server.supervisor.host_socket())
        )
    );
    assert_eq!(by_the_core[0].base_url, engine.url(""));
    assert_eq!(by_a_module[0].token, by_the_core[0].token);
}

#[test]
fn uninstalling_a_module_takes_its_socket_directory_with_it() {
    let server = Server::new("component-uninstall", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);

    server.supervisor.uninstall(GUEST).unwrap();

    assert!(!endpoint.socket.parent().unwrap().exists());
    assert!(!server.supervisor.is_running(GUEST));
}
