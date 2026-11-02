//! In-process Whisper transcription (no external whisper.cpp binary). The candle
//! inference lives in [`engine`], behind the `local` feature; the default build
//! compiles a stub that returns `None`.

#[cfg(feature = "local")]
mod engine;
#[cfg(feature = "local")]
mod mel;
#[cfg(feature = "local")]
mod pcm;

#[cfg_attr(not(feature = "local"), allow(dead_code))]
mod model;
mod serve;
pub use serve::whisper_routes;

use std::path::Path;

/// Transcribe audio track `track` of `input` to WebVTT. `model_spec` is a local
/// dir or one of the pinned `openai/whisper-*` repo ids, whose files must match
/// their sha256; `lang` forces the spoken language (ISO 639-1) instead of
/// auto-detecting; `cancelled` is asked between steps. `None` on failure,
/// cancellation, or with the feature off.
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
    cancelled: &dyn Fn() -> bool,
) -> Option<String> {
    #[cfg(feature = "local")]
    {
        on_stage("model");
        let dir = model::resolve(data_dir, model_spec)?;
        if cancelled() {
            return None;
        }
        on_stage("extract");
        let pcm = pcm::extract(input, track, &data_dir.join("modules").join(MODULE_ID))?;
        if cancelled() {
            return None;
        }
        on_stage("transcribe");
        engine::transcribe(&dir, pcm, lang, on_progress, cancelled)
    }
    #[cfg(not(feature = "local"))]
    {
        None
    }
}

#[cfg(feature = "local")]
const MODULE_ID: &str = "tv.kroma.whisper";

pub mod module;
pub use module::MODULE;
