// In-process libmpv engine for Windows, mirroring mpv.rs / libmpv_mac.rs's Tauri
// surface so the frontend `MpvEngine` drives it unchanged. On Windows `--wid`
// embedding is the supported path: mpv renders a child surface inside the app
// window's HWND. The React chrome floats over it, so the window needs
// `transparent: true` (tauri.windows.conf.json) and the child surface kept at
// the bottom of the z-order.

use std::sync::Arc;

use libmpv2::Mpv;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::libmpv_shared::{self, MpvSlot};

pub type MpvState = MpvSlot;

/// Builds the engine embedded in `hwnd` and spawns the event pump, once the
/// window exists. False means the caller must not advertise mpv to the frontend,
/// or an early no-op `mpv_load` strands playback instead of using `<video>`.
pub fn init(app: &AppHandle, hwnd: i64) -> bool {
    let mpv = match Mpv::with_initializer(|init| {
        init.set_property("wid", hwnd)?;
        // d3d11va for HEVC/H264, dav1d for AV1.
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

/// Replaces the current file, resuming at `start` seconds when it is > 0.
#[tauri::command]
pub fn mpv_load(state: State<'_, MpvState>, url: String, start: f64) {
    state.load(&url, start);
}

#[tauri::command]
pub fn mpv_command(state: State<'_, MpvState>, args: Vec<Value>) {
    state.command(&args);
}
