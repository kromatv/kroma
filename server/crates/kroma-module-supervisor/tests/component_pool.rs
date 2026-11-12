#![cfg(unix)]

use std::collections::BTreeSet;
use std::sync::Mutex;
use std::time::Duration;

use kroma_module_host::NetworkAction;
use kroma_module_supervisor::Endpoint;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{DECLARES, GUEST, Server, wait_until};

const TWO_INSTANCES: &str = r#", "storage": {}, "component": { "instances": 2 }"#;
const THREE_INSTANCES: &str = r#", "storage": {}, "component": { "instances": 3 }"#;
const WORKER_LIFETIME: Duration = Duration::from_millis(200);

fn instances_answering(server: &Server, endpoint: &Endpoint) -> BTreeSet<String> {
    let names = Mutex::new(BTreeSet::new());
    std::thread::scope(|threads| {
        for _ in 0..4 {
            threads.spawn(|| {
                for _ in 0..40 {
                    let name = server.get(endpoint, "/who").text();
                    names.lock().unwrap().insert(name);
                }
            });
        }
    });
    names.into_inner().unwrap()
}

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
fn a_call_its_caller_gave_up_on_keeps_the_only_instance_until_it_ends() {
    let server = Server::new("component-abandoned", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), DECLARES);
    let before = server.get(&endpoint, "/who").text();

    let abandoned = server
        .as_the_core(GUEST)
        .max_time(1)
        .get(&endpoint.url("/slow"));
    let after = server.get(&endpoint, "/who").text();

    assert!(abandoned.is_err());
    assert_eq!(after, before);
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
    let endpoint = server.started(GUEST, guest_component(), TWO_INSTANCES);
    server.get(&endpoint, "/background");

    let names = instances_answering(&server, &endpoint);

    assert_eq!(names.len(), 2);
}

#[test]
fn an_idle_worker_is_dropped_after_its_lifetime_while_another_instance_keeps_running() {
    let server = Server::new("component-worker-dropped", NetworkAction::Direct);
    server.supervisor.keep_idle_workers_for(WORKER_LIFETIME);
    let endpoint = server.started(GUEST, guest_component(), THREE_INSTANCES);
    server.get(&endpoint, "/background");
    let before = instances_answering(&server, &endpoint);
    std::thread::sleep(WORKER_LIFETIME * 5);

    let after = instances_answering(&server, &endpoint);

    assert_eq!(before.len(), 3, "{before:?}");
    assert!(after.difference(&before).next().is_some(), "{before:?} {after:?}");
    assert!(after.intersection(&before).next().is_some(), "{before:?} {after:?}");
}

#[test]
fn a_worker_used_within_its_lifetime_is_kept() {
    let server = Server::new("component-worker-kept", NetworkAction::Direct);
    let endpoint = server.started(GUEST, guest_component(), TWO_INSTANCES);
    server.get(&endpoint, "/background");
    let before = instances_answering(&server, &endpoint);

    let after = instances_answering(&server, &endpoint);

    assert_eq!(after, before);
}
