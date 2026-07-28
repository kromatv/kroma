//! Dependency-free hashed term-frequency embedder (the default backend).
//!
//! Pipeline: tokenize → hash each token into one of `dim` buckets (the "hashing
//! trick", so there's no vocabulary to store) → sublinear term-frequency weight →
//! L2-normalize. No model, no new crates it compiles on the pinned 1.81 / musl
//! build as-is. Similarity reflects shared genres / cast / words, which is enough
//! for "more like this"; switch on `semantic` for free-text semantics.

use super::Embedder;

/// Hashed bag-of-words embedder. `dim` trades collisions for size/speed; 256 is
/// plenty for a few-thousand-title library.
pub struct LexicalEmbedder {
    dim: usize,
}

impl LexicalEmbedder {
    pub fn new(dim: usize) -> Self {
        Self { dim: dim.max(16) }
    }
}

impl Embedder for LexicalEmbedder {
    fn dim(&self) -> usize {
        self.dim
    }

    fn relevance_floor(&self) -> f32 {
        // Above the "shared generic token" noise floor; calibrated on a ~1k library.
        0.16
    }

    fn embed(&self, text: &str) -> Vec<f32> {
        let mut v = vec![0.0f32; self.dim];
        for tok in tokenize(text) {
            if is_stopword(&tok) {
                continue;
            }
            let bucket = (fnv1a(&tok) % self.dim as u64) as usize;
            v[bucket] += 1.0;
        }
        // Sublinear term frequency: a word seen 10× shouldn't swamp one seen once.
        for x in v.iter_mut() {
            if *x > 0.0 {
                *x = 1.0 + x.ln();
            }
        }
        super::l2_normalize(&mut v);
        v
    }
}

/// Lowercase, split on non-alphanumerics, drop 1-char noise.
fn tokenize(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() >= 2)
        .map(|s| s.to_lowercase())
}

/// FNV-1a 64-bit fast, allocation-free, good enough spread for bucketing.
fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// A tiny stop-list so the most common English/French filler doesn't dominate the
/// overview text. Not exhaustive by design collisions wash out the long tail.
fn is_stopword(t: &str) -> bool {
    matches!(
        t,
        "the" | "and" | "for" | "with" | "from" | "that" | "this" | "his" | "her"
            | "its" | "their" | "are" | "was" | "but" | "not" | "you" | "who"
            | "les" | "des" | "une" | "dans" | "pour" | "par" | "qui" | "que"
            | "sur" | "est" | "son" | "ses" | "aux" | "avec" | "leur"
            // Generic film words: they appear in nearly every doc *and* in the
            // themed query phrases, inflating similarity to a baseline that buried
            // real signal (e.g. "christmas movie" matched anything via "movie").
            | "movie" | "movies" | "film" | "films" | "cinema" | "story"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cosine similarity - both vectors are unit-length, so this is a plain dot.
    fn cosine(a: &[f32], b: &[f32]) -> f32 {
        a.iter().zip(b).map(|(x, y)| x * y).sum()
    }

    #[test]
    fn a_vector_is_unit_length_so_cosine_is_a_dot_product() {
        // Every consumer compares with a dot product and assumes normalization
        // already happened; an un-normalized vector would let a long overview
        // outscore a relevant short one purely on length.
        let e = LexicalEmbedder::new(256);
        let v = e.embed("A heist thriller set in Paris");
        assert_eq!(v.len(), 256);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "norm was {norm}");
    }

    #[test]
    fn text_with_nothing_to_say_embeds_as_zeroes_rather_than_nan() {
        // l2_normalize guards on a zero norm; without that guard every one of
        // these would come back NaN and poison the similarity ranking.
        let e = LexicalEmbedder::new(64);
        for empty in ["", "   ", "!!! ??? ...", "a b c", "the and for with"] {
            let v = e.embed(empty);
            assert!(v.iter().all(|x| *x == 0.0), "{empty:?} produced {v:?}");
        }
    }

    #[test]
    fn the_dimension_has_a_floor_so_collisions_stay_survivable() {
        // A caller asking for 4 buckets would collide almost everything into
        // one; 16 is the smallest that still discriminates.
        assert_eq!(LexicalEmbedder::new(0).dim(), 16);
        assert_eq!(LexicalEmbedder::new(4).dim(), 16);
        assert_eq!(LexicalEmbedder::new(256).dim(), 256);
    }

    #[test]
    fn shared_words_score_higher_than_unrelated_ones() {
        // The whole point: "more like this" ranks by overlapping vocabulary.
        let e = LexicalEmbedder::new(512);
        let heist = e.embed("bank heist crew safecracker vault");
        let heist2 = e.embed("safecracker joins a vault heist crew");
        let romance = e.embed("wedding proposal countryside romance");
        assert!(
            cosine(&heist, &heist2) > cosine(&heist, &romance),
            "{} vs {}",
            cosine(&heist, &heist2),
            cosine(&heist, &romance)
        );
        // Identical text is a perfect match.
        assert!((cosine(&heist, &heist) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn case_and_punctuation_do_not_change_the_vector() {
        let e = LexicalEmbedder::new(128);
        let plain = e.embed("Blade Runner 2049");
        let noisy = e.embed("  blade, RUNNER -- 2049!  ");
        assert!((cosine(&plain, &noisy) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn repetition_is_dampened_rather_than_counted() {
        // Sublinear term frequency: a word seen 10x must not swamp one seen
        // once, or a title that repeats its own name buries everything else.
        let e = LexicalEmbedder::new(256);
        let once = e.embed("dragon knight");
        let shouted = e.embed("dragon dragon dragon dragon dragon knight");
        // Still clearly the same subject...
        assert!(cosine(&once, &shouted) > 0.8);
        // ...but "knight" has not been drowned out. Weighting the count
        // linearly would put 0.962 of the vector's energy on "dragon"; the
        // 1 + ln(n) weight holds it to 0.872.
        let loudest = shouted.iter().map(|x| x * x).fold(0.0f32, f32::max);
        assert!(loudest < 0.9, "one term holds {loudest} of the vector");
    }

    #[test]
    fn generic_film_words_are_dropped_so_they_cannot_manufacture_a_match() {
        // This is the bug the stop-list exists for: "christmas movie" matched
        // anything at all through the word "movie".
        let e = LexicalEmbedder::new(256);
        let christmas = e.embed("christmas movie");
        let unrelated = e.embed("submarine movie");
        assert_eq!(cosine(&christmas, &unrelated), 0.0, "only 'movie' is shared");
        // Both English and French filler is dropped.
        assert!(e.embed("the and for with that").iter().all(|x| *x == 0.0));
        assert!(e.embed("les des une dans pour").iter().all(|x| *x == 0.0));
    }

    #[test]
    fn single_characters_are_noise_and_are_skipped() {
        let e = LexicalEmbedder::new(64);
        let bare = e.embed("samurai");
        let padded = e.embed("a samurai s x 7");
        assert!((cosine(&bare, &padded) - 1.0).abs() < 1e-5, "1-char tokens leaked in");
        // A two-character token is real (e.g. "9/11", "ET").
        assert!(e.embed("et").iter().any(|x| *x != 0.0));
    }

    #[test]
    fn the_relevance_floor_is_above_the_noise_of_one_shared_word() {
        // Two docs sharing a single generic token out of many score well below
        // this; the generator uses the floor to drop exactly that case.
        let e = LexicalEmbedder::new(256);
        assert_eq!(e.relevance_floor(), 0.16);
        let a = e.embed("desert survival expedition dunes caravan water heat compass");
        let b = e.embed("courtroom perjury verdict caravan lawyer jury bench gavel");
        let noise = cosine(&a, &b);
        assert!(noise < e.relevance_floor(), "one shared word in eight scored {noise}");
        // Real overlap clears it comfortably.
        let c = e.embed("desert survival expedition dunes caravan thirst");
        assert!(cosine(&a, &c) > e.relevance_floor());
    }

    #[test]
    fn fnv1a_is_the_published_algorithm() {
        // Pinning the constants: a different offset basis or prime silently
        // re-buckets every stored vector, so old embeddings would stop matching
        // new ones with no error anywhere.
        assert_eq!(fnv1a(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a("a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a("foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn tokenize_splits_on_anything_that_is_not_alphanumeric() {
        let got: Vec<String> = tokenize("Mad-Max: Fury_Road (2015)").collect();
        // `_` is not alphanumeric, so it splits too; digits are kept as tokens.
        assert_eq!(got, ["mad", "max", "fury", "road", "2015"]);
        assert!(tokenize("").next().is_none());
    }

    #[test]
    fn unicode_survives_tokenization() {
        // Accented titles are common and must not be dropped or split apart.
        let got: Vec<String> = tokenize("Amélie Poulain").collect();
        assert_eq!(got, ["amélie", "poulain"]);
        let e = LexicalEmbedder::new(128);
        assert!(e.embed("Amélie").iter().any(|x| *x != 0.0));
    }
}
