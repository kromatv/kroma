//! The demo library as REAL files, written with ffmpeg into
//! `<data>/demo-media` and then scanned like any other library.
//!
//! The rows [`super::demo_data`] seeds have no bytes behind them, so on a server
//! with nothing configured — a fresh clone, a first install, CI — nothing that
//! reads a file works: no playback, no transcode, no storyboard, no subtitle
//! extraction. That is most of what a first look wants to try.
//!
//! Written rather than shipped: video cannot live in the repo, and a download
//! would need a network and someone else's licence. ffmpeg is already required
//! for a real library, so the frames are generated here (a test pattern and a
//! tone) and belong to nobody.
//!
//! Each title is named the way a release is named and carries a shape the player
//! branches on, so what a first look exercises is the real path: 10-bit HDR HEVC,
//! plain h264, and two audio languages with an embedded subtitle track.

use std::path::{Path, PathBuf};
use std::process::Command;

use tracing::{info, warn};

/// Seconds per title. Long enough for a storyboard (one tile every 2s) and for
/// a couple of HLS segments; short enough that the whole library is ~25 MB.
const SECONDS: u32 = 12;

/// What a generated title looks like to a player.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    /// h264 8-bit, one English AAC track. The direct-play case.
    Plain,
    /// HEVC 10-bit with BT.2020/PQ signalling. The HDR + transcode case.
    Hdr,
    /// h264 with English and French audio plus an embedded subtitle track. The
    /// track-picker case.
    Tracks,
}

/// One file to write, at `rel` under the demo root.
#[derive(Debug, Clone)]
pub struct Title {
    pub rel: &'static str,
    pub shape: Shape,
    pub size: &'static str,
}

/// The library: four films and four episodes, the same titles
/// [`super::demo_data`] names, so the two seeds tell one story.
pub fn plan() -> Vec<Title> {
    vec![
        Title {
            rel: "movies/Blade Runner 2049 (2017)/Blade Runner 2049 (2017) 2160p BluRay x265 10bit HDR-DEMO.mkv",
            shape: Shape::Hdr,
            size: "1920x1080",
        },
        Title {
            rel: "movies/Dune Part Two (2024)/Dune.Part.Two.2024.1080p.WEB-DL.x264-DEMO.mkv",
            shape: Shape::Tracks,
            size: "1280x720",
        },
        Title {
            rel: "movies/The Matrix (1999)/The.Matrix.1999.1080p.BluRay.x264-DEMO.mp4",
            shape: Shape::Plain,
            size: "1280x720",
        },
        Title {
            rel: "movies/Spirited Away (2001)/Spirited Away (2001) 1080p BluRay x264-DEMO.mkv",
            shape: Shape::Tracks,
            size: "1280x720",
        },
        Title {
            rel: "shows/Planet Earth II/Season 01/Planet Earth II - S01E01 - Islands [2160p HDR].mkv",
            shape: Shape::Hdr,
            size: "1920x1080",
        },
        Title {
            rel: "shows/Planet Earth II/Season 01/Planet Earth II - S01E02 - Mountains [2160p HDR].mkv",
            shape: Shape::Plain,
            size: "1280x720",
        },
        Title {
            rel: "shows/The Office/Season 02/The Office - S02E01 - The Dundies [1080p x264].mp4",
            shape: Shape::Plain,
            size: "1280x720",
        },
        Title {
            rel: "shows/The Office/Season 02/The Office - S02E02 - Sexual Harassment [1080p x264].mkv",
            shape: Shape::Tracks,
            size: "1280x720",
        },
    ]
}

/// `(movies, shows)` roots under `data_dir`, which is what a library definition
/// points at.
pub fn roots(data_dir: &Path) -> (PathBuf, PathBuf) {
    let base = data_dir.join("demo-media");
    (base.join("movies"), base.join("shows"))
}

/// Write whatever the plan is missing, and answer whether the library is there.
///
/// Idempotent and cheap to call: a title already on disk is left alone, so a
/// restart costs a handful of `stat`s. `false` means nothing was written and the
/// caller should fall back to the row-only seed — no ffmpeg, or every write
/// failed.
pub fn ensure(data_dir: &Path) -> bool {
    let base = data_dir.join("demo-media");
    let plan = plan();
    let missing: Vec<&Title> = plan
        .iter()
        .filter(|t| !base.join(t.rel).is_file())
        .collect();
    if missing.is_empty() {
        return true;
    }
    if !ffmpeg_available() {
        warn!("no ffmpeg on PATH: the demo library stays row-only (nothing will play)");
        return false;
    }
    info!(titles = missing.len(), path = %base.display(), "writing the demo library");
    let mut written = 0usize;
    for title in missing {
        let out = base.join(title.rel);
        if let Some(parent) = out.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                warn!(error = %e, path = %parent.display(), "could not create a demo folder");
                continue;
            }
        }
        match write(title, &out) {
            Ok(()) => written += 1,
            Err(e) => {
                warn!(error = %format!("{e:#}"), title = title.rel, "could not write a demo title")
            }
        }
    }
    let present = plan.iter().filter(|t| base.join(t.rel).is_file()).count();
    if present == 0 {
        // Leaving the empty folders behind would read as a configured library
        // with nothing in it, which is how an unmounted share looks: the scan
        // would hold the index and the row-only seed would never run.
        let _ = std::fs::remove_dir_all(&base);
        warn!("no demo title could be written; falling back to the row-only demo");
        return false;
    }
    info!(written, present, total = plan.len(), "demo library ready");
    true
}

fn ffmpeg_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

// One ffmpeg run per title. HEVC is attempted first for an HDR title and falls
// back to h264: a distribution build without libx265 is common, and a demo file
// that exists beats one that matches the name exactly.
fn write(title: &Title, out: &Path) -> anyhow::Result<()> {
    let tmp = partial(out);
    let _ = std::fs::remove_file(&tmp);
    let result = match title.shape {
        Shape::Hdr => {
            run(&hdr_args(title.size, &tmp)).or_else(|_| run(&plain_args(title.size, &tmp)))
        }
        Shape::Plain => run(&plain_args(title.size, &tmp)),
        Shape::Tracks => {
            let srt = tmp.with_extension("srt");
            std::fs::write(&srt, CUES)?;
            let out = run(&tracks_args(title.size, &srt, &tmp));
            let _ = std::fs::remove_file(&srt);
            out
        }
    };
    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    std::fs::rename(&tmp, out)?;
    Ok(())
}

// A half-written file must not be scanned, and ffmpeg picks its muxer from the
// EXTENSION: the marker goes in front of the name, never over its suffix.
fn partial(out: &Path) -> PathBuf {
    let name = out
        .file_name()
        .map_or_else(|| ".part".into(), |n| n.to_string_lossy().into_owned());
    out.with_file_name(format!(".part-{name}"))
}

fn run(args: &[String]) -> anyhow::Result<()> {
    let status = Command::new("ffmpeg")
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()?;
    if !status.success() {
        anyhow::bail!("ffmpeg exited with {status}");
    }
    Ok(())
}

fn base_args(size: &str) -> Vec<String> {
    vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        format!("testsrc2=size={size}:rate=24:duration={SECONDS}"),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        format!("sine=frequency=440:duration={SECONDS}"),
    ]
}

fn plain_args(size: &str, out: &Path) -> Vec<String> {
    let mut a = base_args(size);
    a.extend(
        [
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "32",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            "-metadata:s:a:0",
            "language=eng",
        ]
        .map(String::from),
    );
    a.push(out.to_string_lossy().into_owned());
    a
}

fn hdr_args(size: &str, out: &Path) -> Vec<String> {
    let mut a = base_args(size);
    a.extend(
        [
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "libx265",
            "-preset",
            "ultrafast",
            "-crf",
            "34",
            "-pix_fmt",
            "yuv420p10le",
            "-x265-params",
            "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:log-level=none",
            "-tag:v",
            "hvc1",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            "-metadata:s:a:0",
            "language=eng",
        ]
        .map(String::from),
    );
    a.push(out.to_string_lossy().into_owned());
    a
}

fn tracks_args(size: &str, srt: &Path, out: &Path) -> Vec<String> {
    let mut a = base_args(size);
    a.extend([
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        format!("sine=frequency=220:duration={SECONDS}"),
        "-i".into(),
        srt.to_string_lossy().into_owned(),
    ]);
    a.extend(
        [
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-map",
            "2:a",
            "-map",
            "3:s",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "32",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            "-c:s",
            "srt",
            "-metadata:s:a:0",
            "language=eng",
            "-metadata:s:a:1",
            "language=fra",
            "-metadata:s:s:0",
            "language=fra",
        ]
        .map(String::from),
    );
    a.push(out.to_string_lossy().into_owned());
    a
}

const CUES: &str = "1\n00:00:01,000 --> 00:00:05,000\nA demo subtitle track.\n\n\
2\n00:00:06,000 --> 00:00:11,000\nSecond cue, so the timing is visible.\n";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_title_lands_in_a_library_and_reads_as_a_release() {
        let plan = plan();
        assert_eq!(plan.len(), 8);
        for t in &plan {
            assert!(
                t.rel.starts_with("movies/") || t.rel.starts_with("shows/"),
                "{} is in neither library",
                t.rel
            );
            assert!(
                t.rel.ends_with(".mkv") || t.rel.ends_with(".mp4"),
                "{} is not a container the scan walks",
                t.rel
            );
        }
        // An episode is only parsed as one when its name carries the numbers.
        let episodes: Vec<&Title> = plan
            .iter()
            .filter(|t| t.rel.starts_with("shows/"))
            .collect();
        assert_eq!(episodes.len(), 4);
        for e in episodes {
            assert!(
                e.rel.contains("S01E") || e.rel.contains("S02E"),
                "{} has no season/episode marker",
                e.rel
            );
            assert!(
                e.rel.contains("/Season "),
                "{} is not under a season folder",
                e.rel
            );
        }
    }

    #[test]
    fn the_shapes_a_player_branches_on_are_all_present() {
        let shapes: Vec<Shape> = plan().iter().map(|t| t.shape).collect();
        for want in [Shape::Plain, Shape::Hdr, Shape::Tracks] {
            assert!(
                shapes.contains(&want),
                "{want:?} is not in the demo library"
            );
        }
    }

    #[test]
    fn the_roots_are_the_two_the_libraries_point_at() {
        let (movies, shows) = roots(Path::new("/data"));
        assert_eq!(movies, Path::new("/data/demo-media/movies"));
        assert_eq!(shows, Path::new("/data/demo-media/shows"));
        // Every planned title lives under one of them.
        for t in plan() {
            let abs = Path::new("/data/demo-media").join(t.rel);
            assert!(
                abs.starts_with(&movies) || abs.starts_with(&shows),
                "{} escapes both roots",
                t.rel
            );
        }
    }

    #[test]
    fn an_hdr_title_asks_for_ten_bit_bt2020_and_a_plain_one_does_not() {
        let hdr = hdr_args("1920x1080", Path::new("/tmp/x.mkv")).join(" ");
        assert!(hdr.contains("yuv420p10le"), "{hdr}");
        assert!(hdr.contains("smpte2084"), "{hdr}");
        assert!(hdr.contains("libx265"), "{hdr}");

        let plain = plain_args("1280x720", Path::new("/tmp/x.mp4")).join(" ");
        assert!(plain.contains("libx264"), "{plain}");
        assert!(!plain.contains("smpte2084"), "{plain}");
    }

    #[test]
    fn a_tracks_title_carries_two_languages_and_a_subtitle_stream() {
        let a = tracks_args("1280x720", Path::new("/tmp/x.srt"), Path::new("/tmp/x.mkv")).join(" ");
        assert!(a.contains("language=eng"), "{a}");
        assert!(a.contains("language=fra"), "{a}");
        assert!(a.contains("-c:s srt"), "{a}");
        // Three inputs and four maps: video, two audio, one subtitle.
        assert_eq!(a.matches("-map").count(), 4, "{a}");
    }

    #[test]
    fn the_output_path_is_always_the_last_argument() {
        // ffmpeg reads it positionally, so a flag appended after it would be
        // taken as another output.
        let out = Path::new("/tmp/demo.mkv").to_string_lossy().into_owned();
        for args in [
            plain_args("1280x720", Path::new("/tmp/demo.mkv")),
            hdr_args("1280x720", Path::new("/tmp/demo.mkv")),
            tracks_args(
                "1280x720",
                Path::new("/tmp/s.srt"),
                Path::new("/tmp/demo.mkv"),
            ),
        ] {
            assert_eq!(args.last().unwrap(), &out);
        }
    }

    #[test]
    fn the_partial_name_keeps_the_extension_ffmpeg_reads_the_muxer_from() {
        // `with_extension("part")` would have replaced `.mkv`, and ffmpeg cannot
        // infer a container from `.part`: every write failed that way once.
        let tmp = partial(Path::new(
            "/data/demo-media/movies/A (2001)/A (2001) 1080p.mkv",
        ));
        assert_eq!(tmp.extension().unwrap(), "mkv");
        assert_eq!(tmp.file_name().unwrap(), ".part-A (2001) 1080p.mkv");
        assert_eq!(
            tmp.parent().unwrap(),
            Path::new("/data/demo-media/movies/A (2001)")
        );
    }

    #[test]
    fn a_library_already_on_disk_is_not_written_again() {
        // `ensure` reports true without ffmpeg when the files are there, which is
        // what makes it cheap to call on every boot.
        let dir = kroma_testing::temp_dir("demo-media");
        let base = dir.path().join("demo-media");
        for t in plan() {
            let f = base.join(t.rel);
            std::fs::create_dir_all(f.parent().unwrap()).unwrap();
            std::fs::write(&f, b"not really a video").unwrap();
        }

        assert!(ensure(dir.path()));
    }

    #[test]
    fn the_cues_are_a_subtitle_file_a_muxer_accepts() {
        assert!(CUES.starts_with("1\n00:00:01,000 --> "), "{CUES}");
        assert_eq!(CUES.matches(" --> ").count(), 2);
    }
}
