use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;

use super::*;
use crate::point::StubFn;

type Heard = Arc<Mutex<Vec<(String, Value)>>>;

fn target(host: &str) -> WebTarget {
    WebTarget {
        https: true,
        host: host.to_string(),
        port: 443,
    }
}

fn answering(module: &'static str, heard: &Heard, answer: Value) -> (&'static str, StubFn) {
    let heard = heard.clone();
    let asked: StubFn = Arc::new(move |method, body| {
        heard
            .lock()
            .unwrap()
            .push((format!("{module}/{method}"), body.clone()));
        Some(answer.clone())
    });
    (module, asked)
}

fn slow(module: &'static str) -> (&'static str, StubFn) {
    let asked: StubFn = Arc::new(|_, _| {
        std::thread::sleep(DEADLINE * 3);
        Some(json!({ "verdict": "keep" }))
    });
    (module, asked)
}

fn behind(tag: &str, rules: &str, middleware: Vec<(&str, StubFn)>) -> (Network, TempPool) {
    let vpn = offering(vec![
        offer("vpn", "127.0.0.1:1000", true),
        offer("vpn-se", "127.0.0.1:2000", true),
    ]);
    let (network, pool) = network(tag, vpn);
    let network = network.with_middleware(Point::stubs(POLICY_POINT, middleware));
    network.set_rules(everything(rules)).unwrap();
    (network, pool)
}

fn asked_of(heard: &Heard) -> Vec<String> {
    heard.lock().unwrap().iter().map(|(who, _)| who.clone()).collect()
}

#[test]
fn a_middleware_blocks_a_connection_the_rules_allowed_and_says_why() {
    let heard = Heard::default();
    let blocklist = answering(
        "tv.example.blocklist",
        &heard,
        json!({ "verdict": "block", "reason": "on the blocklist" }),
    );
    let (network, _pool) = behind("middleware-block", "direct", vec![blocklist]);

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        ruling,
        Ruling {
            decision: Decision::Block("on the blocklist".to_string()),
            rule: Some("middleware:tv.example.blocklist".to_string()),
        }
    );
}

#[test]
fn a_middleware_is_told_who_calls_why_and_where_and_nothing_more() {
    let heard = Heard::default();
    let watcher = answering("tv.example.watcher", &heard, json!({ "verdict": "keep" }));
    let (network, _pool) = behind("middleware-ask", "vpn", vec![watcher]);

    network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        heard.lock().unwrap()[0].1,
        json!({
            "caller": "tv.kroma.indexer",
            "purpose": "indexer",
            "host": "tracker.example",
            "port": 443,
            "decision": { "action": "vpn", "rule": "all" },
        })
    );
}

#[test]
fn a_middleware_moves_a_connection_to_another_network() {
    let heard = Heard::default();
    let router = answering(
        "tv.example.router",
        &heard,
        json!({ "verdict": "network", "network": "vpn-se" }),
    );
    let (network, _pool) = behind("middleware-route", "direct", vec![router]);

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        ruling,
        Ruling {
            decision: Decision::Proxy("socks5://kroma:pw@127.0.0.1:2000".to_string()),
            rule: Some("middleware:tv.example.router".to_string()),
        }
    );
}

#[test]
fn a_network_no_provider_offers_refuses_the_connection_rather_than_let_it_out() {
    let heard = Heard::default();
    let router = answering(
        "tv.example.router",
        &heard,
        json!({ "verdict": "network", "network": "nowhere" }),
    );
    let (network, _pool) = behind("middleware-nowhere", "direct", vec![router]);

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        ruling.decision,
        Decision::Block("the network nowhere is not running".to_string())
    );
}

#[test]
fn a_connection_a_rule_or_a_guard_blocked_is_never_put_to_a_middleware() {
    let heard = Heard::default();
    let lenient = answering("tv.example.lenient", &heard, json!({ "verdict": "keep" }));
    let (network, _pool) = behind("middleware-blocked", "block", vec![lenient]);

    let by_rule = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));
    let by_guard = network.rule_on("tv.kroma.indexer", "indexer", &target("169.254.1.1"));

    assert_eq!(by_rule.rule.as_deref(), Some("all"));
    assert!(matches!(by_rule.decision, Decision::Block(_)));
    assert_eq!(by_guard.rule.as_deref(), Some(GUARD_LINK_LOCAL));
    assert!(asked_of(&heard).is_empty());
}

#[test]
fn an_answer_that_would_send_a_tunnelled_connection_direct_is_no_answer() {
    let heard = Heard::default();
    let relaxing = answering("tv.example.relaxing", &heard, json!({ "verdict": "direct" }));
    let (network, _pool) = behind("middleware-relax", "vpn", vec![relaxing]);

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        ruling,
        Ruling {
            decision: Decision::Proxy("socks5://kroma:pw@127.0.0.1:1000".to_string()),
            rule: Some("all".to_string()),
        }
    );
    assert_eq!(network.middleware()[0].skipped, 1);
}

#[test]
fn a_slow_middleware_is_skipped_and_the_skip_is_on_record() {
    let (network, _pool) = behind("middleware-slow", "direct", vec![slow("tv.example.slow")]);

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    let standing = &network.middleware()[0];
    let skip = standing.last_skip.as_ref().unwrap();
    assert_eq!(ruling.decision, Decision::Direct);
    assert_eq!(standing.skipped, 1);
    assert_eq!(
        (skip.caller.as_str(), skip.host.as_str(), skip.blocked),
        ("tv.kroma.indexer", "tracker.example", false)
    );
}

#[test]
fn a_required_middleware_that_does_not_answer_blocks_the_connection() {
    let (network, _pool) = behind("middleware-required", "direct", vec![slow("tv.example.slow")]);
    network
        .set_middleware_order(vec![Placed {
            module: "tv.example.slow".to_string(),
            required: true,
        }])
        .unwrap();

    let ruling = network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    assert_eq!(
        ruling,
        Ruling {
            decision: Decision::Block(
                "the required middleware tv.example.slow did not answer in time".to_string()
            ),
            rule: Some("middleware:tv.example.slow".to_string()),
        }
    );
    assert!(network.middleware()[0].last_skip.as_ref().unwrap().blocked);
}

#[test]
fn middlewares_are_asked_in_the_operators_order_each_seeing_the_one_before() {
    let heard = Heard::default();
    let first = answering("tv.example.a", &heard, json!({ "verdict": "keep" }));
    let second = answering(
        "tv.example.b",
        &heard,
        json!({ "verdict": "network", "network": "vpn-se" }),
    );
    let (network, _pool) = behind("middleware-order", "direct", vec![first, second]);
    let placed = |module: &str| Placed {
        module: module.to_string(),
        required: false,
    };
    network
        .set_middleware_order(vec![placed("tv.example.b"), placed("tv.example.a")])
        .unwrap();

    network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));

    let asked = heard.lock().unwrap();
    assert_eq!(asked[0].0, "tv.example.b/decide");
    assert_eq!(asked[1].0, "tv.example.a/decide");
    assert_eq!(asked[1].1["decision"]["action"], json!("vpn-se"));
}

#[test]
fn a_burst_of_the_same_connection_is_one_question() {
    let heard = Heard::default();
    let watcher = answering("tv.example.watcher", &heard, json!({ "verdict": "keep" }));
    let (network, _pool) = behind("middleware-cache", "direct", vec![watcher]);

    for _ in 0..5 {
        network.rule_on("tv.kroma.indexer", "indexer", &target("tracker.example"));
    }
    network.rule_on("tv.kroma.indexer", "indexer", &target("other.example"));

    assert_eq!(asked_of(&heard).len(), 2);
}

#[test]
fn a_middleware_is_not_asked_about_its_own_connections() {
    let heard = Heard::default();
    let blocklist = answering("tv.example.blocklist", &heard, json!({ "verdict": "block" }));
    let (network, _pool) = behind("middleware-own", "direct", vec![blocklist]);

    let ruling = network.rule_on("tv.example.blocklist", "lists", &target("lists.example"));

    assert_eq!(ruling.decision, Decision::Direct);
    assert!(asked_of(&heard).is_empty());
}

#[test]
fn a_network_verdict_leaves_a_local_destination_direct() {
    let heard = Heard::default();
    let router = answering(
        "tv.example.router",
        &heard,
        json!({ "verdict": "network", "network": "vpn-se" }),
    );
    let (network, _pool) = behind("middleware-local", "direct", vec![router]);

    let ruling = network.rule_on("tv.kroma.roku", "roku", &target("192.168.1.20"));

    assert_eq!(ruling.decision, Decision::Direct);
}

#[test]
fn journal_rows_reach_a_middleware_in_a_batch_once_they_are_flushed() {
    let heard = Heard::default();
    let watcher = answering("tv.example.watcher", &heard, json!({ "verdict": "keep" }));
    let (network, _pool) = behind("middleware-observe", "direct", vec![watcher]);
    let report = |host: &str| FlowReport {
        purpose: "metadata".to_string(),
        method: "GET".to_string(),
        host: host.to_string(),
        port: 443,
        route: FlowRoute::Direct,
        status: Some(200),
        bytes_in: 10,
        bytes_out: 2,
        duration_ms: 5,
        error: None,
        rule: None,
    };

    network.record(CORE, report("a.example"));
    network.record(CORE, report("b.example"));
    network.flush_observed();

    let told = (0..40).find_map(|_| {
        std::thread::sleep(Duration::from_millis(25));
        let heard = heard.lock().unwrap();
        heard
            .iter()
            .find(|(who, _)| who == "tv.example.watcher/observe")
            .map(|(_, body)| body.clone())
    });
    let flows = told.expect("the batch")["flows"].clone();
    assert_eq!(flows.as_array().map(Vec::len), Some(2));
    assert_eq!(flows[0]["host"], json!("a.example"));
    assert_eq!(flows[0]["caller"], json!(CORE));
    assert_eq!(flows[1]["route"], json!("direct"));
}
