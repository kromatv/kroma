//! Raw sockets, for an instance whose grant holds them: TCP on wasmtime's own
//! sockets under an address check, UDP and name lookup on the host's, so that
//! every bind, connect, datagram and lookup is ruled before it happens.

mod datagrams;
mod lookup;
mod udp;

use std::collections::HashMap;
use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::pin::Pin;
use std::sync::{Arc, Mutex, PoisonError};

use wasmtime::component::{HasData, Linker, Resource, ResourceTable};
use wasmtime_wasi::p2::bindings::sockets::network::{self, ErrorCode};
use wasmtime_wasi::p2::SocketError;
use wasmtime_wasi::sockets::SocketAddrUse;

use crate::state::State;
use crate::{SocketCall, SocketGrant, SocketProto, SocketUse};

const NAMES_KEPT: usize = 1024;

pub(crate) struct Held {
    grant: SocketGrant,
    names: Mutex<HashMap<IpAddr, Vec<String>>>,
}

impl Held {
    pub(crate) fn new(grant: SocketGrant) -> Arc<Self> {
        Arc::new(Self {
            grant,
            names: Mutex::new(HashMap::new()),
        })
    }

    pub(crate) fn tcp(&self) -> bool {
        self.grant.tcp
    }

    fn udp(&self) -> bool {
        self.grant.udp
    }

    fn allows(&self, proto: SocketProto, using: SocketUse, address: SocketAddr) -> bool {
        let names = self.names_of(address.ip());
        self.grant.rules.allows(&SocketCall {
            proto,
            using,
            address,
            names: &names,
        })
    }

    fn names_of(&self, ip: IpAddr) -> Vec<String> {
        let names = self.names.lock().unwrap_or_else(PoisonError::into_inner);
        names.get(&ip.to_canonical()).cloned().unwrap_or_default()
    }

    fn may_resolve(&self, name: &str) -> bool {
        self.grant.rules.may_resolve(name)
    }

    fn remember(&self, name: &str, addresses: &[IpAddr]) {
        let mut names = self.names.lock().unwrap_or_else(PoisonError::into_inner);
        if names.len() >= NAMES_KEPT {
            names.clear();
        }
        for ip in addresses {
            let known = names.entry(ip.to_canonical()).or_default();
            if !known.iter().any(|kept| kept == name) {
                known.push(name.to_string());
            }
        }
    }
}

type Check = Pin<Box<dyn Future<Output = bool> + Send + Sync>>;

pub(crate) fn tcp_check(
    held: Option<Arc<Held>>,
) -> impl Fn(SocketAddr, SocketAddrUse) -> Check + Send + Sync + 'static {
    move |address, using| {
        let allowed = match (&held, using) {
            (Some(held), SocketAddrUse::TcpConnect) => {
                held.allows(SocketProto::Tcp, SocketUse::Connect, address)
            }
            (Some(_), SocketAddrUse::TcpBind) => is_ephemeral(address),
            _ => false,
        };
        Box::pin(async move { allowed })
    }
}

fn is_ephemeral(address: SocketAddr) -> bool {
    address.ip().is_unspecified() && address.port() == 0
}

pub(crate) fn link(linker: &mut Linker<State>) -> wasmtime::Result<()> {
    use wasmtime_wasi::p2::bindings::sync::sockets::{ip_name_lookup, udp, udp_create_socket};
    linker.allow_shadowing(true);
    udp::add_to_linker::<State, OwnSockets>(linker, State::sockets_view)?;
    udp_create_socket::add_to_linker::<State, OwnSockets>(linker, State::sockets_view)?;
    ip_name_lookup::add_to_linker::<State, OwnSockets>(linker, State::sockets_view)?;
    linker.allow_shadowing(false);
    Ok(())
}

pub(crate) struct OwnSockets;

impl HasData for OwnSockets {
    type Data<'a> = SocketsView<'a>;
}

pub(crate) struct SocketsView<'a> {
    pub(crate) table: &'a mut ResourceTable,
    pub(crate) held: Option<&'a Arc<Held>>,
}

impl network::Host for SocketsView<'_> {
    fn convert_error_code(&mut self, error: SocketError) -> wasmtime::Result<ErrorCode> {
        error.downcast()
    }

    fn network_error_code(&mut self, error: Resource<wasmtime::Error>) -> wasmtime::Result<Option<ErrorCode>> {
        let error = self.table.get(&error)?;
        Ok(error.downcast_ref::<std::io::Error>().map(ErrorCode::from))
    }
}

impl network::HostNetwork for SocketsView<'_> {
    fn drop(&mut self, this: Resource<network::Network>) -> wasmtime::Result<()> {
        self.table.delete(this)?;
        Ok(())
    }
}

fn discard<T: 'static, U: 'static>(table: &mut ResourceTable, handle: &Resource<U>) -> wasmtime::Result<()> {
    table.delete(owned::<U, T>(handle))?;
    Ok(())
}

fn as_ours<T: 'static, U: 'static>(handle: &Resource<T>) -> Resource<U> {
    Resource::new_borrow(handle.rep())
}

fn owned<T: 'static, U: 'static>(handle: &Resource<T>) -> Resource<U> {
    Resource::new_own(handle.rep())
}
