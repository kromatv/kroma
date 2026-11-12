use std::sync::Arc;
use std::time::Duration;

use kroma_module_sdk::host::process::{Child, Command};
use kroma_module_sdk::host::run_blocking;

use crate::access::RemoteAccess;

const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
const DRAIN_EVERY: Duration = Duration::from_millis(500);
const DRAIN_BYTES: u32 = 64 * 1024;

pub(crate) fn tunnel_command(bin: &str, token: &str) -> Command {
    Command::new(bin)
        .args(["tunnel", "--no-autoupdate", "run"])
        .env("TUNNEL_TOKEN", token.trim())
}

pub(crate) fn spawn_tunnel(bin: &str, token: &str) -> Result<Child, String> {
    tunnel_command(bin, token).spawn()
}

fn take_lines(pending: &mut String, bytes: &[u8]) -> Vec<String> {
    pending.push_str(&String::from_utf8_lossy(bytes));
    let Some(last) = pending.rfind('\n') else {
        return Vec::new();
    };
    let rest = pending.split_off(last + 1);
    let lines = pending.lines().map(ToString::to_string).collect();
    *pending = rest;
    lines
}

// What the connector wrote, into the log ring, until it ends.
pub(crate) async fn drain(me: Arc<RemoteAccess>, child: Child) {
    let (mut out, mut err) = (String::new(), String::new());
    loop {
        let ended = !matches!(child.try_wait(), Ok(None));
        for line in take_lines(&mut out, &child.read_stdout(DRAIN_BYTES))
            .into_iter()
            .chain(take_lines(&mut err, &child.read_stderr(DRAIN_BYTES)))
        {
            me.push_log(line).await;
        }
        if ended {
            return;
        }
        tokio::time::sleep(DRAIN_EVERY).await;
    }
}

// Returns the trimmed first line of `bin --version` on success, else `None`
// (binary missing / not runnable). Used for the panel's "found" indicator.
pub(crate) async fn binary_version(bin: &str) -> Option<String> {
    let command = Command::new(bin).arg("--version");
    let out = run_blocking(move || command.output(VERSION_TIMEOUT)).await.ok()?.ok()?;
    if out.code != 0 {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .next()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{binary_version, drain, spawn_tunnel, take_lines, tunnel_command};

    const BIN: &str = "/opt/kroma/bin/cloudflared";
    const TOKEN: &str = "eyJhIjoiZmFrZS10dW5uZWwtdG9rZW4ifQ";

    #[test]
    fn keeps_the_tunnel_token_out_of_the_command_line() {
        let cmd = tunnel_command(BIN, TOKEN);

        let line = cmd.spec().args.join(" ");

        assert!(!line.contains(TOKEN), "token leaked into argv: {line}");
        assert!(!line.contains("--token"));
    }

    #[test]
    fn hands_the_trimmed_token_to_cloudflared_through_the_environment() {
        let cmd = tunnel_command(BIN, &format!("  {TOKEN}\n"));

        let env = cmd.spec().env.clone();

        assert_eq!(env, vec![("TUNNEL_TOKEN".to_string(), TOKEN.to_string())]);
    }

    #[test]
    fn a_partial_line_waits_for_the_rest_of_it() {
        let mut pending = String::new();

        let first = take_lines(&mut pending, b"one\ntw");
        let second = take_lines(&mut pending, b"o\n");

        assert_eq!(first, ["one"]);
        assert_eq!(second, ["two"]);
    }

    #[tokio::test]
    async fn reads_no_version_from_a_binary_that_is_not_there() {
        let version = binary_version("/nowhere/cloudflared").await;

        assert_eq!(version, None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn spawns_a_tunnel_binary_that_was_still_open_for_writing_a_moment_ago() {
        let host = crate::test_support::host();
        let bin = crate::test_support::install_script(
            kroma_module_sdk::host::HostCtx::data_dir(&host),
            crate::test_support::RUNNING,
        );
        let writer = std::fs::OpenOptions::new().append(true).open(&bin).unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            drop(writer);
        });

        let child = spawn_tunnel(&bin.to_string_lossy(), TOKEN).unwrap();

        release.join().unwrap();
        child.kill();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reads_the_first_line_of_the_version_output() {
        let host = crate::test_support::host();
        let bin = crate::test_support::install_script(
            kroma_module_sdk::host::HostCtx::data_dir(&host),
            crate::test_support::RUNNING,
        );

        let version = binary_version(&bin.to_string_lossy()).await;

        assert_eq!(version.as_deref(), Some("cloudflared version 2024.1.0"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reads_no_version_from_a_binary_that_fails() {
        let host = crate::test_support::host();
        let bin = crate::test_support::install_script(
            kroma_module_sdk::host::HostCtx::data_dir(&host),
            "#!/bin/sh\necho cloudflared version 2024.1.0\nexit 1\n",
        );

        let version = binary_version(&bin.to_string_lossy()).await;

        assert_eq!(version, None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reads_no_version_from_a_binary_that_prints_nothing() {
        let host = crate::test_support::host();
        let bin = crate::test_support::install_script(
            kroma_module_sdk::host::HostCtx::data_dir(&host),
            "#!/bin/sh\nexit 0\n",
        );

        let version = binary_version(&bin.to_string_lossy()).await;

        assert_eq!(version, None);
    }

    #[tokio::test]
    #[cfg_attr(target_family = "wasm", ignore = "starts a program, which a component asks its host to do")]
    async fn drains_every_line_a_program_writes_into_the_log() {
        let host = crate::test_support::host();
        let remote = crate::test_support::remote_for(&host);
        let bin = crate::test_support::install_script(
            kroma_module_sdk::host::HostCtx::data_dir(&host),
            "#!/bin/sh\necho one\necho two\n",
        );

        let child = spawn_tunnel(&bin.to_string_lossy(), TOKEN).unwrap();
        drain(remote.clone(), child).await;

        assert_eq!(remote.inner.lock().await.logs, ["one", "two"]);
    }
}
