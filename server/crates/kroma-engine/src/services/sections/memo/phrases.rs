//! The embedder's vector for each phrase a home asks about on every build: a
//! theme's mood and the rows a model named. Kept in the database too, so the
//! first home after a start does not embed them all again.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};

use crate::db::{self, Phrase};
use crate::services::embeddings;
use crate::state::SharedState;

const MOST_HELD: usize = 128;

struct Held {
    module: String,
    vector: Arc<[f32]>,
}

#[derive(Default)]
pub struct Phrases {
    held: Mutex<HashMap<String, Held>>,
}

impl Phrases {
    /// The vector of `phrase`, computed once per module answering the embedder
    /// and per width `dim` it says its vectors have, then reused, across starts
    /// too. Empty when nothing answers or `dim` is `0`, and never kept then.
    pub fn vector(&self, state: &SharedState, dim: usize, phrase: &str) -> Arc<[f32]> {
        let module = match state.embedder.answering().into_iter().next() {
            Some(module) if dim > 0 => module,
            _ => return Arc::from([]),
        };
        if let Some(vector) = self.recall(&module, dim, phrase) {
            return vector;
        }
        let asked = Phrase {
            module: &module,
            dim,
            text: phrase,
        };
        let vector = kept_or_embedded(state, &asked);
        if vector.len() == dim {
            let entry = Held {
                module,
                vector: Arc::clone(&vector),
            };
            self.keep(phrase, entry);
        }
        vector
    }

    fn recall(&self, module: &str, dim: usize, phrase: &str) -> Option<Arc<[f32]>> {
        let held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        held.get(phrase)
            .filter(|h| h.module == module && h.vector.len() == dim)
            .map(|h| Arc::clone(&h.vector))
    }

    fn keep(&self, phrase: &str, entry: Held) {
        let mut held = self.held.lock().unwrap_or_else(PoisonError::into_inner);
        if held.len() >= MOST_HELD {
            held.clear();
        }
        held.insert(phrase.to_string(), entry);
    }
}

fn kept_or_embedded(state: &SharedState, phrase: &Phrase) -> Arc<[f32]> {
    if let Ok(Some(kept)) = db::phrase_vector(&state.db, phrase) {
        return kept.into();
    }
    let vector = embeddings::embed(&state.embedder, phrase.text);
    if vector.len() == phrase.dim {
        if let Err(e) = db::keep_phrase_vector(&state.db, phrase, &vector) {
            tracing::warn!(target: "sections", "a phrase vector could not be kept: {e:#}");
        }
    }
    vector.into()
}

#[cfg(test)]
mod tests;
