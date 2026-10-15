use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use super::parse::build_result;
use super::run::DURATION_ARGS;
use super::ProbeResult;

/// The container's `format.duration` of `input`, a path or any URL ffmpeg opens.
/// `None` where ffprobe answered nothing within `limit`, which over a download in
/// flight means the header it reads the length from has not arrived: the answer
/// is worth asking for again rather than remembering.
pub async fn duration_ms_within(input: &str, limit: Duration) -> Option<u64> {
    let child = Command::new("ffprobe")
        .args(DURATION_ARGS)
        .arg(input)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    let out = tokio::time::timeout(limit, child.wait_with_output())
        .await
        .ok()?
        .ok()?;
    if !out.status.success() {
        return None;
    }
    super::duration_of(&out.stdout)
}

/// Probes `input`, a path or any URL ffmpeg opens, the way [`super::probe_file`]
/// probes a file, except that nothing is guessed: `None` when ffprobe cannot read
/// the streams within `limit`, which for a download in flight means the bytes it
/// needs have not arrived yet. The ffprobe is killed when the limit runs out.
pub async fn probe_input(input: &str, limit: Duration) -> Option<ProbeResult> {
    let child = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-show_chapters",
            "-of",
            "json",
        ])
        .arg(input)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    let out = tokio::time::timeout(limit, child.wait_with_output())
        .await
        .ok()?
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(build_result(serde_json::from_slice(&out.stdout).ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(dir: &std::path::Path) -> Option<String> {
        let path = dir.join("clip.mp4");
        let made = std::process::Command::new("ffmpeg")
            .args(["-v", "error", "-f", "lavfi", "-i"])
            .arg("testsrc=duration=1:size=64x48:rate=10")
            .args(["-c:v", "mpeg4", "-y"])
            .arg(&path)
            .status()
            .ok()?;
        made.success().then(|| path.to_string_lossy().into_owned())
    }

    #[tokio::test]
    async fn reads_the_picture_of_an_input_it_can_open() {
        let dir = kroma_testing::temp_dir("probe-input");
        let Some(path) = clip(dir.path()) else {
            return;
        };

        let probed = probe_input(&path, Duration::from_secs(10)).await;

        let video = probed.and_then(|p| p.video).expect("a video stream");
        assert_eq!(video.codec, "mpeg4");
        assert_eq!((video.width, video.height), (Some(64), Some(48)));
    }

    #[tokio::test]
    async fn reads_the_chapters_an_input_carries() {
        let dir = kroma_testing::temp_dir("probe-chapters");
        let marks = dir.path().join("marks.txt");
        std::fs::write(
            &marks,
            ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=500\ntitle=Opening\n",
        )
        .unwrap();
        let Some(path) = clip(dir.path()) else {
            return;
        };
        let marked = dir.path().join("marked.mkv");
        let made = std::process::Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(&path)
            .arg("-i")
            .arg(&marks)
            .args(["-map_chapters", "1", "-c", "copy", "-y"])
            .arg(&marked)
            .status();
        if !matches!(made, Ok(status) if status.success()) {
            return;
        }

        let probed = probe_input(&marked.to_string_lossy(), Duration::from_secs(10)).await;

        let chapters = probed.expect("a readable clip").chapters;
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title.as_deref(), Some("Opening"));
        assert_eq!((chapters[0].start_ms, chapters[0].end_ms), (0, 500));
    }

    #[tokio::test]
    async fn an_address_nothing_answers_reads_nothing_rather_than_a_guess() {
        let probed = probe_input("http://127.0.0.1:1/clip.mp4", Duration::from_secs(10)).await;

        assert!(probed.is_none());
    }

    #[tokio::test]
    async fn gives_up_on_a_length_an_input_never_answers_with() {
        let silent = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/clip.mp4", silent.local_addr().unwrap());

        let length = duration_ms_within(&url, Duration::from_millis(300)).await;

        assert_eq!(length, None);
    }

    #[tokio::test]
    async fn reads_the_length_of_an_input_it_can_open() {
        let dir = kroma_testing::temp_dir("probe-duration");
        let Some(path) = clip(dir.path()) else {
            return;
        };

        let length = duration_ms_within(&path, Duration::from_secs(10)).await;

        assert!(length.is_some_and(|ms| ms > 0), "{length:?}");
    }

    #[tokio::test]
    async fn gives_up_on_an_input_whose_bytes_never_arrive() {
        let silent = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/clip.mp4", silent.local_addr().unwrap());

        let probed = probe_input(&url, Duration::from_millis(300)).await;

        assert!(probed.is_none());
    }
}
