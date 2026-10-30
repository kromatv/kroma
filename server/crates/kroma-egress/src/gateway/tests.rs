use std::path::PathBuf;
use std::sync::Mutex;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;

use super::*;
use crate::Upstream;

const CALLER: &str = "tv.kroma.test";
const CREDENTIAL: &str = "secret";

struct TestPolicy {
    verdict: Verdict,
    flows: Mutex<Vec<Flow>>,
    asked: Mutex<Vec<Request>>,
}

impl TestPolicy {
    fn answering(verdict: Verdict) -> Arc<Self> {
        Arc::new(Self {
            verdict,
            flows: Mutex::new(Vec::new()),
            asked: Mutex::new(Vec::new()),
        })
    }

    async fn flow(&self) -> Flow {
        for _ in 0..100 {
            if let Some(flow) = self.flows.lock().unwrap().first().cloned() {
                return flow;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("no flow was recorded");
    }
}

impl Policy for TestPolicy {
    fn caller_of(&self, credential: &str) -> Option<String> {
        (credential == CREDENTIAL).then(|| CALLER.to_string())
    }

    fn decide(&self, request: &Request) -> Verdict {
        self.asked.lock().unwrap().push(request.clone());
        self.verdict.clone()
    }

    fn record(&self, flow: Flow) {
        self.flows.lock().unwrap().push(flow);
    }
}

async fn echo_server() -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            tokio::spawn(async move {
                let (mut read, mut write) = stream.split();
                let _ = tokio::io::copy(&mut read, &mut write).await;
            });
        }
    });
    addr
}

fn gateway_socket(policy: Arc<TestPolicy>) -> (kroma_testing::TempDir, PathBuf) {
    let dir = kroma_testing::temp_dir("egress");
    let path = dir.path().join("gateway.sock");
    let listener = UnixListener::bind(&path).unwrap();
    tokio::spawn(serve_unix(listener, policy));
    (dir, path)
}

fn connect_request(host: &str, port: u16) -> Vec<u8> {
    let mut request = vec![0x05, 0x01, 0x00];
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => {
            request.push(0x01);
            request.extend_from_slice(&v4.octets());
        }
        Ok(IpAddr::V6(v6)) => {
            request.push(0x04);
            request.extend_from_slice(&v6.octets());
        }
        Err(_) => {
            request.push(0x03);
            request.push(host.len() as u8);
            request.extend_from_slice(host.as_bytes());
        }
    }
    request.extend_from_slice(&port.to_be_bytes());
    request
}

async fn socks_connect(path: &PathBuf, password: &str, host: &str, port: u16) -> (UnixStream, u8) {
    let mut stream = UnixStream::connect(path).await.unwrap();
    stream.write_all(&[0x05, 0x01, 0x02]).await.unwrap();
    let mut chosen = [0u8; 2];
    stream.read_exact(&mut chosen).await.unwrap();
    assert_eq!(chosen, [0x05, 0x02]);
    let mut auth = vec![0x01, 5];
    auth.extend_from_slice(b"peers");
    auth.push(password.len() as u8);
    auth.extend_from_slice(password.as_bytes());
    stream.write_all(&auth).await.unwrap();
    let mut status = [0u8; 2];
    stream.read_exact(&mut status).await.unwrap();
    if status[1] != 0 {
        return (stream, 0xff);
    }
    stream
        .write_all(&connect_request(host, port))
        .await
        .unwrap();
    let mut answer = [0u8; 10];
    stream.read_exact(&mut answer).await.unwrap();
    (stream, answer[1])
}

#[tokio::test]
async fn an_allowed_connection_is_relayed_and_reported_with_its_bytes() {
    let echo = echo_server().await;
    let policy = TestPolicy::answering(Verdict::Direct {
        private_allowed: true,
    });
    let (_dir, path) = gateway_socket(policy.clone());

    let (mut stream, answer) = socks_connect(&path, CREDENTIAL, "127.0.0.1", echo.port()).await;
    stream.write_all(b"ping").await.unwrap();
    let mut back = [0u8; 4];
    stream.read_exact(&mut back).await.unwrap();
    drop(stream);

    assert_eq!(answer, 0x00);
    assert_eq!(&back, b"ping");
    let flow = policy.flow().await;
    assert_eq!(flow.caller, CALLER);
    assert_eq!(flow.purpose, "peers");
    assert_eq!(flow.route, Route::Direct);
    assert_eq!((flow.bytes_up, flow.bytes_down), (4, 4));
    assert_eq!(flow.error, None);
}

#[tokio::test]
async fn a_caller_offering_no_credentials_is_refused_before_naming_a_destination() {
    let policy = TestPolicy::answering(Verdict::Direct {
        private_allowed: true,
    });
    let (_dir, path) = gateway_socket(policy.clone());
    let mut stream = UnixStream::connect(&path).await.unwrap();

    stream.write_all(&[0x05, 0x01, 0x00]).await.unwrap();
    let mut chosen = [0u8; 2];
    stream.read_exact(&mut chosen).await.unwrap();

    assert_eq!(chosen, [0x05, 0xff]);
    assert!(policy.asked.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_credential_the_policy_does_not_know_is_refused() {
    let policy = TestPolicy::answering(Verdict::Direct {
        private_allowed: true,
    });
    let (_dir, path) = gateway_socket(policy.clone());

    let (_stream, answer) = socks_connect(&path, "guessed", "127.0.0.1", 9).await;

    assert_eq!(answer, 0xff);
    assert!(policy.asked.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_blocked_connection_is_refused_and_still_reported() {
    let policy = TestPolicy::answering(Verdict::Block("not on the list".into()));
    let (_dir, path) = gateway_socket(policy.clone());

    let (_stream, answer) = socks_connect(&path, CREDENTIAL, "tracker.example.org", 443).await;

    assert_eq!(answer, 0x02);
    let flow = policy.flow().await;
    assert_eq!(flow.route, Route::Blocked);
    assert_eq!(flow.host, "tracker.example.org");
    assert_eq!(flow.error.as_deref(), Some("not on the list"));
}

#[tokio::test]
async fn a_name_that_resolves_to_this_machine_is_refused_unless_private_is_allowed() {
    let echo = echo_server().await;
    let policy = TestPolicy::answering(Verdict::Direct {
        private_allowed: false,
    });
    let (_dir, path) = gateway_socket(policy.clone());

    let (_stream, answer) = socks_connect(&path, CREDENTIAL, "localhost", echo.port()).await;

    assert_eq!(answer, 0x02);
    let flow = policy.flow().await;
    assert_eq!(flow.route, Route::Blocked);
    assert!(flow.error.unwrap().contains("may not reach"));
}

#[tokio::test]
async fn link_local_stays_unreachable_even_when_private_is_allowed() {
    let policy = TestPolicy::answering(Verdict::Direct {
        private_allowed: true,
    });
    let (_dir, path) = gateway_socket(policy.clone());

    let (_plain, plain) = socks_connect(&path, CREDENTIAL, "169.254.169.254", 80).await;
    let (_mapped, mapped) = socks_connect(&path, CREDENTIAL, "::ffff:169.254.169.254", 80).await;

    assert_eq!(plain, 0x02);
    assert_eq!(mapped, 0x02);
}

#[tokio::test]
async fn anything_but_connect_is_refused() {
    let policy = TestPolicy::answering(Verdict::Direct {
        private_allowed: true,
    });
    let (_dir, path) = gateway_socket(policy.clone());
    let mut stream = UnixStream::connect(&path).await.unwrap();
    stream.write_all(&[0x05, 0x01, 0x02]).await.unwrap();
    let mut chosen = [0u8; 2];
    stream.read_exact(&mut chosen).await.unwrap();
    let mut auth = vec![0x01, 3];
    auth.extend_from_slice(b"dht");
    auth.push(CREDENTIAL.len() as u8);
    auth.extend_from_slice(CREDENTIAL.as_bytes());
    stream.write_all(&auth).await.unwrap();
    let mut status = [0u8; 2];
    stream.read_exact(&mut status).await.unwrap();

    let mut associate = connect_request("0.0.0.0", 0);
    associate[1] = 0x03;
    stream.write_all(&associate).await.unwrap();
    let mut answer = [0u8; 10];
    stream.read_exact(&mut answer).await.unwrap();

    assert_eq!(answer[1], 0x07);
}

#[tokio::test]
async fn an_upstream_route_hands_the_name_itself_to_the_upstream_proxy() {
    let echo = echo_server().await;
    let upstream_policy = Arc::new(UpstreamPolicy::default());
    let upstream_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_addr = upstream_listener.local_addr().unwrap();
    tokio::spawn(serve_tcp(upstream_listener, upstream_policy.clone()));
    let policy = TestPolicy::answering(Verdict::Upstream(Upstream {
        address: upstream_addr.to_string(),
        credentials: Some(("bridge".into(), "bridge-secret".into())),
    }));
    let (_dir, path) = gateway_socket(policy.clone());

    let (mut stream, answer) = socks_connect(&path, CREDENTIAL, "localhost", echo.port()).await;
    stream.write_all(b"through").await.unwrap();
    let mut back = [0u8; 7];
    stream.read_exact(&mut back).await.unwrap();
    drop(stream);

    assert_eq!(answer, 0x00);
    assert_eq!(&back, b"through");
    let seen = upstream_policy.asked.lock().unwrap().clone();
    assert_eq!(seen[0].host, Host::Name("localhost".into()));
    assert_eq!(seen[0].purpose, "bridge");
    assert_eq!(policy.flow().await.route, Route::Upstream);
}

#[derive(Default)]
struct UpstreamPolicy {
    asked: Mutex<Vec<Request>>,
}

impl Policy for UpstreamPolicy {
    fn caller_of(&self, credential: &str) -> Option<String> {
        (credential == "bridge-secret").then(|| "kroma".to_string())
    }

    fn decide(&self, request: &Request) -> Verdict {
        self.asked.lock().unwrap().push(request.clone());
        Verdict::Direct {
            private_allowed: true,
        }
    }

    fn record(&self, _flow: Flow) {}
}
