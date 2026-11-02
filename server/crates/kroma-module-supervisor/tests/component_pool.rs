#![cfg(unix)]

use std::sync::Mutex;

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{DECLARES, GUEST, Server, wait_until};

#[test]
fn a_component_that_panics_is_reported_and_the_next_call_gets_a_fresh_one() {
    let server = Server::new("component-trap", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);

    let exploded = server.as_the_core(GUEST).get(&endpoint.url("/explode"));
    let after = server.get(&endpoint, "/echo");

    assert_ne!(exploded.map(|response| response.status).unwrap_or(500), 200);
    assert_eq!(after.text(), "still here");
    assert!(
        server
            .said
            .lock()
            .unwrap()
            .iter()
            .any(|line| line.contains("component stopped"))
    );
    assert!(server.supervisor.is_running(GUEST));
}

#[test]
fn what_a_component_leaves_running_advances_between_calls() {
    let server = Server::new("component-tick", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);
    server.get(&endpoint, "/background");

    let advanced = wait_until(|| {
        server
            .get(&endpoint, "/background/count")
            .text()
            .parse::<u32>()
            .unwrap_or(0)
            > 3
    });

    assert!(advanced);
}

#[test]
fn the_instances_of_a_busy_component_never_outnumber_what_it_declares() {
    let server = Server::new("component-instances", NetworkAction::Direct);
    let two = r#", "storage": {}, "component": { "instances": 2 }"#;
    let endpoint = server.started(GUEST, guest_component(), two);
    server.get(&endpoint, "/background");
    let names = Mutex::new(std::collections::BTreeSet::new());

    std::thread::scope(|threads| {
        for _ in 0..4 {
            threads.spawn(|| {
                for _ in 0..40 {
                    let name = server.get(&endpoint, "/who").text();
                    names.lock().unwrap().insert(name);
                }
            });
        }
    });

    assert_eq!(names.lock().unwrap().len(), 2);
}
