use std::sync::mpsc;

use super::*;

fn exchange(port: u16) -> Exchange {
    Exchange {
        purpose: "indexer",
        method: "GET",
        host: "tracker.example".to_string(),
        port,
        route: Route::Proxy,
        status: Some(200),
        bytes_in: 10,
        bytes_out: 0,
        duration_ms: 3,
        error: None,
        rule: Some("r1".to_string()),
    }
}

fn reporting() -> (Arc<Reporter>, mpsc::Receiver<Vec<NetworkFlow>>) {
    let (sent, received) = mpsc::channel();
    let reporter = Reporter::start(move |batch| {
        let _ = sent.send(batch);
    });
    (reporter, received)
}

#[test]
fn a_full_batch_goes_before_the_interval_is_up() {
    let (reporter, received) = reporting();

    for port in 0..BATCH as u16 {
        reporter.push(exchange(port));
    }

    let batch = received.recv_timeout(FLUSH_EVERY / 2).unwrap();
    assert_eq!(batch.len(), BATCH);
    assert_eq!(batch[0].route, NetworkRoute::Proxy);
}

#[test]
fn a_partial_batch_goes_on_the_interval() {
    let (reporter, received) = reporting();

    reporter.push(exchange(1));
    reporter.push(exchange(2));

    let batch = received.recv_timeout(FLUSH_EVERY * 3).unwrap();
    let ports: Vec<u16> = batch.iter().map(|flow| flow.port).collect();
    assert_eq!(ports, [1, 2]);
}

#[test]
fn the_oldest_flows_are_dropped_past_the_buffer_cap() {
    let reporter = Reporter::default();

    for port in 0..=MAX_BUFFERED as u16 {
        reporter.push(exchange(port));
    }

    let buffer = reporter.buffer.lock().unwrap();
    assert_eq!(buffer.len(), MAX_BUFFERED);
    assert_eq!(buffer.front().unwrap().port, 1);
}
