use std::io::{Read, Write};
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;

pub(crate) struct Asked {
    pub target: String,
    pub request: String,
}

pub(crate) fn http_echo(body: &'static str) -> String {
    counting_http_echo(body).0
}

pub(crate) fn counting_http_echo(body: &'static str) -> (String, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let hits = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&hits);
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            if read_http_request(&mut stream).starts_with("GET /ip ") {
                counter.fetch_add(1, Ordering::SeqCst);
            }
            write_http_response(&mut stream, body.as_bytes());
        }
    });
    (format!("http://127.0.0.1:{port}/ip"), hits)
}

pub(crate) fn socks5_echo(body: &'static str) -> String {
    socks5_serving(body.as_bytes().to_vec()).0
}

pub(crate) fn socks5_serving(body: Vec<u8>) -> (String, Receiver<Asked>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (asked, seen) = mpsc::channel();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let Some(target) = socks5_handshake(&mut stream) else {
                continue;
            };
            let request = read_http_request(&mut stream);
            let _ = asked.send(Asked { target, request });
            write_http_response(&mut stream, &body);
        }
    });
    (format!("127.0.0.1:{port}"), seen)
}

fn socks5_handshake(stream: &mut TcpStream) -> Option<String> {
    let mut greeting = [0u8; 2];
    stream.read_exact(&mut greeting).ok()?;
    if greeting[0] != 0x05 {
        return None;
    }
    let mut methods = vec![0u8; greeting[1] as usize];
    stream.read_exact(&mut methods).ok()?;
    stream.write_all(&[0x05, 0x00]).ok()?;

    let mut head = [0u8; 4];
    stream.read_exact(&mut head).ok()?;
    let host = match head[3] {
        0x01 => {
            let mut ip = [0u8; 4];
            stream.read_exact(&mut ip).ok()?;
            Ipv4Addr::from(ip).to_string()
        }
        0x04 => {
            let mut ip = [0u8; 16];
            stream.read_exact(&mut ip).ok()?;
            format!("[{}]", Ipv6Addr::from(ip))
        }
        _ => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len).ok()?;
            let mut name = vec![0u8; len[0] as usize];
            stream.read_exact(&mut name).ok()?;
            String::from_utf8_lossy(&name).into_owned()
        }
    };
    let mut port = [0u8; 2];
    stream.read_exact(&mut port).ok()?;
    stream
        .write_all(&[0x05, 0, 0, 0x01, 0, 0, 0, 0, 0, 0])
        .ok()?;
    Some(format!("{host}:{}", u16::from_be_bytes(port)))
}

fn read_http_request(stream: &mut TcpStream) -> String {
    let mut seen = Vec::new();
    let mut byte = [0u8; 1];
    while stream.read_exact(&mut byte).is_ok() {
        seen.push(byte[0]);
        if seen.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    String::from_utf8_lossy(&seen).into_owned()
}

fn write_http_response(stream: &mut TcpStream, body: &[u8]) {
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}
