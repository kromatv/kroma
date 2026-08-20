use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::process::Child;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use super::MpvState;

const OBSERVED: &[&str] = &[
    "time-pos",
    "duration",
    "pause",
    "paused-for-cache",
    "demuxer-cache-time",
    "track-list",
];

pub(super) fn pump_events(app: &AppHandle, read_half: UnixStream) {
    // Focus-stealing prevention for a SYSTEM mpv, which doesn't get the
    // sidecar-only `--focus-on=never` (see start_mpv): over IPC a pre-0.39 build
    // returns an error reply instead of aborting on the unknown option.
    let _ = write_ipc(app, &json!({ "command": ["set_property", "focus-on", "never"] }));
    for (i, prop) in OBSERVED.iter().enumerate() {
        let _ = write_ipc(app, &json!({ "command": ["observe_property", i + 1, prop] }));
    }
    let reader = BufReader::new(read_half);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(msg) = serde_json::from_str::<Value>(line) {
            forward(app, &msg);
        }
    }
}

fn write_ipc(app: &AppHandle, msg: &Value) -> Result<(), String> {
    let Some(state) = app.try_state::<MpvState>() else {
        return Err("mpv state unavailable".into());
    };
    let mut guard = state.conn.lock().unwrap();
    let Some(stream) = guard.as_mut() else {
        return Err("mpv is not running (no IPC connection)".into());
    };
    let mut line = msg.to_string();
    line.push('\n');
    let res = stream.write_all(line.as_bytes()).and_then(|()| stream.flush());
    res.map_err(|e| {
        *guard = None;
        format!("mpv IPC write failed: {e}")
    })
}

fn forward(app: &AppHandle, msg: &Value) {
    match msg.get("event").and_then(Value::as_str).unwrap_or("") {
        "property-change" => {
            let name = msg.get("name").and_then(Value::as_str).unwrap_or_default();
            let data = msg.get("data").cloned().unwrap_or(Value::Null);
            let _ = app.emit("mpv://property", json!({ "name": name, "data": data }));
        }
        "file-loaded" => {
            let _ = app.emit("mpv://file-loaded", ());
        }
        "end-file" => {
            let reason = msg.get("reason").and_then(Value::as_str).unwrap_or_default();
            let _ = app.emit("mpv://end-file", json!({ "reason": reason }));
        }
        _ => {}
    }
}

/// `start` > 0 seeks DURING the open, rather than buffering at 0 first.
pub fn binary_load(app: &AppHandle, url: String, start: f64) -> Result<(), String> {
    let cmd = if start > 0.5 {
        json!({ "command": ["loadfile", url, "replace", "0", format!("start={start}")] })
    } else {
        json!({ "command": ["loadfile", url, "replace"] })
    };
    write_ipc(app, &cmd)
}

/// Send a raw mpv command array (`set_property`, `seek`, `stop`, …).
pub fn binary_command(app: &AppHandle, args: Vec<Value>) -> Result<(), String> {
    write_ipc(app, &json!({ "command": args }))
}

/// `running` (IPC up), `starting` (launched, socket not connected yet) or `dead`
/// (never launched, or exited — the zombie is reaped here).
pub fn binary_status(state: &MpvState) -> String {
    if state.conn.lock().unwrap().is_some() {
        return "running".into();
    }
    let mut child = state.child.lock().unwrap();
    match child.as_mut().map(Child::try_wait) {
        Some(Ok(None)) => "starting".into(),
        Some(Ok(Some(_))) => {
            *child = None;
            "dead".into()
        }
        Some(Err(_)) | None => "dead".into(),
    }
}
