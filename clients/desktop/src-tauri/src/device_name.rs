//! The name the owner gave this computer, which is what a phone's "Play on TV"
//! list should show rather than the platform label.

use std::process::Command;

/// The computer's own name, or `None` when the system will not say.
#[tauri::command]
pub fn device_name() -> Option<String> {
    let name = read()?;
    let name = name.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

#[cfg(target_os = "macos")]
fn read() -> Option<String> {
    let out = Command::new("/usr/sbin/scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(target_os = "windows")]
fn read() -> Option<String> {
    std::env::var("COMPUTERNAME").ok()
}

#[cfg(target_os = "linux")]
fn read() -> Option<String> {
    let pretty = Command::new("hostnamectl")
        .arg("--pretty")
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).into_owned())
        .filter(|name| !name.trim().is_empty());
    pretty.or_else(|| std::fs::read_to_string("/etc/hostname").ok())
}
