use std::collections::VecDeque;
use std::net::{IpAddr, ToSocketAddrs};

use wasmtime::component::Resource;
use wasmtime_wasi::p2::bindings::sockets::network::{ErrorCode, IpAddress, Network};
use wasmtime_wasi::p2::bindings::sync::sockets::ip_name_lookup::{
    Host, HostResolveAddressStream, ResolveAddressStream,
};
use wasmtime_wasi::p2::{subscribe, DynPollable, Pollable, SocketResult};

use super::{as_ours, discard, owned, SocketsView};

pub(super) struct Resolved(VecDeque<IpAddr>);

#[wasmtime_wasi::async_trait]
impl Pollable for Resolved {
    async fn ready(&mut self) {}
}

fn plain(name: &str) -> Option<String> {
    let name = name.trim_end_matches('.').to_ascii_lowercase();
    let plain = !name.is_empty()
        && name.len() <= 253
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    plain.then_some(name)
}

fn resolve(name: &str) -> SocketResult<Vec<IpAddr>> {
    let addresses = (name, 0)
        .to_socket_addrs()
        .map_err(|_| ErrorCode::NameUnresolvable)?;
    Ok(addresses.map(|address| address.ip().to_canonical()).collect())
}

impl Host for SocketsView<'_> {
    fn resolve_addresses(
        &mut self,
        network: Resource<Network>,
        name: String,
    ) -> SocketResult<Resource<ResolveAddressStream>> {
        self.table.get(&network)?;
        let held = self.held.ok_or(ErrorCode::AccessDenied)?;
        if let Ok(ip) = name.parse::<IpAddr>() {
            let stream = self.table.push(Resolved(VecDeque::from([ip])))?;
            return Ok(owned(&stream));
        }
        let name = plain(&name).ok_or(ErrorCode::InvalidArgument)?;
        if !held.may_resolve(&name) {
            return Err(ErrorCode::AccessDenied.into());
        }
        let addresses = resolve(&name)?;
        held.remember(&name, &addresses);
        let stream = self.table.push(Resolved(addresses.into()))?;
        Ok(owned(&stream))
    }
}

impl HostResolveAddressStream for SocketsView<'_> {
    fn resolve_next_address(
        &mut self,
        this: Resource<ResolveAddressStream>,
    ) -> SocketResult<Option<IpAddress>> {
        let stream = self.table.get_mut(&as_ours::<_, Resolved>(&this))?;
        Ok(stream.0.pop_front().map(IpAddress::from))
    }

    fn subscribe(&mut self, this: Resource<ResolveAddressStream>) -> wasmtime::Result<Resource<DynPollable>> {
        subscribe(self.table, as_ours::<_, Resolved>(&this))
    }

    fn drop(&mut self, this: Resource<ResolveAddressStream>) -> wasmtime::Result<()> {
        discard::<Resolved, _>(self.table, &this)
    }
}
