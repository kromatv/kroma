//! The one way an ffmpeg or ffprobe command names its input.

use std::ffi::{OsStr, OsString};

const LOCAL_PROTOCOLS: &str = "file";

/// The arguments that make `path` the input, for ffmpeg and ffprobe alike. Only
/// the `file` protocol is whitelisted: a URL, or a playlist naming one, is refused.
pub fn file(path: impl AsRef<OsStr>) -> [OsString; 4] {
    [
        "-protocol_whitelist".into(),
        LOCAL_PROTOCOLS.into(),
        "-i".into(),
        path.as_ref().to_os_string(),
    ]
}

/// The arguments that make a lavfi graph (`testsrc=...`, `color=...`) the input,
/// under the same whitelist as [`file`].
pub fn generated(graph: &str) -> [OsString; 6] {
    [
        "-protocol_whitelist".into(),
        LOCAL_PROTOCOLS.into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        graph.into(),
    ]
}

#[cfg(test)]
mod tests;
