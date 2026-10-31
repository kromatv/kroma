use std::hint::black_box;
use std::net::{TcpStream, ToSocketAddrs};

use exports::kroma::module::route::{Guest, Request, Response};
use kroma::module::{net, settings};

wit_bindgen::generate!({ path: "../../wit", world: "module" });

struct Probes;

impl Guest for Probes {
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
            "/fetch" => answer(fetch(&argument)),
            "/settings" => answer(settings::get(&argument).ok_or_else(|| "absent".into())),
            "/bench/settings" => answer(read_settings_repeatedly(&argument)),
            _ => Response {
                status: 404,
                body: Vec::new(),
            },
        }
    }
}

fn answer(outcome: Result<String, String>) -> Response {
    match outcome {
        Ok(body) => Response {
            status: 200,
            body: body.into_bytes(),
        },
        Err(reason) => Response {
            status: 403,
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
    let response = net::fetch(purpose, "GET", "https://api.example.test/v1", &[])?;
    Ok(String::from_utf8_lossy(&response.body).into_owned())
}

fn read_settings_repeatedly(count: &str) -> Result<String, String> {
    let count: u32 = count.parse().map_err(|_| format!("not a count: {count}"))?;
    let answered = (0..count)
        .filter(|_| black_box(settings::get(black_box("bench.key"))).is_some())
        .count();
    Ok(answered.to_string())
}

export!(Probes);
