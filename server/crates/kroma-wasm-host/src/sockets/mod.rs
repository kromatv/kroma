//! Raw sockets, for an instance whose grant holds them: TCP on wasmtime's own
//! sockets under an address check, UDP and name lookup on the host's, so that
//! every bind, connect, datagram and lookup is ruled before it happens.

mod budget;
mod datagrams;
mod held;
mod lookup;
mod tcp;
mod udp;

use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;

use wasmtime::component::{HasData, Linker, Resource, ResourceTable};
use wasmtime_wasi::p2::bindings::sockets::network::{self, ErrorCode};
use wasmtime_wasi::p2::SocketError;
use wasmtime_wasi::sockets::SocketAddrUse;

pub(crate) use held::Held;
pub(crate) use tcp::{OwnTcp, TcpView};

use crate::state::State;
use crate::{SocketProto, SocketUse};

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
    use wasmtime_wasi::p2::bindings::sockets::tcp_create_socket;
    use wasmtime_wasi::p2::bindings::sync::sockets::{ip_name_lookup, udp, udp_create_socket};
    linker.allow_shadowing(true);
    tcp_create_socket::add_to_linker::<State, OwnTcp>(linker, State::tcp_view)?;
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

#[cfg(test)]
mod tests;
