//! Starting a sidecar with no network of its own: a fresh user and network
//! namespace that holds nothing but loopback, so the only way out is a Unix
//! socket the core put on the filesystem. Linux only, and only where the
//! kernel lets an unprivileged process create namespaces.

use std::process::Command;
use std::sync::OnceLock;

/// Whether this machine can start a module with no network, probed once by
/// starting `true` that way.
pub fn network_isolation_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let mut probe = Command::new("true");
        isolate_network(&mut probe);
        probe.status().is_ok_and(|status| status.success())
    })
}

#[cfg(target_os = "linux")]
pub(crate) fn isolate_network(command: &mut Command) {
    use std::os::unix::process::CommandExt;

    // SAFETY: getuid and getgid cannot fail and touch no memory.
    let (uid, gid) = unsafe { (libc::getuid(), libc::getgid()) };
    let uid_map = format!("{uid} {uid} 1\n").into_bytes();
    let gid_map = format!("{gid} {gid} 1\n").into_bytes();
    // SAFETY: the closure runs between fork and exec, where only
    // async-signal-safe calls are allowed. It makes raw syscalls on buffers
    // built before the fork and allocates nothing.
    unsafe {
        command.pre_exec(move || {
            if libc::unshare(libc::CLONE_NEWUSER | libc::CLONE_NEWNET) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            write_proc(c"/proc/self/setgroups", b"deny")?;
            write_proc(c"/proc/self/uid_map", &uid_map)?;
            write_proc(c"/proc/self/gid_map", &gid_map)?;
            loopback_up()
        });
    }
}

#[cfg(not(target_os = "linux"))]
pub(crate) fn isolate_network(_command: &mut Command) {}

#[cfg(target_os = "linux")]
unsafe fn write_proc(path: &std::ffi::CStr, contents: &[u8]) -> std::io::Result<()> {
    let fd = libc::open(path.as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC);
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }
    let written = libc::write(fd, contents.as_ptr().cast(), contents.len());
    libc::close(fd);
    if written != contents.len() as isize {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

// A new network namespace starts with `lo` down, and a module's own
// loopback forwarders (for libraries that cannot dial a Unix socket) need it.
#[cfg(target_os = "linux")]
unsafe fn loopback_up() -> std::io::Result<()> {
    let fd = libc::socket(libc::AF_INET, libc::SOCK_DGRAM | libc::SOCK_CLOEXEC, 0);
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }
    let mut request: libc::ifreq = std::mem::zeroed();
    for (slot, byte) in request.ifr_name.iter_mut().zip(b"lo\0") {
        *slot = *byte as libc::c_char;
    }
    let mut result = libc::ioctl(fd, libc::SIOCGIFFLAGS, &mut request);
    if result == 0 {
        request.ifr_ifru.ifru_flags |= (libc::IFF_UP | libc::IFF_RUNNING) as libc::c_short;
        result = libc::ioctl(fd, libc::SIOCSIFFLAGS, &request);
    }
    libc::close(fd);
    if result != 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

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
