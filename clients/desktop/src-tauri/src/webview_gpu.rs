// Persisted opt-in for the WebKitGTK DMABUF (GPU) renderer on Linux/Deck.
//
// GPU (DMABUF) rendering is the default (DEFAULT_GPU): it is a large perf win on
// a 4K TV, and forcing software rendering black-screens the transform-composited
// app layer under the transparent window (nothing paints, the mpv plane shows
// through). The menu's "GPU rendering" row is an opt-OUT to software, stored in
// the app config dir and applied before WebKitGTK initialises; flipping it only
// takes effect on the next boot, so the frontend relaunches right after.
//
// Boot guard: a GPU boot arms a probe marker that the frontend disarms once it
// is actually running (`webview_boot_ok`). A marker still present at the next
// launch means the web process never came up, so the setting auto-reverts to
// software - a TV-docked Deck recovers on its own, no terminal needed. (A
// force-quit within the first second of a healthy GPU boot also reverts; rare,
// and re-enabling is one menu row away.)

use std::path::PathBuf;

const DEFAULT_GPU: bool = true;

// Mirrors Tauri's `app_config_dir` for our identifier, without needing an
// `AppHandle` — this runs before the app is built.
fn config_dir() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join("tv.kroma.desktop"))
}

fn settings_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join("webview.json"))
}

fn probe_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join("webview-gpu.probe"))
}

// GPU is the default; only an explicit opt-out (`{"dmabuf": false}`) selects
// software. An absent, unreadable, or malformed settings file reads as enabled.
fn gpu_enabled() -> bool {
    let Some(path) = settings_path() else {
        return DEFAULT_GPU;
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return DEFAULT_GPU;
    };
    serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| v.get("dmabuf").and_then(serde_json::Value::as_bool))
        .unwrap_or(DEFAULT_GPU)
}

// Best-effort: a write failure only costs the preference, nothing crashes.
fn write_enabled(on: bool) {
    let Some(dir) = config_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(
        dir.join("webview.json"),
        serde_json::json!({ "dmabuf": on }).to_string(),
    );
}

// Arms the GPU boot guard. A marker still present from the last boot means
// that boot never reached the frontend, so the setting reverts to software.
fn arm_gpu_probe() -> bool {
    let Some(probe) = probe_path() else {
        return false;
    };
    if probe.exists() {
        eprintln!(
            "KROMA: the last GPU-rendering boot never reached the frontend; reverting to software rendering"
        );
        write_enabled(false);
        let _ = std::fs::remove_file(probe);
        return false;
    }
    if let Some(dir) = probe.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&probe, b"").is_ok()
}

/// Decide the renderer for this boot. Called by `prepare_linux_env` BEFORE any
/// webview/GTK init. An explicit env pin (either var, either direction) always
/// wins and leaves the probe state untouched - that's a manual A/B session.
pub fn apply_env() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some()
        || std::env::var_os("KROMA_WEBKIT_DMABUF").is_some()
    {
        return;
    }
    if gpu_enabled() && arm_gpu_probe() {
        return;
    }
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
}

/// Pin WebKit's hardware acceleration on for this webview, and honour
/// `KROMA_REDUCED_MOTION=1`, which turns GTK animations off so the page reads
/// `prefers-reduced-motion` and drops its scroll and fade animations.
pub fn pin_acceleration(win: &tauri::WebviewWindow) {
    use gtk::prelude::GtkSettingsExt as _;
    use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt as _, WebViewExt as _};
    let _ = win.with_webview(|webview| {
        if let Some(settings) = webview.inner().settings() {
            settings.set_hardware_acceleration_policy(HardwareAccelerationPolicy::Always);
        }
    });
    if std::env::var("KROMA_REDUCED_MOTION").is_ok_and(|v| v == "1") {
        if let Some(settings) = gtk::Settings::default() {
            settings.set_gtk_enable_animations(false);
        }
    }
}

/// Current persisted choice, read when the menu row mounts.
#[tauri::command]
pub fn webview_gpu_get() -> bool {
    gpu_enabled()
}

/// Persist a new choice. Applies at the NEXT launch (see module docs); the
/// frontend invokes `app_relaunch` right after.
#[tauri::command]
pub fn webview_gpu_set(enabled: bool) {
    write_enabled(enabled);
}

/// The frontend is alive: this GPU boot worked, disarm the auto-revert.
#[tauri::command]
pub fn webview_boot_ok() {
    if let Some(probe) = probe_path() {
        let _ = std::fs::remove_file(probe);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_install_arms_the_gpu_probe_instead_of_falling_back_to_software() {
        let home = std::env::temp_dir().join(format!("kroma-gpu-probe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::env::set_var("XDG_CONFIG_HOME", &home);
        std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
        std::env::remove_var("KROMA_WEBKIT_DMABUF");

        apply_env();

        assert!(probe_path().unwrap().exists());
        assert!(std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none());
        let _ = std::fs::remove_dir_all(&home);
    }
}
