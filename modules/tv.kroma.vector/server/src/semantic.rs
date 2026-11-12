use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use kroma_module_sdk::host::run_blocking;

use crate::candle::MiniLmEmbedder;
use crate::model::{self, Place};
use crate::{Embedder, LexicalEmbedder, LEXICAL_DIMENSIONS};

const RETRY_FETCH: Duration = Duration::from_secs(10 * 60);

pub(crate) struct Semantic {
    place: Place,
    lexical: LexicalEmbedder,
    minilm: OnceLock<MiniLmEmbedder>,
    unloadable: AtomicBool,
    next_fetch: Mutex<Option<Instant>>,
}

impl Semantic {
    pub(crate) fn new(place: Place) -> Self {
        Self {
            place,
            lexical: LexicalEmbedder::new(LEXICAL_DIMENSIONS),
            minilm: OnceLock::new(),
            unloadable: AtomicBool::new(false),
            next_fetch: Mutex::new(None),
        }
    }

    fn backend(&self) -> &dyn Embedder {
        if let Some(minilm) = self.minilm.get() {
            return minilm;
        }
        if model::present(&self.place.dir) {
            if let Some(minilm) = self.loaded() {
                return minilm;
            }
        } else if self.place.downloads {
            self.fetch_in_the_background();
        }
        &self.lexical
    }

    fn loaded(&self) -> Option<&MiniLmEmbedder> {
        if self.unloadable.load(Ordering::Relaxed) {
            return None;
        }
        match MiniLmEmbedder::load(&self.place.dir) {
            Ok(minilm) => Some(self.minilm.get_or_init(|| minilm)),
            Err(error) => {
                self.unloadable.store(true, Ordering::Relaxed);
                tracing::warn!(error = %format!("{error:#}"), "MiniLM did not load; embedding with the lexical backend");
                None
            }
        }
    }

    fn fetch_in_the_background(&self) {
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        let now = Instant::now();
        {
            let mut next = self.next_fetch.lock().unwrap_or_else(PoisonError::into_inner);
            if next.is_some_and(|at| now < at) {
                return;
            }
            *next = Some(now + RETRY_FETCH);
        }
        let dir = self.place.dir.clone();
        runtime.spawn(async move {
            tracing::info!(dir = %dir.display(), "downloading the MiniLM model; embedding with the lexical backend until it lands");
            match run_blocking(move || model::fetch(&dir)).await {
                Ok(true) => tracing::info!("the MiniLM model is ready"),
                _ => tracing::warn!("the MiniLM model did not download; another try in ten minutes"),
            }
        });
    }
}

impl Embedder for Semantic {
    fn dim(&self) -> usize {
        self.backend().dim()
    }

    fn embed(&self, text: &str) -> Vec<f32> {
        self.backend().embed(text)
    }

    fn relevance_floor(&self) -> f32 {
        self.backend().relevance_floor()
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::testing::temp_dir;

    use super::*;

    fn nowhere(dir: &std::path::Path, downloads: bool) -> Semantic {
        Semantic::new(Place {
            dir: dir.join("ml-minilm"),
            downloads,
        })
    }

    #[test]
    fn answers_with_the_lexical_backend_while_no_model_is_on_disk() {
        let data = temp_dir("vector-semantic");
        let embedder = nowhere(data.path(), false);

        let vector = embedder.embed("a heist thriller");

        assert_eq!((embedder.dim(), vector.len()), (LEXICAL_DIMENSIONS, LEXICAL_DIMENSIONS));
    }

    #[test]
    fn keeps_the_lexical_backend_when_the_model_on_disk_does_not_load() {
        let data = temp_dir("vector-semantic");
        let embedder = nowhere(data.path(), false);
        std::fs::create_dir_all(data.path().join("ml-minilm")).unwrap();
        for name in ["config.json", "tokenizer.json", "model.safetensors"] {
            std::fs::write(data.path().join("ml-minilm").join(name), "not a model").unwrap();
        }

        let dims = (embedder.dim(), embedder.dim());

        assert_eq!(dims, (LEXICAL_DIMENSIONS, LEXICAL_DIMENSIONS));
        assert!(embedder.unloadable.load(Ordering::Relaxed));
    }

    #[test]
    fn asks_for_the_download_at_most_once_in_ten_minutes() {
        let data = temp_dir("vector-semantic");
        let embedder = nowhere(data.path(), true);
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        let _inside = runtime.enter();

        embedder.fetch_in_the_background();
        let first = *embedder.next_fetch.lock().unwrap();
        embedder.fetch_in_the_background();

        assert!(first.is_some());
        assert_eq!(*embedder.next_fetch.lock().unwrap(), first);
    }

    #[test]
    fn starts_no_download_outside_a_runtime() {
        let data = temp_dir("vector-semantic");
        let embedder = nowhere(data.path(), true);

        embedder.fetch_in_the_background();

        assert!(embedder.next_fetch.lock().unwrap().is_none());
    }
}
