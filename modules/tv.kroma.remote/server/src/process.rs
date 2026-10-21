use std::process::Stdio;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::access::RemoteAccess;

// The adjacent substring `kill_all_cloudflared` sweeps `ps aux` for, so a shell
// line that merely mentions the binary path isn't caught.
#[cfg(any(unix, test))]
pub(crate) fn tunnel_needle(bin: &str) -> String {
    format!("{bin} tunnel")
}

pub(crate) fn tunnel_command(bin: &str, token: &str) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(["tunnel", "--no-autoupdate", "run"])
        .env("TUNNEL_TOKEN", token.trim())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    cmd
}

pub(crate) async fn drain<R: tokio::io::AsyncRead + Unpin>(me: Arc<RemoteAccess>, stream: R) {
    let mut lines = BufReader::new(stream).lines();
    while let Ok(Some(l)) = lines.next_line().await {
        me.push_log(l).await;
    }
}

// Returns the trimmed first line of `bin --version` on success, else `None`
// (binary missing / not runnable). Used for the panel's "found" indicator.
pub(crate) async fn binary_version(bin: &str) -> Option<String> {
    let out = Command::new(bin).arg("--version").output().await.ok()?;
    if !out.status.success() {
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
    use super::{binary_version, drain, tunnel_command, tunnel_needle};

    const BIN: &str = "/opt/kroma/bin/cloudflared";
    const TOKEN: &str = "eyJhIjoiZmFrZS10dW5uZWwtdG9rZW4ifQ";

    fn command_line(bin: &str, cmd: &tokio::process::Command) -> String {
        let args = cmd
            .as_std()
            .get_args()
            .map(|a| a.to_string_lossy().into_owned());
        std::iter::once(bin.to_string())
            .chain(args)
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn keeps_the_tunnel_token_out_of_the_command_line() {
        let cmd = tunnel_command(BIN, TOKEN);

        let line = command_line(BIN, &cmd);

        assert!(!line.contains(TOKEN), "token leaked into argv: {line}");
        assert!(!line.contains("--token"));
    }

    #[test]
    fn hands_the_trimmed_token_to_cloudflared_through_the_environment() {
        let cmd = tunnel_command(BIN, &format!("  {TOKEN}\n"));

        let env: Vec<_> = cmd
            .as_std()
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();

        assert_eq!(
            env,
            vec![("TUNNEL_TOKEN".to_string(), Some(TOKEN.to_string()))]
        );
    }

    #[test]
    fn launches_a_command_line_the_orphan_sweep_still_matches() {
        let cmd = tunnel_command(BIN, TOKEN);

        let line = command_line(BIN, &cmd);

        assert!(
            line.contains(&tunnel_needle(BIN)),
            "sweep needle no longer matches: {line}"
        );
    }

    #[tokio::test]
    async fn reads_no_version_from_a_binary_that_is_not_there() {
        let version = binary_version("/nowhere/cloudflared").await;

        assert_eq!(version, None);
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
    async fn drains_every_line_of_a_stream_into_the_log() {
        let host = crate::test_support::host();
        let remote = crate::test_support::remote_for(&host);

        drain(remote.clone(), "one\ntwo\n".as_bytes()).await;

        assert_eq!(remote.status().await.logs, vec!["one", "two"]);
    }
}
