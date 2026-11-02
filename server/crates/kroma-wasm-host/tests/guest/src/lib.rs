use std::hint::black_box;
use std::net::{TcpStream, ToSocketAddrs};

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
