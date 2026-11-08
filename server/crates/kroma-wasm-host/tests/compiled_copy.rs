mod support;

use std::path::PathBuf;

use kroma_testing::{temp_dir, TempDir};
use kroma_wasm_host::{Readied, WasmHost};
use support::{guest_wasm, probe, sandboxed_from, text};

const KEY: &str = "the-guest";

fn copy_in(dir: &TempDir) -> PathBuf {
    dir.path().join("kept").join("module.cwasm")
}

#[test]
fn a_component_compiled_once_is_ready_from_its_copy_the_next_time() {
    let dir = temp_dir("copy-reused");
    let host = WasmHost::new().unwrap();
    host.compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();

    let (component, readied) = host
        .compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();

    assert_eq!(readied, Readied::FromCache);
    assert_eq!(
        text(&probe(&mut sandboxed_from(&component), "/ping", "")),
        "pong"
    );
}

#[test]
fn a_copy_changed_after_it_was_kept_is_compiled_again() {
    let dir = temp_dir("copy-changed");
    let host = WasmHost::new().unwrap();
    host.compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();
    let mut changed = std::fs::read(copy_in(&dir)).unwrap();
    let last = changed.len() - 1;
    changed[last] ^= 0xff;
    std::fs::write(copy_in(&dir), changed).unwrap();

    let (component, readied) = host
        .compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();

    assert_eq!(readied, Readied::CopyRefused);
    assert_eq!(
        text(&probe(&mut sandboxed_from(&component), "/ping", "")),
        "pong"
    );
}

#[test]
fn compiling_leaves_only_the_copy_and_its_stamp_beside_each_other() {
    let dir = temp_dir("copy-alone");
    let host = WasmHost::new().unwrap();

    host.compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();

    let mut kept: Vec<String> = std::fs::read_dir(dir.path().join("kept"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    kept.sort();
    assert_eq!(kept, ["module.cwasm", "module.stamp"]);
}

#[cfg(unix)]
#[test]
fn compiling_again_replaces_the_copy_a_running_component_reads_rather_than_writing_into_it() {
    use std::os::unix::fs::MetadataExt;

    let dir = temp_dir("copy-replaced");
    let host = WasmHost::new().unwrap();
    let (running, _) = host
        .compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();
    let mut instance = sandboxed_from(&running);
    let first = std::fs::metadata(copy_in(&dir)).unwrap().ino();

    host.compile_keeping(guest_wasm(), &copy_in(&dir), "another-key")
        .unwrap();

    assert_ne!(std::fs::metadata(copy_in(&dir)).unwrap().ino(), first);
    assert_eq!(text(&probe(&mut instance, "/ping", "")), "pong");
}

#[cfg(target_os = "linux")]
#[test]
fn a_component_ready_from_its_copy_runs_from_the_file_mapped_in_place() {
    let dir = temp_dir("copy-mapped");
    let host = WasmHost::new().unwrap();
    host.compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();

    let (_component, _) = host
        .compile_keeping(guest_wasm(), &copy_in(&dir), KEY)
        .unwrap();

    let maps = std::fs::read_to_string("/proc/self/maps").unwrap();
    let copy = copy_in(&dir).canonicalize().unwrap();
    assert!(
        maps.lines()
            .any(|line| line.ends_with(&*copy.to_string_lossy())),
        "{maps}"
    );
}
