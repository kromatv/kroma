use serde_json::{json, Value};

use kroma_module_host::{NetworkAction, NetworkAsk, NetworkFlow, NetworkPolicy, NetworkRoute};
use kroma_module_manifest::Permissions;

use super::*;
use crate::db::testing::{temp_pool, TempPool};
use crate::point::Point;
use crate::services::network::{FlowFilter, NetworkRules, VPN_POINT};
use crate::services::settings::Settings;

const MODULE: &str = "tv.kroma.example";

fn network(tag: &str, block: Option<Value>) -> (Network, TempPool) {
    let pool = temp_pool(tag);
    let settings = Settings::load(&pool);
    let declared: Option<Permissions> = block.map(|block| serde_json::from_value(block).unwrap());
    let network = Network::new((*pool).clone(), settings, Point::absent(VPN_POINT)).with_declared(
        Arc::new(move |id| (id == MODULE).then(|| declared.clone()).flatten()),
    );
    (network, pool)
}

fn ask(purpose: &str, host: &str, port: u16) -> NetworkAsk {
    NetworkAsk {
        purpose: purpose.to_string(),
        method: "GET".to_string(),
        host: host.to_string(),
        port,
        https: port == 443,
    }
}

fn indexer_on_the_internet() -> Option<Value> {
    Some(
        json!({ "net": { "connect": [{ "purpose": "indexer", "to": ["public"], "ports": [443] }] } }),
    )
}

#[test]
fn a_module_that_declares_no_block_is_ruled_as_before() {
    let (network, _pool) = network("permissions-none", None);

    let answer = NetworkPolicy::decide(&network, MODULE, &ask("anything", "tracker.example", 443));

    assert_eq!(answer.action, NetworkAction::Direct);
}

#[test]
fn a_call_its_block_does_not_cover_is_refused_naming_the_permission() {
    let (network, _pool) = network("permissions-refused", indexer_on_the_internet());

    let wrong_purpose =
        NetworkPolicy::decide(&network, MODULE, &ask("peers", "tracker.example", 443));
    let wrong_port =
        NetworkPolicy::decide(&network, MODULE, &ask("indexer", "tracker.example", 8080));
    let on_the_lan = NetworkPolicy::decide(&network, MODULE, &ask("indexer", "192.168.1.20", 443));

    assert_eq!(wrong_purpose.action, NetworkAction::Block);
    assert_eq!(wrong_purpose.rule.as_deref(), Some(PERMISSION_NET_CONNECT));
    assert_eq!(
        wrong_purpose.reason.as_deref(),
        Some("net.connect: tracker.example:443 for purpose \"peers\" is not declared")
    );
    assert_eq!(wrong_port.action, NetworkAction::Block);
    assert_eq!(on_the_lan.action, NetworkAction::Block);
}

#[test]
fn a_call_its_block_covers_is_still_ruled_by_the_operator() {
    let (network, _pool) = network("permissions-covered", indexer_on_the_internet());
    let blocking: NetworkRules = serde_json::from_value(
        json!({ "defaultAction": "allow", "rules": [{ "id": "no-indexers", "purpose": "indexer", "action": "block" }] }),
    )
    .unwrap();

    let allowed = NetworkPolicy::decide(&network, MODULE, &ask("indexer", "tracker.example", 443));
    network.set_rules(blocking).unwrap();
    let ruled = NetworkPolicy::decide(&network, MODULE, &ask("indexer", "tracker.example", 443));

    assert_eq!(allowed.action, NetworkAction::Direct);
    assert_eq!(ruled.action, NetworkAction::Block);
    assert_eq!(ruled.rule.as_deref(), Some("no-indexers"));
}

#[test]
fn a_setting_destination_allows_the_hosts_its_urls_name_and_no_other() {
    let block = json!({ "net": { "connect": [{ "purpose": "flaresolverr", "to": ["setting:acqFlaresolverrUrl"] }] } });
    let (network, pool) = network("permissions-setting", Some(block));
    network
        .settings
        .set_internal(
            &pool,
            "acqFlaresolverrUrl",
            json!("http://solver.lan:8191/v1"),
        )
        .unwrap();

    let named = NetworkPolicy::decide(&network, MODULE, &ask("flaresolverr", "solver.lan", 8191));
    let other = NetworkPolicy::decide(
        &network,
        MODULE,
        &ask("flaresolverr", "elsewhere.lan", 8191),
    );
    network
        .settings
        .set_internal(
            &pool,
            "acqFlaresolverrUrl",
            json!(["https://a.example", "https://b.example"]),
        )
        .unwrap();
    let listed = NetworkPolicy::decide(&network, MODULE, &ask("flaresolverr", "b.example", 443));

    assert_eq!(named.action, NetworkAction::Direct);
    assert_eq!(other.action, NetworkAction::Block);
    assert_eq!(listed.action, NetworkAction::Direct);
}

#[test]
fn the_refusal_the_module_reports_is_journaled_with_the_permission() {
    let (network, _pool) = network("permissions-journal", indexer_on_the_internet());
    let answer = NetworkPolicy::decide(&network, MODULE, &ask("peers", "tracker.example", 443));
    let reported = NetworkFlow {
        purpose: "peers".to_string(),
        method: "GET".to_string(),
        host: "tracker.example".to_string(),
        port: 443,
        route: NetworkRoute::Blocked,
        status: None,
        bytes_in: 0,
        bytes_out: 0,
        duration_ms: 1,
        error: answer.reason.clone(),
        rule: answer.rule.clone(),
    };

    network.record_flows(MODULE, vec![reported]);

    let flows = network
        .flows(&FlowFilter {
            limit: 10,
            ..FlowFilter::default()
        })
        .flows;
    assert_eq!(flows[0].caller, MODULE);
    assert_eq!(flows[0].rule.as_deref(), Some(PERMISSION_NET_CONNECT));
    assert!(flows[0]
        .error
        .as_deref()
        .is_some_and(|error| error.starts_with("net.connect: tracker.example:443")));
}
