// Native mpv playback for the Steam Deck shell: the mpv BINARY (not libmpv)
// driven over its JSON IPC socket, rendering to its own window beneath the
// transparent, always-on-top Tauri UI.

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct MpvState {
    conn: Mutex<Option<UnixStream>>,
    child: Mutex<Option<Child>>,
}

const OBSERVED: &[&str] = &[
    "time-pos",
    "duration",
    "pause",
    "paused-for-cache",
    "demuxer-cache-time",
    "track-list",
];

const BASE_ARGS: &[&str] = &[
    "--idle=yes",
    "--force-window=yes",
    "--fullscreen",
    "--ontop=no",         // stay BELOW the always-on-top Tauri window
    "--title=KROMA Player",
    "--no-osc",
    "--no-input-default-bindings",
    "--no-terminal",
    "--no-config",
    "--keep-open=no",
    "--hwdec=auto-safe",
    "--cache=yes",
    "--hr-seek=yes",
    "--force-seekable=yes",
    "--sub-auto=no",
    "--sid=no",
    "--ytdl=no",            // never invoke yt-dlp: KROMA only opens its own HTTP file URLs
];

fn socket_path() -> PathBuf {
    std::env::temp_dir().join("kroma-mpv.sock")
}

// The bundled kroma-mpv AppImage's `get-yt-dlp.hook` pops a modal kdialog before
// exec'ing mpv when `yt-dlp` is missing from PATH, blocking startup so the IPC
// socket never appears. The hook only probes with `command -v`, so a stub does.
fn ytdlp_shim_dir() -> Option<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join("kroma-mpv-shim");
    std::fs::create_dir_all(&dir).ok()?;
    let stub = dir.join("yt-dlp");
    if !stub.exists() {
        std::fs::write(&stub, "#!/bin/sh\nexit 0\n").ok()?;
    }
    std::fs::set_permissions(&stub, std::fs::Permissions::from_mode(0o755)).ok()?;
    Some(dir)
}

// Video-output fallback ladder, most-capable first: mpv aborts (its IPC socket
// never appears) when an output cannot initialise its GPU context. The default
// `gpu-next` needs an EGL context that fails on the Steam Deck's KDE-Wayland
// desktop ("Could not create default EGL display: EGL_BAD_PARAMETER"); the later
// rungs avoid EGL. `KROMA_MPV_VO` pins one output and skips the ladder.
fn vo_ladder() -> Vec<Vec<String>> {
    if let Ok(vo) = std::env::var("KROMA_MPV_VO") {
        let vo = vo.trim();
        if !vo.is_empty() {
            let mut cfg = vec![format!("--vo={vo}")];
            for (var, flag) in [
                ("KROMA_MPV_GPU_API", "--gpu-api"),
                ("KROMA_MPV_GPU_CONTEXT", "--gpu-context"),
            ] {
                if let Ok(val) = std::env::var(var) {
                    let val = val.trim();
                    if !val.is_empty() {
                        cfg.push(format!("{flag}={val}"));
                    }
                }
            }
            return vec![cfg];
        }
    }
    vec![
        vec!["--vo=gpu-next".into()],
        vec!["--vo=gpu-next".into(), "--gpu-api=vulkan".into()], // Vulkan: no EGL
        vec!["--vo=gpu".into(), "--gpu-context=x11".into()], // GLX via X11/XWayland: no EGL
        vec!["--vo=x11".into()],                             // software: always works
    ]
}

// A GUI-launched app (Finder / Steam Game Mode) inherits a minimal PATH that
// usually omits Homebrew / Flatpak dirs, hence the explicit install locations.
fn mpv_binary() -> String {
    if let Ok(p) = std::env::var("KROMA_MPV") {
        if !p.trim().is_empty() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(cand) = exe.parent().map(|d| d.join("kroma-mpv")) {
            if cand.exists() {
                return cand.to_string_lossy().into_owned();
            }
        }
    }
    for cand in [
        "/opt/homebrew/bin/mpv",
        "/usr/local/bin/mpv",
        "/usr/bin/mpv",
        "/var/lib/flatpak/exports/bin/mpv",
    ] {
        if std::path::Path::new(cand).exists() {
            return cand.to_string();
        }
    }
    "mpv".to_string()
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

fn pump_events(app: &AppHandle, read_half: UnixStream) {
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

fn finish(app: &AppHandle) {
    if let Some(state) = app.try_state::<MpvState>() {
        *state.conn.lock().unwrap() = None;
    }
    let _ = app.emit("mpv://exited", ());
}

fn start_mpv(binary: &str, sock: &Path) -> Result<(Child, UnixStream), &'static str> {
    let ladder = vo_ladder();
    // PATH with the no-op yt-dlp shim prepended, so the AppImage's
    // get-yt-dlp.hook skips its blocking install dialog. See `ytdlp_shim_dir`.
    let shim_path = ytdlp_shim_dir().map(|dir| {
        let mut p = std::ffi::OsString::from(dir);
        if let Some(existing) = std::env::var_os("PATH") {
            p.push(":");
            p.push(existing);
        }
        p
    });
    // Only the pinned sidecar (mpv 0.41) gets --focus-on: a pre-0.39 system mpv
    // aborts on the unknown option and would sink every ladder rung. Without it
    // the fullscreen mpv window grabs focus as it maps, hiding the UI window.
    let sidecar_focus_flag = Path::new(binary)
        .file_name()
        .is_some_and(|n| n.to_string_lossy().starts_with("kroma-mpv"));
    for cfg in &ladder {
        let _ = std::fs::remove_file(sock);
        let mut command = Command::new(binary);
        {
            // Own process group, so shutdown can kill the WHOLE tree: in
            // extract-and-run mode the spawned pid is the AppImage runtime and the
            // real mpv is a grandchild that Child::kill alone would orphan.
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        if sidecar_focus_flag {
            command.arg("--focus-on=never");
        }
        command
            // The sidecar is an AppImage spawned from INSIDE the KROMA AppImage,
            // where nested FUSE mounting is unreliable (esp. SteamOS).
            .env("APPIMAGE_EXTRACT_AND_RUN", "1")
            // Silence the AppImage's self-updater.hook, whose modal dialog blocks
            // startup the same way the yt-dlp nag does.
            .env("DISABLE_AUTO_UPDATES", "1")
            // AppRun's LD_LIBRARY_PATH points at $APPDIR/usr/lib, whose stale
            // libs (tauri-apps/tauri#15665) would shadow mpv's self-contained
            // stack, as would a user's libwayland LD_PRELOAD workaround.
            .env_remove("LD_LIBRARY_PATH")
            .env_remove("LD_PRELOAD")
            .env_remove("APPDIR")
            // Keep mpv on XWayland like the UI window: the keep-above sandwich
            // and --focus-on=never rely on X11 WM semantics, and a native-Wayland
            // client cannot refuse the focus its mapping fullscreen window gets.
            .env_remove("WAYLAND_DISPLAY")
            .args(BASE_ARGS)
            .args(cfg)
            .arg(format!("--input-ipc-server={}", sock.display()));
        if let Some(ref p) = shim_path {
            command.env("PATH", p);
        }
        let child = command.spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                // A missing / unspawnable binary won't be fixed by a different VO.
                eprintln!("KROMA: failed to launch mpv (is it installed / on PATH?): {e}");
                return Err("spawn-failed");
            }
        };

        match await_socket(&mut child, sock) {
            Some(stream) => {
                eprintln!("KROMA: mpv up [{}]", cfg.join(" "));
                return Ok((child, stream));
            }
            None => {
                kill_tree(&mut child);
                eprintln!(
                    "KROMA: mpv could not start [{}]; trying a more compatible video output",
                    cfg.join(" ")
                );
            }
        }
    }
    Err("socket-timeout")
}

// The ~15s window is generous because a cold sidecar launch unpacks ~50 MB
// (extract-and-run) before mpv starts; a dead rung short-circuits immediately.
fn await_socket(child: &mut Child, sock: &Path) -> Option<UnixStream> {
    for _ in 0..300 {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return None;
        }
        if let Ok(s) = UnixStream::connect(sock) {
            return Some(s);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    None
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

/// Call on app exit: Tauri does not reap children.
pub fn shutdown(state: &MpvState) {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        kill_tree(&mut child);
    }
    let _ = std::fs::remove_file(socket_path());
}

// SIGTERM first so mpv tears its window / VA-API state down cleanly.
fn kill_tree(child: &mut Child) {
    let pgid = child.id() as libc::pid_t;
    let _ = unsafe { libc::kill(-pgid, libc::SIGTERM) };
    for _ in 0..20 {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let _ = unsafe { libc::kill(-pgid, libc::SIGKILL) };
    let _ = child.wait();
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
