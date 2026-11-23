//! The embedder's vector for each phrase a home asks about on every build: a
//! theme's mood and the rows a model named.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};

use crate::point::Point;
use crate::services::embeddings;
use crate::services::jobs::now_ms;

const FRESH_FOR_MS: i64 = 60 * 60_000;
const MOST_HELD: usize = 128;

struct Held {
    module: String,
    built_at_ms: i64,
    vector: Arc<[f32]>,
}

#[derive(Default)]
pub struct Phrases {
    held: Mutex<HashMap<String, Held>>,
}

impl Phrases {
    /// The vector of `phrase`, computed once per module answering the embedder
    /// and reused for an hour. Empty when nothing answers, and never kept then.
    pub fn vector(&self, embedder: &Point, phrase: &str) -> Arc<[f32]> {
        self.vector_at(embedder, phrase, now_ms())
    }

    fn vector_at(&self, embedder: &Point, phrase: &str, now_ms: i64) -> Arc<[f32]> {
        let Some(module) = embedder.answering().into_iter().next() else {
            return Arc::from([]);
        };
        if let Some(vector) = self.recall(&module, phrase, now_ms) {
            return vector;
        }
        let vector: Arc<[f32]> = embeddings::embed(embedder, phrase).into();
        if !vector.is_empty() {
            let entry = Held {
                module,
                built_at_ms: now_ms,
                vector: Arc::clone(&vector),
            };
            self.keep(phrase, entry);
        }
        vector
    }

    fn recall(&self, module: &str, phrase: &str, now_ms: i64) -> Option<Arc<[f32]>> {
        let held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        held.get(phrase)
            .filter(|h| h.module == module && now_ms - h.built_at_ms < FRESH_FOR_MS)
            .map(|h| Arc::clone(&h.vector))
    }

    fn keep(&self, phrase: &str, entry: Held) {
        let mut held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        held.retain(|_, h| entry.built_at_ms - h.built_at_ms < FRESH_FOR_MS);
        if held.len() >= MOST_HELD {
            held.clear();
        }
        held.insert(phrase.to_string(), entry);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use serde_json::{json, Value};

    use super::*;
    use crate::point::StubFn;

    fn counting(calls: &Arc<AtomicUsize>, answer: Value) -> StubFn {
        let calls = Arc::clone(calls);
        Arc::new(move |_, _| {
            calls.fetch_add(1, Ordering::SeqCst);
            Some(answer.clone())
        })
    }

    fn embedder(module: &str, calls: &Arc<AtomicUsize>) -> Point {
        Point::stubs(
            "embedder",
            vec![(module, counting(calls, json!([0.6, 0.8])))],
        )
    }

    #[test]
    fn a_phrase_asked_again_is_not_embedded_again() {
        let calls = Arc::new(AtomicUsize::new(0));
        let phrases = Phrases::default();
        let point = embedder("tv.kroma.vector", &calls);

        let first = phrases.vector_at(&point, "cozy autumn drama", 0);
        let again = phrases.vector_at(&point, "cozy autumn drama", FRESH_FOR_MS - 1);

        assert_eq!(&*first, &[0.6, 0.8]);
        assert_eq!(&*again, &[0.6, 0.8]);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_phrase_is_embedded_again_once_its_hour_is_over() {
        let calls = Arc::new(AtomicUsize::new(0));
        let phrases = Phrases::default();
        let point = embedder("tv.kroma.vector", &calls);

        phrases.vector_at(&point, "heist thriller", 0);
        phrases.vector_at(&point, "heist thriller", FRESH_FOR_MS);

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn another_module_answering_embeds_the_phrase_itself() {
        let calls = Arc::new(AtomicUsize::new(0));
        let phrases = Phrases::default();

        phrases.vector_at(&embedder("tv.kroma.vector", &calls), "action movie", 0);
        phrases.vector_at(&embedder("org.example.vectors", &calls), "action movie", 1);

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn an_embedder_that_answers_nothing_is_asked_again_next_time() {
        let calls = Arc::new(AtomicUsize::new(0));
        let phrases = Phrases::default();
        let point = Point::stubs(
            "embedder",
            vec![("tv.kroma.vector", counting(&calls, json!([])))],
        );

        let first = phrases.vector_at(&point, "tearjerker", 0);
        phrases.vector_at(&point, "tearjerker", 1);

        assert!(first.is_empty());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn no_embedder_installed_reads_as_no_vector() {
        let phrases = Phrases::default();

        let vector = phrases.vector(&Point::absent("embedder"), "neon night drive");

        assert!(vector.is_empty());
    }
}
