use kroma_egress::Host;

use super::*;

fn answer(action: NetworkAction) -> NetworkAnswer {
    NetworkAnswer {
        action,
        proxy: None,
        rule: Some("r".into()),
        reason: None,
        private_allowed: true,
    }
}

#[test]
fn a_username_is_its_purpose_and_its_flags() {
    let asked = Username::parse("peers.public.vpn");

    assert_eq!(asked.purpose, "peers");
    assert!(asked.public_only);
    assert!(asked.sealed);
}

#[test]
fn a_bare_username_asks_for_nothing_more() {
    let asked = Username::parse("indexer");

    assert_eq!(asked.purpose, "indexer");
    assert!(!asked.public_only);
    assert!(!asked.sealed);
}

#[test]
fn a_vpn_url_becomes_an_upstream_with_its_credentials() {
    let upstream = upstream_of("socks5://kroma:secret@127.0.0.1:25345").unwrap();

    assert_eq!(upstream.address, "127.0.0.1:25345");
    assert_eq!(
        upstream.credentials,
        Some(("kroma".to_string(), "secret".to_string()))
    );
}

#[test]
fn a_vpn_url_with_no_credentials_becomes_a_plain_upstream() {
    let upstream = upstream_of("127.0.0.1:25345").unwrap();

    assert_eq!(upstream.address, "127.0.0.1:25345");
    assert_eq!(upstream.credentials, None);
}

#[test]
fn a_vpn_answer_with_no_proxy_is_refused_rather_than_sent_direct() {
    let ruling = ruling_of(answer(NetworkAction::Vpn), false);

    assert!(matches!(ruling.verdict, Verdict::Block(_)));
}

#[test]
fn a_caller_that_asks_for_public_addresses_only_gets_them() {
    let ruling = ruling_of(answer(NetworkAction::Direct), true);

    assert_eq!(
        ruling.verdict,
        Verdict::Direct {
            private_allowed: false
        }
    );
}

#[test]
fn a_ruling_keeps_the_rule_that_chose_it() {
    let ruling = ruling_of(answer(NetworkAction::Direct), false);

    assert_eq!(ruling.rule.as_deref(), Some("r"));
}

struct AllowsAll;

impl NetworkPolicy for AllowsAll {
    fn decide(&self, _caller: &str, _ask: &NetworkAsk) -> NetworkAnswer {
        answer(NetworkAction::Direct)
    }

    fn record_flows(&self, _caller: &str, _flows: Vec<NetworkFlow>) {}
}

#[test]
fn a_contained_module_that_declares_nothing_has_no_network() {
    let policy = ModulePolicy {
        module: "tv.example.old".into(),
        token: "token".into(),
        network: Arc::new(AllowsAll),
        no_network: true,
    };

    let ruling = policy.decide(&Request {
        caller: "tv.example.old".into(),
        purpose: "peers".into(),
        host: Host::Name("tracker.example".into()),
        port: 443,
    });

    assert!(matches!(ruling.verdict, Verdict::Block(_)));
    assert_eq!(ruling.rule.as_deref(), Some(PERMISSION_NET_CONNECT));
}

#[derive(Default)]
struct Recording {
    asked: std::sync::Mutex<Vec<(String, NetworkAsk)>>,
}

impl NetworkPolicy for Recording {
    fn decide(&self, caller: &str, ask: &NetworkAsk) -> NetworkAnswer {
        self.asked
            .lock()
            .unwrap()
            .push((caller.to_string(), ask.clone()));
        answer(NetworkAction::Direct)
    }

    fn record_flows(&self, _caller: &str, _flows: Vec<NetworkFlow>) {}
}

fn ruled_by(network: Arc<dyn NetworkPolicy>) -> ModulePolicy {
    ModulePolicy {
        module: "tv.example.peer".into(),
        token: "its-token".into(),
        network,
        no_network: false,
    }
}

#[test]
fn a_modules_gateway_names_the_holder_of_its_token_and_nobody_else() {
    let policy = ruled_by(Arc::new(AllowsAll));

    let own = policy.caller_of("its-token");
    let other = policy.caller_of("another-modules-token");
    let none = policy.caller_of("");

    assert_eq!(own.as_deref(), Some("tv.example.peer"));
    assert_eq!(other, None);
    assert_eq!(none, None);
}

#[test]
fn the_policy_is_asked_for_the_purpose_and_the_flags_the_username_carries() {
    let network = Arc::new(Recording::default());
    let policy = ruled_by(network.clone());

    let ruling = policy.decide(&Request {
        caller: "tv.example.peer".into(),
        purpose: "peers.public.vpn".into(),
        host: Host::Name("tracker.example".into()),
        port: 443,
    });

    let asked = network.asked.lock().unwrap();
    let (caller, ask) = &asked[0];
    assert_eq!(caller, "tv.example.peer");
    assert_eq!(ask.purpose, "peers");
    assert!(ask.sealed);
    assert!(ask.https);
    assert_eq!(
        ruling.verdict,
        Verdict::Direct {
            private_allowed: false
        }
    );
}
