use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

/// A local HTTP server that answers its connections, in order, with what
/// `answers` makes of its base URL. Returns that base URL.
pub fn serve(answers: impl FnOnce(&str) -> Vec<Vec<u8>>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let answers = answers(&base);
    std::thread::spawn(move || {
        for (stream, answer) in listener.incoming().zip(answers) {
            let Ok(mut stream) = stream else { break };
            let mut reader = BufReader::new(&stream);
            let mut line = String::new();
            while reader.read_line(&mut line).is_ok_and(|read| read > 2) {
                line.clear();
            }
            let _ = stream.write_all(&answer);
        }
    });
    base
}

/// An HTTP/1.1 answer with `status`, extra `headers` (each ending in CRLF) and
/// `body`.
pub fn answer(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
    let head = format!(
        "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    [head.as_bytes(), body].concat()
}
