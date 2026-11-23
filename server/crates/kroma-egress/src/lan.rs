//! Where an address sits, seen from this machine: on the public internet, on
//! one of the networks this machine's interfaces sit on, or elsewhere. A raw
//! socket's `public` and `lan` are judged by it, in the server and in an audit.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::Arc;

use if_addrs::IfAddr;
use kroma_http::address::is_public;

const METADATA: [IpAddr; 2] = [
    IpAddr::V4(Ipv4Addr::new(100, 100, 100, 200)),
    IpAddr::V6(Ipv6Addr::new(0xfd00, 0xec2, 0, 0, 0, 0, 0, 0x254)),
];

/// One network an interface of this machine sits on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocalNetwork {
    pub address: IpAddr,
    pub prefix: u8,
}

/// The networks this machine's interfaces sit on, loopback left out.
pub type LocalNetworks = Arc<dyn Fn() -> Vec<LocalNetwork> + Send + Sync>;

/// Where an address sits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Place {
    Public,
    Lan,
    Elsewhere,
}

/// The networks this machine's interfaces sit on, as the OS lists them. An
/// interface that is loopback or names no netmask is left out.
pub fn interface_networks() -> Vec<LocalNetwork> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|interface| !interface.is_loopback())
        .map(|interface| LocalNetwork {
            address: interface.ip(),
            prefix: match interface.addr {
                IfAddr::V4(v4) => v4.prefixlen,
                IfAddr::V6(v6) => v6.prefixlen,
            },
        })
        .filter(|network| network.prefix > 0)
        .collect()
}

fn under_prefix((ip, network): (u128, u128), width: u32, bits: u32) -> bool {
    bits > 0 && bits <= width && ip >> (width - bits) == network >> (width - bits)
}

impl LocalNetwork {
    fn contains(&self, ip: IpAddr) -> bool {
        let bits = u32::from(self.prefix);
        match (self.address, ip) {
            (IpAddr::V4(network), IpAddr::V4(ip)) => {
                under_prefix((u32::from(ip).into(), u32::from(network).into()), 32, bits)
            }
            (IpAddr::V6(network), IpAddr::V6(ip)) => under_prefix((ip.into(), network.into()), 128, bits),
            _ => false,
        }
    }

    fn broadcast(&self) -> Option<IpAddr> {
        let IpAddr::V4(address) = self.address else {
            return None;
        };
        let host_bits = u32::MAX
            .checked_shr(u32::from(self.prefix))
            .filter(|bits| *bits > 0)?;
        Some(Ipv4Addr::from(u32::from(address) | host_bits).into())
    }
}

fn stays_on_the_link(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, c, _] = v4.octets();
            v4 == Ipv4Addr::BROADCAST || (a == 224 && b == 0 && c == 0) || a == 239
        }
        IpAddr::V6(v6) => v6.segments()[0] == 0xff02,
    }
}

/// Whether `ip` is this machine whichever interface it names: loopback, an
/// unspecified address or `0.0.0.0/8`.
pub fn is_this_host(ip: IpAddr) -> bool {
    match ip.to_canonical() {
        IpAddr::V4(v4) => v4.is_loopback() || v4.octets()[0] == 0,
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
    }
}

/// Whether `ip` reaches more than one machine: a multicast group, the limited
/// broadcast, or the broadcast address of one of `networks`.
pub fn spreads(ip: IpAddr, networks: &[LocalNetwork]) -> bool {
    let ip = ip.to_canonical();
    ip.is_multicast()
        || ip == IpAddr::V4(Ipv4Addr::BROADCAST)
        || networks
            .iter()
            .any(|network| network.broadcast() == Some(ip))
}

/// Where `ip` sits. Loopback, an unspecified address and `0.0.0.0/8` are
/// neither public nor `lan`, whatever an interface claims.
pub fn place_of(ip: IpAddr, networks: &[LocalNetwork]) -> Place {
    let ip = ip.to_canonical();
    if is_this_host(ip) {
        return Place::Elsewhere;
    }
    if is_public(ip) {
        return Place::Public;
    }
    if stays_on_the_link(ip) || networks.iter().any(|network| network.contains(ip)) {
        return Place::Lan;
    }
    Place::Elsewhere
}

/// Whether `ip` lands on this machine: loopback, an unspecified address, one of
/// this machine's own addresses, or a broadcast or multicast address, which
/// this machine hears too.
pub fn reaches_this_machine(ip: IpAddr, networks: &[LocalNetwork]) -> bool {
    let ip = ip.to_canonical();
    is_this_host(ip) || spreads(ip, networks) || networks.iter().any(|network| network.address == ip)
}

/// Whether `ip` is link-local, IPv4-mapped forms included: `169.254.0.0/16` or
/// `fe80::/10`.
pub fn is_link_local(ip: IpAddr) -> bool {
    match ip.to_canonical() {
        IpAddr::V4(v4) => v4.is_link_local(),
        IpAddr::V6(v6) => (v6.segments()[0] & 0xffc0) == 0xfe80,
    }
}

/// Whether `ip` is a cloud provider's metadata service that is not on a
/// link-local address: Alibaba's `100.100.100.200` and AWS's `fd00:ec2::254`.
pub fn is_cloud_metadata(ip: IpAddr) -> bool {
    METADATA.contains(&ip.to_canonical())
}

#[cfg(test)]
mod tests;
