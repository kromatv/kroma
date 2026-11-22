use std::hint::black_box;
use std::net::{TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::time::{Duration, Instant};

use exports::kroma::module::route::{Guest, Request, Response};
use kroma::module::{media, net, settings};

wit_bindgen::generate!({ path: "../../../kroma-module-runtime/wit", world: "module" });

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
            "/udp/options" => answer(udp_options()),
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

fn udp_options() -> Result<String, String> {
    use wasip2::sockets::instance_network::instance_network;
    use wasip2::sockets::network::{IpAddressFamily, IpSocketAddress, Ipv4SocketAddress};
    use wasip2::sockets::udp_create_socket::create_udp_socket;

    let failed = |error: wasip2::sockets::network::ErrorCode| error.name().to_string();
    let named = |error: Option<wasip2::sockets::network::ErrorCode>| error.map_or("none", |error| error.name());
    let socket = create_udp_socket(IpAddressFamily::Ipv6).map_err(failed)?;
    let v4 = IpSocketAddress::Ipv4(Ipv4SocketAddress { port: 0, address: (0, 0, 0, 0) });
    let wrong_family = named(socket.start_bind(&instance_network(), v4).err());
    let zero_buffer = named(socket.set_receive_buffer_size(0).err());
    let zero_hops = named(socket.set_unicast_hop_limit(0).err());
    socket.set_receive_buffer_size(65_536).map_err(failed)?;
    socket.set_send_buffer_size(65_536).map_err(failed)?;
    socket.set_unicast_hop_limit(8).map_err(failed)?;
    let buffers = socket.receive_buffer_size().map_err(failed)? > 0 && socket.send_buffer_size().map_err(failed)? > 0;
    let unbound = named(socket.local_address().err());
    let streams = socket.stream(None).map_err(failed)?;
    let bound = matches!(socket.local_address().map_err(failed)?, IpSocketAddress::Ipv6(_));
    let unconnected = named(socket.remote_address().err());
    drop(streams);
    let finished = named(socket.finish_bind().err());
    Ok(format!(
        "{wrong_family} {zero_buffer} {zero_hops} hops {} buffers {buffers} {:?} {unbound} bound {bound} {unconnected} {finished}",
        socket.unicast_hop_limit().map_err(failed)?,
        socket.address_family(),
    ))
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
