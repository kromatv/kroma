use std::sync::mpsc::{Sender, channel};

use tokio::sync::broadcast::Receiver;

use super::super::start::claimed_or_withdrawn;
use super::super::{Request, StartError, Started, start};
use super::*;
use crate::infra::events::Envelope;
use crate::model::imports::Status;
use crate::test_support::test_state;

fn owner_of(state: &SharedState) -> String {
    db::create_user(&state.db, "owner@example.test", "owner", "hash", &[])
        .unwrap()
        .id
}

fn request(owner: &str, selection: Selection) -> Request {
    Request {
        importer: IMPORTER.into(),
        sign_in: "s-1".into(),
        server: living_room(),
        selection,
        started_by: owner.into(),
    }
}

fn held_at_the_survey() -> (Importers, Sender<()>) {
    let (release, held) = channel::<()>();
    let held = Mutex::new(held);
    let stub: StubFn = Arc::new(move |_, _| {
        let _ = held.lock().unwrap().recv();
        Some(json!({ "Ok": {} }))
    });
    let importers = Importers::new(Point::stubs(POINT, vec![(IMPORTER, stub)]));
    (importers, release)
}

async fn finished(events: &mut Receiver<Envelope>) -> String {
    loop {
        let envelope = events.recv().await.unwrap();
        let event: Value = serde_json::from_str(envelope.payload_unrouted()).unwrap();
        if event["type"] == "job.finished" && event["key"] == super::super::JOB.as_str() {
            return event["status"].as_str().unwrap().to_string();
        }
    }
}

#[tokio::test]
async fn starting_queues_what_the_owner_kept_and_the_job_runs_it() {
    let state = importing_from(&household());
    let owner = owner_of(&state);
    let mut events = state.events.subscribe();

    let started = start(&state, request(&owner, everything())).unwrap();

    let job = finished(&mut events).await;
    let import = db::imports::get(&state.db, &started.id).unwrap().unwrap();
    assert_eq!(job, "success");
    assert_eq!(import.status, Status::Completed);
    assert_eq!(import.run_id, started.run_id);
    assert_eq!(import.sign_in.as_deref(), Some("s-1"));
    assert_eq!(import.selection, everything());
    assert_eq!(import.server, living_room());
    assert_eq!(import.started_by, Some(owner));
}

#[tokio::test]
async fn a_second_import_is_refused_while_one_runs() {
    let (importers, release) = held_at_the_survey();
    let state = test_state_with_service(importers);
    let owner = owner_of(&state);
    let mut events = state.events.subscribe();
    start(&state, request(&owner, everything())).unwrap();

    let second = start(&state, request(&owner, everything()));

    release.send(()).unwrap();
    finished(&mut events).await;
    assert!(matches!(second, Err(StartError::Busy)));
    assert_eq!(db::imports::list(&state.db, 10).unwrap().len(), 1);
}

#[tokio::test]
async fn a_library_or_a_user_kept_twice_is_kept_once() {
    let state = importing_from(&household());
    let owner = owner_of(&state);
    let mut events = state.events.subscribe();

    let started = start(&state, request(&owner, kept(&["1", "1"], &["42", "42"]))).unwrap();

    finished(&mut events).await;
    let import = db::imports::get(&state.db, &started.id).unwrap().unwrap();
    assert_eq!(import.selection, kept(&["1"], &["42"]));
}

#[test]
fn an_import_through_an_importer_that_is_not_running_does_not_start() {
    let nobody_answers = test_state();
    let another_answers = importing_from(&household());
    let other = Request {
        importer: "tv.y.import".into(),
        ..request("owner", everything())
    };

    let absent = start(&nobody_answers, request("owner", everything()));
    let unknown = start(&another_answers, other);

    assert!(matches!(absent, Err(StartError::Absent)));
    assert!(matches!(unknown, Err(StartError::Absent)));
    assert!(
        db::imports::list(&another_answers.db, 10)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn an_id_the_other_server_could_not_have_given_is_refused_and_nothing_is_queued() {
    let state = importing_from(&household());
    let no_sign_in = Request {
        sign_in: String::new(),
        ..request("owner", everything())
    };
    let endless_server = Request {
        server: Origin {
            id: "s".repeat(600),
            name: String::new(),
        },
        ..request("owner", everything())
    };

    let refused = [
        start(&state, no_sign_in),
        start(&state, endless_server),
        start(&state, request("owner", kept(&[""], &[]))),
        start(&state, request("owner", kept(&[], &[""]))),
    ];

    assert!(
        refused
            .iter()
            .all(|refusal| matches!(refusal, Err(StartError::Invalid(_))))
    );
    assert!(db::imports::list(&state.db, 10).unwrap().is_empty());
}

#[test]
fn an_import_the_job_could_not_take_is_withdrawn_as_busy() {
    let state = importing_from(&household());
    let id = queue(&state, &everything(), "s-1");

    let started = claimed_or_withdrawn(&state, id.clone());

    assert!(matches!(started, Err(StartError::Busy)));
    assert!(db::imports::get(&state.db, &id).unwrap().is_none());
}

#[test]
fn an_import_a_run_took_before_its_own_trigger_is_started_under_that_run() {
    let state = importing_from(&household());
    let id = queue(&state, &everything(), "s-1");
    db::imports::claim(&state.db, "run-9", 1).unwrap();

    let started = claimed_or_withdrawn(&state, id.clone()).unwrap();

    assert_eq!(
        started,
        Started {
            id,
            run_id: Some("run-9".into()),
        }
    );
}
