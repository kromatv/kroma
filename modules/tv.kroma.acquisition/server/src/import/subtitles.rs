//! The subtitle files a release ships beside its video, imported with it.

use std::path::{Path, PathBuf};

use anyhow::Result;

use kroma_module_sdk::host::HostCtx;
use kroma_module_sdk::media::external_subtitles::beside;

use super::place::{place, Placement};

/// Place `src` in the library, then every subtitle file beside it, renamed to
/// the stem the video landed under so the catalogue matches the two again.
/// Answers where the video landed.
pub(super) fn place_with_subtitles(
    host: &dyn HostCtx,
    src: &Path,
    around: &[PathBuf],
    dest: &Path,
    mode: Placement,
) -> Result<PathBuf> {
    let at = place(host, src, dest, mode)?;
    let placed = subtitles_beside(host, src, around, &at, mode);
    if placed > 0 {
        tracing::info!(video = %at.display(), placed, "subtitle files imported beside a video");
    }
    Ok(at)
}

fn subtitles_beside(
    host: &dyn HostCtx,
    src: &Path,
    around: &[PathBuf],
    at: &Path,
    mode: Placement,
) -> usize {
    let Some(stem) = at.file_stem().and_then(std::ffi::OsStr::to_str) else {
        return 0;
    };
    let folder = at.parent().unwrap_or_else(|| Path::new("."));
    beside(src, around)
        .iter()
        .filter(|found| {
            let to = folder.join(found.named_after(stem));
            match place(host, &found.path, &to, mode) {
                Ok(_) => true,
                Err(e) => {
                    tracing::warn!(file = %found.path.display(), error = %format!("{e:#}"), "a subtitle file would not import");
                    false
                }
            }
        })
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_module_sdk::host::testing::StubHost;

    fn scratch(name: &str) -> kroma_module_sdk::testing::TempDir {
        kroma_module_sdk::testing::temp_dir(&format!("import-subs-{name}"))
    }

    fn write(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    struct Release {
        _scratch: kroma_module_sdk::testing::TempDir,
        video: PathBuf,
        around: Vec<PathBuf>,
        dest: PathBuf,
    }

    fn release(tag: &str, names: &[&str]) -> Release {
        let scratch = scratch(tag);
        let folder = scratch.path().join("downloads/Old.Release.1080p");
        let video = folder.join("Old.Release.1080p.mkv");
        write(&video, "bytes");
        let mut around = vec![video.clone()];
        for name in names {
            let file = folder.join(name);
            write(&file, "1\n00:00:01,000 --> 00:00:02,000\nhello\n");
            around.push(file);
        }
        let dest = scratch
            .path()
            .join("library/The Matrix (1999)/The Matrix (1999).mkv");
        Release {
            _scratch: scratch,
            video,
            around,
            dest,
        }
    }

    #[test]
    fn a_subtitle_file_follows_the_video_under_its_new_name() {
        let r = release("follows", &["Old.Release.1080p.fr.srt"]);

        let at = place_with_subtitles(&StubHost::new(), &r.video, &r.around, &r.dest, Placement::Skip).unwrap();

        assert_eq!(at, r.dest);
        assert!(
            r.dest.with_file_name("The Matrix (1999).fr.srt").exists(),
            "the subtitle did not land beside the video"
        );
    }

    #[test]
    fn a_subs_folder_is_flattened_beside_the_video() {
        let r = release("flattened", &["Subs/2_English.srt", "Subs/3_French.srt"]);

        place_with_subtitles(&StubHost::new(), &r.video, &r.around, &r.dest, Placement::Skip).unwrap();

        let folder = r.dest.parent().unwrap();
        assert!(folder.join("The Matrix (1999).en.srt").exists());
        assert!(folder.join("The Matrix (1999).fr.srt").exists());
    }

    #[test]
    fn a_picture_subtitle_is_left_where_it_was() {
        let r = release("picture", &["Old.Release.1080p.fr.sub"]);

        place_with_subtitles(&StubHost::new(), &r.video, &r.around, &r.dest, Placement::Skip).unwrap();

        let folder = r.dest.parent().unwrap();
        assert_eq!(std::fs::read_dir(folder).unwrap().count(), 1);
    }

    #[test]
    fn a_release_that_ships_no_subtitle_file_still_imports() {
        let r = release("none", &[]);

        let at = place_with_subtitles(&StubHost::new(), &r.video, &r.around, &r.dest, Placement::Skip).unwrap();

        assert!(at.exists());
    }
}
