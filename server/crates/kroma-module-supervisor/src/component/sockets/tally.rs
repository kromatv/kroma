use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use kroma_module_host::{NetworkFlow, NetworkRoute};
use kroma_wasm_host::SocketUse;

const FILED_EVERY: Duration = Duration::from_secs(10);
const PEERS_TALLIED: usize = 512;

struct Tally {
    purpose: String,
    host: String,
    out: u64,
    inbound: u64,
    filed: Option<Instant>,
}

impl Tally {
    fn flow(&mut self, peer: SocketAddr) -> NetworkFlow {
        let flow = NetworkFlow {
            purpose: self.purpose.clone(),
            method: "UDP".to_string(),
            host: self.host.clone(),
            port: peer.port(),
            route: NetworkRoute::Direct,
            status: None,
            bytes_in: self.inbound,
            bytes_out: self.out,
            duration_ms: 0,
            error: None,
            rule: None,
            carried: false,
        };
        (self.out, self.inbound, self.filed) = (0, 0, Some(Instant::now()));
        flow
    }

    fn due(&self) -> bool {
        self.filed.is_none_or(|at| at.elapsed() >= FILED_EVERY)
    }
}

pub(super) struct Carried<'a> {
    pub(super) peer: SocketAddr,
    pub(super) using: SocketUse,
    pub(super) bytes: u64,
    pub(super) purpose: &'a str,
    pub(super) host: &'a str,
}

#[derive(Default)]
pub(super) struct Tallies {
    peers: HashMap<SocketAddr, Tally>,
}

impl Tallies {
    pub(super) fn count(&mut self, carried: &Carried<'_>) -> Vec<NetworkFlow> {
        let mut filed = Vec::new();
        if self.peers.len() >= PEERS_TALLIED && !self.peers.contains_key(&carried.peer) {
            filed = self.drain();
        }
        let tally = self.peers.entry(carried.peer).or_insert_with(|| Tally {
            purpose: carried.purpose.to_string(),
            host: carried.host.to_string(),
            out: 0,
            inbound: 0,
            filed: None,
        });
        match carried.using {
            SocketUse::Receive => tally.inbound += carried.bytes,
            SocketUse::Connect | SocketUse::Send => tally.out += carried.bytes,
        }
        if tally.due() {
            filed.push(tally.flow(carried.peer));
        }
        filed
    }

    pub(super) fn drain(&mut self) -> Vec<NetworkFlow> {
        self.peers
            .drain()
            .filter(|(_, tally)| tally.out > 0 || tally.inbound > 0)
            .map(|(peer, mut tally)| tally.flow(peer))
            .collect()
    }
}
