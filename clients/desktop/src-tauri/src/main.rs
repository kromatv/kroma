// KROMA desktop shell (Steam Deck / macOS / Windows): a Tauri window hosting the
// shared @kroma/tv frontend. In-process libmpv is the default native engine on
// every OS (feature `libmpv`); Linux falls back to the mpv binary over unix-socket
// IPC unless KROMA_LINUX_LIBMPV=1 opts in. `--no-default-features` drops libmpv for
// the in-page <video> (macOS/Windows) or the mpv binary (Linux).

// Prevents an extra console window on Windows in release; a no-op on Linux/macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Shared core for the three in-process libmpv engines (init options, observed
// properties, event pump, command mapping).
#[cfg(all(
    feature = "libmpv",
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
#[allow(dead_code)]
mod libmpv_shared;

// mpv binary IPC runtime (Linux): default backend, and the automatic fallback
// when the in-process libmpv engine can't come up.
#[cfg(target_os = "linux")]
#[allow(dead_code)]
mod mpv;

// Routes the frontend's mpv_* commands to whichever Linux backend is live.
#[cfg(target_os = "linux")]
mod mpv_dispatch;

// In-process libmpv (Linux): embeds into the GTK window's X11 XID via `--wid`.
// Primary only when opted in (KROMA_LINUX_LIBMPV=1) and it initialises.
#[cfg(all(target_os = "linux", feature = "libmpv"))]
#[allow(dead_code)]
mod libmpv_linux;

// Persisted WebKitGTK GPU-rendering opt-in + its crash guard (Deck / Linux).
#[cfg(target_os = "linux")]
mod webview_gpu;

// In-process libmpv (macOS): renders into a native NSView behind the webview.
#[cfg(all(target_os = "macos", feature = "libmpv"))]
#[allow(dead_code)]
mod libmpv_mac;

// In-process libmpv (Windows): decodes what WebView2 can't (HEVC without the
// extension, AV1, MKV, surround), embedded into the window's HWND via `--wid`.
#[cfg(all(target_os = "windows", feature = "libmpv"))]
#[allow(dead_code)]
mod libmpv_win;

#[cfg(target_os = "linux")]
fn prepare_linux_env() {
    // WebKitGTK GPU (DMABUF) rendering is the default; webview_gpu.rs carries a
    // crash guard that auto-reverts to software on a boot that never reaches the
    // frontend. WEBKIT_DISABLE_DMABUF_RENDERER or KROMA_WEBKIT_DMABUF=1 pins the
    // choice for one session without touching the stored setting.
    webview_gpu::apply_env();
    // WebKitGTK's native Wayland backend can't create an EGL display on the Deck
    // ("Could not create default EGL display: EGL_BAD_PARAMETER"), aborting the
    // web process. Pin GTK to X11 (XWayland) unless the user set GDK_BACKEND.
    if std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
    // Tauri AppImages export GST_PLUGIN_SYSTEM_PATH(_1_0) at a directory that's
    // never created when bundleMediaFramework is off; GStreamer then searches
    // ONLY there and webview audio dies (tauri-apps/tauri#15665). Drop the var
    // when it points at a missing directory.
    for var in ["GST_PLUGIN_SYSTEM_PATH_1_0", "GST_PLUGIN_SYSTEM_PATH"] {
        if let Some(path) = std::env::var_os(var) {
            let single_path = !path.to_string_lossy().contains(':');
            if single_path && !std::path::Path::new(&path).is_dir() {
                std::env::remove_var(var);
            }
        }
    }
}

// macOS: tell the frontend the mpv engine is available (+ the debug test URL) up
// front, then build the in-process libmpv engine AFTER the window is on-screen +
// laid out. mpv's `--wid` embedding needs a visible, non-zero view or it falls
// back to opening its OWN window - so we can't init in `setup` (the window isn't
// shown yet); defer to the running loop.
#[cfg(all(target_os = "macos", feature = "libmpv"))]
fn init_libmpv_deferred(app: &tauri::AppHandle) {
    use tauri::Manager;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(win) = h.webview_windows().values().next() {
                if let Ok(nsw) = win.ns_window() {
                    // Advertise mpv to the frontend ONLY after the engine is up,
                    // so playback started early can't invoke a no-op mpv_load.
                    if libmpv_mac::init(&h, nsw) {
                        let _ = win.eval("window.__KROMA_MPV__ = true;");
                    }
                }
            }
        });
    });
}

// Windows: build the in-process libmpv engine embedded in the window's HWND,
// once the window (and its WebView2 child) exists. Deferred a beat so the HWND
// + webview are laid out before mpv attaches its `--wid` render surface. Same
// contract as macOS: advertise mpv to the frontend only after the engine is up.
#[cfg(all(target_os = "windows", feature = "libmpv"))]
fn init_libmpv_win_deferred(app: &tauri::AppHandle) {
    use tauri::Manager;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(win) = h.webview_windows().values().next() {
                if let Ok(hwnd) = win.hwnd() {
                    if libmpv_win::init(&h, hwnd.0 as isize as i64) {
                        let _ = win.eval("window.__KROMA_MPV__ = true;");
                    }
                }
            }
        });
    });
}

// Linux: the app window's X11 XID, for mpv's `--wid` embedding. `None` on a Wayland
// backend (no XID to embed into) - the shell then falls back to the mpv binary. The
// app pins GDK_BACKEND=x11 (prepare_linux_env), so this is Xlib in practice.
#[cfg(all(target_os = "linux", feature = "libmpv"))]
fn window_xid(win: &tauri::WebviewWindow) -> Option<u64> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    match win.window_handle().ok()?.as_raw() {
        RawWindowHandle::Xlib(h) => Some(h.window),
        RawWindowHandle::Xcb(h) => Some(u32::from(h.window) as u64),
        _ => None,
    }
}

// Linux: build the in-process libmpv engine embedded in the window's X11 XID, once
// the window is realised. On ANY failure (no XID / Wayland / GPU-context abort) it
// falls back to spawning the mpv binary, so the Deck is never left without a player.
// Only called when the user opted in (KROMA_LINUX_LIBMPV=1); the default is the binary.
#[cfg(all(target_os = "linux", feature = "libmpv"))]
fn init_libmpv_linux_deferred(app: &tauri::AppHandle) {
    use tauri::Manager;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(700));
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let xid = h.webview_windows().values().next().and_then(window_xid);
            let up = matches!(xid, Some(x) if libmpv_linux::init(&h, x));
            if up {
                mpv_dispatch::mark_inproc_active();
                if let Some(win) = h.webview_windows().values().next() {
                    let _ = win.eval("window.__KROMA_MPV__ = true;");
                }
            } else {
                eprintln!("KROMA: in-process libmpv unavailable on Linux; using the mpv binary");
                mpv::spawn(h.clone());
            }
        });
    });
}

/// Quit the whole app from the webview. The shell is a fullscreen window with no
/// chrome (no close button), so the TV UI offers an explicit "quit" menu row;
/// exiting through the event loop also runs the Linux mpv teardown.
#[tauri::command]
fn app_quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// Relaunch the app (used after flipping a boot-time setting like the webview
/// GPU renderer). `restart` re-execs without flowing through `RunEvent::Exit`,
/// so the mpv teardown must run here first (idempotent with the Exit handler).
#[tauri::command]
fn app_relaunch(app: tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    {
        use tauri::Manager;
        if let Some(state) = app.try_state::<mpv::MpvState>() {
            mpv::shutdown(state.inner());
        }
    }
    app.restart();
}

/// Deck: Tauri does not reap child processes; kill the mpv binary on exit.
#[cfg(target_os = "linux")]
fn on_run_event(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    use tauri::Manager;
    if let tauri::RunEvent::Exit = event {
        if let Some(state) = app.try_state::<mpv::MpvState>() {
            mpv::shutdown(state.inner());
        }
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    prepare_linux_env();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Native-engine command surface (same `mpv_load`/`mpv_command` names on both). The
    // two cfgs are mutually exclusive, so exactly one `invoke_handler` compiles.
    #[cfg(target_os = "linux")]
    {
        builder = builder.manage(mpv::MpvState::default());
        // In-process libmpv state (empty until init succeeds); the dispatcher routes
        // commands to it or the binary. Only present in a libmpv build.
        #[cfg(feature = "libmpv")]
        {
            builder = builder.manage(libmpv_linux::InprocState::default());
        }
        builder = builder.invoke_handler(tauri::generate_handler![
            mpv_dispatch::mpv_load,
            mpv_dispatch::mpv_command,
            mpv_dispatch::mpv_status,
            webview_gpu::webview_gpu_get,
            webview_gpu::webview_gpu_set,
            webview_gpu::webview_boot_ok,
            app_quit,
            app_relaunch
        ]);
    }
    #[cfg(all(target_os = "macos", feature = "libmpv"))]
    {
        builder = builder
            .manage(libmpv_mac::MpvState::default())
            .invoke_handler(tauri::generate_handler![
                libmpv_mac::mpv_load,
                libmpv_mac::mpv_command,
                libmpv_mac::set_now_playing,
                app_quit,
                app_relaunch
            ]);
    }
    #[cfg(all(target_os = "windows", feature = "libmpv"))]
    {
        builder = builder
            .manage(libmpv_win::MpvState::default())
            .invoke_handler(tauri::generate_handler![
                libmpv_win::mpv_load,
                libmpv_win::mpv_command,
                app_quit,
                app_relaunch
            ]);
    }
    // Remaining shells (macOS/Windows without libmpv) still need the app commands.
    #[cfg(not(any(
        target_os = "linux",
        all(target_os = "macos", feature = "libmpv"),
        all(target_os = "windows", feature = "libmpv")
    )))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![app_quit, app_relaunch]);
    }

    // Self-update (all desktop OSes): checks the GitHub Release, verifies the
    // signature against the pinned pubkey, installs, relaunches (driven from JS).
    builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        // Deck: the transparent UI window is always-on-top so the chrome floats over
        // the mpv plane - but a PERMANENT keep-above makes every other window
        // unreachable (alt-tab away showed nothing but KROMA). Track focus instead:
        // keep-above only while KROMA is the active window, so alt-tabbing to Steam
        // or a terminal actually reveals it.
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "linux")]
            if let tauri::WindowEvent::Focused(focused) = _event {
                let _ = _window.set_always_on_top(*focused);
            }
        })
        .setup(|_app| {
            // Linux: in-process libmpv when opted in (deferred; falls back to the
            // binary on any init failure), otherwise launch the proven mpv binary now.
            #[cfg(target_os = "linux")]
            {
                #[cfg(feature = "libmpv")]
                {
                    if mpv_dispatch::opt_in() {
                        init_libmpv_linux_deferred(_app.handle());
                    } else {
                        mpv::spawn(_app.handle().clone());
                    }
                }
                #[cfg(not(feature = "libmpv"))]
                {
                    mpv::spawn(_app.handle().clone());
                }
            }
            // macOS: build the in-process libmpv engine once the window is laid out
            // (deferred; see [`init_libmpv_deferred`]).
            #[cfg(all(target_os = "macos", feature = "libmpv"))]
            {
                init_libmpv_deferred(_app.handle());
            }
            // Windows: same, embedding into the window HWND (see [`init_libmpv_win_deferred`]).
            #[cfg(all(target_os = "windows", feature = "libmpv"))]
            {
                init_libmpv_win_deferred(_app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the KROMA desktop app")
        .run(|_app, _event| {
            #[cfg(target_os = "linux")]
            on_run_event(_app, &_event);
        });
}
