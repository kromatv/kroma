use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, UdpSocket};
use std::sync::{Arc, Mutex};

use kroma_wasm_host::{ModuleInstance, SocketCall, SocketGrant, SocketUse, Sockets};

use super::with_sockets;

pub const BROADCAST: &str = "255.255.255.255:9";

pub type Seen = (SocketUse, SocketAddr, Vec<String>);

#[derive(Default)]
pub struct Rules {
    pub reachable: Vec<SocketAddr>,
    pub heard: Vec<SocketAddr>,
    pub names: Vec<String>,
    pub any_name: bool,
    pub seen: Mutex<Vec<Seen>>,
    pub generations: Mutex<Vec<u64>>,
    pub carried: Mutex<Vec<(SocketUse, u64)>>,
}

impl Rules {
    pub fn reaching(addresses: &[SocketAddr]) -> Self {
        Self {
            reachable: addresses.to_vec(),
            heard: addresses.to_vec(),
            ..Self::default()
        }
    }
}

impl Rules {
    pub fn saw(&self, using: SocketUse, address: &str) -> bool {
        let address: SocketAddr = address.parse().unwrap();
        self.seen
            .lock()
            .unwrap()
            .iter()
            .any(|(seen, at, _)| *seen == using && *at == address)
    }
}

impl Sockets for Rules {
    fn allows(&self, call: &SocketCall<'_>) -> bool {
        self.seen
            .lock()
            .unwrap()
            .push((call.using, call.address, call.names.to_vec()));
        self.generations.lock().unwrap().push(call.generation);
        match call.using {
            SocketUse::Receive => self.heard.contains(&call.address),
            SocketUse::Connect | SocketUse::Send => self.reachable.contains(&call.address),
        }
    }

    fn resolve(&self, name: &str) -> Option<Vec<IpAddr>> {
        let named = self.any_name || self.names.iter().any(|allowed| allowed == name);
        named.then(|| vec![IpAddr::V4(Ipv4Addr::LOCALHOST)])
    }

    fn carried(&self, call: &SocketCall<'_>, bytes: u64) {
        self.carried.lock().unwrap().push((call.using, bytes));
    }
}

pub fn granted(tcp: bool, udp: bool, rules: Rules) -> (ModuleInstance, Arc<Rules>) {
    let rules = Arc::new(rules);
    let instance = with_sockets(SocketGrant {
        tcp,
        udp,
        rules: rules.clone(),
    });
    (instance, rules)
}

pub fn udp(rules: Rules) -> (ModuleInstance, Arc<Rules>) {
    granted(false, true, rules)
}

pub fn tcp(rules: Rules) -> (ModuleInstance, Arc<Rules>) {
    granted(true, false, rules)
}

#[expect(
    clippy::disallowed_methods,
    reason = "the test's own peer, answering the component on loopback"
)]
pub fn echo() -> SocketAddr {
    let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    std::thread::spawn(move || {
        let mut datagram = [0u8; 64];
        if let Ok((_, from)) = socket.recv_from(&mut datagram) {
            let _ = socket.send_to(b"pong", from);
        }
    });
    address
}

pub fn listening() -> (TcpListener, SocketAddr) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    (listener, address)
}

