//! Content embeddings: turn a title's metadata into a dense, L2-normalized
//! vector so we can rank by "feels like this" powering similar-to, themed rows
//! and a personalized "For You" centroid (see `crate::db::vectors`).
//!
//! Two backends sit behind one [`Embedder`] trait:
//!   * [`LexicalEmbedder`] dependency-free hashed term vector, used when no model
//!     is on disk. Similarity reflects shared genres/cast/words. Good for "more
//!     like this".
//!   * `MiniLmEmbedder` a real sentence-transformer via `candle` (Cargo feature
//!     `semantic`, on in the published bundle). Gives free-text *semantic* matches
//!     (e.g. embed the phrase "cozy christmas movie" and retrieve titles whose
//!     overview never says "christmas").
//!
//! Both backends consume the SAME document string from [`build_doc`] and return a
//! normalized vector, so storage/search downstream is backend-agnostic.

use std::sync::Arc;

mod lexical;
pub use lexical::LexicalEmbedder;

// The out-of-process provider routes (the `.kmod`'s embedder-over-HTTP surface).
mod serve;
pub use serve::embedder_routes;

#[cfg(feature = "semantic")]
mod candle;
#[cfg(feature = "semantic")]
mod model;
#[cfg(feature = "semantic")]
mod semantic;
#[cfg(feature = "semantic")]
mod weights;

/// Produces a fixed-dimension, **L2-normalized** vector for a text document.
/// Normalization is part of the contract: it lets the search layer treat cosine
/// similarity as a plain dot product.
pub trait Embedder: Send + Sync {
    /// Output dimension (stable for the lifetime of one embedder). Used by the
    /// `semantic` backend (zero-vector fallback / storage sizing).
    #[allow(dead_code)]
    fn dim(&self) -> usize;
    // Embed `text` into a unit-length vector of length [`dim`](Self::dim).
    fn embed(&self, text: &str) -> Vec<f32>;
    // Minimum cosine for a hit to count as "really about" a themed query
    // below this a row is just noise and the generator drops it. Backend-
    // specific: lexical (sparse hashed TF) scores run lower than MiniLM's dense
    // embeddings. Tunable against live probes.
    fn relevance_floor(&self) -> f32;
}

/// Pick the compiled-in backend: under the `semantic` feature, MiniLM once its
/// model is on disk, and the lexical embedder until then; else the lexical
/// embedder alone.
///
/// Under a host, a missing model is downloaded into `<data>/models/ml-minilm` in
/// the background, pinned by sha256, and the embedder switches to it once it
/// lands. `KROMA_EMBED_MODEL_DIR` names an operator's own copy instead, which is
/// never downloaded into. Build this once (e.g. into shared state) rather than
/// per request.
pub fn default_embedder() -> Arc<dyn Embedder> {
    #[cfg(feature = "semantic")]
    {
        Arc::new(semantic::Semantic::new(model::place()))
    }
    #[cfg(not(feature = "semantic"))]
    {
        Arc::new(LexicalEmbedder::new(LEXICAL_DIMENSIONS))
    }
}

const LEXICAL_DIMENSIONS: usize = 256;

// L2-normalize in place; a no-op for the zero vector. Shared by both backends
// (a private parent item, visible to the `lexical`/`candle` submodules).
fn l2_normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

pub mod module;
pub use module::MODULE;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_compiled_in_backend_answers_with_a_unit_vector_of_its_own_dimension() {
        let e = default_embedder();
        let v = e.embed("a heist thriller set in Paris");
        assert_eq!(v.len(), e.dim());
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!(
            (norm - 1.0).abs() < 1e-5,
            "storage treats cosine as a dot product: {norm}"
        );
        assert!(e.relevance_floor() > 0.0 && e.relevance_floor() < 1.0);
    }

    #[test]
    fn normalizing_the_zero_vector_leaves_it_alone_instead_of_producing_nan() {
        let mut zero = [0.0f32; 4];
        l2_normalize(&mut zero);
        assert_eq!(zero, [0.0; 4]);

        let mut v = [3.0f32, 4.0];
        l2_normalize(&mut v);
        assert!(
            (v[0] - 0.6).abs() < 1e-6 && (v[1] - 0.8).abs() < 1e-6,
            "{v:?}"
        );
    }
}
