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
