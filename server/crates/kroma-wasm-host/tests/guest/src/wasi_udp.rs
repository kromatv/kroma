use wasip2::sockets::instance_network::instance_network;
use wasip2::sockets::ip_name_lookup::resolve_addresses;
use wasip2::sockets::network::{ErrorCode, IpAddress, IpAddressFamily, IpSocketAddress, Ipv4SocketAddress, Ipv6SocketAddress};
use wasip2::sockets::udp::OutgoingDatagram;
use wasip2::sockets::udp_create_socket::create_udp_socket;

fn failed(error: ErrorCode) -> String {
    error.name().to_string()
}

fn named(error: Option<ErrorCode>) -> &'static str {
    error.map_or("none", |error| error.name())
}

fn v4(address: &str) -> Result<Ipv4SocketAddress, String> {
    let parsed: std::net::SocketAddrV4 = address.parse().map_err(|_| format!("not an address: {address}"))?;
    let [a, b, c, d] = parsed.ip().octets();
    Ok(Ipv4SocketAddress {
        port: parsed.port(),
        address: (a, b, c, d),
    })
}

fn datagram(data: Vec<u8>, to: IpSocketAddress) -> OutgoingDatagram {
    OutgoingDatagram {
        data,
        remote_address: Some(to),
    }
}

pub(crate) fn options() -> Result<String, String> {
    let socket = create_udp_socket(IpAddressFamily::Ipv6).map_err(failed)?;
    let v4 = IpSocketAddress::Ipv4(Ipv4SocketAddress { port: 0, address: (0, 0, 0, 0) });
    let wrong_family = named(socket.start_bind(&instance_network(), v4).err());
    let zero_buffer = named(socket.set_receive_buffer_size(0).err());
    let zero_hops = named(socket.set_unicast_hop_limit(0).err());
    socket.set_receive_buffer_size(65_536).map_err(failed)?;
    socket.set_send_buffer_size(65_536).map_err(failed)?;
    socket.set_unicast_hop_limit(8).map_err(failed)?;
    let buffers = socket.receive_buffer_size().map_err(failed)? > 0 && socket.send_buffer_size().map_err(failed)? > 0;
    let unbound = named(socket.local_address().err());
    let streams = socket.stream(None).map_err(failed)?;
    let bound = matches!(socket.local_address().map_err(failed)?, IpSocketAddress::Ipv6(_));
    let unconnected = named(socket.remote_address().err());
    drop(streams);
    let finished = named(socket.finish_bind().err());
    Ok(format!(
        "{wrong_family} {zero_buffer} {zero_hops} hops {} buffers {buffers} {:?} {unbound} bound {bound} {unconnected} {finished}",
        socket.unicast_hop_limit().map_err(failed)?,
        socket.address_family(),
    ))
}


pub(crate) fn misuse(peer: &str) -> Result<String, String> {
    let peer = v4(peer)?;
    let socket = create_udp_socket(IpAddressFamily::Ipv4).map_err(failed)?;
    let nowhere = Ipv4SocketAddress { port: 0, ..peer };
    let port_zero = named(socket.stream(Some(IpSocketAddress::Ipv4(nowhere))).err());
    let (incoming, outgoing) = socket.stream(None).map_err(failed)?;
    let unspecified = IpSocketAddress::Ipv4(Ipv4SocketAddress { port: 0, address: (0, 0, 0, 0) });
    let rebound = named(socket.start_bind(&instance_network(), unspecified).err());
    socket.subscribe().block();
    let v6 = IpSocketAddress::Ipv6(Ipv6SocketAddress { port: 9, flow_info: 0, address: (0, 0, 0, 0, 0, 0, 0, 1), scope_id: 0 });
    outgoing.check_send().map_err(failed)?;
    let wrong_family = named(outgoing.send(&[datagram(vec![1], v6)]).err());
    outgoing.check_send().map_err(failed)?;
    let too_large = named(outgoing.send(&[datagram(vec![0; 70_000], IpSocketAddress::Ipv4(peer))]).err());
    drop((incoming, outgoing));
    let (_incoming, connected) = socket.stream(Some(IpSocketAddress::Ipv4(peer))).map_err(failed)?;
    connected.check_send().map_err(failed)?;
    let elsewhere = Ipv4SocketAddress { port: peer.port.wrapping_add(1), ..peer };
    let away = named(connected.send(&[datagram(vec![1], IpSocketAddress::Ipv4(elsewhere))]).err());
    Ok(format!("{port_zero} {rebound} {wrong_family} {too_large} {away}"))
}

pub(crate) fn stream_twice() -> Result<String, String> {
    let socket = create_udp_socket(IpAddressFamily::Ipv4).map_err(failed)?;
    let _first = socket.stream(None).map_err(failed)?;
    let _second = socket.stream(None).map_err(failed)?;
    Ok("streamed twice".to_string())
}

pub(crate) fn lookup_literal(literal: &str) -> Result<String, String> {
    let stream = resolve_addresses(&instance_network(), literal).map_err(failed)?;
    stream.subscribe().block();
    match stream.resolve_next_address().map_err(failed)? {
        Some(IpAddress::Ipv4((a, b, c, d))) => Ok(format!("{a}.{b}.{c}.{d}")),
        other => Err(format!("{other:?}")),
    }
}

pub(crate) fn flood(peer: &str) -> Result<String, String> {
    let peer = IpSocketAddress::Ipv4(v4(peer)?);
    let socket = create_udp_socket(IpAddressFamily::Ipv4).map_err(failed)?;
    let (_incoming, outgoing) = socket.stream(None).map_err(failed)?;
    outgoing.subscribe().block();
    let mut sent = 0;
    loop {
        let permitted = outgoing.check_send().map_err(failed)?;
        if permitted == 0 {
            break;
        }
        let batch: Vec<OutgoingDatagram> = (0..permitted).map(|_| datagram(vec![0; 16], peer)).collect();
        sent += outgoing.send(&batch).map_err(failed)?;
    }
    Ok(sent.to_string())
}

pub(crate) fn fresh_permits(streams: &str) -> Result<String, String> {
    let streams: usize = streams.parse().map_err(|_| format!("not a count: {streams}"))?;
    let mut refused = 0;
    for _ in 0..streams {
        let socket = create_udp_socket(IpAddressFamily::Ipv4).map_err(failed)?;
        let (_incoming, outgoing) = socket.stream(None).map_err(failed)?;
        if outgoing.check_send().map_err(failed)? == 0 {
            refused += 1;
        }
    }
    Ok(format!("{refused} of {streams} fresh streams granted nothing"))
}
