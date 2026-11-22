use std::sync::Arc;

use wasmtime::component::{HasData, Resource};
use wasmtime_wasi::p2::bindings::sockets::network::{self, ErrorCode, IpAddressFamily};
use wasmtime_wasi::p2::bindings::sockets::tcp_create_socket;
use wasmtime_wasi::p2::{SocketError, SocketResult, TcpSocket};
use wasmtime_wasi::sockets::WasiSocketsCtxView;

use super::Held;

pub(crate) struct OwnTcp;

impl HasData for OwnTcp {
    type Data<'a> = TcpView<'a>;
}

pub(crate) struct TcpView<'a> {
    pub(crate) stock: WasiSocketsCtxView<'a>,
    pub(crate) held: Option<&'a Arc<Held>>,
}

impl tcp_create_socket::Host for TcpView<'_> {
    fn create_tcp_socket(&mut self, family: IpAddressFamily) -> SocketResult<Resource<TcpSocket>> {
        let Some(held) = self.held else {
            return tcp_create_socket::Host::create_tcp_socket(&mut self.stock, family);
        };
        if !held.has_room(self.stock.table) {
            return Err(ErrorCode::NewSocketLimit.into());
        }
        let socket = tcp_create_socket::Host::create_tcp_socket(&mut self.stock, family)?;
        held.opened_tcp(socket.rep());
        Ok(socket)
    }
}

impl network::Host for TcpView<'_> {
    fn convert_error_code(&mut self, error: SocketError) -> wasmtime::Result<ErrorCode> {
        network::Host::convert_error_code(&mut self.stock, error)
    }

    fn network_error_code(&mut self, error: Resource<wasmtime::Error>) -> wasmtime::Result<Option<ErrorCode>> {
        network::Host::network_error_code(&mut self.stock, error)
    }
}

impl network::HostNetwork for TcpView<'_> {
    fn drop(&mut self, this: Resource<network::Network>) -> wasmtime::Result<()> {
        network::HostNetwork::drop(&mut self.stock, this)
    }
}
