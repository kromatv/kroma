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

fn refused() -> Result<String, SocketRefused> {
    Err(SocketRefused {
        rule: Some("permission:net.connect".to_string()),
        reason: "net.connect: 8.8.8.8:7359 over udp is not declared".to_string(),
    })
}

fn granted(rules: Arc<Answering>, journal: Arc<Journal>) -> SocketGrant {
    socket_grant(&lan_udp(), Some(rules), journal).unwrap()
}

fn call(using: SocketUse, address: &str) -> (SocketUse, SocketAddr) {
    (using, address.parse().unwrap())
}

fn ask(grant: &SocketGrant, (using, address): (SocketUse, SocketAddr)) -> bool {
    grant.rules.allows(&SocketCall {
        proto: SocketProto::Udp,
        using,
        address,
        names: &[],
    })
}

#[test]
fn a_module_whose_entries_name_no_protocol_gets_no_socket() {
    let manifest = manifest(serde_json::json!([{ "purpose": "api", "to": ["lan"] }]));

    let grant = socket_grant(&manifest, Some(answering(refused())), Arc::new(Journal::default()));

    assert!(grant.is_none());
}

#[test]
fn a_module_that_names_udp_alone_gets_udp_alone() {
    let grant = socket_grant(&lan_udp(), Some(answering(refused())), Arc::new(Journal::default())).unwrap();

    assert_eq!((grant.tcp, grant.udp), (false, true));
}

#[test]
fn a_supervisor_with_no_socket_rules_grants_no_socket() {
    let grant = socket_grant(&lan_udp(), None, Arc::new(Journal::default()));

    assert!(grant.is_none());
}

#[test]
fn an_allowed_datagram_is_filed_once_under_its_purpose_while_its_ruling_holds() {
    let rules = answering(Ok("discovery".to_string()));
    let journal = Arc::new(Journal::default());
    let grant = granted(rules.clone(), journal.clone());

    let first = ask(&grant, call(SocketUse::Send, "192.168.1.255:7359"));
    let again = ask(&grant, call(SocketUse::Send, "192.168.1.255:7359"));

    assert!(first && again);
    assert_eq!(rules.asked.load(Ordering::SeqCst), 1);
    let flows = journal.0.lock().unwrap();
    assert_eq!(flows.len(), 1);
    assert_eq!(
        (flows[0].purpose.as_str(), flows[0].method.as_str(), flows[0].host.as_str(), flows[0].route),
        ("discovery", "UDP", "192.168.1.255", NetworkRoute::Direct)
    );
}

#[test]
fn a_refused_datagram_is_filed_with_the_rule_that_refused_it() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(refused()), journal.clone());

    let allowed = ask(&grant, call(SocketUse::Send, "8.8.8.8:7359"));

    assert!(!allowed);
    let flows = journal.0.lock().unwrap();
    assert_eq!(flows[0].route, NetworkRoute::Blocked);
    assert_eq!(flows[0].rule.as_deref(), Some("permission:net.connect"));
}

#[test]
fn a_datagram_that_arrives_is_ruled_and_never_filed() {
    let journal = Arc::new(Journal::default());
    let grant = granted(answering(Ok("discovery".to_string())), journal.clone());

    let allowed = ask(&grant, call(SocketUse::Receive, "192.168.1.20:7359"));

    assert!(allowed);
    assert!(journal.0.lock().unwrap().is_empty());
}

#[test]
fn a_refused_lookup_is_filed_and_an_allowed_one_is_not() {
    let journal = Arc::new(Journal::default());
    let refusing = granted(answering(refused()), journal.clone());
    let allowing = granted(answering(Ok("discovery".to_string())), journal.clone());

    let refused = refusing.rules.may_resolve("tracker.example.org");
    let allowed = allowing.rules.may_resolve("tracker.example.org");

    assert_eq!((refused, allowed), (false, true));
    let flows = journal.0.lock().unwrap();
    assert_eq!(flows.len(), 1);
    assert_eq!((flows[0].method.as_str(), flows[0].host.as_str()), ("LOOKUP", "tracker.example.org"));
}
