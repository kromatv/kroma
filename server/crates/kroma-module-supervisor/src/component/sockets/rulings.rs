use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, Instant};

use kroma_wasm_host::{SocketCall, SocketProto, SocketUse};

const RULED_FOR: Duration = Duration::from_secs(10);
const RULINGS_KEPT: usize = 512;
const REFUSED_PORTS_PER_ADDRESS: usize = 8;

type Key = (SocketProto, SocketUse, IpAddr, u16, u64);

fn key(call: &SocketCall<'_>) -> Key {
    (
        call.proto,
        call.using,
        call.address.ip().to_canonical(),
        call.address.port(),
        call.generation,
    )
}

fn fresh(at: Instant) -> bool {
    at.elapsed() < RULED_FOR
}

#[derive(Default)]
pub(super) struct Rulings {
    kept: HashMap<Key, (Option<String>, Instant)>,
    refused_ports: HashMap<IpAddr, (usize, Instant)>,
}

impl Rulings {
    pub(super) fn remembered(&self, call: &SocketCall<'_>) -> Option<Option<String>> {
        if let Some((purpose, _)) = self.kept.get(&key(call)).filter(|(_, at)| fresh(*at)) {
            return Some(purpose.clone());
        }
        let ip = call.address.ip().to_canonical();
        let flooded = self
            .refused_ports
            .get(&ip)
            .is_some_and(|(count, at)| *count >= REFUSED_PORTS_PER_ADDRESS && fresh(*at));
        (call.using == SocketUse::Receive && flooded).then_some(None)
    }

    pub(super) fn remember(&mut self, call: &SocketCall<'_>, purpose: Option<String>) {
        if self.kept.len() >= RULINGS_KEPT {
            self.kept.retain(|_, (_, at)| fresh(*at));
        }
        if self.kept.len() >= RULINGS_KEPT {
            self.kept.clear();
        }
        if purpose.is_none() && call.using == SocketUse::Receive {
            self.refused_port(call.address);
        }
        self.kept.insert(key(call), (purpose, Instant::now()));
    }

    fn refused_port(&mut self, address: SocketAddr) {
        if self.refused_ports.len() >= RULINGS_KEPT {
            self.refused_ports.clear();
        }
        let counted = self
            .refused_ports
            .entry(address.ip().to_canonical())
            .or_insert((0, Instant::now()));
        if !fresh(counted.1) {
            *counted = (0, Instant::now());
        }
        counted.0 += 1;
    }
}

#[cfg(test)]
impl Rulings {
    pub(super) fn kept(&self) -> usize {
        self.kept.len()
    }
}
