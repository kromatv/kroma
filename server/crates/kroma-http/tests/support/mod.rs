//! A one-request HTTP server on loopback, for the tests that drive real curl.

pub fn read_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
    use std::io::Read;
    let mut head = Vec::new();
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).unwrap_or(0) == 0 {
            break;
        }
        head.push(byte[0]);
    }
    let length = String::from_utf8_lossy(&head)
        .lines()
        .find_map(|l| {
            l.split_once(':')
                .filter(|(k, _)| k.eq_ignore_ascii_case("content-length"))
        })
        .and_then(|(_, v)| v.trim().parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0u8; length];
    if length > 0 {
        stream.read_exact(&mut body).unwrap();
    }
    head.extend_from_slice(&body);
    head
}

pub fn text(request: &[u8]) -> String {
    String::from_utf8_lossy(request).into_owned()
}

pub fn one_shot_server(
    status_line: &str,
    body: &str,
) -> (String, std::thread::JoinHandle<Vec<u8>>) {
    use std::io::Write;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    let response = format!(
        "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
        body.len()
    );
    let handle = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream);
        stream.write_all(response.as_bytes()).unwrap();
        request
    });
    (url, handle)
}
