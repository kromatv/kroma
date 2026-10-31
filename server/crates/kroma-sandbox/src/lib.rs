//! Starting a process with no network of its own: a fresh user and network
//! namespace holding only loopback. Linux only, where the kernel allows
//! unprivileged namespaces.

#[cfg(target_os = "linux")]
mod child;

use std::process::Command;
use std::sync::OnceLock;

/// Whether this machine can start a process with no network, probed once.
pub fn network_isolation_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let mut probe = Command::new("true");
        isolate_network(&mut probe);
        probe.status().is_ok_and(|status| status.success())
    })
}

/// Starts `command` in a fresh user and network namespace holding only
/// loopback, keeping its uid and gid. The spawn fails where
/// [`network_isolation_available`] is false.
#[cfg(target_os = "linux")]
pub fn isolate_network(command: &mut Command) {
    use std::os::unix::process::CommandExt;

    // SAFETY: getuid and getgid cannot fail and touch no memory.
    let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
    let uid_map = format!("{uid} {uid} 1\n").into_bytes();
    let gid_map = format!("{gid} {gid} 1\n").into_bytes();
    // SAFETY: the closure runs between fork and exec, where only
    // async-signal-safe calls are allowed. It makes raw syscalls on buffers
    // built before the fork and allocates nothing.
    unsafe {
        command.pre_exec(move || child::enter(&uid_map, &gid_map));
    }
}

#[cfg(not(target_os = "linux"))]
pub fn isolate_network(_command: &mut Command) {}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    fn isolated(script: &str) -> std::process::Output {
        let mut command = Command::new("sh");
        command.arg("-c").arg(script);
        isolate_network(&mut command);
        command.output().unwrap()
    }

    #[test]
    fn an_isolated_process_sees_no_interface_but_loopback() {
        if !network_isolation_available() {
            return;
        }

        let out = isolated("cat /proc/net/dev");

        let interfaces: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .skip(2)
            .filter_map(|line| line.split(':').next())
            .map(|name| name.trim().to_string())
            .collect();
        assert_eq!(interfaces, ["lo"]);
    }

    #[test]
    fn an_isolated_process_keeps_its_user_and_reaches_its_own_loopback() {
        if !network_isolation_available() {
            return;
        }
        // SAFETY: getuid cannot fail.
        let uid = unsafe { libc::getuid() };

        let out = isolated(
            "id -u; grep -q ' lo' /proc/net/dev && cat /sys/class/net/lo/operstate 2>/dev/null || echo unknown",
        );

        let said = String::from_utf8_lossy(&out.stdout);
        let mut lines = said.lines();
        assert_eq!(lines.next(), Some(uid.to_string().as_str()));
        assert_ne!(lines.next(), Some("down"), "{said}");
    }

    #[test]
    fn an_isolated_process_cannot_reach_the_network() {
        if !network_isolation_available() {
            return;
        }

        let out = isolated(
            "curl -q -sS --max-time 3 -o /dev/null http://1.1.1.1/ && echo reached || echo refused",
        );

        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "refused");
    }
}
