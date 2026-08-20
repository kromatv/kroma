//! Which audio tracks the download stream-copies and which it re-encodes,
//! as the ffmpeg flags that say so.

// Copy-safe means fMP4-muxable (mirrors the clients' `FMP4_COPY_CODECS`) AND, when
// the client declared a `copy` set, present in it - Android phones usually lack
// Dolby decoders and send `aac`, iOS sends `aac,ac3,eac3`.
fn download_copies_audio(codec: Option<&str>, client_set: Option<&str>) -> bool {
    let Some(codec) = codec else { return false };
    if !matches!(codec, "aac" | "ac3" | "eac3") {
        return false;
    }
    match client_set {
        None => true,
        Some(set) => set.split(',').any(|c| c.trim().eq_ignore_ascii_case(codec)),
    }
}

// Every track rides along in stream order: AVFoundation synthesizes local audio
// selection from the MP4 muxer's single alternate group, so offline pickers select
// by ordinal.
pub(super) fn download_audio_args(
    tracks: &[crate::model::AudioStream],
    fallback_codec: Option<&str>,
    client_set: Option<&str>,
) -> Vec<String> {
    if tracks.is_empty() {
        // Unprobed item: the map stays optional so a video-only file still downloads.
        let mut args: Vec<String> = vec!["-map".into(), "0:a:0?".into()];
        args.extend(audio_codec_args(":a", download_copies_audio(fallback_codec, client_set)));
        return args;
    }
    let mut sorted: Vec<&crate::model::AudioStream> = tracks.iter().collect();
    sorted.sort_by_key(|t| t.index);
    let mut args: Vec<String> = Vec::new();
    for (out, t) in sorted.iter().enumerate() {
        // NOT optional (`0:a:N?`): the per-track codec options are numbered by OUTPUT
        // position, so a map matching nothing shifts every later stream and lands
        // `copy` on a track meant to be transcoded. Fail loudly instead.
        args.extend(["-map".into(), format!("0:a:{}", t.index)]);
        args.extend(audio_codec_args(&format!(":a:{out}"), download_copies_audio(Some(t.codec.as_str()), client_set)));
    }
    args
}

fn audio_codec_args(spec: &str, copy: bool) -> Vec<String> {
    if copy {
        return vec![format!("-c{spec}"), "copy".into()];
    }
    vec![
        format!("-c{spec}"),
        "aac".into(),
        format!("-ac{spec}"),
        "2".into(),
        format!("-b{spec}"),
        "192k".into(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(index: u32, codec: &str) -> crate::model::AudioStream {
        crate::model::AudioStream {
            index,
            codec: codec.into(),
            channels: None,
            language: None,
            title: None,
            default: false,
        }
    }

    #[test]
    fn download_copy_gate_honors_safe_set_and_client_set() {
        assert!(download_copies_audio(Some("eac3"), None));
        assert!(!download_copies_audio(Some("dts"), None));
        assert!(!download_copies_audio(None, None));
        assert!(download_copies_audio(Some("aac"), Some("aac")));
        assert!(!download_copies_audio(Some("eac3"), Some("aac")));
        assert!(download_copies_audio(Some("ac3"), Some("aac, AC3")));
        // `?copy=` (present, empty) means the device decodes none of them.
        assert!(!download_copies_audio(Some("aac"), Some("")));
        assert!(!download_copies_audio(Some("eac3"), Some("")));
    }

    #[test]
    fn download_audio_args_unprobed_fallback() {
        assert_eq!(
            download_audio_args(&[], Some("aac"), None),
            ["-map", "0:a:0?", "-c:a", "copy"]
        );
        assert_eq!(
            download_audio_args(&[], Some("dts"), None),
            ["-map", "0:a:0?", "-c:a", "aac", "-ac:a", "2", "-b:a", "192k"]
        );
    }

    #[test]
    fn download_audio_args_maps_every_track_with_per_track_codecs() {
        let tracks = [track(0, "eac3"), track(1, "dts"), track(2, "aac")];
        assert_eq!(
            download_audio_args(&tracks, Some("eac3"), None),
            [
                "-map", "0:a:0", "-c:a:0", "copy",
                "-map", "0:a:1", "-c:a:1", "aac", "-ac:a:1", "2", "-b:a:1", "192k",
                "-map", "0:a:2", "-c:a:2", "copy",
            ]
        );
    }

    #[test]
    fn download_audio_args_client_set_forces_transcode_and_sorts_by_index() {
        let tracks = [track(1, "aac"), track(0, "eac3")];
        assert_eq!(
            download_audio_args(&tracks, None, Some("aac")),
            [
                "-map", "0:a:0", "-c:a:0", "aac", "-ac:a:0", "2", "-b:a:0", "192k",
                "-map", "0:a:1", "-c:a:1", "copy",
            ]
        );
    }
}
