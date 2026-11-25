//! A real event socket against the app under test: the router served on a
//! loopback port, and just enough of a WebSocket client to say text messages
//! and hear text frames.

use std::net::SocketAddr;
use std::time::Duration;

use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::TestApp;

const MASK: [u8; 4] = [0x37, 0xfa, 0x21, 0x3d];
const WAIT: Duration = Duration::from_secs(10);

/// Serves `t`'s router on a loopback port and returns its address.
pub async fn serve(t: &TestApp) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("address");
    let app = t.app.clone();
    tokio::spawn(async move {
        let service = app.into_make_service_with_connect_info::<SocketAddr>();
        let _ = axum::serve(listener, service).await;
    });
    addr
}

/// One open `GET /api/events` socket.
pub struct EventSocket {
    stream: TcpStream,
}

impl EventSocket {
    /// Opens a socket signed in with `token` and reads the server's hello.
    pub async fn open(addr: SocketAddr, token: &str) -> Self {
        let mut stream = dial(addr).await;
        let handshake = format!(
            "GET /api/events HTTP/1.1\r\nHost: {addr}\r\nUpgrade: websocket\r\n\
             Connection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\
             Sec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: kroma.session.{token}\r\n\r\n"
        );
        stream
            .write_all(handshake.as_bytes())
            .await
            .expect("handshake");
        let head = read_head(&mut stream).await;
        assert!(head.starts_with("HTTP/1.1 101"), "{head}");
        let mut socket = Self { stream };
        assert_eq!(socket.next().await["type"], "hello");
        socket
    }

    /// Says one text message.
    pub async fn say(&mut self, text: &str) {
        let frame = masked_text(text.as_bytes());
        self.stream.write_all(&frame).await.expect("send a frame");
    }

    /// Says `value` as JSON.
    pub async fn say_json(&mut self, value: &Value) {
        self.say(&value.to_string()).await;
    }

    /// The next text frame, as JSON.
    pub async fn next(&mut self) -> Value {
        tokio::time::timeout(WAIT, self.next_text())
            .await
            .expect("a frame in time")
    }

    /// The next frame of `kind`, skipping any other.
    pub async fn next_of(&mut self, kind: &str) -> Value {
        loop {
            let frame = self.next().await;
            if frame["type"] == kind {
                return frame;
            }
        }
    }

    async fn next_text(&mut self) -> Value {
        loop {
            let (opcode, payload) = self.read_frame().await;
            if opcode == 0x1 {
                return serde_json::from_slice(&payload).expect("a JSON frame");
            }
        }
    }

    async fn read_frame(&mut self) -> (u8, Vec<u8>) {
        let mut head = [0u8; 2];
        self.stream.read_exact(&mut head).await.expect("a frame");
        let len = match head[1] & 0x7f {
            126 => u64::from(self.stream.read_u16().await.expect("length")),
            127 => self.stream.read_u64().await.expect("length"),
            short => u64::from(short),
        };
        let mut payload = vec![0u8; usize::try_from(len).expect("a frame that fits")];
        self.stream.read_exact(&mut payload).await.expect("payload");
        (head[0] & 0x0f, payload)
    }
}

#[expect(
    clippy::disallowed_methods,
    reason = "the test's own client of the app it serves on loopback"
)]
async fn dial(addr: SocketAddr) -> TcpStream {
    TcpStream::connect(addr).await.expect("connect")
}

async fn read_head(stream: &mut TcpStream) -> String {
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).await.expect("a response head");
        head.push(byte[0]);
    }
    String::from_utf8_lossy(&head).into_owned()
}

fn masked_text(payload: &[u8]) -> Vec<u8> {
    let mut frame = vec![0x81];
    match payload.len() {
        len @ 0..=125 => frame.push(0x80 | len as u8),
        len @ 126..=0xffff => {
            frame.push(0x80 | 126);
            frame.extend_from_slice(&(len as u16).to_be_bytes());
        }
        len => {
            frame.push(0x80 | 127);
            frame.extend_from_slice(&(len as u64).to_be_bytes());
        }
    }
    frame.extend_from_slice(&MASK);
    let masked = payload.iter().enumerate().map(|(i, b)| b ^ MASK[i % 4]);
    frame.extend(masked);
    frame
}
