use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Clone, Default)]
pub(super) struct Bytes {
    pub(super) lan: Arc<AtomicU64>,
    pub(super) wan: Arc<AtomicU64>,
}

impl Bytes {
    pub(super) fn sink(&self, is_lan: bool) -> ByteSink {
        ByteSink(Some(if is_lan {
            self.lan.clone()
        } else {
            self.wan.clone()
        }))
    }

    pub(super) fn read(&self) -> (u64, u64) {
        (
            self.lan.load(Ordering::Relaxed),
            self.wan.load(Ordering::Relaxed),
        )
    }
}

/// A cheap, cloneable handle a streaming response adds its delivered bytes to.
/// An empty sink (`ByteSink::none`) is a no-op, for byte streams that shouldn't
/// count toward media bandwidth (e.g. UI theme songs).
#[derive(Clone, Default)]
pub struct ByteSink(Option<Arc<AtomicU64>>);

impl ByteSink {
    pub fn none() -> Self {
        ByteSink(None)
    }

    pub fn add(&self, n: u64) {
        if let Some(c) = &self.0 {
            c.fetch_add(n, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
impl ByteSink {
    pub(crate) fn counting() -> (Self, Arc<AtomicU64>) {
        let counter = Arc::new(AtomicU64::new(0));
        (ByteSink(Some(counter.clone())), counter)
    }
}

pub(super) fn mbps(bytes: u64, dt: f64) -> f64 {
    (bytes as f64) * 8.0 / dt / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mbps_converts_bytes_over_time() {
        assert!((mbps(1_000_000, 1.0) - 8.0).abs() < 1e-9);
        assert!((mbps(1_000_000, 2.0) - 4.0).abs() < 1e-9);
        assert_eq!(mbps(0, 3.0), 0.0);
    }

    #[test]
    fn a_sink_routes_bytes_to_the_counter_its_network_class_names() {
        let bytes = Bytes::default();

        bytes.sink(true).add(1_000);
        bytes.sink(true).add(500);
        bytes.sink(false).add(200);

        assert_eq!(bytes.read(), (1_500, 200));
    }

    #[test]
    fn an_empty_sink_counts_nowhere() {
        ByteSink::none().add(9_999);
        ByteSink::default().add(9_999);
    }
}
