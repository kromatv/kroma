use std::net::SocketAddrV6;
use std::sync::atomic::{AtomicUsize, Ordering};

use kroma_module_host::{NetworkAnswer, NetworkAsk};

use super::*;

struct Answering {
    answer: Result<String, SocketRefused>,
    asked: AtomicUsize,
}

impl SocketRules for Answering {
    fn decide_socket(&self, _caller: &str, _ask: &SocketAsk<'_>) -> Result<String, SocketRefused> {
        self.asked.fetch_add(1, Ordering::SeqCst);
        self.answer.clone()
    }

    fn decide_lookup(&self, _caller: &str, _name: &str) -> Result<String, SocketRefused> {
        self.answer.clone()
    }
}

#[derive(Default)]
struct Journal(Mutex<Vec<NetworkFlow>>);

impl NetworkPolicy for Journal {
    fn decide(&self, _caller: &str, _ask: &NetworkAsk) -> NetworkAnswer {
        unreachable!("a raw socket is never ruled as a fetch")
    }

    fn record_flows(&self, _caller: &str, flows: Vec<NetworkFlow>) {
        self.0.lock().unwrap().extend(flows);
    }
}

impl Journal {
    fn flows(&self) -> Vec<NetworkFlow> {
        self.0.lock().unwrap().clone()
    }
}

fn manifest(connect: serde_json::Value) -> ModuleManifest {
    serde_json::from_value(serde_json::json!({
        "schemaVersion": kroma_module_manifest::MODULE_SCHEMA_VERSION,
        "id": "tv.example.discovery",
        "name": "Discovery",
        "version": "1.0.0",
        "permissions": { "net": { "connect": connect } }
    }))
    .unwrap()
}

fn lan_udp() -> ModuleManifest {
    manifest(serde_json::json!([
        { "purpose": "discovery", "to": ["lan"], "ports": [7359], "proto": ["udp"] }
    ]))
}

fn answering(answer: Result<String, SocketRefused>) -> Arc<Answering> {
    Arc::new(Answering {
        answer,
        asked: AtomicUsize::new(0),
    })
}

fn allowed() -> Result<String, SocketRefused> {
    Ok("discovery".to_string())
}

fn refused() -> Result<String, SocketRefused> {
    Err(SocketRefused {
        rule: Some("permission:net.connect".to_string()),
        reason: "net.connect: 8.8.8.8:7359 over udp is not declared".to_string(),
    })
}

fn granted(rules: Arc<Answering>, journal: Arc<Journal>) -> SocketGrant {
    socket_grant(&lan_udp(), Some(rules), journal).unwrap()
}

struct Asked<'a> {
    using: SocketUse,
    address: SocketAddr,
    names: &'a [String],
    generation: u64,
}

fn at(using: SocketUse, address: &str) -> Asked<'static> {
    Asked {
        using,
        address: address.parse().unwrap(),
        names: &[],
        generation: 0,
    }
}

fn call<'a>(asked: &Asked<'a>) -> SocketCall<'a> {
    SocketCall {
        proto: SocketProto::Udp,
        using: asked.using,
        address: asked.address,
        names: asked.names,
        generation: asked.generation,
    }
}

fn ask(grant: &SocketGrant, asked: &Asked<'_>) -> bool {
    grant.rules.allows(&call(asked))
}

#[test]
fn a_module_whose_entries_name_no_protocol_gets_no_socket() {
    let manifest = manifest(serde_json::json!([{ "purpose": "api", "to": ["lan"] }]));

    let grant = socket_grant(&manifest, Some(answering(refused())), Arc::new(Journal::default()));

    assert!(grant.is_none());
}

#[test]
fn a_module_that_names_udp_alone_gets_udp_alone() {
    let grant = granted(answering(refused()), Arc::new(Journal::default()));

    assert_eq!((grant.tcp, grant.udp), (false, true));
}

#[test]
fn a_supervisor_with_no_socket_rules_grants_no_socket() {
    let grant = socket_grant(&lan_udp(), None, Arc::new(Journal::default()));

    assert!(grant.is_none());
}

#[test]
fn a_ruling_holds_for_its_address_and_generation_whatever_names_ride_with_it() {
    let rules = answering(allowed());
    let grant = granted(rules.clone(), Arc::new(Journal::default()));
    let names = ["a.example.test".to_string()];
    let renamed = Asked {
        names: &names,
        ..at(SocketUse::Send, "192.168.1.255:7359")
    };
    let resolved_again = Asked {
        generation: 7,
        ..at(SocketUse::Send, "192.168.1.255:7359")
    };

    ask(&grant, &at(SocketUse::Send, "192.168.1.255:7359"));
    ask(&grant, &renamed);
    let for_both = rules.asked.load(Ordering::SeqCst);
    ask(&grant, &resolved_again);

    assert_eq!((for_both, rules.asked.load(Ordering::SeqCst)), (1, 2));
}

#[test]
fn a_ruling_holds_for_its_address_whatever_flowinfo_or_scope_it_carries() {
    let rules = answering(allowed());
    let grant = granted(rules.clone(), Arc::new(Journal::default()));
    let plain = SocketAddr::V6(SocketAddrV6::new("ff02::1".parse().unwrap(), 7359, 0, 0));
    let tagged = SocketAddr::V6(SocketAddrV6::new("ff02::1".parse().unwrap(), 7359, 99, 3));

    ask(&grant, &Asked { address: plain, ..at(SocketUse::Send, "1.1.1.1:1") });
    ask(&grant, &Asked { address: tagged, ..at(SocketUse::Send, "1.1.1.1:1") });

    assert_eq!(rules.asked.load(Ordering::SeqCst), 1);
}

#[test]
fn past_eight_refused_ports_an_address_is_refused_without_asking_again() {
    let rules = answering(refused());
    let grant = granted(rules.clone(), Arc::new(Journal::default()));

    let admitted = (0..20)
        .filter(|port| ask(&grant, &at(SocketUse::Receive, &format!("192.168.1.66:{}", 40_000 + port))))
        .count();

    assert_eq!(admitted, 0);
    assert_eq!(rules.asked.load(Ordering::SeqCst), 8);
}

impl ModuleSockets {
    fn for_tests(rules: Arc<Answering>) -> Self {
        Self {
            module: "tv.example.discovery".to_string(),
            rules,
            journal: Arc::new(Journal::default()),
            ruled: Mutex::default(),
            tallies: Mutex::default(),
        }
    }

    fn rulings_kept(&self) -> usize {
        self.ruled.lock().unwrap().kept()
    }
}

#[test]
fn the_rulings_kept_never_pass_512() {
    let sockets = ModuleSockets::for_tests(answering(allowed()));

    for n in 0..600u32 {
        let address = SocketAddr::from((std::net::Ipv4Addr::from(0x0a00_0000 + n), 7359));
        sockets.allows(&call(&Asked { address, ..at(SocketUse::Send, "1.1.1.1:1") }));
    }

    assert!(sockets.rulings_kept() <= 512, "{}", sockets.rulings_kept());
}

#[test]
fn a_refused_datagram_is_filed_with_the_rule_that_refused_it() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(refused()), journal.clone());

    let allowed = ask(&grant, &at(SocketUse::Send, "8.8.8.8:7359"));

    assert!(!allowed);
    let flows = journal.flows();
    assert_eq!(flows[0].route, NetworkRoute::Blocked);
    assert_eq!(flows[0].rule.as_deref(), Some("permission:net.connect"));
}

#[test]
fn the_bytes_a_peer_carries_are_filed_at_once_then_each_window_and_the_rest_when_the_module_stops() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(allowed()), journal.clone());
    let peer = at(SocketUse::Send, "192.168.1.255:7359");

    ask(&grant, &peer);
    grant.rules.carried(&call(&peer), 100);
    grant.rules.carried(&call(&peer), 50);
    let answer = at(SocketUse::Receive, "192.168.1.20:7359");
    ask(&grant, &answer);
    grant.rules.carried(&call(&answer), 30);
    let while_running = journal.flows().len();
    drop(grant);

    let filed: Vec<(String, u64, u64)> = journal
        .flows()
        .into_iter()
        .map(|flow| (flow.method, flow.bytes_out, flow.bytes_in))
        .collect();
    assert_eq!(while_running, 2);
    assert_eq!(
        filed,
        [
            ("UDP".to_string(), 100, 0),
            ("UDP".to_string(), 0, 30),
            ("UDP".to_string(), 50, 0)
        ]
    );
    assert!(journal.flows().iter().all(|flow| flow.purpose == "discovery"));
}

#[test]
fn a_datagram_that_arrives_is_ruled_and_never_filed_as_a_flow_of_its_own() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(allowed()), journal.clone());

    let allowed = ask(&grant, &at(SocketUse::Receive, "192.168.1.20:7359"));

    assert!(allowed);
    assert!(journal.flows().is_empty());
}

#[test]
fn a_lookup_is_filed_whether_it_was_refused_or_allowed() {
    let journal = Arc::new(Journal::default());
    let refusing = granted(answering(refused()), journal.clone());
    let allowing = granted(answering(allowed()), journal.clone());

    let refused = refusing.rules.resolve("localhost");
    let allowed = allowing.rules.resolve("localhost");

    assert!(refused.is_none());
    assert!(allowed.is_some());
    let routes: Vec<(String, NetworkRoute)> = journal
        .flows()
        .into_iter()
        .map(|flow| (flow.method, flow.route))
        .collect();
    assert_eq!(
        routes,
        [
            ("LOOKUP".to_string(), NetworkRoute::Blocked),
            ("LOOKUP".to_string(), NetworkRoute::Direct)
        ]
    );
}

#[test]
fn a_name_is_looked_up_as_an_absolute_one_so_no_search_domain_is_tried() {
    let looked_up = [absolute("tracker.example.org"), absolute("tracker.example.org.")];

    assert_eq!(looked_up, ["tracker.example.org.", "tracker.example.org."]);
}

#[test]
fn an_allowed_connection_is_filed_when_it_is_ruled() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(allowed()), journal.clone());

    let allowed = grant.rules.allows(&SocketCall {
        proto: SocketProto::Tcp,
        ..call(&at(SocketUse::Connect, "1.1.1.1:443"))
    });

    assert!(allowed);
    let flows = journal.flows();
    assert_eq!((flows[0].method.as_str(), flows[0].route), ("TCP", NetworkRoute::Direct));
}

#[test]
fn past_512_refused_addresses_the_count_starts_over_and_each_new_one_is_asked() {
    let rules = answering(refused());
    let grant = granted(rules.clone(), Arc::new(Journal::default()));

    for n in 0..600u32 {
        let address = SocketAddr::from((std::net::Ipv4Addr::from(0x0a00_0000 + n), 7359));
        ask(&grant, &Asked { address, ..at(SocketUse::Receive, "1.1.1.1:1") });
    }

    assert_eq!(rules.asked.load(Ordering::SeqCst), 600);
}

#[test]
fn past_512_peers_what_was_counted_is_filed_and_counting_starts_over() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(allowed()), journal.clone());

    for n in 0..600u32 {
        let address = SocketAddr::from((std::net::Ipv4Addr::from(0x0a00_0000 + n), 7359));
        let peer = Asked { address, ..at(SocketUse::Send, "1.1.1.1:1") };
        ask(&grant, &peer);
        grant.rules.carried(&call(&peer), 10);
    }

    assert_eq!(journal.flows().len(), 600);
}
