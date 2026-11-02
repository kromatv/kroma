#![cfg(unix)]

use std::path::{Path, PathBuf};
use std::process::Command;

use kroma_module_host::NetworkAction;
use kroma_module_supervisor::Endpoint;

mod component_support;

use component_support::wasm::guest_component;
use component_support::{GUEST, Server, THIRD_PARTY};

const DECODES: &str = r#", "storage": {}, "permissions": { "fs": { "read": ["media"], "write": ["module"] }, "media": ["decode"] }"#;
const READS_ONLY: &str =
    r#", "storage": {}, "permissions": { "fs": { "read": ["media"], "write": ["module"] } }"#;
const ONE_SECOND_OF_MONO_16_KHZ_FLOATS: u64 = 16_000 * 4;

fn tone_in(dir: &Path) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let clip = dir.join("tone.wav");
    let made = Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-y"])
        .args(kroma_primitives::input::generated(
            "sine=frequency=440:duration=1:sample_rate=44100",
        ))
        .arg(&clip)
        .output()
        .expect("run ffmpeg");
    assert!(
        made.status.success(),
        "{}",
        String::from_utf8_lossy(&made.stderr)
    );
    clip
}

fn decoded(server: &Server, endpoint: &Endpoint, source: &Path, into: &str) -> String {
    let path = format!("/decode?source={}&track=0&into={into}", source.display());
    server.get(endpoint, &path).text()
}

#[test]
fn a_component_decodes_a_library_track_into_its_own_folder() {
    let server = Server::new("component-media", NetworkAction::Block);
    let clip = tone_in(&server.library());
    let endpoint = server.started(GUEST, guest_component(), DECODES);
    let into = server.module_dir(GUEST).join("pcm");

    let answer = decoded(&server, &endpoint, &clip, &into.to_string_lossy());

    let size = ONE_SECOND_OF_MONO_16_KHZ_FLOATS;
    assert_eq!(answer, format!("Ok({size}) Ok({size})"));
    assert_eq!(std::fs::metadata(&into).unwrap().len(), size);
}

#[test]
fn a_component_decodes_into_its_private_tmp() {
    let server = Server::new("component-media-tmp", NetworkAction::Block);
    let clip = tone_in(&server.library());
    let endpoint = server.started(GUEST, guest_component(), DECODES);

    let private_tmp = server
        .supervisor
        .host_socket()
        .parent()
        .unwrap()
        .join("modules")
        .join(GUEST)
        .join("tmp");

    let answer = decoded(&server, &endpoint, &clip, "/tmp/pcm");

    let size = ONE_SECOND_OF_MONO_16_KHZ_FLOATS;
    assert_eq!(answer, format!("Ok({size}) Ok({size})"));
    assert_eq!(
        std::fs::metadata(private_tmp.join("pcm")).unwrap().len(),
        size
    );
}

#[test]
fn a_source_outside_the_folders_a_component_holds_is_refused() {
    let server = Server::new("component-media-outside", NetworkAction::Block);
    let clip = tone_in(&server.dir.path().join("elsewhere"));
    let endpoint = server.started(GUEST, guest_component(), DECODES);
    let into = server.module_dir(GUEST).join("pcm");

    let answer = decoded(&server, &endpoint, &clip, &into.to_string_lossy());

    assert!(
        answer.contains("is not in a folder this module holds"),
        "{answer}"
    );
    assert!(answer.ends_with("Err(NotFound)"), "{answer}");
}

#[test]
fn a_source_in_a_folder_the_component_may_write_is_refused() {
    let server = Server::new("component-media-writable", NetworkAction::Block);
    let endpoint = server.started(GUEST, guest_component(), DECODES);
    let clip = tone_in(&server.module_dir(GUEST));
    let into = server.module_dir(GUEST).join("pcm");

    let answer = decoded(&server, &endpoint, &clip, &into.to_string_lossy());

    assert!(answer.contains("may write"), "{answer}");
    assert!(!into.exists());
}

#[test]
fn a_component_that_does_not_declare_the_decoder_decodes_nothing() {
    let server = Server::new("component-media-undeclared", NetworkAction::Block);
    let clip = tone_in(&server.library());
    let endpoint = server.started(GUEST, guest_component(), READS_ONLY);
    let into = server.module_dir(GUEST).join("pcm");

    let answer = decoded(&server, &endpoint, &clip, &into.to_string_lossy());

    assert!(answer.contains("does not declare media"), "{answer}");
    assert!(!into.exists());
}

#[test]
fn a_third_party_component_that_declares_the_decoder_decodes_too() {
    let server = Server::new("component-media-third-party", NetworkAction::Block);
    let clip = tone_in(&server.library());
    let endpoint = server.started_from(GUEST, guest_component(), DECODES, THIRD_PARTY);
    let into = server.module_dir(GUEST).join("pcm");

    let answer = decoded(&server, &endpoint, &clip, &into.to_string_lossy());

    let size = ONE_SECOND_OF_MONO_16_KHZ_FLOATS;
    assert_eq!(answer, format!("Ok({size}) Ok({size})"));
}
