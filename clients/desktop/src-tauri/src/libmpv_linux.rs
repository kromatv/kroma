// In-process libmpv engine for Linux (the Steam Deck / desktop).
//
// Mirrors mpv.rs / libmpv_win.rs's Tauri surface (`mpv_load` / `mpv_command` +
// `mpv://…` events) so the frontend `MpvEngine` drives it UNCHANGED. Like Windows,
// libmpv embeds into the app window via `--wid`: on X11 we hand mpv the GTK
// window's X11 XID and its gpu VO renders a child surface inside it, behind the
// transparent webview (the same "video plane behind the page" model as the mpv
// binary's separate window, but in-process - no second window, no IPC socket).
//
// WHY this is the PRIMARY-but-guarded path: the mpv BINARY (mpv.rs) exists because
// the Deck's EGL/Wayland GPU stack is fragile, and a separate process can walk a VO
// fallback ladder (gpu-next -> vulkan -> GLX -> software) and crash without taking
// the app down. In-process libmpv loses that isolation, so:
//   * init() returns false on ANY failure -> the dispatcher (mpv_dispatch.rs) falls
//     back to spawning the binary, so the Deck is never left without a player.
//   * it is OFF by default (opt in with KROMA_LINUX_LIBMPV=1) until validated on a
//     real Deck; the proven binary stays the default. See mpv_dispatch::opt_in.
//
// Only the X11 embedding lives here; the engine itself (event pump, command
// mapping, track list) is in libmpv_shared.rs, shared with macOS and Windows.
//
// libmpv is thread-safe (`Mpv: Send + Sync`): commands run on invoke threads, a
// pump thread drains `wait_event`.

use std::sync::Arc;

use libmpv2::Mpv;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::libmpv_shared::{self, MpvSlot};

/// Managed Tauri state for the in-process engine: the shared engine slot (see
/// libmpv_shared.rs). Empty until [`init`] succeeds; the dispatcher checks
/// `is_active()` to route commands here vs to the mpv binary.
pub type InprocState = MpvSlot;

/// Build the engine embedded in the X11 window `xid` and spawn the event pump. Call
/// once the window exists. Returns whether the engine came up, so the caller falls
/// back to the mpv binary on failure (the Deck must never be left without a player).
pub fn init(app: &AppHandle, xid: u64) -> bool {
    let mpv = match Mpv::with_initializer(|init| {
        // Embed into the app window's X11 XID: mpv creates its child render surface
        // inside it (its normal gpu VO), rather than opening a window of its own.
        init.set_property("wid", xid as i64)?;
        // gpu output + hardware decode: VA-API (the Deck's APU) for HEVC/H264,
        // dav1d for AV1. `auto-safe` avoids the copy-back hwdec modes that flicker.
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

// ----- called by the dispatcher (mpv_dispatch.rs) when in-process is active ------

/// Load a URL, replacing the current file (resume at `start` seconds when > 0).
pub fn load(state: &InprocState, url: &str, start: f64) {
    state.load(url, start);
}

/// Send a raw mpv command array (`set_property`, `seek`, `stop`, …).
pub fn command(state: &InprocState, args: &[Value]) {
    state.command(args);
}
