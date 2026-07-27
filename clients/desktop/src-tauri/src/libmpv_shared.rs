// Platform-independent core of the in-process libmpv engines.
//
// The macOS / Windows / Linux engines differ ONLY in how mpv is attached to the app
// window (render API + Obj-C GL shim on macOS, `--wid` embedding on Windows/Linux)
// and in the command surface they expose (Tauri commands vs the Linux dispatcher).
// Everything else - the engine handle slot, the shared init options, the observed
// properties, the event pump and the JSON argument mapping - is byte-identical on
// every OS and lives here.
//
// This module MUST stay free of any `#[cfg(target_os = …)]` and of any window handle
// type (HWND / XID / NSWindow); those belong to the platform modules.

use std::sync::{Arc, Mutex};
use std::thread;

use libmpv2::events::{Event, PropertyData};
use libmpv2::{Format, Mpv, MpvInitializer, MpvStr, Result as MpvResult};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// Holds the live engine handle. Each platform module re-exports it under its own
/// name (`MpvState` on macOS/Windows, `InprocState` on Linux) and hands it to Tauri
/// as managed state; it stays empty until that platform's `init()` succeeds.
#[derive(Default)]
pub struct MpvSlot {
    mpv: Mutex<Option<Arc<Mpv>>>,
}

impl MpvSlot {
    /// Publish the engine handle once init succeeded.
    pub fn set(&self, mpv: Arc<Mpv>) {
        *self.mpv.lock().unwrap() = Some(mpv);
    }

    /// Whether the in-process engine came up (the Linux dispatcher's backend probe).
    pub fn is_active(&self) -> bool {
        self.mpv.lock().unwrap().is_some()
    }

    /// Load a URL, replacing the current file. `start` > 0 seeks DURING the open
    /// (resume) via `loadfile <url> replace 0 start=<sec>`, so playback begins at the
    /// resume point instead of buffering at 0 first.
    pub fn load(&self, url: &str, start: f64) {
        if let Some(mpv) = self.mpv.lock().unwrap().as_ref() {
            if start > 0.5 {
                let opt = format!("start={start}");
                let _ = mpv.command("loadfile", &[url, "replace", "0", &opt]);
            } else {
                let _ = mpv.command("loadfile", &[url, "replace"]);
            }
        }
    }

    /// Send a raw mpv command array (`set_property`, `seek`, `stop`, …). libmpv's
    /// string command form parses the args, so we stringify each (bools -> `yes`/`no`).
    pub fn command(&self, args: &[Value]) {
        if args.is_empty() {
            return;
        }
        let mut strs: Vec<String> = args.iter().map(value_to_mpv_arg).collect();
        // The frontend speaks mpv's JSON-IPC dialect (matching the Deck's mpv binary),
        // where `set_property` is an IPC-level command. In-process libmpv's mpv_command
        // only knows INPUT commands - the equivalent there is `set` - so translate it,
        // else mpv returns -4 (INVALID_PARAMETER) and pause / audio-track changes
        // silently no-op.
        if strs[0] == "set_property" {
            strs[0] = "set".to_string();
        }
        let rest: Vec<&str> = strs[1..].iter().map(String::as_str).collect();
        if let Some(mpv) = self.mpv.lock().unwrap().as_ref() {
            let _ = mpv.command(&strs[0], &rest);
        }
    }
}

/// Options every engine sets, applied AFTER the platform's own video-output options
/// (`wid`/`vo`/`hwdec`) so the resulting option order is unchanged per platform.
/// KROMA renders its own subtitle overlay (React, over the transparent webview), so
/// mpv must draw NONE itself: no external auto-load AND no embedded/default track.
pub fn apply_common_options(init: &MpvInitializer) -> MpvResult<()> {
    init.set_property("hr-seek", "yes")?;
    init.set_property("force-seekable", "yes")?;
    init.set_property("cache", "yes")?;
    init.set_property("sub-auto", "no")?;
    init.set_property("sid", "no")?;
    init.set_property("terminal", false)?;
    // No mpv Lua. Two independent reasons, either of which is sufficient:
    //
    // 1. They are dead weight. The built-in scripts are mpv's OWN interface -
    //    the on-screen controller, the stats overlay (`i`), the console, the
    //    ytdl hook, auto-profiles. KROMA draws every one of those itself in
    //    React over a transparent webview, and there is no keyboard bound to
    //    mpv at all, so the scripts render nothing and answer nobody.
    //
    // 2. On macOS they are FATAL. The scripts run on LuaJIT, which compiles and
    //    then executes machine code at runtime. Under the hardened runtime
    //    (required for notarization) that is exactly what the kernel refuses:
    //    the app is SIGKILLed a few seconds into playback init with
    //    CODESIGNING / "Invalid Page" - an instruction-abort permission fault
    //    on the JIT's own r-x page, on the `*/stats` thread. Allowing it would
    //    mean shipping `com.apple.security.cs.allow-unsigned-executable-memory`,
    //    weakening the hardened runtime app-wide to run scripts we do not want.
    //
    // EVERY built-in script has to be named individually. `load-scripts=no` is
    // NOT enough and the name is a trap: it governs only the USER scripts
    // auto-loaded from the config directory, not the ones mpv ships. Setting it
    // alone leaves all of the below running - the crash reproduced unchanged,
    // and the mpv thread names in the report (`*/stats`, `*/console`,
    // `*/select`, ...) are exactly this list.
    for option in [
        "load-scripts",       // user scripts in ~/.config/mpv/scripts
        "load-stats-overlay", // */stats
        "load-console",       // */console
        "load-auto-profiles", // */auto_profiles
        "load-select",        // */select
        "load-positioning",   // */positioning
        "load-commands",      // */commands
        "load-context-menu",  // */context_menu
        "osc",                // the on-screen controller
        "ytdl",               // */ytdl_hook
    ] {
        init.set_property(option, "no")?;
    }
    Ok(())
}

/// Observe the properties the frontend `MpvEngine` reacts to. The ids (1..5) are part
/// of that protocol, so keep them (and their order) stable.
pub fn observe_playback_properties(mpv: &Mpv) {
    let _ = mpv.observe_property("time-pos", Format::Double, 1);
    let _ = mpv.observe_property("duration", Format::Double, 2);
    let _ = mpv.observe_property("demuxer-cache-time", Format::Double, 3);
    let _ = mpv.observe_property("pause", Format::Flag, 4);
    let _ = mpv.observe_property("paused-for-cache", Format::Flag, 5);
}

/// Start the background thread draining mpv's event queue.
pub fn spawn_pump(app: &AppHandle, mpv: Arc<Mpv>) {
    let app_pump = app.clone();
    thread::spawn(move || pump_events(app_pump, mpv));
}

/// Drain mpv's event queue and forward the events the frontend `MpvEngine` listens
/// for (identical mapping on the binary / macOS / Windows / Linux engines).
fn pump_events(app: AppHandle, mpv: Arc<Mpv>) {
    loop {
        match mpv.wait_event(1.0) {
            Some(Ok(Event::PropertyChange { name, change, .. })) => {
                let data = match change {
                    PropertyData::Double(d) => json!(d),
                    PropertyData::Int64(i) => json!(i),
                    PropertyData::Flag(b) => json!(b),
                    PropertyData::Str(s) | PropertyData::OsdStr(s) => json!(s),
                };
                let _ = app.emit("mpv://property", json!({ "name": name, "data": data }));
            }
            Some(Ok(Event::FileLoaded)) => {
                let _ = app.emit("mpv://file-loaded", ());
                emit_track_list(&app, &mpv);
            }
            Some(Ok(Event::EndFile(reason))) => {
                let r = match reason {
                    0 => "eof",
                    4 => "error",
                    _ => "stop",
                };
                let _ = app.emit("mpv://end-file", json!({ "reason": r }));
            }
            Some(Ok(Event::Shutdown)) => break,
            _ => {}
        }
    }
}

/// Build the track list from `track-list/N/{id,type}` and emit it as an
/// `mpv://property` so the frontend can map an audio-relative rendition to an mpv
/// track id (track-list has no node variant, so it's built on file-load).
fn emit_track_list(app: &AppHandle, mpv: &Mpv) {
    let count = mpv.get_property::<i64>("track-list/count").unwrap_or(0);
    let mut tracks = Vec::new();
    for i in 0..count {
        let id = mpv
            .get_property::<i64>(&format!("track-list/{i}/id"))
            .unwrap_or(-1);
        let ty = mpv
            .get_property::<MpvStr>(&format!("track-list/{i}/type"))
            .map(|s| s.to_string())
            .unwrap_or_default();
        tracks.push(json!({ "id": id, "type": ty }));
    }
    let _ = app.emit("mpv://property", json!({ "name": "track-list", "data": tracks }));
}

/// Stringify one JSON command argument the way mpv's string command form expects.
fn value_to_mpv_arg(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => (if *b { "yes" } else { "no" }).to_string(),
        // Numbers (and anything else) stringify to their unquoted Display form.
        other => other.to_string(),
    }
}
