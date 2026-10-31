//! The sidecar's sink: each finished call joins a buffer that a thread of its
//! own sends to the core's journal every couple of seconds, or sooner once a
//! batch fills. The caller never waits on the send.

use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::time::Duration;

use kroma_http::egress::{Exchange, Route};
use kroma_module_wire::{NetworkFlow, NetworkRoute};

const FLUSH_EVERY: Duration = Duration::from_secs(2);
const BATCH: usize = 100;
const MAX_BUFFERED: usize = 1000;

#[derive(Default)]
pub(crate) struct Reporter {
    buffer: Mutex<VecDeque<NetworkFlow>>,
    filled: Condvar,
}

impl Reporter {
    pub(crate) fn start(send: impl Fn(Vec<NetworkFlow>) + Send + 'static) -> Arc<Self> {
        let reporter = Arc::new(Self::default());
        let flushing = Arc::clone(&reporter);
        let started = std::thread::Builder::new()
            .name("kroma-egress-report".into())
            .spawn(move || {
                loop {
                    let batch = flushing.next_batch();
                    if !batch.is_empty() {
                        send(batch);
                    }
                }
            });
        if let Err(error) = started {
            tracing::warn!(%error, "the network journal reporter could not start");
        }
        reporter
    }

    pub(crate) fn push(&self, exchange: Exchange) {
        let mut buffer = self.buffer.lock().unwrap_or_else(PoisonError::into_inner);
        if buffer.len() >= MAX_BUFFERED {
            buffer.pop_front();
        }
        buffer.push_back(flow_of(exchange));
        if buffer.len() >= BATCH {
            self.filled.notify_one();
        }
    }

    fn next_batch(&self) -> Vec<NetworkFlow> {
        let buffer = self.buffer.lock().unwrap_or_else(PoisonError::into_inner);
        let (mut buffer, _) = self
            .filled
            .wait_timeout_while(buffer, FLUSH_EVERY, |b| b.len() < BATCH)
            .unwrap_or_else(PoisonError::into_inner);
        let take = buffer.len().min(BATCH);
        buffer.drain(..take).collect()
    }
}

fn flow_of(exchange: Exchange) -> NetworkFlow {
    let route = match exchange.route {
        Route::Direct => NetworkRoute::Direct,
        Route::Proxy => NetworkRoute::Proxy,
        Route::Blocked => NetworkRoute::Blocked,
    };
    NetworkFlow {
        purpose: exchange.purpose.to_string(),
        method: exchange.method.to_string(),
        host: exchange.host,
        port: exchange.port,
        route,
        status: exchange.status,
        bytes_in: exchange.bytes_in,
        bytes_out: exchange.bytes_out,
        duration_ms: exchange.duration_ms,
        error: exchange.error,
        rule: exchange.rule,
    }
}

#[cfg(test)]
mod tests;
