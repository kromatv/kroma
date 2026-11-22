use std::io;

use wasmtime_wasi::WasiCtx;

use super::*;

fn raised(table: &mut ResourceTable, error: wasmtime::Error) -> Resource<wasmtime::Error> {
    table.push(error).unwrap()
}

#[test]
fn a_network_error_names_its_code_only_when_it_came_from_the_system() {
    let mut table = ResourceTable::new();
    let system = raised(&mut table, io::Error::from(io::ErrorKind::ConnectionRefused).into());
    let other = raised(&mut table, wasmtime::Error::msg("not the system's"));
    let mut view = SocketsView {
        table: &mut table,
        held: None,
    };

    let codes = [
        network::Host::network_error_code(&mut view, system).unwrap(),
        network::Host::network_error_code(&mut view, other).unwrap(),
    ];

    assert_eq!(codes.map(|code| code.is_some()), [true, false]);
}

#[test]
fn a_view_drops_a_network_handle_and_refuses_anything_else() {
    let mut table = ResourceTable::new();
    let mut ctx = WasiCtx::builder().build();
    let stray = table.push(7u8).unwrap();
    let network = Resource::<network::Network>::new_own(stray.rep());
    let error = raised(&mut table, wasmtime::Error::msg("raised"));
    let mut view = TcpView {
        stock: wasmtime_wasi::sockets::WasiSocketsCtxView {
            ctx: ctx.sockets(),
            table: &mut table,
        },
        held: None,
    };

    let dropped = network::HostNetwork::drop(&mut view, network);
    let code = network::Host::network_error_code(&mut view, error).unwrap();

    assert!(dropped.is_err());
    assert!(code.is_none());
}

#[test]
fn a_udp_view_drops_a_network_handle_and_refuses_anything_else() {
    let mut table = ResourceTable::new();
    let stray = table.push(7u8).unwrap();
    let network = Resource::<network::Network>::new_own(stray.rep());
    let mut view = SocketsView {
        table: &mut table,
        held: None,
    };

    let dropped = network::HostNetwork::drop(&mut view, network);

    assert!(dropped.is_err());
}
