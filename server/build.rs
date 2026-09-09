// The module store needs the compile target triple at runtime (env!("KROMA_BUILD_TARGET"))
// to pick the matching per-target `.kmod` artifact: a sidecar module carries a
// native binary, so its platform must match this server's.
fn main() {
    println!(
        "cargo:rustc-env=KROMA_BUILD_TARGET={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    // env!("KROMA_GIT_HASH") for the admin "Version installée" row and for the
    // anonymous heartbeat. The build supplies it where it can: a release
    // compiles inside a container over a bind-mounted checkout, which git
    // refuses to read as a repository nobody in there owns, so asking git at
    // this point answered "unknown" for every published build.
    let commit = from_env("KROMA_GIT_HASH")
        .or_else(|| output("git", &["rev-parse", "--short", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=KROMA_GIT_HASH={commit}");

    // `date -u` exists on the Linux/macOS build hosts; anything else falls back
    // to "unknown".
    let date = output("date", &["-u", "+%Y-%m-%d %H:%M UTC"])
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=KROMA_BUILD_DATE={date}");

    println!("cargo:rerun-if-env-changed=KROMA_GIT_HASH");
    println!("cargo:rerun-if-changed=../.git/HEAD");
}

fn from_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn output(program: &str, args: &[&str]) -> Option<String> {
    std::process::Command::new(program)
        .args(args)
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}
