// In-process libmpv engine for macOS.
//
// Mirrors mpv.rs's Tauri surface (`mpv_load` / `mpv_command` + `mpv://…` events) so the
// frontend `MpvEngine` drives it UNCHANGED. Compositing model: mpv renders into its OWN
// borderless window (embedding into our NSViews via `--wid` proved unreliable on macOS -
// it only attaches to a standalone key window, not a subview/child), and on the first
// load we pin that window BEHIND the transparent KROMA window as a child, so it moves +
// composites with it while the React player chrome sits on top - the same "video plane
// behind the page" model as the Deck / Tizen.
//
// Only the NSWindow/GL-shim wiring and the macOS media-key bridge live here; the engine
// itself (event pump, command mapping, track list) is in libmpv_shared.rs, shared with
// the Windows and Linux engines.
//
// libmpv is thread-safe (`Mpv: Send + Sync`): commands run on invoke threads, a pump
// thread drains `wait_event`. track-list has no node variant so it's built on file-load.

use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::{Arc, Mutex};

use libmpv2::Mpv;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::libmpv_shared::{self, MpvSlot};

extern "C" {
    /// Create the GL view behind the webview + the mpv render context bound to it, and
    /// make the app window + webview see-through. Returns 0 on success. MUST run on the
    /// main thread. `mpv_handle` is the raw `mpv_handle*`.
    fn kroma_mpv_render_setup(nswindow: *mut c_void, mpv_handle: *mut c_void) -> i32;
    /// Blank the GL view once (file switch), so the previous video's last frame doesn't
    /// linger while the next one buffers.
    fn kroma_mpv_request_clear();
    /// Register MPRemoteCommandCenter handlers + Now Playing info so the MacBook's
    /// hardware media keys (⏯/⏭/⏮) route to us. MUST run on the main thread.
    fn kroma_setup_media_keys();
    /// Update the OS Now Playing widget (title/artist/poster/progress/rate). `artwork`
    /// empty = keep the current poster. MUST run on the main thread.
    fn kroma_set_now_playing(
        title: *const c_char,
        artist: *const c_char,
        duration: f64,
        position: f64,
        rate: f64,
        artwork: *const u8,
        artwork_len: usize,
    );
}

/// The app handle for the media-key callback below (MPRemoteCommandCenter fires on the
/// main thread; we just forward the action to the UI as a `media-key` event).
static MEDIA_APP: Mutex<Option<AppHandle>> = Mutex::new(None);

/// Called by the Obj-C MPRemoteCommandCenter handlers when a MacBook media key is
/// pressed; forwards the action (`playpause`/`play`/`pause`/`next`/`prev`) to the UI.
#[no_mangle]
pub extern "C" fn kroma_media_key_pressed(action: *const c_char) {
    if action.is_null() {
        return;
    }
    let s = unsafe { CStr::from_ptr(action) }.to_string_lossy().into_owned();
    // Recover from a poisoned lock instead of panicking: this is an extern "C" callback, so
    // an unwind across the FFI boundary would abort the whole process.
    let guard = MEDIA_APP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(app) = guard.as_ref() {
        let _ = app.emit("media-key", s);
    }
}

/// Called by the Obj-C `changePlaybackPositionCommand` handler when the OS scrubber is
/// dragged; forwards the target position (seconds) to the UI as a `media-seek` event.
#[no_mangle]
pub extern "C" fn kroma_media_seek(position: f64) {
    let guard = MEDIA_APP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(app) = guard.as_ref() {
        let _ = app.emit("media-seek", position);
    }
}

/// Managed Tauri state: the shared engine slot (see libmpv_shared.rs).
pub type MpvState = MpvSlot;

/// Build the engine + spawn the event pump. Call once from `setup`. Returns whether the
/// engine came up, so the caller advertises mpv to the frontend ONLY on success (else the
/// webview `<video>` path is used and no early no-op `mpv_load` can strand playback).
pub fn init(app: &AppHandle, nswindow: *mut c_void) -> bool {
    let mpv = match Mpv::with_initializer(|init| {
        // Render API: mpv draws into OUR GL view (no window of its own); the shim creates
        // the render context after init. `vo=libmpv` selects that output.
        init.set_property("vo", "libmpv")?;
        init.set_property("hwdec", "videotoolbox")?; // HW for HEVC/H264; AV1 → dav1d
        libmpv_shared::apply_common_options(&init)
    }) {
        Ok(m) => Arc::new(m),
        Err(e) => {
            eprintln!("KROMA libmpv: init failed: {e:?}");
            return false;
        }
    };

    libmpv_shared::observe_playback_properties(&mpv);

    // Create the GL view behind the webview + the mpv render context bound to it (we're
    // on the main thread). mpv (vo=libmpv) then draws each frame into it.
    let handle = mpv.ctx.as_ptr() as *mut c_void;
    let rc = unsafe { kroma_mpv_render_setup(nswindow, handle) };
    if rc != 0 {
        eprintln!("KROMA libmpv: render setup failed (rc={rc}); falling back to no video");
    }

    if let Some(state) = app.try_state::<MpvState>() {
        state.set(mpv.clone());
    }
    // MacBook hardware media keys (⏯/⏭/⏮) → the `media-key` event (we're on the main
    // thread, which MPRemoteCommandCenter requires).
    *MEDIA_APP.lock().unwrap() = Some(app.clone());
    unsafe { kroma_setup_media_keys() };
    libmpv_shared::spawn_pump(app, mpv);
    eprintln!("KROMA libmpv: engine up (render API, GL view behind the webview)");
    true
}

// ----- commands invoked by the frontend MpvEngine (same names as mpv.rs) -----

/// Load a URL, replacing the current file (resume at `start` seconds when > 0), then
/// blank the GL view so the previous video's last frame doesn't linger.
#[tauri::command]
pub fn mpv_load(state: State<'_, MpvState>, url: String, start: f64) {
    state.load(&url, start);
    // Blank the last frame of the previous video while the new one buffers.
    unsafe { kroma_mpv_request_clear() };
}

/// Send a raw mpv command array (`set_property`, `seek`, `stop`, …).
#[tauri::command]
pub fn mpv_command(state: State<'_, MpvState>, args: Vec<Value>) {
    state.command(&args);
}

/// Update the OS "Now Playing" widget with the current item + progress. `artwork` is the
/// poster bytes (PNG/JPEG) on an item change, empty otherwise (keeps the current poster).
#[tauri::command]
pub fn set_now_playing(
    app: AppHandle,
    title: String,
    artist: String,
    duration: f64,
    position: f64,
    playing: bool,
    artwork: Vec<u8>,
) {
    let title = CString::new(title).unwrap_or_default();
    let artist = CString::new(artist).unwrap_or_default();
    let rate = if playing { 1.0 } else { 0.0 };
    let _ = app.run_on_main_thread(move || {
        // as_ptr() on an empty Vec is valid + len() is 0, and the C side gates on len > 0.
        unsafe {
            kroma_set_now_playing(
                title.as_ptr(),
                artist.as_ptr(),
                duration,
                position,
                rate,
                artwork.as_ptr(),
                artwork.len(),
            );
        }
    });
}
