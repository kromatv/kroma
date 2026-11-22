use std::io::ErrorKind;
use std::net::SocketAddr;
use std::sync::Arc;
use std::task::{Context, Poll, Waker};

use tokio::net::UdpSocket;
use wasmtime::component::Resource;
use wasmtime_wasi::p2::bindings::sockets::network::ErrorCode;
use wasmtime_wasi::p2::bindings::sync::sockets::udp::{
    HostIncomingDatagramStream, HostOutgoingDatagramStream, IncomingDatagram, IncomingDatagramStream,
    OutgoingDatagram, OutgoingDatagramStream,
};
use wasmtime_wasi::p2::{subscribe, DynPollable, Pollable, SocketError, SocketResult};

use super::{as_ours, discard, Held, SocketsView};
use crate::{SocketProto, SocketUse};

const LARGEST_DATAGRAM: usize = u16::MAX as usize;
const DATAGRAMS_AT_ONCE: u64 = 16;
const READS_PER_CALL: usize = 64;

pub(super) struct Incoming {
    socket: Arc<UdpSocket>,
    remote: Option<SocketAddr>,
    held: Arc<Held>,
}

impl Incoming {
    pub(super) fn new(socket: Arc<UdpSocket>, remote: Option<SocketAddr>, held: Arc<Held>) -> Self {
        Self { socket, remote, held }
    }

    fn admits(&self, from: SocketAddr) -> bool {
        self.remote.is_none_or(|remote| remote == from)
            && self.held.allows(SocketProto::Udp, SocketUse::Receive, from)
    }

    fn receive(&self, wanted: usize) -> SocketResult<Vec<IncomingDatagram>> {
        let mut received = Vec::new();
        let mut buffer = vec![0u8; LARGEST_DATAGRAM];
        for _ in 0..READS_PER_CALL {
            if received.len() >= wanted {
                break;
            }
            match self.socket.try_recv_from(&mut buffer) {
                Ok((read, from)) if self.admits(from) => {
                    self.held.carried(SocketUse::Receive, from, read);
                    received.push(IncomingDatagram {
                        data: buffer[..read].to_vec(),
                        remote_address: from.into(),
                    });
                }
                Ok(_) => {}
                Err(error) if error.kind() == ErrorKind::WouldBlock => break,
                Err(error) if received.is_empty() => return Err(error.into()),
                Err(_) => break,
            }
        }
        Ok(received)
    }
}

#[wasmtime_wasi::async_trait]
impl Pollable for Incoming {
    async fn ready(&mut self) {
        let _ = self.socket.readable().await;
    }
}

pub(super) struct Outgoing {
    socket: Arc<UdpSocket>,
    remote: Option<SocketAddr>,
    held: Arc<Held>,
    permitted: u64,
}

impl Outgoing {
    pub(super) fn new(socket: Arc<UdpSocket>, remote: Option<SocketAddr>, held: Arc<Held>) -> Self {
        Self {
            socket,
            remote,
            held,
            permitted: 0,
        }
    }

    fn target(&self, datagram: &OutgoingDatagram) -> SocketResult<SocketAddr> {
        let asked = datagram.remote_address.map(SocketAddr::from);
        let target = match (asked, self.remote) {
            (Some(asked), Some(remote)) if asked != remote => None,
            (asked, remote) => asked.or(remote),
        };
        let target = target.ok_or(ErrorCode::InvalidArgument)?;
        let local = self.socket.local_addr()?;
        if target.is_ipv4() != local.is_ipv4() || target.ip().is_unspecified() || target.port() == 0 {
            return Err(ErrorCode::InvalidArgument.into());
        }
        if datagram.data.len() > LARGEST_DATAGRAM {
            return Err(ErrorCode::DatagramTooLarge.into());
        }
        Ok(target)
    }

    fn send_one(&self, datagram: &OutgoingDatagram) -> SocketResult<bool> {
        let target = self.target(datagram)?;
        if !self.held.allows(SocketProto::Udp, SocketUse::Send, target) {
            return Err(ErrorCode::AccessDenied.into());
        }
        if !self.held.spend(datagram.data.len()) {
            return Ok(false);
        }
        match self.socket.try_send_to(&datagram.data, target) {
            Ok(sent) => {
                self.held.carried(SocketUse::Send, target, sent);
                Ok(true)
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => Ok(false),
            Err(error) => Err(error.into()),
        }
    }

    fn send(&mut self, datagrams: &[OutgoingDatagram]) -> SocketResult<u64> {
        if u64::try_from(datagrams.len()).unwrap_or(u64::MAX) > self.permitted {
            return Err(SocketError::trap(wasmtime::format_err!(
                "more datagrams than check-send permitted"
            )));
        }
        self.permitted = 0;
        let mut sent = 0u64;
        for datagram in datagrams {
            match self.send_one(datagram) {
                Ok(true) => sent += 1,
                Ok(false) => break,
                Err(error) if sent == 0 => return Err(error),
                Err(_) => break,
            }
        }
        Ok(sent)
    }

    fn check_send(&mut self) -> SocketResult<u64> {
        if self.held.spent() {
            self.permitted = 0;
            return Ok(0);
        }
        let mut context = Context::from_waker(Waker::noop());
        self.permitted = match self.socket.poll_send_ready(&mut context) {
            Poll::Ready(Ok(())) => DATAGRAMS_AT_ONCE,
            Poll::Ready(Err(error)) => return Err(error.into()),
            Poll::Pending => 0,
        };
        Ok(self.permitted)
    }
}

#[wasmtime_wasi::async_trait]
impl Pollable for Outgoing {
    async fn ready(&mut self) {
        let wait = self.held.budget_wait();
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
        let _ = self.socket.writable().await;
    }
}

impl HostIncomingDatagramStream for SocketsView<'_> {
    fn receive(
        &mut self,
        this: Resource<IncomingDatagramStream>,
        max_results: u64,
    ) -> SocketResult<Vec<IncomingDatagram>> {
        let stream = self.table.get(&as_ours::<_, Incoming>(&this))?;
        stream.receive(usize::try_from(max_results).unwrap_or(usize::MAX))
    }

    fn subscribe(&mut self, this: Resource<IncomingDatagramStream>) -> wasmtime::Result<Resource<DynPollable>> {
        subscribe(self.table, as_ours::<_, Incoming>(&this))
    }

    fn drop(&mut self, this: Resource<IncomingDatagramStream>) -> wasmtime::Result<()> {
        discard::<Incoming, _>(self.table, &this)
    }
}

impl HostOutgoingDatagramStream for SocketsView<'_> {
    fn check_send(&mut self, this: Resource<OutgoingDatagramStream>) -> SocketResult<u64> {
        self.table.get_mut(&as_ours::<_, Outgoing>(&this))?.check_send()
    }

    fn send(
        &mut self,
        this: Resource<OutgoingDatagramStream>,
        datagrams: Vec<OutgoingDatagram>,
    ) -> SocketResult<u64> {
        self.table.get_mut(&as_ours::<_, Outgoing>(&this))?.send(&datagrams)
    }

    fn subscribe(&mut self, this: Resource<OutgoingDatagramStream>) -> wasmtime::Result<Resource<DynPollable>> {
        subscribe(self.table, as_ours::<_, Outgoing>(&this))
    }

    fn drop(&mut self, this: Resource<OutgoingDatagramStream>) -> wasmtime::Result<()> {
        discard::<Outgoing, _>(self.table, &this)
    }
}
