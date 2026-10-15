use std::path::{Path, PathBuf};

use crate::subtitles::{extract_vtt, timeout_for};
use crate::tmp_file::unique_tmp;

use super::decode::text_of;

// A text subtitle of a feature film runs a few hundred kilobytes. Past this the
// file is something else, and reading it would be the point of the exercise.
const MOST_BYTES: u64 = 32 * 1024 * 1024;

/// Convert one text subtitle file to WebVTT at `out`.
///
/// The bytes are decoded before ffmpeg sees them, so a Windows-1252 `.srt`
/// keeps its accents instead of arriving as replacement characters. ASS and SSA
/// keep their text and lose their styling. Blocking; run it on a blocking
/// thread.
pub fn to_vtt(file: &Path, out: &Path, cancel: &dyn Fn() -> bool) -> Result<(), String> {
    let weight = std::fs::metadata(file)
        .map_err(|e| format!("could not read {}: {e}", file.display()))?
        .len();
    if weight > MOST_BYTES {
        return Err(format!("{} is too large to be a subtitle", file.display()));
    }
    let bytes =
        std::fs::read(file).map_err(|e| format!("could not read {}: {e}", file.display()))?;
    let staged = staging_beside(out, file);
    if let Some(dir) = staged.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("could not create the subtitle output dir: {e}"))?;
    }
    std::fs::write(&staged, text_of(&bytes))
        .map_err(|e| format!("could not stage {}: {e}", file.display()))?;
    let landed = extract_vtt(
        &staged.to_string_lossy(),
        &[(0, out.to_path_buf())],
        timeout_for(&staged.to_string_lossy()),
        cancel,
    );
    let _ = std::fs::remove_file(&staged);
    match landed {
        Ok(0) => Err(format!("{} held no cues", file.display())),
        Ok(_) => Ok(()),
        Err(reason) => Err(reason),
    }
}

// ffmpeg reads the format off the extension, so the decoded copy keeps the
// source's, and it is written beside the output rather than in the media folder.
fn staging_beside(out: &Path, file: &Path) -> PathBuf {
    let ext = file
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("srt");
    unique_tmp(&out.with_extension(ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> kroma_testing::TempDir {
        kroma_testing::temp_dir(&format!("subtitle-files-{name}"))
    }

    #[test]
    fn a_staged_copy_keeps_the_extension_ffmpeg_reads_the_format_from() {
        let staged = staging_beside(Path::new("/subs/abc.vtt"), Path::new("/films/Film.en.ASS"));

        assert_eq!(staged.extension().unwrap(), "ASS");
        assert_eq!(staged.parent().unwrap(), Path::new("/subs"));
    }

    #[test]
    fn a_file_far_too_big_to_be_a_subtitle_is_refused_unread() {
        let dir = scratch("too-big");
        let file = dir.path().join("Film.en.srt");
        std::fs::File::create(&file)
            .unwrap()
            .set_len(MOST_BYTES + 1)
            .unwrap();

        let refused = to_vtt(&file, &dir.path().join("out.vtt"), &|| false).unwrap_err();

        assert!(refused.contains("too large"), "{refused}");
    }

    #[test]
    fn a_file_that_is_not_there_is_refused_rather_than_spawning_anything() {
        let dir = scratch("missing");

        let refused = to_vtt(
            &dir.path().join("gone.srt"),
            &dir.path().join("out.vtt"),
            &|| false,
        )
        .unwrap_err();

        assert!(refused.contains("could not read"), "{refused}");
    }
}
