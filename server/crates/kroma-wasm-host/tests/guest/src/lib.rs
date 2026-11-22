use std::hint::black_box;
use std::net::{TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::time::{Duration, Instant};

use exports::kroma::module::route::{Guest, Request, Response};
use kroma::module::{media, net, settings};

wit_bindgen::generate!({ path: "../../../kroma-module-runtime/wit", world: "module" });

mod wasi_udp;

struct Probes;

impl Guest for Probes {
    fn tick() -> bool {
        false
    }

    fn stop() {}

    fn handle(request: Request) -> Response {
        let argument = String::from_utf8_lossy(&request.body).into_owned();
        match request.path.as_str() {
            "/ping" => answer(Ok("pong".into())),
            "/fs/read" => answer(read_file(&argument)),
            "/net/connect" => answer(connect(&argument)),
            "/net/resolve" => answer(resolve(&argument)),
            "/tcp/listen" => answer(listen(&argument)),
            "/udp/bind" => answer(bind_udp(&argument)),
            "/udp/send" => answer(send_datagram(&argument)),
            "/udp/exchange" => answer(exchange(&argument)),
            "/udp/connected" => answer(connected(&argument)),
            "/udp/options" => answer(wasi_udp::options()),
            "/udp/misuse" => answer(wasi_udp::misuse(&argument)),
            "/udp/stream-twice" => answer(wasi_udp::stream_twice()),
            "/udp/wasi-flood" => answer(wasi_udp::flood(&argument)),
            "/net/lookup-literal" => answer(wasi_udp::lookup_literal(&argument)),
            "/udp/many" => answer(many_udp(&argument)),
            "/udp/churn" => answer(churn_udp(&argument)),
            "/udp/flood" => answer(flood(&argument)),
            "/tcp/many" => answer(many_tcp(&argument)),
            "/net/resolve-many" => answer(resolve_many(&argument)),
            "/env" => answer(std::env::var(&argument).map_err(|error| format!("{error:?}"))),
            "/memory" => answer(allocate(&argument)),
            "/spin" => spin(),
            "/sleep" => answer(sleep(&argument)),
            "/fetch" => answer(fetch(&argument)),
            "/settings" => answer(settings::get(&argument).ok_or_else(|| "absent".into())),
            "/media/decode" => answer(decode(&argument)),
            "/bench/settings" => answer(read_settings_repeatedly(&argument)),
            _ => Response {
                status: 404,
                headers: Vec::new(),
                body: Vec::new(),
            },
        }
    }
}

fn answer(outcome: Result<String, String>) -> Response {
    match outcome {
        Ok(body) => Response {
            status: 200,
            headers: Vec::new(),
            body: body.into_bytes(),
        },
        Err(reason) => Response {
            status: 403,
            headers: Vec::new(),
            body: reason.into_bytes(),
        },
    }
}

fn kind(error: std::io::Error) -> String {
    format!("{:?}", error.kind())
}

fn read_file(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(kind)?;
    Ok(format!("read {} bytes", bytes.len()))
}

fn connect(address: &str) -> Result<String, String> {
    let stream = TcpStream::connect(address).map_err(kind)?;
    Ok(format!("connected from {:?}", stream.local_addr()))
}

fn resolve(host_and_port: &str) -> Result<String, String> {
    let addresses = host_and_port.to_socket_addrs().map_err(kind)?;
    Ok(format!("{:?}", addresses.collect::<Vec<_>>()))
}

fn listen(address: &str) -> Result<String, String> {
    let listener = TcpListener::bind(address).map_err(kind)?;
    Ok(format!("listening on {:?}", listener.local_addr()))
}

fn bind_udp(address: &str) -> Result<String, String> {
    let socket = UdpSocket::bind(address).map_err(kind)?;
    Ok(format!("bound to {:?}", socket.local_addr()))
}

fn ephemeral() -> Result<UdpSocket, String> {
    UdpSocket::bind("0.0.0.0:0").map_err(kind)
}

fn send_datagram(address: &str) -> Result<String, String> {
    let sent = ephemeral()?.send_to(b"ping", address).map_err(kind)?;
    Ok(format!("sent {sent} bytes"))
}

fn exchange(address: &str) -> Result<String, String> {
    let socket = ephemeral()?;
    socket.send_to(b"ping", address).map_err(kind)?;
    socket.set_nonblocking(true).map_err(kind)?;
    let deadline = Instant::now() + Duration::from_millis(1500);
    let mut reply = [0u8; 64];
    while Instant::now() < deadline {
        match socket.recv_from(&mut reply) {
            Ok((read, from)) => return Ok(format!("{} from {from}", String::from_utf8_lossy(&reply[..read]))),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => return Err(kind(error)),
        }
    }
    Err("nothing came back".to_string())
}

fn connected(address: &str) -> Result<String, String> {
    let socket = ephemeral()?;
    socket.set_ttl(4).map_err(kind)?;
    socket.connect(address).map_err(kind)?;
    socket.send(b"ping").map_err(kind)?;
    let mut reply = [0u8; 64];
    let read = socket.recv(&mut reply).map_err(kind)?;
    let ttl = socket.ttl().map_err(kind)?;
    let peer = socket.peer_addr().map_err(kind)?;
    let local = socket.local_addr().map_err(kind)?;
    Ok(format!(
        "{} from {peer} at hop limit {ttl} on port {}",
        String::from_utf8_lossy(&reply[..read]),
        u16::from(local.port() != 0)
    ))
}

fn count(text: &str) -> Result<usize, String> {
    text.parse().map_err(|_| format!("not a count: {text}"))
}

fn many_udp(limit: &str) -> Result<String, String> {
    let mut held = Vec::new();
    for _ in 0..count(limit)? {
        match ephemeral() {
            Ok(socket) => held.push(socket),
            Err(error) => return Ok(format!("opened {} then {error}", held.len())),
        }
    }
    Ok(format!("opened {}", held.len()))
}

fn churn_udp(limit: &str) -> Result<String, String> {
    let wanted = count(limit)?;
    for opened in 0..wanted {
        if let Err(error) = ephemeral() {
            return Ok(format!("opened {opened} then {error}"));
        }
    }
    Ok(format!("opened {wanted}"))
}

fn flood(address: &str) -> Result<String, String> {
    let socket = ephemeral()?;
    socket.set_nonblocking(true).map_err(kind)?;
    let sent = (0..3000)
        .filter(|_| socket.send_to(&[0u8; 16], address).is_ok())
        .count();
    Ok(sent.to_string())
}

fn many_tcp(address: &str) -> Result<String, String> {
    let mut held = Vec::new();
    for _ in 0..100 {
        match TcpStream::connect(address) {
            Ok(stream) => held.push(stream),
            Err(error) => return Ok(format!("opened {} then {:?}", held.len(), error.kind())),
        }
    }
    Ok(format!("opened {}", held.len()))
}

fn resolve_many(argument: &str) -> Result<String, String> {
    let (names, address) = argument.split_once(' ').ok_or("names and an address")?;
    for n in 0..count(names)? {
        (format!("n{n}.example.test"), 0).to_socket_addrs().map_err(kind)?;
    }
    send_datagram(address)
}

fn sleep(millis: &str) -> Result<String, String> {
    let millis: u64 = millis.parse().map_err(|_| format!("not a number: {millis}"))?;
    std::thread::sleep(std::time::Duration::from_millis(millis));
    Ok("awake".to_string())
}

fn allocate(size: &str) -> Result<String, String> {
    let bytes: usize = size.parse().map_err(|_| format!("not a size: {size}"))?;
    let block = vec![1u8; bytes];
    Ok(format!("allocated {}", black_box(&block).len()))
}

fn spin() -> ! {
    loop {
        std::hint::spin_loop();
    }
}

fn fetch(purpose: &str) -> Result<String, String> {
    let response = net::fetch(&net::FetchRequest {
        purpose: purpose.to_string(),
        method: "GET".to_string(),
        url: "https://api.example.test/v1".to_string(),
        headers: Vec::new(),
        body: Vec::new(),
        max_time_secs: 30,
        max_bytes: None,
        max_redirects: None,
        follow_redirects: true,
        public_only: false,
        https_only: false,
        sealed: false,
        http2: false,
        digest: None,
    })?;
    Ok(String::from_utf8_lossy(&response.body).into_owned())
}

fn decode(source: &str) -> Result<String, String> {
    let bytes = media::decode_audio(&media::AudioDecode {
        source: source.to_string(),
        track: 2,
        sample_rate: 16_000,
        channels: 1,
        format: media::SampleFormat::S16le,
        destination: "/tmp/pcm".to_string(),
    })?;
    Ok(format!("decoded {bytes} bytes"))
}

fn read_settings_repeatedly(count: &str) -> Result<String, String> {
    let count: u32 = count.parse().map_err(|_| format!("not a count: {count}"))?;
    let answered = (0..count)
        .filter(|_| black_box(settings::get(black_box("bench.key"))).is_some())
        .count();
    Ok(answered.to_string())
}

export!(Probes);
