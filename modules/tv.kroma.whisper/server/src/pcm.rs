//! The audio Whisper reads: mono 16 kHz little-endian `f32`.

use std::fs::File;
use std::path::Path;
use std::time::Duration;

use kroma_module_sdk::host::process::Command;
use kroma_module_sdk::primitives::{input, random_token};

const EXTRACT_TIMEOUT: Duration = Duration::from_secs(3600);

/// Audio track `track` of `source`, decoded by the host's ffmpeg into a file under
/// `scratch`. The file is already unlinked when this answers, so nothing is left
/// behind whatever happens to the call afterwards.
pub(crate) fn extract(source: &Path, track: u32, scratch: &Path) -> Option<File> {
    std::fs::create_dir_all(scratch).ok()?;
    let path = scratch.join(format!("pcm-{}.f32le", random_token()));
    let named = input::file(source).map(|arg| arg.to_string_lossy().into_owned());
    let out = Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-y"])
        .args(named)
        .args(["-vn", "-map"])
        .arg(format!("0:a:{track}"))
        .args(["-ac", "1", "-ar", "16000", "-f", "f32le"])
        .arg(path.to_string_lossy())
        .output(EXTRACT_TIMEOUT);
    let file = File::open(&path);
    let _ = std::fs::remove_file(&path);
    if out.ok()?.code != 0 {
        return None;
    }
    let file = file.ok()?;
    (file.metadata().ok()?.len() > 0).then_some(file)
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use kroma_module_sdk::testing::temp_dir;

    use super::*;

    const SAMPLE_RATE: u64 = 16_000;
    const SAMPLE_BYTES: u64 = 4;

    fn clip_of_one_second(dir: &Path) -> std::path::PathBuf {
        let path = dir.join("clip.wav");
        let graph = input::generated("sine=frequency=440:duration=1:sample_rate=44100");
        let made = Command::new("ffmpeg")
            .args(["-v", "error", "-nostdin", "-y"])
            .args(graph.map(|arg| arg.to_string_lossy().into_owned()))
            .arg(path.to_string_lossy())
            .output(Duration::from_secs(30))
            .unwrap();
        assert_eq!(made.code, 0, "{}", String::from_utf8_lossy(&made.stderr));
        path
    }

    fn names_in(dir: &Path) -> Vec<String> {
        std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn decodes_a_track_to_16_khz_floats_and_leaves_no_file_behind() {
        let media = temp_dir("whisper-media");
        let scratch = temp_dir("whisper-scratch");
        let clip = clip_of_one_second(media.path());

        let mut pcm = extract(&clip, 0, scratch.path()).expect("the track decoded");

        let mut bytes = Vec::new();
        pcm.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes.len() as u64, SAMPLE_RATE * SAMPLE_BYTES);
        assert!(names_in(scratch.path()).is_empty());
    }

    #[test]
    fn answers_nothing_for_a_track_the_file_does_not_hold() {
        let media = temp_dir("whisper-media");
        let scratch = temp_dir("whisper-scratch");
        let clip = clip_of_one_second(media.path());

        let pcm = extract(&clip, 3, scratch.path());

        assert!(pcm.is_none());
        assert!(names_in(scratch.path()).is_empty());
    }

    #[test]
    fn refuses_a_url_named_as_the_input() {
        let scratch = temp_dir("whisper-scratch");

        let pcm = extract(Path::new("http://127.0.0.1:9/clip.ts"), 0, scratch.path());

        assert!(pcm.is_none());
        assert!(names_in(scratch.path()).is_empty());
    }
}
