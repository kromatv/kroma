use std::net::Ipv4Addr;

use super::*;
use crate::Sockets;

struct Everyone;

impl Sockets for Everyone {
    fn allows(&self, _call: &SocketCall<'_>) -> bool {
        true
    }

    fn resolve(&self, name: &str) -> Option<Vec<IpAddr>> {
        (!name.starts_with("refused")).then(|| vec![IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1))])
    }
}

fn held() -> Arc<Held> {
    Held::new(SocketGrant {
        tcp: true,
        udp: true,
        rules: Arc::new(Everyone),
    })
}

fn address() -> IpAddr {
    IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1))
}

#[test]
fn an_address_keeps_the_last_eight_names_and_each_once() {
    let held = held();

    for n in 0..10 {
        held.resolve(&format!("n{n}.example.test"));
    }
    held.resolve("n9.example.test");

    let (names, _) = held.named(address());
    let latest: Vec<String> = (2..10).map(|n| format!("n{n}.example.test")).collect();
    assert_eq!(names, latest);
}

#[test]
fn each_resolution_gives_the_address_a_generation_never_given_before() {
    let held = held();

    held.resolve("a.example.test");
    let (_, first) = held.named(address());
    held.resolve("b.example.test");
    let (_, second) = held.named(address());

    assert!(first > 0 && second > first, "{first} {second}");
}

#[test]
fn a_name_the_rules_refuse_is_neither_resolved_nor_kept() {
    let held = held();

    let resolved = held.resolve("refused.example.test");

    assert_eq!((resolved, held.named(address())), (None, (Vec::new(), 0)));
}

#[test]
fn past_1024_named_addresses_the_names_start_over() {
    let held = held();
    {
        let mut names = held.names.lock().unwrap();
        for n in 0..1024u32 {
            names.insert(IpAddr::V4(Ipv4Addr::from(n)), Named::default());
        }
    }

    held.resolve("fresh.example.test");

    assert_eq!(held.names.lock().unwrap().len(), 1);
}

#[test]
fn a_closed_socket_gives_its_place_back() {
    let held = held();
    let table = ResourceTable::new();
    for _ in 0..64 {
        held.opened_udp();
    }
    let full = held.has_room(&table);

    held.closed_udp();

    assert!(!full);
    assert!(held.has_room(&table));
}

#[test]
fn bytes_reach_rules_that_do_not_count_them_without_harm() {
    let held = held();

    held.carried(SocketUse::Send, "192.0.2.1:7359".parse().unwrap(), 4);

    assert!(held.allows(SocketProto::Udp, SocketUse::Send, "192.0.2.1:7359".parse().unwrap()));
}
