//! The core's media tools, run by the host on the files a module holds.

use std::path::Path;

pub use kroma_primitives::pcm::{Pcm, SampleFormat};

use crate::outside::{DecodeSpec, outside};

/// Decode audio track `track` of `source` into raw `pcm` at `destination`, with
/// the core's ffmpeg under its budget, and answer the bytes written. Needs
/// `"media": ["decode"]` under `permissions`. The host refuses a `source` outside
/// the folders this module holds or inside one it may write, and a `destination`
/// outside the ones it may write.
pub fn decode_audio(
    source: &Path,
    track: u32,
    pcm: Pcm,
    destination: &Path,
) -> Result<u64, String> {
    outside()?.decode_audio(DecodeSpec {
        source: source.to_string_lossy().into_owned(),
        track,
        pcm,
        destination: destination.to_string_lossy().into_owned(),
    })
}
