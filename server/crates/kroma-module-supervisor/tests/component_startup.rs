#![cfg(unix)]

use std::collections::BTreeSet;

use kroma_module_host::NetworkAction;

mod component_support;

use component_support::wasm::lifecycle_component;
use component_support::{Server, wait_until};

const LIFECYCLE: &str = "tv.example.lifecycle";
const FOUR: &str = r#", "storage": {}, "component": { "instances": 4 }"#;

fn database_at_schema_one(server: &Server) {
    let dir = server.dir.path().join("modules").join(LIFECYCLE);
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("module.sqlite");
    let conn = rusqlite::Connection::open(&file).unwrap();
    conn.execute_batch("CREATE TABLE enabled (at INTEGER NOT NULL); PRAGMA user_version = 1;")
        .unwrap();
}

fn count(file: &std::path::Path, table: &str) -> i64 {
    rusqlite::Connection::open(file)
        .unwrap()
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
}

#[test]
fn a_module_with_four_instances_migrates_registers_and_enables_once() {
    let server = Server::new("component-startup-once", NetworkAction::Direct);
    let core = server.core_hearing();
    database_at_schema_one(&server);
    let endpoint = server.started(LIFECYCLE, lifecycle_component(), FOUR);
    let file = server.data_dir.join("databases").join(LIFECYCLE).join("module.sqlite");

    let names: BTreeSet<String> = std::thread::scope(|threads| {
        let held: Vec<_> = (0..4)
            .map(|_| threads.spawn(|| server.as_the_core(LIFECYCLE).get(&endpoint.url("/hold"))))
            .collect();
        held.into_iter()
            .map(|call| call.join().unwrap().unwrap().text())
            .collect()
    });

    assert_eq!(names.len(), 4);
    assert_eq!(count(&file, "steps"), 1);
    assert!(file.with_file_name("module.sqlite.pre-v1").exists());
    assert_eq!(core.count("/api/_host/register-job"), 2);
    assert_eq!(core.count("/api/_host/register-events"), 1);
    assert_eq!(count(&file, "enabled"), 1);
}

fn calls_counted_by(answers: &[String], instance: &str) -> Vec<u32> {
    answers
        .iter()
        .filter_map(|answer| answer.strip_prefix(instance)?.parse().ok())
        .collect()
}

#[test]
fn the_primary_keeps_its_state_while_a_worker_answers_beside_it() {
    let server = Server::new("component-startup-roles", NetworkAction::Direct);
    let endpoint = server.started(LIFECYCLE, lifecycle_component(), FOUR);
    let get = |path: &str| {
        server
            .as_the_core(LIFECYCLE)
            .get(&endpoint.url(path))
            .unwrap()
            .text()
    };

    let answers = std::thread::scope(|threads| {
        let mut answers: Vec<String> = (0..3).map(|_| get("/state")).collect();
        let held = threads.spawn(|| get("/hold"));
        wait_until(|| {
            answers.push(get("/state"));
            answers
                .last()
                .is_some_and(|answer| answer.starts_with("worker"))
        });
        held.join().unwrap();
        answers.extend((0..3).map(|_| get("/state")));
        answers
    });

    let primary = calls_counted_by(&answers, "primary enabled ");
    assert!(primary.len() >= 2, "{answers:?}");
    assert_eq!(
        primary,
        (1..=primary.len() as u32).collect::<Vec<_>>(),
        "{answers:?}"
    );
    assert!(
        !calls_counted_by(&answers, "worker idle ").is_empty(),
        "{answers:?}"
    );
    assert!(
        answers.iter().all(
            |answer| answer.starts_with("primary enabled") || answer.starts_with("worker idle")
        ),
        "{answers:?}"
    );
}
