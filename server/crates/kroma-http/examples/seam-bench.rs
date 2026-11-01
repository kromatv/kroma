//! What one exchange on the internal seam costs, per transport.
//!
//!     cargo run -p kroma-http --release --example seam-bench

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use kroma_http::{Fetch, Loopback};

const BODY: &str = r#"{"ok":true,"items":[]}"#;
const CALLS: u32 = 200;

fn response() -> String {
    format!(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: keep-alive\r\n\r\n{BODY}",
        BODY.len()
    )
}

fn answer(mut stream: impl Read + Write + Send + 'static) {
    std::thread::spawn(move || {
        let response = response();
        let mut buf = [0u8; 16384];
        while matches!(stream.read(&mut buf), Ok(n) if n > 0) {
            if stream.write_all(response.as_bytes()).is_err() {
                return;
            }
        }
    });
}

fn serve() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            stream.set_nodelay(true).ok();
            answer(stream);
        }
    });
    port
}

fn serve_unix(socket: &std::path::Path) {
    let listener = std::os::unix::net::UnixListener::bind(socket).unwrap();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            answer(stream);
        }
    });
}

fn time(label: &str, mut call: impl FnMut()) -> Duration {
    call();
    let start = Instant::now();
    for _ in 0..CALLS {
        call();
    }
    let elapsed = start.elapsed();
    let per_call = elapsed.as_secs_f64() * 1000.0 / f64::from(CALLS);
    println!("  {label:<38} {per_call:>9.3} ms/call");
    elapsed
}

fn main() {
    let port = serve();
    let url = format!("http://127.0.0.1:{port}/_port/acquisition/search");
    let body = serde_json::json!({ "query": "test", "limit": 50 });

    println!("\n  {CALLS} POSTs to a loopback peer, one warm-up call each\n");

    let curl = time("Fetch (a curl process per call)", || {
        Fetch::new()
            .header("authorization", "Bearer tok")
            .post_json(&url, &body)
            .unwrap();
    });

    let tcp = time("Loopback / tcp", || {
        Loopback::new()
            .header("authorization", "Bearer tok")
            .post_json(&url, &body)
            .unwrap();
    });

    let dir = std::env::temp_dir().join(format!("kroma-seam-bench-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let socket = dir.join("bench.sock");
    serve_unix(&socket);
    let unix_url = format!(
        "{}/_port/acquisition/search",
        kroma_http::loopback::unix_url(&socket)
    );
    let unix = time("Loopback / unix", || {
        Loopback::new()
            .header("authorization", "Bearer tok")
            .post_json(&unix_url, &body)
            .unwrap();
    });
    let _ = std::fs::remove_dir_all(&dir);

    let ratio = curl.as_secs_f64() / tcp.as_secs_f64();
    println!("\n  tcp is {ratio:.0}x faster than a curl process per call");
    let ratio = tcp.as_secs_f64() / unix.as_secs_f64();
    println!("  tcp takes {ratio:.2}x the time of unix per call\n");
}
