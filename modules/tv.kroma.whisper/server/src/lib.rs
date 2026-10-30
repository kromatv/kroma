//! In-process Whisper transcription (no external whisper.cpp binary). The candle
//! inference lives in [`engine`], behind the `local` feature; the default build
//! compiles a stub that returns `None`.

#[cfg(feature = "local")]
mod engine;

#[cfg_attr(not(feature = "local"), allow(dead_code))]
mod model;
mod serve;
pub use serve::whisper_routes;

use std::path::Path;
use std::sync::atomic::AtomicBool;
#[cfg(feature = "local")]
use std::sync::atomic::Ordering;

/// Transcribe audio track `track` of `input` to WebVTT. `model_spec` is a local
/// dir or one of the pinned `openai/whisper-*` repo ids, whose files must match
/// their sha256; `lang` forces the spoken language (ISO 639-1) instead of
/// auto-detecting. `None` on failure, cancellation, or with the feature off.
#[allow(clippy::too_many_arguments)]
#[allow(unused_variables)]
pub fn transcribe(
    data_dir: &Path,
    model_spec: &str,
    input: &Path,
    track: u32,
    lang: Option<&str>,
    on_stage: &dyn Fn(&str),
    on_progress: &dyn Fn(usize, usize),
    cancel: &AtomicBool,
) -> Option<String> {
    #[cfg(feature = "local")]
    {
        on_stage("model");
        let dir = model::resolve(data_dir, model_spec)?;
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        on_stage("extract");
        let pcm = extract_pcm(input, track)?;
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        on_stage("transcribe");
        engine::transcribe(&dir, &pcm, lang, on_progress, cancel)
    }
    #[cfg(not(feature = "local"))]
    {
        None
    }
}

// Mono 16 kHz f32 PCM is Whisper's input format.
#[cfg(feature = "local")]
fn extract_pcm(input: &Path, track: u32) -> Option<Vec<f32>> {
    use std::process::Command;
    let out = Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-i"])
        .arg(input)
        .arg("-vn")
        .arg("-map")
        .arg(format!("0:a:{track}"))
        .args(["-ac", "1", "-ar", "16000", "-f", "f32le", "-"])
        .output()
        .ok()?;
    if !out.status.success() || out.stdout.is_empty() {
        return None;
    }
    Some(
        out.stdout
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect(),
    )
}

pub mod module;
pub use module::MODULE;
