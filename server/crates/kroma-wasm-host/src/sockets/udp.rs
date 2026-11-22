use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;

use socket2::{Domain, Protocol, SockRef, Socket, Type};
use wasmtime::component::Resource;
use wasmtime_wasi::p2::bindings::sockets::network::{ErrorCode, Network};
use wasmtime_wasi::p2::bindings::sync::sockets::udp::{
    self, HostUdpSocket, IncomingDatagramStream, IpAddressFamily, IpSocketAddress, OutgoingDatagramStream,
    UdpSocket,
};
use wasmtime_wasi::p2::bindings::sync::sockets::udp_create_socket;
use wasmtime_wasi::p2::{subscribe, DynPollable, Pollable, SocketError, SocketResult};
use wasmtime_wasi::runtime::with_ambient_tokio_runtime;

use super::datagrams::{Incoming, Outgoing};
use super::{as_ours, discard, is_ephemeral, owned, Held, SocketsView};
use crate::{SocketProto, SocketUse};

pub(super) struct Datagrams {
    family: IpAddressFamily,
    unbound: Option<Socket>,
    bound: Option<Arc<tokio::net::UdpSocket>>,
    remote: Option<SocketAddr>,
    binding: bool,
    held: Arc<Held>,
}

impl Datagrams {
    fn new(family: IpAddressFamily, held: Arc<Held>) -> std::io::Result<Self> {
        let (domain, v6) = match family {
            IpAddressFamily::Ipv4 => (Domain::IPV4, false),
            IpAddressFamily::Ipv6 => (Domain::IPV6, true),
        };
        let socket = Socket::new(domain, Type::DGRAM, Some(Protocol::UDP))?;
        if v6 {
            socket.set_only_v6(true)?;
        } else {
            socket.set_broadcast(true)?;
        }
        socket.set_nonblocking(true)?;
        Ok(Self {
            family,
            unbound: Some(socket),
            bound: None,
            remote: None,
            binding: false,
            held,
        })
    }

    fn of_family(&self, address: SocketAddr) -> bool {
        matches!(
            (self.family, address),
            (IpAddressFamily::Ipv4, SocketAddr::V4(_)) | (IpAddressFamily::Ipv6, SocketAddr::V6(_))
        )
    }

    fn unspecified(&self) -> SocketAddr {
        match self.family {
            IpAddressFamily::Ipv4 => (Ipv4Addr::UNSPECIFIED, 0).into(),
            IpAddressFamily::Ipv6 => (Ipv6Addr::UNSPECIFIED, 0).into(),
        }
    }

    fn bind(&mut self, local: SocketAddr) -> SocketResult<()> {
        if self.bound.is_some() {
            return Err(ErrorCode::InvalidState.into());
        }
        if !self.of_family(local) {
            return Err(ErrorCode::InvalidArgument.into());
        }
        if !is_ephemeral(local) {
            return Err(ErrorCode::AccessDenied.into());
        }
        self.unbound.as_ref().ok_or(ErrorCode::InvalidState)?.bind(&local.into())?;
        let socket = self.unbound.take().ok_or(ErrorCode::InvalidState)?;
        let socket = with_ambient_tokio_runtime(|| tokio::net::UdpSocket::from_std(socket.into()))?;
        self.bound = Some(Arc::new(socket));
        Ok(())
    }

    fn bound_or_bind(&mut self) -> SocketResult<Arc<tokio::net::UdpSocket>> {
        if self.bound.is_none() {
            self.bind(self.unspecified())?;
        }
        self.bound.clone().ok_or_else(|| ErrorCode::InvalidState.into())
    }

    fn options(&self) -> SocketResult<SockRef<'_>> {
        match (&self.unbound, &self.bound) {
            (Some(socket), _) => Ok(SockRef::from(socket)),
            (None, Some(socket)) => Ok(SockRef::from(socket.as_ref())),
            (None, None) => Err(ErrorCode::InvalidState.into()),
        }
    }

    fn peer(&self, remote: Option<IpSocketAddress>) -> SocketResult<Option<SocketAddr>> {
        let Some(remote) = remote.map(SocketAddr::from) else {
            return Ok(None);
        };
        if !self.of_family(remote) || remote.ip().is_unspecified() || remote.port() == 0 {
            return Err(ErrorCode::InvalidArgument.into());
        }
        let both_ways = self.held.allows(SocketProto::Udp, SocketUse::Send, remote)
            && self.held.allows(SocketProto::Udp, SocketUse::Receive, remote);
        if !both_ways {
            return Err(ErrorCode::AccessDenied.into());
        }
        Ok(Some(remote))
    }
}

#[wasmtime_wasi::async_trait]
impl Pollable for Datagrams {
    async fn ready(&mut self) {}
}

impl SocketsView<'_> {
    fn datagrams(&mut self, handle: &Resource<UdpSocket>) -> SocketResult<&mut Datagrams> {
        Ok(self.table.get_mut(&as_ours::<_, Datagrams>(handle))?)
    }
}

impl udp_create_socket::Host for SocketsView<'_> {
    fn create_udp_socket(&mut self, family: IpAddressFamily) -> SocketResult<Resource<UdpSocket>> {
        let held = self
            .held
            .filter(|held| held.udp())
            .ok_or(ErrorCode::AccessDenied)?;
        let socket = Datagrams::new(family, Arc::clone(held))?;
        let socket = self.table.push(socket)?;
        Ok(owned(&socket))
    }
}

impl udp::Host for SocketsView<'_> {}

impl HostUdpSocket for SocketsView<'_> {
    fn start_bind(
        &mut self,
        this: Resource<UdpSocket>,
        network: Resource<Network>,
        local: IpSocketAddress,
    ) -> SocketResult<()> {
        self.table.get(&network)?;
        let socket = self.datagrams(&this)?;
        socket.bind(SocketAddr::from(local))?;
        socket.binding = true;
        Ok(())
    }

    fn finish_bind(&mut self, this: Resource<UdpSocket>) -> SocketResult<()> {
        let socket = self.datagrams(&this)?;
        if !std::mem::take(&mut socket.binding) {
            return Err(ErrorCode::NotInProgress.into());
        }
        Ok(())
    }

    fn stream(
        &mut self,
        this: Resource<UdpSocket>,
        remote: Option<IpSocketAddress>,
    ) -> SocketResult<(Resource<IncomingDatagramStream>, Resource<OutgoingDatagramStream>)> {
        let parent = as_ours::<_, Datagrams>(&this);
        let streaming = self
            .table
            .iter_children(&parent)?
            .any(|child| child.is::<Incoming>() || child.is::<Outgoing>());
        if streaming {
            return Err(SocketError::trap(wasmtime::format_err!("UDP streams not dropped yet")));
        }
        let socket = self.datagrams(&this)?;
        let remote = socket.peer(remote)?;
        let bound = socket.bound_or_bind()?;
        socket.remote = remote;
        let held = Arc::clone(&socket.held);
        let incoming = Incoming::new(Arc::clone(&bound), remote, Arc::clone(&held));
        let incoming = self.table.push_child(incoming, &parent)?;
        let outgoing = self.table.push_child(Outgoing::new(bound, remote, held), &parent)?;
        Ok((owned(&incoming), owned(&outgoing)))
    }

    fn local_address(&mut self, this: Resource<UdpSocket>) -> SocketResult<IpSocketAddress> {
        let socket = self.datagrams(&this)?;
        let bound = socket.bound.as_ref().ok_or(ErrorCode::InvalidState)?;
        Ok(bound.local_addr()?.into())
    }

    fn remote_address(&mut self, this: Resource<UdpSocket>) -> SocketResult<IpSocketAddress> {
        let remote = self.datagrams(&this)?.remote.ok_or(ErrorCode::InvalidState)?;
        Ok(remote.into())
    }

    fn address_family(&mut self, this: Resource<UdpSocket>) -> wasmtime::Result<IpAddressFamily> {
        Ok(self.table.get(&as_ours::<_, Datagrams>(&this))?.family)
    }

    fn unicast_hop_limit(&mut self, this: Resource<UdpSocket>) -> SocketResult<u8> {
        let socket = self.datagrams(&this)?;
        let hops = match socket.family {
            IpAddressFamily::Ipv4 => socket.options()?.ttl_v4()?,
            IpAddressFamily::Ipv6 => socket.options()?.unicast_hops_v6()?,
        };
        Ok(u8::try_from(hops).unwrap_or(u8::MAX))
    }

    fn set_unicast_hop_limit(&mut self, this: Resource<UdpSocket>, value: u8) -> SocketResult<()> {
        if value == 0 {
            return Err(ErrorCode::InvalidArgument.into());
        }
        let socket = self.datagrams(&this)?;
        match socket.family {
            IpAddressFamily::Ipv4 => socket.options()?.set_ttl_v4(value.into())?,
            IpAddressFamily::Ipv6 => socket.options()?.set_unicast_hops_v6(value.into())?,
        }
        Ok(())
    }

    fn receive_buffer_size(&mut self, this: Resource<UdpSocket>) -> SocketResult<u64> {
        Ok(widened(self.datagrams(&this)?.options()?.recv_buffer_size()?))
    }

    fn set_receive_buffer_size(&mut self, this: Resource<UdpSocket>, value: u64) -> SocketResult<()> {
        let size = buffer_size(value)?;
        Ok(self.datagrams(&this)?.options()?.set_recv_buffer_size(size)?)
    }

    fn send_buffer_size(&mut self, this: Resource<UdpSocket>) -> SocketResult<u64> {
        Ok(widened(self.datagrams(&this)?.options()?.send_buffer_size()?))
    }

    fn set_send_buffer_size(&mut self, this: Resource<UdpSocket>, value: u64) -> SocketResult<()> {
        let size = buffer_size(value)?;
        Ok(self.datagrams(&this)?.options()?.set_send_buffer_size(size)?)
    }

    fn subscribe(&mut self, this: Resource<UdpSocket>) -> wasmtime::Result<Resource<DynPollable>> {
        subscribe(self.table, as_ours::<_, Datagrams>(&this))
    }

    fn drop(&mut self, this: Resource<UdpSocket>) -> wasmtime::Result<()> {
        discard::<Datagrams, _>(self.table, &this)
    }
}

fn widened(size: usize) -> u64 {
    u64::try_from(size).unwrap_or(u64::MAX)
}

fn buffer_size(value: u64) -> SocketResult<usize> {
    if value == 0 {
        return Err(ErrorCode::InvalidArgument.into());
    }
    Ok(usize::try_from(value).unwrap_or(usize::MAX))
}
