use std::sync::atomic::{AtomicUsize, Ordering};

use kroma_http::address::WebTarget;

use super::*;

fn outgoing(purpose: &'static str, host: &str) -> Outgoing {
    Outgoing {
        purpose,
        method: "GET",
        target: WebTarget {
            https: true,
            host: host.to_string(),
            port: 443,
        },
    }
}

fn answer(action: NetworkAction, proxy: Option<&str>, reason: Option<&str>) -> NetworkAnswer {
    NetworkAnswer {
        action,
        proxy: proxy.map(str::to_string),
        rule: Some("r1".to_string()),
        reason: reason.map(str::to_string),
    }
}

#[test]
fn each_answer_becomes_the_ruling_it_names() {
    let cases = [
        (answer(NetworkAction::Direct, None, None), Decision::Direct),
        (
            answer(NetworkAction::Vpn, Some("socks5://k:p@127.0.0.1:9"), None),
            Decision::Proxy("socks5://k:p@127.0.0.1:9".to_string()),
        ),
        (
            answer(NetworkAction::Block, None, Some("rule r1")),
            Decision::Block("rule r1".to_string()),
        ),
    ];

    for (answer, expected) in cases {
        let gate = Gate::new(move |_: &NetworkAsk| Asked::Answer(answer.clone()));
        let ruling = gate.rule(&outgoing("indexer", "tracker.example"));
        assert_eq!(ruling.decision, expected);
        assert_eq!(ruling.rule.as_deref(), Some("r1"));
    }
}

#[test]
fn a_vpn_answer_without_a_proxy_is_refused_rather_than_sent_direct() {
    let gate = Gate::new(|_: &NetworkAsk| Asked::Answer(answer(NetworkAction::Vpn, None, None)));

    let ruling = gate.rule(&outgoing("indexer", "tracker.example"));

    assert!(matches!(ruling.decision, Decision::Block(_)));
}

#[test]
fn an_unreachable_core_refuses_the_call() {
    let gate = Gate::new(|_: &NetworkAsk| Asked::Unreachable);

    let ruling = gate.rule(&outgoing("indexer", "tracker.example"));

    assert!(matches!(ruling.decision, Decision::Block(_)));
}

#[test]
fn a_core_without_a_policy_lets_the_call_go_direct() {
    let gate = Gate::new(|_: &NetworkAsk| Asked::NoPolicy);

    let ruling = gate.rule(&outgoing("indexer", "tracker.example"));

    assert_eq!(ruling.decision, Decision::Direct);
}

#[test]
fn a_burst_to_one_host_for_one_purpose_asks_the_core_once() {
    let asked = AtomicUsize::new(0);
    let gate = Gate::new(|_: &NetworkAsk| {
        asked.fetch_add(1, Ordering::Relaxed);
        Asked::Answer(answer(NetworkAction::Direct, None, None))
    });

    for _ in 0..5 {
        gate.rule(&outgoing("indexer", "tracker.example"));
    }

    assert_eq!(asked.load(Ordering::Relaxed), 1);
}

#[test]
fn a_refusal_for_an_unreachable_core_is_not_kept() {
    let asked = AtomicUsize::new(0);
    let gate = Gate::new(|_: &NetworkAsk| {
        asked.fetch_add(1, Ordering::Relaxed);
        Asked::Unreachable
    });

    gate.rule(&outgoing("indexer", "tracker.example"));
    gate.rule(&outgoing("indexer", "tracker.example"));

    assert_eq!(asked.load(Ordering::Relaxed), 2);
}
