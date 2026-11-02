//! Candle Whisper inference: PCM → log-mel → encoder/decoder greedy decode →
//! WebVTT. Adapted from candle-transformers' whisper example, simplified to a
//! greedy decoder with timestamp-delimited cues over 30 s windows. Runs on the
//! Metal / CUDA GPU when the build includes that backend (see [`best_device`]),
//! else the pure-Rust CPU path.

use std::fs::File;
use std::path::Path;

use anyhow::{anyhow, Result};
use candle_core::{DType, Device, IndexOp, Tensor};
use candle_transformers::models::whisper::{self as w, Config};
use tokenizers::Tokenizer;

const SAMPLE_RATE: f64 = 16000.0;
const N_FRAMES: usize = 3000; // 30 s of mel frames (hop 160 @ 16 kHz)
const HOP: f64 = 160.0;
const MAX_TOKENS: usize = 224;

/// Transcribe `pcm` (a file of mono 16 kHz little-endian f32) with the model in
/// `model_dir`. `lang` forces the spoken language (ISO 639-1) when the model is
/// multilingual. `on_progress` reports decoded-window counts; `cancelled` is asked
/// before each window and each decoded token. `None` on failure (logged) or
/// cancellation; the caller reports an error.
pub fn transcribe(
    model_dir: &Path,
    pcm: File,
    lang: Option<&str>,
    on_progress: &dyn Fn(usize, usize),
    cancelled: &dyn Fn() -> bool,
) -> Option<String> {
    match run(model_dir, pcm, lang, on_progress, cancelled) {
        Ok(vtt) => Some(vtt),
        Err(e) => {
            tracing::warn!(error = %format!("{e:#}"), "whisper transcription failed");
            None
        }
    }
}

fn best_device() -> Device {
    match Device::new_metal(0) {
        Ok(d) => {
            tracing::info!("whisper: running on the Metal GPU");
            return d;
        }
        Err(e) => tracing::debug!(error = %e, "whisper: Metal backend unavailable"),
    }
    match Device::new_cuda(0) {
        Ok(d) => {
            tracing::info!("whisper: running on the CUDA GPU");
            return d;
        }
        Err(e) => tracing::debug!(error = %e, "whisper: CUDA backend unavailable"),
    }
    tracing::info!("whisper: running on the CPU");
    Device::Cpu
}

fn run(
    model_dir: &Path,
    pcm: File,
    lang: Option<&str>,
    on_progress: &dyn Fn(usize, usize),
    cancelled: &dyn Fn() -> bool,
) -> Result<String> {
    let device = best_device();
    let cfg: Config = serde_json::from_reader(File::open(model_dir.join("config.json"))?)?;
    let tokenizer =
        Tokenizer::from_file(model_dir.join("tokenizer.json")).map_err(|e| anyhow!("{e}"))?;
    let mut model = {
        let vb = kroma_weights::var_builder(&model_dir.join("model.safetensors"), DType::F32, &device)?;
        w::model::Whisper::load(&vb, cfg.clone())?
    };

    let samples = usize::try_from(pcm.metadata()?.len())? / size_of::<f32>();
    let mel = crate::mel::log_mel(pcm, samples, cfg.num_mel_bins)?;
    let n_frames = mel.len() / cfg.num_mel_bins;
    let mel = Tensor::from_vec(mel, (1, cfg.num_mel_bins, n_frames), &device)?;

    let tok = |s: &str| {
        tokenizer
            .token_to_id(s)
            .ok_or_else(|| anyhow!("missing token {s}"))
    };
    let sot = tok("<|startoftranscript|>")?;
    let eot = tok("<|endoftext|>")?;
    let transcribe = tok("<|transcribe|>")?;
    let no_ts = tok("<|notimestamps|>")?;
    let ts0 = tok("<|0.00|>")?;
    // Force the spoken language when given and the model is multilingual (the token
    // exists). Seeding `[sot, <|lang|>, <|transcribe|>]` skips Whisper's language
    // detection and keeps timestamps on. English-only models lack the token and
    // transparently fall back to auto-detect.
    let lang_tok = lang.and_then(|c| tokenizer.token_to_id(&format!("<|{c}|>")));
    let mut specials = vec![eot, transcribe, sot, no_ts];
    if let Some(l) = lang_tok {
        specials.push(l);
    }
    let seed = DecodeSeed {
        sot,
        transcribe,
        no_ts,
        eot,
        lang_tok,
    };

    let total_windows = n_frames.div_ceil(N_FRAMES).max(1);
    let mut out = String::from("WEBVTT\n\n");
    let mut seek = 0usize;
    let mut window_idx = 0usize;
    while seek < n_frames {
        if cancelled() {
            anyhow::bail!("cancelled");
        }
        on_progress(window_idx, total_windows);
        let len = (n_frames - seek).min(N_FRAMES);
        let mut window = mel.narrow(2, seek, len)?;
        if len < N_FRAMES {
            let pad = Tensor::zeros((1, cfg.num_mel_bins, N_FRAMES - len), DType::F32, &device)?;
            window = Tensor::cat(&[&window, &pad], 2)?;
        }
        let features = model.encoder.forward(&window, true)?;

        let tokens = decode_window(&mut model, &features, &device, &seed, cancelled)?;

        let offset = seek as f64 * HOP / SAMPLE_RATE;
        emit_segments(&mut out, &tokens, &tokenizer, ts0, &specials, offset);
        seek += N_FRAMES;
        window_idx += 1;
    }
    on_progress(total_windows, total_windows);
    Ok(out)
}

// The fixed special-token ids that seed and terminate greedy decoding.
struct DecodeSeed {
    sot: u32,
    transcribe: u32,
    no_ts: u32,
    eot: u32,
    lang_tok: Option<u32>,
}

// Greedily decode one 30s window into its token sequence (seeded prompt +
// argmax until `eot` or `MAX_TOKENS`).
fn decode_window(
    model: &mut w::model::Whisper,
    features: &Tensor,
    device: &Device,
    seed: &DecodeSeed,
    cancelled: &dyn Fn() -> bool,
) -> Result<Vec<u32>> {
    let mut tokens: Vec<u32> = vec![seed.sot];
    if let Some(l) = seed.lang_tok {
        tokens.push(l);
        tokens.push(seed.transcribe);
    }
    for i in 0..MAX_TOKENS {
        if cancelled() {
            anyhow::bail!("cancelled");
        }
        let t = Tensor::new(tokens.as_slice(), device)?.unsqueeze(0)?;
        // `decoder.forward` returns hidden states (1, seq, d_model); the vocab
        // logits come from the SEPARATE `final_linear` projection (candle keeps
        // them apart). Project the LAST position to (1, 1, vocab) and argmax that
        // - argmaxing the raw hidden states only ever indexes < d_model, so it
        // never reaches the eot / timestamp tokens and no cues are emitted.
        let hidden = model.decoder.forward(&t, features, i == 0)?;
        let last = hidden.narrow(1, hidden.dim(1)? - 1, 1)?;
        let logits = model.decoder.final_linear(&last)?;
        let next = logits.i((0, 0))?.argmax(0)?.to_scalar::<u32>()?;
        if next == seed.no_ts {
            continue;
        }
        tokens.push(next);
        if next == seed.eot {
            break;
        }
    }
    Ok(tokens)
}

// Append cues for one window's tokens: text between two timestamp tokens is a
// cue; a timestamp token maps to `(id - ts0) * 0.02` seconds + window `offset`.
fn emit_segments(
    out: &mut String,
    tokens: &[u32],
    tokenizer: &Tokenizer,
    ts0: u32,
    specials: &[u32],
    offset: f64,
) {
    let mut start: Option<f64> = None;
    let mut text_ids: Vec<u32> = Vec::new();
    for &t in tokens {
        if t >= ts0 {
            let time = offset + (t - ts0) as f64 * 0.02;
            if let Some(s) = start.take() {
                let text = tokenizer.decode(&text_ids, true).unwrap_or_default();
                let text = text.trim();
                if !text.is_empty() {
                    out.push_str(&format!("{} --> {}\n{}\n\n", fmt_ts(s), fmt_ts(time), text));
                }
            }
            text_ids.clear();
            start = Some(time);
        } else if !specials.contains(&t) {
            text_ids.push(t);
        }
    }
}

fn fmt_ts(s: f64) -> String {
    let s = s.max(0.0);
    let h = (s / 3600.0) as u64;
    let m = ((s % 3600.0) / 60.0) as u64;
    let sec = s % 60.0;
    format!("{h:02}:{m:02}:{sec:06.3}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Confirms the selected device (Metal/CUDA when built for it) actually runs
    /// the ops the greedy decoder relies on matmul, argmax, and a host readback.
    /// Run with `cargo test --features whisper-metal -- --ignored gpu_ops`.
    #[test]
    #[ignore]
    fn gpu_ops_run_on_selected_device() {
        let d = best_device();
        let a = Tensor::randn(0f32, 1f32, (2, 4), &d).unwrap();
        let b = Tensor::randn(0f32, 1f32, (4, 3), &d).unwrap();
        let c = a.matmul(&b).unwrap();
        let _ = c.argmax(1).unwrap().to_vec1::<u32>().unwrap();
        println!(
            "whisper device ok: is_metal={} is_cuda={}",
            d.is_metal(),
            d.is_cuda()
        );
        assert!(
            d.is_metal() || d.is_cuda(),
            "expected a GPU device under whisper-metal/cuda"
        );
    }
}
