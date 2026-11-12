#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use kroma_module_host::NetworkAction;
use kroma_module_supervisor::Endpoint;

mod component_support;

use component_support::Server;
use component_support::wasm::{build_with, module_source};

const WHISPER: &str = "tv.kroma.whisper";
const WHISPER_JOB: &str = "wj-test";

fn whisper_component() -> &'static [u8] {
    static BUILT: OnceLock<Vec<u8>> = OnceLock::new();
    BUILT.get_or_init(|| {
        build_with(
            &module_source(WHISPER).join("server"),
            "kroma-module-whisper",
            "local",
        )
    })
}

fn seed_whisper_job(server: &Server) {
    let core = server.core_database();
    core.execute_batch(
        "CREATE TABLE whisper_jobs (
             id TEXT PRIMARY KEY,
             stage TEXT NOT NULL DEFAULT '',
             done INTEGER NOT NULL DEFAULT 0,
             total INTEGER NOT NULL DEFAULT 0,
             cancel INTEGER NOT NULL DEFAULT 0
         );",
    )
    .unwrap();
    core.execute("INSERT INTO whisper_jobs (id) VALUES (?1)", [WHISPER_JOB])
        .unwrap();
}

fn whisper_job(server: &Server) -> (String, i64, i64) {
    server
        .core_database()
        .query_row(
            "SELECT stage, done, total FROM whisper_jobs WHERE id = ?1",
            [WHISPER_JOB],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap()
}

fn transcribed(server: &Server, endpoint: &Endpoint, clip: &Path) -> Option<String> {
    server
        .as_the_core(WHISPER)
        .max_time(1800)
        .post_json(
            &endpoint.url("/_port/transcriber/transcribe"),
            &serde_json::json!({
                "job_id": WHISPER_JOB,
                "data_dir": server.dir.path().to_string_lossy(),
                "model_spec": "openai/whisper-tiny",
                "input": clip.to_string_lossy(),
                "track": 0,
                "lang": "en",
            }),
        )
        .unwrap()
        .json()
        .unwrap()
}

fn spoken_clip(dir: &Path) -> PathBuf {
    let clip = dir.join("clip.aiff");
    let said = Command::new("say")
        .arg("-o")
        .arg(&clip)
        .arg("The old lighthouse stood at the edge of the bay for more than two hundred years.")
        .output()
        .expect("run say");
    assert!(said.status.success(), "{said:?}");
    clip
}

#[test]
fn the_real_whisper_module_answers_nothing_when_it_cannot_get_its_model() {
    let server = Server::new("component-whisper", NetworkAction::Block);
    seed_whisper_job(&server);
    let endpoint = server.installed_as_shipped(WHISPER, whisper_component());

    let text = transcribed(&server, &endpoint, Path::new("/nowhere.mkv"));

    assert_eq!(text, None);
    assert_eq!(whisper_job(&server).0, "model");
    assert!(
        !server
            .said
            .lock()
            .unwrap()
            .iter()
            .any(|line| line.contains("component stopped"))
    );
}

#[test]
#[ignore = "downloads whisper-tiny from Hugging Face, and needs macOS `say`"]
fn the_real_whisper_module_transcribes_speech_and_reports_on_its_row() {
    let server = Server::new("component-whisper-speech", NetworkAction::Direct);
    seed_whisper_job(&server);
    let clip = spoken_clip(&server.library());
    let endpoint = server.installed_as_shipped(WHISPER, whisper_component());

    let text = transcribed(&server, &endpoint, &clip).expect("a transcript");

    let (stage, done, total) = whisper_job(&server);
    let module_folder = std::fs::read_dir(server.dir.path().join("modules").join(WHISPER)).unwrap();
    assert!(text.starts_with("WEBVTT"), "{text}");
    assert!(text.to_lowercase().contains("lighthouse"), "{text}");
    assert_eq!(stage, "transcribe");
    assert!(total > 0 && done == total, "{done}/{total}");
    assert!(
        !module_folder
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .any(|name| name.starts_with("pcm-"))
    );
}

#[test]
#[ignore = "downloads whisper-tiny from Hugging Face, and needs macOS `say`"]
fn a_transcription_the_core_cancels_stops_and_answers_nothing() {
    let server = Server::new("component-whisper-cancel", NetworkAction::Direct);
    seed_whisper_job(&server);
    let clip = spoken_clip(&server.library());
    let endpoint = server.installed_as_shipped(WHISPER, whisper_component());
    let core = server.core_database();
    core.execute(
        "UPDATE whisper_jobs SET cancel = 1 WHERE id = ?1",
        [WHISPER_JOB],
    )
    .unwrap();

    let text = transcribed(&server, &endpoint, &clip);

    assert_eq!(text, None);
    assert!(
        !server
            .said
            .lock()
            .unwrap()
            .iter()
            .any(|line| line.contains("component stopped"))
    );
}
