// In-process libmpv engine for Windows.
//
// Mirrors mpv.rs / libmpv_mac.rs's Tauri surface (`mpv_load` / `mpv_command` +
// `mpv://…` events) so the frontend `MpvEngine` drives it UNCHANGED. Unlike
// macOS (where `--wid` embedding into an NSView proved unreliable, forcing a
// render-API + Obj-C GL shim), on Windows libmpv's `--wid` embedding is the
// supported, simple path: we hand mpv the app window's HWND and its built-in
// gpu/d3d11 video output renders a child surface inside it. No C shim.
//
// Compositing model (same "video plane behind the page" as the Deck / macOS):
// the KROMA window is transparent so the React player chrome floats over the
// video mpv draws behind it. Enabling this engine therefore needs the window's
// `transparent: true` (see tauri.windows.conf.json) and mpv's child surface
// kept at the BOTTOM of the z-order; that window-layering is the on-device
// tuning step (this box can't build/run Windows). The engine itself - decode,
// IPC command mapping, event pump - is platform-independent and lives in
// libmpv_shared.rs, shared with the macOS and Linux engines.
//
// libmpv is thread-safe (`Mpv: Send + Sync`): commands run on invoke threads, a
// pump thread drains `wait_event`.

use std::sync::Arc;

use libmpv2::Mpv;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::libmpv_shared::{self, MpvSlot};

/// Managed Tauri state: the shared engine slot (see libmpv_shared.rs).
pub type MpvState = MpvSlot;

/// Build the engine embedded in `hwnd` and spawn the event pump. Call once the
/// window exists. Returns whether the engine came up, so the caller advertises
/// mpv to the frontend ONLY on success (else the webview `<video>` path is used
/// and no early no-op `mpv_load` can strand playback).
pub fn init(app: &AppHandle, hwnd: i64) -> bool {
    let mpv = match Mpv::with_initializer(|init| {
        // Embed into the app window's HWND: mpv creates its child render surface
        // inside it (its normal gpu VO), rather than opening a window of its own.
        init.set_property("wid", hwnd)?;
        // gpu output + hardware decode: d3d11va for HEVC/H264, dav1d for AV1.
        init.set_property("vo", "gpu")?;
        init.set_property("hwdec", "auto-safe")?;
        libmpv_shared::apply_common_options(&init)
    }) {
        Ok(m) => Arc::new(m),
        Err(e) => {
            eprintln!("KROMA libmpv(win): init failed: {e:?}");
            return false;
        }
    };

    libmpv_shared::observe_playback_properties(&mpv);

    if let Some(state) = app.try_state::<MpvState>() {
        state.set(mpv.clone());
    }
    libmpv_shared::spawn_pump(app, mpv);
    eprintln!("KROMA libmpv(win): engine up (wid embed, hwnd={hwnd})");
    true
}

// ----- commands invoked by the frontend MpvEngine (same names as mpv.rs) -----

/// Load a URL, replacing the current file (resume at `start` seconds when > 0).
#[tauri::command]
pub fn mpv_load(state: State<'_, MpvState>, url: String, start: f64) {
    state.load(&url, start);
}

/// Send a raw mpv command array (`set_property`, `seek`, `stop`, …).
#[tauri::command]
pub fn mpv_command(state: State<'_, MpvState>, args: Vec<Value>) {
    state.command(&args);
}
