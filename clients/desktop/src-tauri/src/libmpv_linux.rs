// In-process libmpv engine for Linux (Steam Deck / desktop). Mirrors mpv.rs /
// libmpv_win.rs's Tauri surface (`mpv_load` / `mpv_command` + `mpv://…` events) so
// the frontend `MpvEngine` drives it unchanged. On X11, mpv embeds via `--wid` into
// the GTK window's X11 XID and its gpu VO renders a child surface behind the
// transparent webview - in-process, no second window or IPC socket.
//
// This path is guarded rather than primary: the mpv BINARY (mpv.rs) exists because
// the Deck's EGL/Wayland GPU stack is fragile, and a separate process can walk a VO
// fallback ladder and crash without taking the app down. In-process libmpv loses
// that isolation, so `init()` returns false on any failure and the dispatcher
// (mpv_dispatch.rs) falls back to the binary. Off by default; opt in with
// KROMA_LINUX_LIBMPV=1 (see mpv_dispatch::opt_in).
//
// The engine itself (event pump, command mapping, track list) is in
// libmpv_shared.rs, shared with macOS and Windows. libmpv is thread-safe
// (`Mpv: Send + Sync`): commands run on invoke threads, a pump thread drains
// `wait_event`.

use std::sync::Arc;

use libmpv2::Mpv;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::libmpv_shared::{self, MpvSlot};

pub type InprocState = MpvSlot;

/// Build the engine embedded in the X11 window `xid` and spawn the event pump. Call
/// once the window exists. Returns whether the engine came up, so the caller falls
/// back to the mpv binary on failure (the Deck must never be left without a player).
pub fn init(app: &AppHandle, xid: u64) -> bool {
    let mpv = match Mpv::with_initializer(|init| {
        init.set_property("wid", xid as i64)?;
        // VA-API (the Deck's APU) for HEVC/H264, dav1d for AV1. `auto-safe` avoids
        // the copy-back hwdec modes that flicker.
        init.set_property("vo", "gpu")?;
        init.set_property("hwdec", "auto-safe")?;
        libmpv_shared::apply_common_options(&init)
    }) {
        Ok(m) => Arc::new(m),
        Err(e) => {
            eprintln!("KROMA libmpv(linux): init failed: {e:?}");
            return false;
        }
    };

    libmpv_shared::observe_playback_properties(&mpv);

    if let Some(state) = app.try_state::<InprocState>() {
        state.set(mpv.clone());
    }
    libmpv_shared::spawn_pump(app, mpv);
    eprintln!("KROMA libmpv(linux): engine up (wid embed, xid={xid})");
    true
}

/// Load a URL, replacing the current file (resume at `start` seconds when > 0).
pub fn load(state: &InprocState, url: &str, start: f64) {
    state.load(url, start);
}

/// Send a raw mpv command array (`set_property`, `seek`, `stop`, …).
pub fn command(state: &InprocState, args: &[Value]) {
    state.command(args);
}
