use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use serde_json::Value;

// A rung gets this long to configure its video output once IPC answers.
const VO_PROBE_WINDOW: Duration = Duration::from_secs(6);
// Ours, so a reply is told apart from mpv's events and its own startup chatter.
const VO_PROBE_ID: u64 = 9001;

const BASE_ARGS: &[&str] = &[
    "--idle=yes",
    "--force-window=yes",
    "--fullscreen",
    "--ontop=no", // stay BELOW the always-on-top Tauri window
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
    "--ytdl=no", // never invoke yt-dlp: KROMA only opens its own HTTP file URLs
];

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
    std::fs::set_permissions(&stub, std::fs::Permissions::from_mode(0o700)).ok()?;
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
        vec!["--vo=gpu".into(), "--gpu-context=x11".into()],     // GLX via X11/XWayland: no EGL
        vec!["--vo=x11".into()],                                 // software: always works
    ]
}

// A GUI-launched app (Finder / Steam Game Mode) inherits a minimal PATH that
// usually omits Homebrew / Flatpak dirs, hence the explicit install locations.
pub(super) fn mpv_binary() -> String {
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

pub(super) fn start_mpv(binary: &str, sock: &Path) -> Result<(Child, UnixStream), &'static str> {
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
            Some(stream) if await_video_output(sock) => {
                eprintln!("KROMA: mpv up [{}]", cfg.join(" "));
                return Ok((child, stream));
            }
            Some(_) => {
                kill_tree(&mut child);
                eprintln!(
                    "KROMA: mpv answered but never configured a video output [{}]; trying a more compatible one",
                    cfg.join(" ")
                );
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

// An answering IPC socket does not mean a rung can draw. `--vo=gpu-next` on a
// driver stack with no usable GL context keeps running with `vo-configured`
// false forever, so the socket alone settles the ladder on an output that never
// shows a frame (measured on SteamOS 3.8, where the next rung down does work).
// `--force-window=yes` configures the output at startup, so a working rung
// answers `true` while still idle - but only once it has finished initialising,
// which is why this waits for `true` rather than trusting the first reading.
fn await_video_output(sock: &Path) -> bool {
    // A SECOND connection, never the one handed back to the caller: probing on
    // the app's own stream would consume the events its pump is there to read
    // and leave a read timeout on a file description the pump blocks in.
    let Ok(probe) = UnixStream::connect(sock) else {
        return true;
    };
    if probe
        .set_read_timeout(Some(Duration::from_millis(250)))
        .is_err()
    {
        return true;
    }
    // An mpv too old to know the property never answers one, and a rung that
    // cannot be measured must not be failed on a guess.
    poll_vo_configured(&probe).unwrap_or(true)
}

fn poll_vo_configured(stream: &UnixStream) -> Option<bool> {
    let probe = format!(
        "{{\"command\":[\"get_property\",\"vo-configured\"],\"request_id\":{VO_PROBE_ID}}}\n"
    );
    let deadline = Instant::now() + VO_PROBE_WINDOW;
    let mut pending = String::new();
    let mut buf = [0u8; 2048];
    let mut answered = None;
    while Instant::now() < deadline {
        if (&*stream).write_all(probe.as_bytes()).is_err() {
            break;
        }
        match (&*stream).read(&mut buf) {
            Ok(0) => break,
            Ok(n) => pending.push_str(&String::from_utf8_lossy(&buf[..n])),
            Err(_) => continue,
        }
        while let Some(end) = pending.find('\n') {
            let line: String = pending.drain(..=end).collect();
            if let Some(state) = vo_configured_reply(&line) {
                // A `false` here is only "not yet": keep asking until the window
                // closes, or the first rung would be failed for being slow.
                if state {
                    return Some(true);
                }
                answered = Some(false);
            }
        }
    }
    answered
}

// `Some(state)` for a reply to our own probe, `None` for anything else on the
// wire: an event, another reply, or an error because the property is unknown.
fn vo_configured_reply(line: &str) -> Option<bool> {
    let msg: Value = serde_json::from_str(line.trim()).ok()?;
    if msg.get("request_id")?.as_u64()? != VO_PROBE_ID {
        return None;
    }
    if msg.get("error")?.as_str()? != "success" {
        return None;
    }
    msg.get("data")?.as_bool()
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

fn signal_group(pgid: libc::pid_t, signal: libc::c_int) {
    // SAFETY: `kill` is a syscall with no memory preconditions, and the negative
    // pid addresses the group `start_mpv` created with `process_group(0)`.
    let _ = unsafe { libc::kill(-pgid, signal) };
}

// SIGTERM first so mpv tears its window / VA-API state down cleanly.
pub(super) fn kill_tree(child: &mut Child) {
    let pgid = child.id() as libc::pid_t;
    signal_group(pgid, libc::SIGTERM);
    for _ in 0..20 {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    signal_group(pgid, libc::SIGKILL);
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::vo_configured_reply;

    #[test]
    fn reads_a_live_video_output_out_of_our_own_reply() {
        let line = r#"{"data":true,"request_id":9001,"error":"success"}"#;

        assert_eq!(vo_configured_reply(line), Some(true));
    }

    #[test]
    fn reads_an_output_that_has_not_come_up_yet() {
        let line = r#"{"data":false,"request_id":9001,"error":"success"}"#;

        assert_eq!(vo_configured_reply(line), Some(false));
    }

    #[test]
    fn ignores_a_reply_meant_for_someone_else() {
        let line = r#"{"data":true,"request_id":1,"error":"success"}"#;

        assert_eq!(vo_configured_reply(line), None);
    }

    #[test]
    fn ignores_an_event_line() {
        let line = r#"{"event":"file-loaded"}"#;

        assert_eq!(vo_configured_reply(line), None);
    }

    #[test]
    fn ignores_an_mpv_too_old_to_know_the_property() {
        let line = r#"{"request_id":9001,"error":"property not found"}"#;

        assert_eq!(vo_configured_reply(line), None);
    }
}
