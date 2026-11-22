use std::collections::{HashMap, VecDeque};
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use wasmtime::component::{Resource, ResourceTable};
use wasmtime_wasi::p2::TcpSocket;

use super::budget::Budget;
use crate::{SocketCall, SocketGrant, SocketProto, SocketUse};

const NAMES_PER_ADDRESS: usize = 8;
const ADDRESSES_NAMED: usize = 1024;
const SOCKETS_AT_ONCE: usize = 64;

static GENERATIONS: AtomicU64 = AtomicU64::new(1);

type At = (SocketProto, SocketUse, SocketAddr);

#[derive(Default)]
struct Named {
    names: VecDeque<String>,
    generation: u64,
}

pub(crate) struct Held {
    grant: SocketGrant,
    names: Mutex<HashMap<IpAddr, Named>>,
    udp_open: AtomicUsize,
    tcp_open: Mutex<Vec<u32>>,
    budget: Mutex<Budget>,
}

impl Held {
    pub(crate) fn new(grant: SocketGrant) -> Arc<Self> {
        Arc::new(Self {
            grant,
            names: Mutex::new(HashMap::new()),
            udp_open: AtomicUsize::new(0),
            tcp_open: Mutex::new(Vec::new()),
            budget: Mutex::new(Budget::full()),
        })
    }

    pub(crate) fn tcp(&self) -> bool {
        self.grant.tcp
    }

    pub(super) fn udp(&self) -> bool {
        self.grant.udp
    }

    fn named(&self, ip: IpAddr) -> (Vec<String>, u64) {
        let names = self.names.lock().unwrap_or_else(PoisonError::into_inner);
        names
            .get(&ip.to_canonical())
            .map(|named| (named.names.iter().cloned().collect(), named.generation))
            .unwrap_or_default()
    }

    fn call<T>(&self, (proto, using, address): At, then: impl FnOnce(&SocketCall<'_>) -> T) -> T {
        let (names, generation) = self.named(address.ip());
        then(&SocketCall {
            proto,
            using,
            address,
            names: &names,
            generation,
        })
    }

    pub(super) fn allows(&self, proto: SocketProto, using: SocketUse, address: SocketAddr) -> bool {
        self.call((proto, using, address), |call| self.grant.rules.allows(call))
    }

    pub(super) fn carried(&self, using: SocketUse, address: SocketAddr, bytes: usize) {
        let bytes = u64::try_from(bytes).unwrap_or(u64::MAX);
        self.call((SocketProto::Udp, using, address), |call| {
            self.grant.rules.carried(call, bytes);
        });
    }

    pub(super) fn resolve(&self, name: &str) -> Option<Vec<IpAddr>> {
        let addresses = self.grant.rules.resolve(name)?;
        self.remember(name, &addresses);
        Some(addresses)
    }

    fn remember(&self, name: &str, addresses: &[IpAddr]) {
        let mut names = self.names.lock().unwrap_or_else(PoisonError::into_inner);
        if names.len() >= ADDRESSES_NAMED {
            names.clear();
        }
        for ip in addresses {
            let named = names.entry(ip.to_canonical()).or_default();
            named.names.retain(|kept| kept != name);
            named.names.push_back(name.to_string());
            if named.names.len() > NAMES_PER_ADDRESS {
                named.names.pop_front();
            }
            named.generation = GENERATIONS.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn live_tcp(&self, table: &ResourceTable) -> usize {
        let mut open = self.tcp_open.lock().unwrap_or_else(PoisonError::into_inner);
        open.retain(|rep| table.get(&Resource::<TcpSocket>::new_borrow(*rep)).is_ok());
        open.len()
    }

    pub(super) fn has_room(&self, table: &ResourceTable) -> bool {
        self.udp_open.load(Ordering::Relaxed) + self.live_tcp(table) < SOCKETS_AT_ONCE
    }

    pub(super) fn opened_udp(&self) {
        self.udp_open.fetch_add(1, Ordering::Relaxed);
    }

    pub(super) fn closed_udp(&self) {
        self.udp_open.fetch_sub(1, Ordering::Relaxed);
    }

    pub(super) fn opened_tcp(&self, rep: u32) {
        self.tcp_open.lock().unwrap_or_else(PoisonError::into_inner).push(rep);
    }

    pub(super) fn spend(&self, bytes: usize) -> bool {
        self.budget.lock().unwrap_or_else(PoisonError::into_inner).take(bytes)
    }

    pub(super) fn spent(&self) -> bool {
        self.budget.lock().unwrap_or_else(PoisonError::into_inner).spent()
    }

    pub(super) fn budget_wait(&self) -> Duration {
        self.budget.lock().unwrap_or_else(PoisonError::into_inner).wait()
    }
}

#[cfg(test)]
mod tests;
