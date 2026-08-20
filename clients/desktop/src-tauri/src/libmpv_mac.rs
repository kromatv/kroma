// In-process libmpv engine for macOS. Mirrors mpv.rs's Tauri surface (`mpv_load` /
// `mpv_command` + `mpv://…` events) so the frontend `MpvEngine` drives it unchanged.
// mpv renders into its own borderless window (`--wid` embedding only attaches to a
// standalone key window on macOS, not a subview/child), pinned behind the transparent
// KROMA window as a child so it moves and composites with it while the React player
// chrome sits on top.
//
// Only the NSWindow/GL-shim wiring and the macOS media-key bridge live here; the engine
// itself is in libmpv_shared.rs, shared with the Windows and Linux engines.

use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::{Arc, Mutex, PoisonError};

use libmpv2::Mpv;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::libmpv_shared::{self, MpvSlot};

extern "C" {
    /// Returns 0 on success. MUST run on the main thread.
    fn kroma_mpv_render_setup(nswindow: *mut c_void, mpv_handle: *mut c_void) -> i32;
    fn kroma_mpv_request_clear();
    /// MUST run on the main thread.
    fn kroma_setup_media_keys();
    /// `artwork` empty = keep the current poster. MUST run on the main thread.
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

static MEDIA_APP: Mutex<Option<AppHandle>> = Mutex::new(None);

/// Called by the Obj-C MPRemoteCommandCenter handlers; forwards the media-key action to
/// the UI as a `media-key` event.
#[no_mangle]
pub extern "C" fn kroma_media_key_pressed(action: *const c_char) {
    if action.is_null() {
        return;
    }
    // SAFETY: null is rejected above; the Obj-C caller passes a NUL-terminated
    // string that outlives this call.
    let s = unsafe { CStr::from_ptr(action) }.to_string_lossy().into_owned();
    // Recover from a poisoned lock instead of panicking: an unwind across the FFI
    // boundary here would abort the whole process.
    let guard = MEDIA_APP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(app) = guard.as_ref() {
        let _ = app.emit("media-key", s);
    }
}

/// Called by the Obj-C `changePlaybackPositionCommand` handler; forwards the target
/// position to the UI as a `media-seek` event.
#[no_mangle]
pub extern "C" fn kroma_media_seek(position: f64) {
    let guard = MEDIA_APP.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(app) = guard.as_ref() {
        let _ = app.emit("media-seek", position);
    }
}

pub type MpvState = MpvSlot;

/// Call once from `setup`. Returns whether the engine came up, so the caller advertises
/// mpv to the frontend only on success (else the webview `<video>` path is used).
pub fn init(app: &AppHandle, nswindow: *mut c_void) -> bool {
    let mpv = match Mpv::with_initializer(|init| {
        // vo=libmpv selects the render API: mpv draws into our GL view instead of its own.
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

    let handle = mpv.ctx.as_ptr() as *mut c_void;
    // SAFETY: called on the main thread as the shim requires, with a live
    // NSWindow and an mpv context the `Arc` below keeps alive.
    let rc = unsafe { kroma_mpv_render_setup(nswindow, handle) };
    if rc != 0 {
        eprintln!("KROMA libmpv: render setup failed (rc={rc}); falling back to no video");
    }

    if let Some(state) = app.try_state::<MpvState>() {
        state.set(mpv.clone());
    }
    *MEDIA_APP.lock().unwrap_or_else(PoisonError::into_inner) = Some(app.clone());
    // SAFETY: MPRemoteCommandCenter setup requires the main thread, which is
    // where `init` runs.
    unsafe { kroma_setup_media_keys() };
    libmpv_shared::spawn_pump(app, mpv);
    eprintln!("KROMA libmpv: engine up (render API, GL view behind the webview)");
    true
}

/// Loads a URL, replacing the current file (resume at `start` seconds when > 0).
#[tauri::command]
pub fn mpv_load(state: State<'_, MpvState>, url: String, start: f64) {
    state.load(&url, start);
    // SAFETY: the shim only flags its GL view for a clear; it takes no arguments
    // and holds no borrow.
    unsafe { kroma_mpv_request_clear() };
}

#[tauri::command]
pub fn mpv_command(state: State<'_, MpvState>, args: Vec<Value>) {
    state.command(&args);
}

/// `artwork` is the poster bytes on an item change, empty otherwise (keeps the current poster).
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
        // SAFETY: on the main thread as the shim requires; both CStrings and the
        // Vec outlive the call, and `as_ptr()` on an empty Vec pairs with len 0,
        // which the C side gates on.
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
