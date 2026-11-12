//! Multilingual semantic-embedding backend Cargo feature `semantic`.
//!
//! Loads a BERT-architecture sentence model (config.json + tokenizer.json +
//! model.safetensors) from the folder `crate::model` places it in, and
//! mean-pools its token embeddings into a 384-d vector. CPU only.
//!
//! Chosen model: **`paraphrase-multilingual-MiniLM-L12-v2`** (384-d, 12 layers,
//! ~470 MB). Libraries are often non-English (ours has French overviews), and an
//! English-only model (`all-MiniLM-L6-v2`) collapsed every query returned the
//! same handful of items. A *multilingual* model maps FR docs + EN/FR queries into
//! one space; verified on the live library (christmas → Nightmare Before Christmas
//! / Elf / Krampus; heist → Heat / Le Cercle rouge). Keep the phrase bank in
//! ENGLISH English queries outperform French against this model.
//!
//! Build notes: candle stays on its pure-Rust `gemm` backend (no mkl/accelerate/
//! cuda) and `tokenizers` on `fancy-regex`, since a component holds no C. Any
//! BERT-arch sentence model in the dir works, but `dim()` assumes 384-d output.

use std::path::Path;

use anyhow::{Context, Result};
use candle_core::{Device, Module, Tensor};
use candle_nn::{embedding, Embedding};
use candle_transformers::models::bert::{BertEncoder, Config, DTYPE};
use candle_transformers::models::with_tracing::{layer_norm, LayerNorm};
use kroma_weights::Rows;
use tokenizers::Tokenizer;

use super::Embedder;

const WORDS: &str = "embeddings.word_embeddings.weight";

pub struct MiniLmEmbedder {
    words: Rows,
    positions: Embedding,
    token_types: Embedding,
    norm: LayerNorm,
    encoder: BertEncoder,
    tokenizer: Tokenizer,
    device: Device,
}

impl MiniLmEmbedder {
    /// Load the model from `dir`, which holds `config.json`, `tokenizer.json`
    /// and `model.safetensors`.
    pub fn load(dir: &Path) -> Result<Self> {
        let device = Device::Cpu;

        let config: Config = serde_json::from_str(
            &std::fs::read_to_string(dir.join("config.json")).context("read config.json")?,
        )
        .context("parse config.json")?;

        let tokenizer = Tokenizer::from_file(dir.join("tokenizer.json"))
            .map_err(|e| anyhow::anyhow!("load tokenizer.json: {e}"))?;

        let weights = dir.join("model.safetensors");
        let words = Rows::open(&weights, WORDS).context("read the word table")?;
        anyhow::ensure!(
            words.width() == config.hidden_size,
            "the word table is {} wide, the model {}",
            words.width(),
            config.hidden_size
        );
        let vb =
            kroma_weights::var_builder(&weights, DTYPE, &device).context("read safetensors")?;
        let embeddings = vb.pp("embeddings");
        Ok(Self {
            words,
            positions: embedding(
                config.max_position_embeddings,
                config.hidden_size,
                embeddings.pp("position_embeddings"),
            )?,
            token_types: embedding(
                config.type_vocab_size,
                config.hidden_size,
                embeddings.pp("token_type_embeddings"),
            )?,
            norm: layer_norm(
                config.hidden_size,
                config.layer_norm_eps,
                embeddings.pp("LayerNorm"),
            )?,
            encoder: BertEncoder::load(vb.pp("encoder"), &config).context("build BERT")?,
            tokenizer,
            device,
        })
    }

    fn sequence(&self, ids: &[u32]) -> Result<Tensor> {
        let tokens = Tensor::new(ids, &self.device)?.unsqueeze(0)?;
        let words = self.words.gather(ids, &self.device)?.unsqueeze(0)?;
        let token_types = self.token_types.forward(&tokens.zeros_like()?)?;
        let positions = Tensor::new(&(0..ids.len() as u32).collect::<Vec<_>>()[..], &self.device)?;
        let embedded =
            (&words + token_types)?.broadcast_add(&self.positions.forward(&positions)?)?;
        let embedded = self.norm.forward(&embedded)?;
        let mask = tokens
            .ones_like()?
            .unsqueeze(1)?
            .unsqueeze(1)?
            .to_dtype(DTYPE)?;
        let mask = (mask.ones_like()? - &mask)?
            .broadcast_mul(&Tensor::try_from(f32::MIN)?.to_dtype(DTYPE)?)?;
        Ok(self.encoder.forward(&embedded, &mask)?)
    }

    fn embed_inner(&self, text: &str) -> Result<Vec<f32>> {
        let enc = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!("tokenize: {e}"))?;

        // [1, seq_len, 384] → mean-pool over the sequence → [384].
        let out = self.sequence(enc.get_ids())?;
        let pooled = out.mean(1)?.squeeze(0)?;
        let mut v: Vec<f32> = pooled.to_vec1()?;
        super::l2_normalize(&mut v);
        Ok(v)
    }
}

impl Embedder for MiniLmEmbedder {
    fn dim(&self) -> usize {
        384
    }

    fn relevance_floor(&self) -> f32 {
        // Calibrated on the live library with paraphrase-multilingual-MiniLM-L12:
        // genuine themed matches score ~0.45–0.66, so ~0.38 keeps them while a
        // query the library can't satisfy (best hit below it) drops the row.
        0.38
    }

    fn embed(&self, text: &str) -> Vec<f32> {
        // Never poison the enrichment pass on a single bad input: log and return
        // a zero vector (which scores 0 against everything and is simply ignored).
        match self.embed_inner(text) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(error = %err, "MiniLM embed failed; using zero vector");
                vec![0.0; self.dim()]
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Embedder;

    #[test]
    #[ignore = "needs the MiniLM model files (models/minilm) on disk"]
    fn minilm_embeds_as_candles_bert_model_does() {
        use candle_transformers::models::bert::BertModel;

        let dir = crate::model::place().dir;
        let e = MiniLmEmbedder::load(&dir).expect("load MiniLM model");
        let config: Config =
            serde_json::from_str(&std::fs::read_to_string(dir.join("config.json")).unwrap())
                .unwrap();
        let vb = kroma_weights::var_builder(&dir.join("model.safetensors"), DTYPE, &Device::Cpu)
            .unwrap();
        let whole = BertModel::load(vb, &config).unwrap();
        let ids = e
            .tokenizer
            .encode(
                "un film de Noël chaleureux about santa and his family",
                true,
            )
            .unwrap()
            .get_ids()
            .to_vec();
        let tokens = Tensor::new(&ids[..], &Device::Cpu)
            .unwrap()
            .unsqueeze(0)
            .unwrap();
        let expected = whole
            .forward(
                &tokens,
                &tokens.zeros_like().unwrap(),
                Some(&tokens.ones_like().unwrap()),
            )
            .unwrap();

        let gathered = e.sequence(&ids).unwrap();

        assert_eq!(
            gathered.flatten_all().unwrap().to_vec1::<f32>().unwrap(),
            expected.flatten_all().unwrap().to_vec1::<f32>().unwrap()
        );
    }

    /// End-to-end runtime check: loads the real model and verifies the output is a
    /// 384-d unit vector AND that it ranks *meaning*, not words the whole reason
    /// for this backend. Needs the model files on disk, so it's ignored by default:
    ///   KROMA_EMBED_MODEL_DIR=models/minilm \
    ///     cargo test -p kroma-vector --features semantic minilm -- --ignored --nocapture
    #[test]
    #[ignore = "needs the MiniLM model files (models/minilm) on disk"]
    fn minilm_embeds_and_ranks_by_meaning() {
        let e = MiniLmEmbedder::load(&crate::model::place().dir).expect("load MiniLM model");
        assert_eq!(e.dim(), 384);

        let christmas = e.embed("a heartwarming christmas movie about santa and family");
        let holiday = e.embed("a festive holiday film with father christmas giving gifts");
        let war = e.embed("a brutal documentary about tank warfare and combat");

        // L2-normalized (so cosine == dot downstream).
        let norm = christmas.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert_eq!(christmas.len(), 384);
        assert!(
            (norm - 1.0).abs() < 1e-3,
            "expected unit length, got {norm}"
        );

        let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        let near = dot(&christmas, &holiday); // same vibe, different words
        let far = dot(&christmas, &war); // different vibe
                                         // Semantics, not keywords: christmas≈holiday must clearly beat christmas≈war.
        assert!(
            near > far + 0.1,
            "christmas~holiday {near:.3} should ≫ christmas~war {far:.3}"
        );
    }
}
