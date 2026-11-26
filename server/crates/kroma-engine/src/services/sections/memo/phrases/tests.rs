use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::{json, Value};

use super::*;
use crate::point::{Point, StubFn};
use crate::test_support::test_state_with_embedder;

fn counting(calls: &Arc<AtomicUsize>, answer: Value) -> StubFn {
    let calls = Arc::clone(calls);
    Arc::new(move |_, _| {
        calls.fetch_add(1, Ordering::SeqCst);
        Some(answer.clone())
    })
}

fn embedding(module: &str, calls: &Arc<AtomicUsize>, answer: Value) -> SharedState {
    test_state_with_embedder(Point::stubs(
        "embedder",
        vec![(module, counting(calls, answer))],
    ))
}

fn vector_module(calls: &Arc<AtomicUsize>) -> SharedState {
    embedding("tv.kroma.vector", calls, json!([0.6, 0.8]))
}

#[test]
fn a_phrase_asked_again_is_not_embedded_again() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = vector_module(&calls);
    let phrases = Phrases::default();

    let first = phrases.vector(&state, 2, "cozy autumn drama");
    let again = phrases.vector(&state, 2, "cozy autumn drama");

    assert_eq!(&*first, &[0.6, 0.8]);
    assert_eq!(&*again, &[0.6, 0.8]);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn a_phrase_embedded_before_a_restart_is_not_embedded_again() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = vector_module(&calls);
    Phrases::default().vector(&state, 2, "heist thriller");

    let after_restart = Phrases::default().vector(&state, 2, "heist thriller");

    assert_eq!(&*after_restart, &[0.6, 0.8]);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn a_phrase_is_embedded_again_once_the_embedder_answers_at_another_width() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = vector_module(&calls);
    let phrases = Phrases::default();
    phrases.vector(&state, 2, "neon night drive");

    phrases.vector(&state, 3, "neon night drive");

    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[test]
fn another_module_answering_embeds_the_phrase_itself() {
    let calls = Arc::new(AtomicUsize::new(0));
    let phrases = Phrases::default();
    phrases.vector(&vector_module(&calls), 2, "action movie");

    let other = embedding("org.example.vectors", &calls, json!([0.8, 0.6]));
    let theirs = phrases.vector(&other, 2, "action movie");

    assert_eq!(&*theirs, &[0.8, 0.6]);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[test]
fn an_embedder_that_answers_nothing_is_asked_again_next_time() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = embedding("tv.kroma.vector", &calls, json!([]));
    let phrases = Phrases::default();

    let first = phrases.vector(&state, 2, "tearjerker");
    phrases.vector(&state, 2, "tearjerker");

    assert!(first.is_empty());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[test]
fn a_phrase_vector_that_cannot_be_kept_is_still_used() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = vector_module(&calls);
    state
        .db
        .get()
        .unwrap()
        .execute("DROP TABLE phrase_vectors", [])
        .unwrap();
    let phrases = Phrases::default();

    let first = phrases.vector(&state, 2, "slow burn mystery");
    let again = phrases.vector(&state, 2, "slow burn mystery");

    assert_eq!(&*first, &[0.6, 0.8]);
    assert_eq!(&*again, &[0.6, 0.8]);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn an_embedder_that_gives_no_width_is_not_asked() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = vector_module(&calls);

    let vector = Phrases::default().vector(&state, 0, "road trip");

    assert!(vector.is_empty());
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[test]
fn no_embedder_installed_reads_as_no_vector() {
    let state = test_state_with_embedder(Point::absent("embedder"));

    let vector = Phrases::default().vector(&state, 2, "neon night drive");

    assert!(vector.is_empty());
}
