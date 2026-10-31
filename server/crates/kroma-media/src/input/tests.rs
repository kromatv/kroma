use super::*;

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

struct Bait {
    port: u16,
    contacts: Arc<AtomicUsize>,
}

impl Bait {
    fn bind() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let contacts = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&contacts);
        thread::spawn(move || {
            for _connection in listener.incoming() {
                counted.fetch_add(1, Ordering::SeqCst);
            }
        });
        Bait { port, contacts }
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}/clip.ts", self.port)
    }

    fn was_contacted(&self) -> bool {
        self.contacts.load(Ordering::SeqCst) > 0
    }
}

fn ffmpeg(input: impl IntoIterator<Item = OsString>) -> Output {
    Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin"])
        .args(input)
        .args(["-f", "null", "-"])
        .output()
        .expect("run ffmpeg")
}

fn ffprobe(input: impl IntoIterator<Item = OsString>) -> Output {
    Command::new("ffprobe")
        .args(["-v", "error"])
        .args(input)
        .output()
        .expect("run ffprobe")
}

fn write_file(dir: &Path, name: &str, body: &str) -> PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, body).unwrap();
    path
}

fn playlist_to(dir: &Path, bait: &Bait) -> PathBuf {
    write_file(
        dir,
        "index.m3u8",
        &format!(
            "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n{}\n#EXT-X-ENDLIST\n",
            bait.url()
        ),
    )
}

fn clip(dir: &Path) -> PathBuf {
    let path = dir.join("clip.mp4");
    let made = Command::new("ffmpeg")
        .args(["-v", "error", "-y"])
        .args(generated("testsrc=size=64x48:rate=5:duration=1"))
        .arg(&path)
        .output()
        .expect("run ffmpeg");
    assert!(made.status.success(), "{made:?}");
    path
}

#[test]
fn a_file_input_whitelists_only_files_ahead_of_the_input_flag() {
    let args = file("/media/film.mkv");

    assert_eq!(
        args.map(|a| a.to_string_lossy().into_owned()),
        ["-protocol_whitelist", "file", "-i", "/media/film.mkv"],
    );
}

#[test]
fn a_generated_input_whitelists_only_files_ahead_of_the_graph() {
    let args = generated("testsrc=size=64x48");

    assert_eq!(
        args.map(|a| a.to_string_lossy().into_owned()),
        [
            "-protocol_whitelist",
            "file",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=64x48"
        ],
    );
}

#[test]
fn ffmpeg_does_not_connect_to_a_url_named_as_the_input() {
    let bait = Bait::bind();

    let run = ffmpeg(file(bait.url()));

    assert!(!run.status.success());
    assert!(!bait.was_contacted());
}

#[test]
fn ffmpeg_does_not_follow_a_playlist_to_the_network() {
    let bait = Bait::bind();
    let dir = kroma_testing::temp_dir("input-playlist");
    let playlist = playlist_to(dir.path(), &bait);

    let run = ffmpeg(file(&playlist));

    assert!(!run.status.success());
    assert!(!bait.was_contacted());
}

#[test]
fn ffmpeg_does_not_follow_a_concat_list_to_the_network() {
    let bait = Bait::bind();
    let dir = kroma_testing::temp_dir("input-concat");
    let concat = write_file(
        dir.path(),
        "list.ffconcat",
        &format!("ffconcat version 1.0\nfile '{}'\n", bait.url()),
    );

    let run = ffmpeg(
        ["-safe".into(), "0".into()]
            .into_iter()
            .chain(file(&concat)),
    );

    assert!(!run.status.success());
    assert!(!bait.was_contacted());
}

#[test]
fn ffprobe_does_not_connect_to_a_url_named_as_the_input() {
    let bait = Bait::bind();

    let run = ffprobe(file(bait.url()));

    assert!(!run.status.success());
    assert!(!bait.was_contacted());
}

#[test]
fn ffprobe_does_not_follow_a_playlist_to_the_network() {
    let bait = Bait::bind();
    let dir = kroma_testing::temp_dir("input-probe-playlist");
    let playlist = playlist_to(dir.path(), &bait);

    let run = ffprobe(file(&playlist));

    assert!(!run.status.success());
    assert!(!bait.was_contacted());
}

#[test]
fn ffmpeg_and_ffprobe_still_read_a_local_file() {
    let dir = kroma_testing::temp_dir("input-local");
    let path = clip(dir.path());

    let decoded = ffmpeg(file(&path));
    let probed = ffprobe(file(&path));

    assert!(decoded.status.success(), "{decoded:?}");
    assert!(probed.status.success(), "{probed:?}");
}
