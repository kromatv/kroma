mod support;

use support::{probe, sandboxed, text, HOST_ABSOLUTE_FILE, HOST_RELATIVE_FILE};

#[test]
fn a_component_cannot_read_an_absolute_path_the_host_process_can() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/fs/read", HOST_ABSOLUTE_FILE);

    assert!(std::fs::read(HOST_ABSOLUTE_FILE).is_ok());
    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "NotFound")
    );
}

#[test]
fn a_component_cannot_read_a_relative_path_the_host_process_can() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/fs/read", HOST_RELATIVE_FILE);

    assert!(std::fs::read(HOST_RELATIVE_FILE).is_ok());
    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "NotFound")
    );
}

#[test]
fn a_component_cannot_open_a_tcp_socket() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/net/connect", "1.1.1.1:443");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "PermissionDenied")
    );
}

#[test]
fn a_component_cannot_resolve_a_name() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/net/resolve", "example.com:443");

    assert_eq!(response.status, 403, "{}", text(&response));
}

#[test]
fn a_component_cannot_read_an_environment_variable_the_host_process_has() {
    let mut module = sandboxed();

    let response = probe(&mut module, "/env", "PATH");

    assert!(std::env::var_os("PATH").is_some());
    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, "NotPresent")
    );
}
