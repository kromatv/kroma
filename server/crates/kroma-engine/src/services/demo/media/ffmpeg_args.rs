use std::ffi::OsString;
use std::path::Path;

use kroma_media::input;

// Long enough for a storyboard (one tile every 2s) and a couple of HLS segments.
const SECONDS: u32 = 12;

fn base(size: &str) -> Vec<OsString> {
    let mut a = ["-hide_banner", "-loglevel", "error", "-y"]
        .map(OsString::from)
        .to_vec();
    a.extend(input::generated(&format!(
        "testsrc2=size={size}:rate=24:duration={SECONDS}"
    )));
    a.extend(input::generated(&format!(
        "sine=frequency=440:duration={SECONDS}"
    )));
    a
}

pub(super) fn plain(size: &str, out: &Path) -> Vec<OsString> {
    let mut a = base(size);
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
        .map(OsString::from),
    );
    a.push(out.into());
    a
}

pub(super) fn hdr(size: &str, out: &Path) -> Vec<OsString> {
    let mut a = base(size);
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
        .map(OsString::from),
    );
    a.push(out.into());
    a
}

pub(super) fn tracks(size: &str, srt: &Path, out: &Path) -> Vec<OsString> {
    let mut a = base(size);
    a.extend(input::generated(&format!(
        "sine=frequency=220:duration={SECONDS}"
    )));
    a.extend(input::file(srt));
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
        .map(OsString::from),
    );
    a.push(out.into());
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    fn worded(args: &[OsString]) -> String {
        args.iter()
            .map(|a| a.to_string_lossy())
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn an_hdr_title_asks_for_ten_bit_bt2020_and_a_plain_one_does_not() {
        let hdr_command = worded(&hdr("1920x1080", Path::new("/tmp/x.mkv")));
        assert!(hdr_command.contains("yuv420p10le"), "{hdr_command}");
        assert!(hdr_command.contains("smpte2084"), "{hdr_command}");
        assert!(hdr_command.contains("libx265"), "{hdr_command}");

        let plain_command = worded(&plain("1280x720", Path::new("/tmp/x.mp4")));
        assert!(plain_command.contains("libx264"), "{plain_command}");
        assert!(!plain_command.contains("smpte2084"), "{plain_command}");
    }

    #[test]
    fn a_tracks_title_carries_two_languages_and_a_subtitle_stream() {
        let a = worded(&tracks(
            "1280x720",
            Path::new("/tmp/x.srt"),
            Path::new("/tmp/x.mkv"),
        ));
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
        let out = OsString::from("/tmp/demo.mkv");
        for args in [
            plain("1280x720", Path::new("/tmp/demo.mkv")),
            hdr("1280x720", Path::new("/tmp/demo.mkv")),
            tracks(
                "1280x720",
                Path::new("/tmp/s.srt"),
                Path::new("/tmp/demo.mkv"),
            ),
        ] {
            assert_eq!(args.last().unwrap(), &out);
        }
    }
}
