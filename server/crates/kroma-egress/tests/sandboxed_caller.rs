//! A process with no network of its own reaches the outside through the
//! gateway's Unix socket and nothing else, and the gateway records it.

use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::process::Command;
use std::sync::{Arc, Mutex};

use kroma_egress::{serve_unix, Flow, Policy, Request, Route, Verdict};

const PROBE: &str = "KROMA_GATEWAY_PROBE";
const CREDENTIAL: &str = "module-token";

#[test]
fn probe_entry() {
    let Ok(spec) = std::env::var(PROBE) else {
        return;
    };
    let (socket, target) = spec.split_once('|').unwrap();
    let (host, port) = target.rsplit_once(':').unwrap();
    let answer = socks_connect(socket, host, port.parse().unwrap());
    std::process::exit(i32::from(answer));
}

fn socks_connect(socket: &str, host: &str, port: u16) -> u8 {
    let mut stream = UnixStream::connect(socket).unwrap();
    stream.write_all(&[0x05, 0x01, 0x02]).unwrap();
    let mut chosen = [0u8; 2];
    stream.read_exact(&mut chosen).unwrap();
    let mut auth = vec![0x01, 5];
    auth.extend_from_slice(b"peers");
    auth.push(CREDENTIAL.len() as u8);
    auth.extend_from_slice(CREDENTIAL.as_bytes());
    stream.write_all(&auth).unwrap();
    let mut status = [0u8; 2];
    stream.read_exact(&mut status).unwrap();
    let mut request = vec![0x05, 0x01, 0x00, 0x03, host.len() as u8];
    request.extend_from_slice(host.as_bytes());
    request.extend_from_slice(&port.to_be_bytes());
    stream.write_all(&request).unwrap();
    let mut answer = [0u8; 10];
    stream.read_exact(&mut answer).unwrap();
    if answer[1] == 0 {
        stream.write_all(b"ping").unwrap();
        let mut back = [0u8; 4];
        stream.read_exact(&mut back).unwrap();
        assert_eq!(&back, b"ping");
    }
    answer[1]
}

fn sandbox_or_skip() -> bool {
    if kroma_sandbox::network_isolation_available() {
        return true;
    }
    assert!(
        std::env::var_os("KROMA_REQUIRE_SANDBOX").is_none_or(|value| value.is_empty()),
        "KROMA_REQUIRE_SANDBOX is set and this machine refuses unprivileged network namespaces"
    );
    eprintln!("SKIPPED: this machine refuses unprivileged network namespaces");
    false
}

struct Recorder {
    verdict: Verdict,
    flows: Mutex<Vec<Flow>>,
}

impl Policy for Recorder {
    fn caller_of(&self, credential: &str) -> Option<String> {
        (credential == CREDENTIAL).then(|| "tv.kroma.sandboxed".to_string())
    }

    fn decide(&self, _request: &Request) -> Verdict {
        self.verdict.clone()
    }

    fn record(&self, flow: Flow) {
        self.flows.lock().unwrap().push(flow);
    }
}

fn echo_server() -> std::net::SocketAddr {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            std::thread::spawn(move || {
                let mut buf = [0u8; 4];
                if stream.read_exact(&mut buf).is_ok() {
                    let _ = stream.write_all(&buf);
                }
            });
        }
    });
    addr
}

fn sandboxed_probe(socket: &std::path::Path, target: std::net::SocketAddr) -> i32 {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", "probe_entry", "--test-threads", "1"])
        .env(
            PROBE,
            format!("{}|localhost:{}", socket.display(), target.port()),
        )
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    kroma_sandbox::isolate_network(&mut command);
    command.status().unwrap().code().unwrap_or(-1)
}

async fn gateway(policy: Arc<Recorder>) -> (kroma_testing::TempDir, std::path::PathBuf) {
    let dir = kroma_testing::temp_dir("sandboxed-caller");
    let path = dir.path().join("gateway.sock");
    let listener = tokio::net::UnixListener::bind(&path).unwrap();
    tokio::spawn(serve_unix(listener, policy));
    (dir, path)
}

async fn flows(policy: &Recorder) -> Vec<Flow> {
    for _ in 0..100 {
        let flows = policy.flows.lock().unwrap().clone();
        if !flows.is_empty() {
            return flows;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    Vec::new()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_sandboxed_caller_reaches_out_through_the_gateway_and_is_recorded() {
    if !sandbox_or_skip() {
        return;
    }
    let echo = echo_server();
    let policy = Arc::new(Recorder {
        verdict: Verdict::Direct {
            private_allowed: true,
        },
        flows: Mutex::new(Vec::new()),
    });
    let (_dir, socket) = gateway(policy.clone()).await;

    let code = tokio::task::spawn_blocking(move || sandboxed_probe(&socket, echo))
        .await
        .unwrap();

    assert_eq!(code, 0, "the probe went out through the gateway");
    let flows = flows(&policy).await;
    assert_eq!(flows.len(), 1);
    assert_eq!(flows[0].caller, "tv.kroma.sandboxed");
    assert_eq!(flows[0].host, "localhost");
    assert_eq!(flows[0].route, Route::Direct);
    assert_eq!((flows[0].bytes_up, flows[0].bytes_down), (4, 4));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_sandboxed_caller_the_policy_blocks_gets_nowhere_and_is_recorded() {
    if !sandbox_or_skip() {
        return;
    }
    let echo = echo_server();
    let policy = Arc::new(Recorder {
        verdict: Verdict::Block("not declared".into()),
        flows: Mutex::new(Vec::new()),
    });
    let (_dir, socket) = gateway(policy.clone()).await;

    let code = tokio::task::spawn_blocking(move || sandboxed_probe(&socket, echo))
        .await
        .unwrap();

    assert_eq!(code, 0x02, "SOCKS5 'not allowed by ruleset'");
    let flows = flows(&policy).await;
    assert_eq!(flows[0].route, Route::Blocked);
    assert_eq!(flows[0].error.as_deref(), Some("not declared"));
}
