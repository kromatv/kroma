use std::io::ErrorKind;
use std::net::TcpListener;
use std::sync::Arc;
use std::time::Duration;

use kroma_db::testing::temp_pool;
use kroma_engine::point::Point;
use kroma_engine::services::network::{FlowFilter, FlowRoute, Network, CORE, VPN_POINT};
use kroma_engine::services::settings::Settings;
use kroma_http::egress::{self, BLOCKED, NO_GATE};
use kroma_http::Fetch;
use kroma_primitives::now_ms;

#[test]
fn a_fetch_before_the_network_policy_is_refused_unsent_and_journaled_at_its_own_time() {
    egress::require_gate();
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind a listener");
    listener
        .set_nonblocking(true)
        .expect("a non-blocking listener");
    let port = listener
        .local_addr()
        .expect("the listener's address")
        .port();
    let called_at = now_ms();

    let refused = Fetch::new()
        .purpose("metadata")
        .max_time(5)
        .get(&format!("http://127.0.0.1:{port}/early"));

    let finished_at = now_ms();
    let error = refused.expect_err("a refusal").to_string();
    assert!(error.contains(BLOCKED), "{error}");
    assert!(error.contains(NO_GATE), "{error}");
    let accepted = listener.accept().map(|_| ());
    assert_eq!(
        accepted.expect_err("no connection").kind(),
        ErrorKind::WouldBlock
    );
    std::thread::sleep(Duration::from_millis(5));
    let pool = temp_pool("before-boot");
    let network = Arc::new(Network::new(
        (*pool).clone(),
        Settings::load(&pool),
        Point::absent(VPN_POINT),
    ));
    let installed_at = now_ms();
    network.install().expect("install the policy");
    let filter = FlowFilter {
        limit: 10,
        purpose: Some("metadata".to_string()),
        ..FlowFilter::default()
    };
    let flows = network.flows(&filter).flows;
    assert_eq!(flows.len(), 1, "{flows:?}");
    let flow = &flows[0];
    assert_eq!(flow.caller, CORE);
    assert_eq!((flow.host.as_str(), flow.port), ("127.0.0.1", port));
    assert_eq!(flow.route, FlowRoute::Blocked);
    assert_eq!(flow.rule, None);
    assert!(
        (called_at..=finished_at).contains(&flow.at) && flow.at < installed_at,
        "journaled at {}, called in {called_at}..={finished_at}, installed at {installed_at}",
        flow.at
    );
}
