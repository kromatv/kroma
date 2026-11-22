fn main() {
    // env!("KROMA_BUILD_TARGET") for the anonymous heartbeat, which reports the
    // platform this server runs on.
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
        .or_else(|| {
            watch_head();
            output("git", &["rev-parse", "--short", "HEAD"])
        })
        .unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=KROMA_GIT_HASH={commit}");

    // `date -u` exists on the Linux/macOS build hosts; anything else falls back
    // to "unknown".
    let date =
        output("date", &["-u", "+%Y-%m-%d %H:%M UTC"]).unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=KROMA_BUILD_DATE={date}");

    let version = from_env("KROMA_VERSION")
        .unwrap_or_else(|| std::env::var("CARGO_PKG_VERSION").unwrap_or_default());
    println!("cargo:rustc-env=KROMA_VERSION={version}");
    let build = from_env("KROMA_BUILD").unwrap_or_else(|| "0".to_owned());
    println!("cargo:rustc-env=KROMA_BUILD={build}");

    println!("cargo:rerun-if-env-changed=KROMA_GIT_HASH");
    println!("cargo:rerun-if-env-changed=KROMA_VERSION");
    println!("cargo:rerun-if-env-changed=KROMA_BUILD");
}

fn watch_head() {
    let branch = output("git", &["symbolic-ref", "-q", "HEAD"]);
    let reflog = branch.as_ref().map(|name| format!("logs/{name}"));
    let mut args = vec!["rev-parse", "--git-path", "HEAD"];
    for name in branch.iter().chain(&reflog) {
        args.extend(["--git-path", name.as_str()]);
    }
    for path in output("git", &args).unwrap_or_default().lines() {
        if std::path::Path::new(path).exists() {
            println!("cargo:rerun-if-changed={path}");
        }
    }
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
