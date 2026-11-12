use super::*;

fn exchange(port: u16) -> Exchange {
    Exchange {
        purpose: "test-backlog",
        method: "GET",
        host: "example.test".to_string(),
        port,
        route: Route::Blocked,
        status: None,
        bytes_in: 0,
        bytes_out: 0,
        duration_ms: 0,
        error: None,
        rule: None,
        carried: false,
    }
}

#[test]
fn the_backlog_keeps_the_first_exchanges_and_drops_the_rest() {
    let mut pending = Vec::new();

    for port in 0..=MAX_PENDING as u16 {
        keep(&mut pending, exchange(port), SystemTime::UNIX_EPOCH);
    }

    assert_eq!(pending.len(), MAX_PENDING);
    assert_eq!(pending.first().map(|(kept, _)| kept.port), Some(0));
    assert_eq!(
        pending.last().map(|(kept, _)| kept.port),
        Some(MAX_PENDING as u16 - 1)
    );
}

fn ruled(decision: Decision) -> Ruling {
    Ruling {
        decision,
        rule: Some("r-1".to_string()),
    }
}

#[test]
fn a_direct_call_opens_on_the_direct_route_with_the_rule_that_let_it() {
    let ruling = ruled(Decision::Direct);

    let (exchange, refusal) =
        Exchange::direct_only("test", "SMTP", "mail.test".into(), 587, ruling, "no proxy");

    assert_eq!(refusal, None);
    assert_eq!(exchange.route, Route::Direct);
    assert_eq!((exchange.host.as_str(), exchange.port), ("mail.test", 587));
    assert_eq!(exchange.rule.as_deref(), Some("r-1"));
}

#[test]
fn a_blocked_call_is_refused_with_the_gate_reason() {
    let ruling = ruled(Decision::Block("off hours".into()));

    let (exchange, refusal) =
        Exchange::direct_only("test", "GET", "example.test".into(), 443, ruling, "no proxy");

    assert_eq!(refusal, Some(format!("{BLOCKED}: off hours")));
    assert_eq!(exchange.route, Route::Blocked);
}

#[test]
fn a_call_sent_to_a_proxy_is_refused_with_the_client_reason() {
    let ruling = ruled(Decision::Proxy("socks5://127.0.0.1:9".into()));

    let (exchange, refusal) =
        Exchange::direct_only("test", "GET", "example.test".into(), 443, ruling, "no proxy");

    assert_eq!(refusal, Some(format!("{BLOCKED}: no proxy")));
    assert_eq!(exchange.route, Route::Blocked);
}
