use std::time::{Duration, Instant};

const DATAGRAMS_PER_SECOND: f64 = 1000.0;
const BYTES_PER_SECOND: f64 = 1024.0 * 1024.0;
const LARGEST_DATAGRAM: f64 = 65_535.0;

pub(super) struct Budget {
    datagrams: f64,
    bytes: f64,
    at: Instant,
}

fn size(bytes: usize) -> f64 {
    f64::from(u32::try_from(bytes).unwrap_or(u32::MAX))
}

impl Budget {
    pub(super) fn full() -> Self {
        Self {
            datagrams: DATAGRAMS_PER_SECOND,
            bytes: BYTES_PER_SECOND,
            at: Instant::now(),
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.at).as_secs_f64();
        self.at = now;
        self.datagrams = (self.datagrams + elapsed * DATAGRAMS_PER_SECOND).min(DATAGRAMS_PER_SECOND);
        self.bytes = (self.bytes + elapsed * BYTES_PER_SECOND).min(BYTES_PER_SECOND);
    }

    pub(super) fn take(&mut self, bytes: usize) -> bool {
        self.refill();
        let bytes = size(bytes);
        if self.datagrams < 1.0 || self.bytes < bytes {
            return false;
        }
        self.datagrams -= 1.0;
        self.bytes -= bytes;
        true
    }

    pub(super) fn spent(&mut self) -> bool {
        self.refill();
        self.datagrams < 1.0 || self.bytes < 1.0
    }

    pub(super) fn wait(&mut self) -> Duration {
        self.refill();
        let for_datagram = (1.0 - self.datagrams).max(0.0) / DATAGRAMS_PER_SECOND;
        let for_bytes = (LARGEST_DATAGRAM - self.bytes).max(0.0) / BYTES_PER_SECOND;
        Duration::from_secs_f64(for_datagram.max(for_bytes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drained() -> Budget {
        Budget {
            datagrams: 0.0,
            bytes: 0.0,
            at: Instant::now(),
        }
    }

    #[test]
    fn a_full_budget_takes_a_second_of_datagrams_and_no_more() {
        let mut budget = Budget::full();

        let taken = (0..1100).filter(|_| budget.take(16)).count();

        assert!((1000..1010).contains(&taken), "{taken}");
        assert!(budget.spent());
    }

    #[test]
    fn a_datagram_larger_than_what_is_left_waits() {
        let mut budget = Budget {
            bytes: 100.0,
            ..Budget::full()
        };

        let taken = budget.take(1000);

        assert!(!taken);
        assert!(budget.wait() > Duration::ZERO);
    }

    #[test]
    fn a_spent_budget_fills_again_with_time() {
        let mut budget = drained();
        budget.at -= Duration::from_millis(500);

        let taken = budget.take(1000);

        assert!(taken);
        assert!(!budget.spent());
    }

    #[test]
    fn a_full_budget_has_nothing_to_wait_for() {
        let mut budget = Budget::full();

        assert_eq!(budget.wait(), Duration::ZERO);
    }
}
