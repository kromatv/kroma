use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use serde_json::json;

use super::*;
use crate::point::Point;
use crate::services::reco::genre::COMEDY;
use crate::services::sections::fixtures::{seed_many, viewer};
use crate::test_support::test_state_with_embedder;

fn counted(calls: &Arc<AtomicUsize>) -> SharedState {
    let calls = Arc::clone(calls);
    let state = test_state_with_embedder(Point::stub("embedder", move |method, _| {
        calls.fetch_add(1, Ordering::SeqCst);
        match method {
            "meta" => Some(json!({ "dim": 2, "relevance_floor": 0.1 })),
            _ => Some(json!([0.6, 0.8])),
        }
    }));
    seed_many(&state, "m", 14, &[COMEDY]);
    state
}

#[test]
fn the_viewer_seen_last_finds_their_home_already_built() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = counted(&calls);
    let user = viewer(&state, "last");
    db::touch_last_seen(&state.db, &user).unwrap();

    warm(&state);
    let asked_while_warming = calls.load(Ordering::SeqCst);
    let home = super::super::home(&state, &state.db, i18n::DEFAULT_LOCALE, &user);

    assert!(asked_while_warming > 0);
    assert!(!home.is_empty());
    assert_eq!(calls.load(Ordering::SeqCst), asked_while_warming);
}

#[test]
fn nobody_seen_yet_builds_no_home() {
    let calls = Arc::new(AtomicUsize::new(0));
    let state = counted(&calls);
    viewer(&state, "never");

    warm(&state);

    assert_eq!(calls.load(Ordering::SeqCst), 0);
}
