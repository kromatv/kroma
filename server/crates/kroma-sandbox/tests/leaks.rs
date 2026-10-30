//! Every way out a sandboxed process could try, tried from inside one. Each
//! probe runs in a child of this test binary, started once in the sandbox
//! (where it must fail) and, where the probe can succeed on this machine, once
//! outside it as a control, so a probe that cannot detect anything fails too.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::os::unix::net::{UnixListener, UnixStream};
use std::process::Command;
use std::time::Duration;

const PROBE: &str = "KROMA_LEAK_PROBE";
const REQUIRED: &str = "KROMA_REQUIRE_SANDBOX";
const REACHED: i32 = 0;
const REFUSED: i32 = 3;

#[test]
fn probe_entry() {
    let Ok(probe) = std::env::var(PROBE) else {
        return;
    };
    let reached = match probe.split_once(':') {
        Some(("tcp", target)) => tcp(target),
        Some(("udp", target)) => udp(target),
        Some(("dns", name)) => (name, 443).to_socket_addrs_ok(),
        Some(("abstract", name)) => abstract_unix(name),
        Some(("unix", path)) => UnixStream::connect(path).is_ok(),
        _ => panic!("unknown probe {probe}"),
    };
    std::process::exit(if reached { REACHED } else { REFUSED });
}

trait Resolves {
    fn to_socket_addrs_ok(self) -> bool;
}

impl Resolves for (&str, u16) {
    fn to_socket_addrs_ok(self) -> bool {
        std::net::ToSocketAddrs::to_socket_addrs(&self).is_ok_and(|mut a| a.next().is_some())
    }
}

fn tcp(target: &str) -> bool {
    let addr: SocketAddr = target.parse().unwrap();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(3)) else {
        return false;
    };
    let _ = stream.write_all(b"leak");
    true
}

fn udp(target: &str) -> bool {
    let addr: SocketAddr = target.parse().unwrap();
    let bind = if addr.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };
    UdpSocket::bind(bind).is_ok_and(|socket| socket.send_to(b"leak", addr).is_ok())
}

fn abstract_unix(name: &str) -> bool {
    use std::os::linux::net::SocketAddrExt;
    let Ok(addr) = std::os::unix::net::SocketAddr::from_abstract_name(name.as_bytes()) else {
        return false;
    };
    UnixStream::connect_addr(&addr).is_ok()
}

fn run(probe: &str, sandboxed: bool) -> i32 {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "--exact",
            "probe_entry",
            "--nocapture",
            "--test-threads",
            "1",
        ])
        .env(PROBE, probe)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    if sandboxed {
        kroma_sandbox::isolate_network(&mut command);
    }
    command.status().unwrap().code().unwrap_or(-1)
}

fn sandbox_or_skip() -> bool {
    if kroma_sandbox::network_isolation_available() {
        return true;
    }
    assert!(
        std::env::var_os(REQUIRED).is_none_or(|value| value.is_empty()),
        "{REQUIRED} is set and this machine refuses unprivileged network namespaces"
    );
    eprintln!("SKIPPED: this machine refuses unprivileged network namespaces");
    false
}

#[test]
fn tcp_to_the_internet_does_not_leave_the_sandbox() {
    if !sandbox_or_skip() {
        return;
    }

    assert_eq!(run("tcp:1.1.1.1:443", true), REFUSED);
    assert_eq!(run("tcp:[2606:4700:4700::1111]:443", true), REFUSED);
}

#[test]
fn udp_to_the_internet_does_not_leave_the_sandbox() {
    if !sandbox_or_skip() {
        return;
    }

    assert_eq!(run("udp:1.1.1.1:53", true), REFUSED);
    assert_eq!(run("udp:[2606:4700:4700::1111]:53", true), REFUSED);
}

#[test]
fn a_lan_address_is_out_of_reach() {
    if !sandbox_or_skip() {
        return;
    }

    assert_eq!(run("tcp:192.168.1.1:80", true), REFUSED);
    assert_eq!(run("udp:192.168.1.1:53", true), REFUSED);
}

#[test]
fn a_name_cannot_be_resolved_from_inside() {
    if !sandbox_or_skip() {
        return;
    }

    assert_eq!(run("dns:example.com", true), REFUSED);
}

#[test]
fn a_service_on_the_hosts_loopback_is_out_of_reach() {
    if !sandbox_or_skip() {
        return;
    }
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let target = format!("tcp:{}", listener.local_addr().unwrap());
    listener.set_nonblocking(true).unwrap();

    assert_eq!(run(&target, false), REACHED, "the control must reach it");
    let _ = listener.accept();
    assert_eq!(run(&target, true), REFUSED);
    assert!(
        listener.accept().is_err(),
        "nothing reached the host listener"
    );
}

#[test]
fn a_hosts_abstract_unix_socket_is_out_of_reach() {
    use std::os::linux::net::SocketAddrExt;
    if !sandbox_or_skip() {
        return;
    }
    let name = format!("kroma-leak-test-{}", std::process::id());
    let addr = std::os::unix::net::SocketAddr::from_abstract_name(name.as_bytes()).unwrap();
    let listener = UnixListener::bind_addr(&addr).unwrap();
    listener.set_nonblocking(true).unwrap();
    let probe = format!("abstract:{name}");

    assert_eq!(run(&probe, false), REACHED, "the control must reach it");
    let _ = listener.accept();
    assert_eq!(run(&probe, true), REFUSED);
}

#[test]
fn the_unix_socket_the_core_hands_over_is_the_way_out() {
    if !sandbox_or_skip() {
        return;
    }
    let dir = kroma_testing::temp_dir("leak-door");
    let path = dir.path().join("gateway.sock");
    let listener = UnixListener::bind(&path).unwrap();
    let door = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut said = [0u8; 4];
        let _ = stream.read(&mut said);
    });

    assert_eq!(run(&format!("unix:{}", path.display()), true), REACHED);
    door.join().unwrap();
}

#[test]
#[ignore = "needs the filesystem sandbox (#488): today any pathname Unix socket the user can open is reachable"]
fn a_pathname_unix_socket_outside_the_run_directory_is_out_of_reach() {
    let dir = kroma_testing::temp_dir("leak-elsewhere");
    let path = dir.path().join("docker.sock");
    let _listener = UnixListener::bind(&path).unwrap();

    assert_eq!(run(&format!("unix:{}", path.display()), true), REFUSED);
}
