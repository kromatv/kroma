// Native mpv playback for the Steam Deck shell: the mpv BINARY (not libmpv)
// driven over its JSON IPC socket, rendering to its own window beneath the
// transparent, always-on-top Tauri UI.

mod ipc;
mod launch;

use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

pub use ipc::{binary_command, binary_load, binary_status};

use ipc::pump_events;
use launch::{kill_tree, mpv_binary, start_mpv};

#[derive(Default)]
pub struct MpvState {
    conn: Mutex<Option<UnixStream>>,
    child: Mutex<Option<Child>>,
}

fn socket_path() -> PathBuf {
    std::env::temp_dir().join("kroma-mpv.sock")
}

fn emit_error(app: &AppHandle, reason: &str) {
    eprintln!("KROMA: mpv unavailable ({reason})");
    let _ = app.emit("mpv://error", json!({ "reason": reason }));
}

/// Call once at setup; failures are logged, not fatal (the UI still runs).
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let Some(read_half) = connect(&app) else { return };
        pump_events(&app, read_half);
        finish(&app);
    });
}

fn connect(app: &AppHandle) -> Option<UnixStream> {
    let sock = socket_path();
    let binary = mpv_binary();

    let (child, stream) = match start_mpv(&binary, &sock) {
        Ok(v) => v,
        Err(reason) => {
            if reason == "socket-timeout" {
                eprintln!("KROMA: mpv IPC socket never appeared at {}", sock.display());
            }
            emit_error(app, reason);
            return None;
        }
    };
    if let Some(state) = app.try_state::<MpvState>() {
        *state.child.lock().unwrap() = Some(child);
    }

    let read_half = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("KROMA: could not clone mpv IPC socket: {e}");
            emit_error(app, "socket-error");
            return None;
        }
    };
    if let Some(state) = app.try_state::<MpvState>() {
        *state.conn.lock().unwrap() = Some(stream);
    }
    Some(read_half)
}

fn finish(app: &AppHandle) {
    if let Some(state) = app.try_state::<MpvState>() {
        *state.conn.lock().unwrap() = None;
    }
    let _ = app.emit("mpv://exited", ());
}

/// Call on app exit: Tauri does not reap children.
pub fn shutdown(state: &MpvState) {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        kill_tree(&mut child);
    }
    let _ = std::fs::remove_file(socket_path());
}
