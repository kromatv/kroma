// The module store needs the compile target triple at runtime (env!("KROMA_BUILD_TARGET"))
// to pick the matching per-target `.kmod` artifact: a sidecar module carries a
// native binary, so its platform must match this server's.
fn main() {
    println!(
        "cargo:rustc-env=KROMA_BUILD_TARGET={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    // env!("KROMA_GIT_HASH") for the admin "Version installée" row. Best effort:
    // "unknown" with no .git dir or no git binary.
    let commit = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=KROMA_GIT_HASH={commit}");

    // `date -u` exists on the Linux/macOS build hosts; anything else falls back
    // to "unknown".
    let date = std::process::Command::new("date")
        .args(["-u", "+%Y-%m-%d %H:%M UTC"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=KROMA_BUILD_DATE={date}");
    println!("cargo:rerun-if-changed=../.git/HEAD");
}
