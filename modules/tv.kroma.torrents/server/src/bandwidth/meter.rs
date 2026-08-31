use crate::db::{BandwidthSample, TransferredBytes};

pub const STEP: i64 = 60;

const MAX_GAP: i64 = 2 * STEP;

/// Whether the bridge was carrying the embedded engine's traffic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Seal {
    NoBridge,
    Held,
    Broken,
}

/// Turns the engine's lifetime counters into closed windows of bytes. The first
/// reading of a process seeds the baseline and emits nothing.
#[derive(Debug, Default)]
pub struct Meter {
    last: Option<(i64, TransferredBytes)>,
    open: Option<BandwidthSample>,
}

impl Meter {
    pub fn read(
        &mut self,
        at_secs: i64,
        counters: TransferredBytes,
        seal: Seal,
    ) -> Option<BandwidthSample> {
        let previous = self.last.replace((at_secs, counters))?;
        let elapsed = (at_secs - previous.0).clamp(0, MAX_GAP);
        let moved = moved_since(previous.1, counters);
        let closed = self.close_if_stale(at_secs);
        if moved == TransferredBytes::default() && seal != Seal::Broken {
            return closed;
        }
        let open = self
            .open
            .get_or_insert_with(|| BandwidthSample {
                at: at_secs.div_euclid(STEP) * STEP,
                step_secs: STEP,
                ..BandwidthSample::default()
            });
        match seal {
            Seal::Held => {
                open.sealed_down_bytes += moved.embedded_down;
                open.sealed_up_bytes += moved.embedded_up;
                open.sealed_secs += elapsed;
            }
            Seal::Broken => {
                open.unsealed_down_bytes += moved.embedded_down;
                open.unsealed_up_bytes += moved.embedded_up;
                open.unsealed_secs += elapsed;
            }
            Seal::NoBridge => {
                open.bypass_down_bytes += moved.embedded_down;
                open.bypass_up_bytes += moved.embedded_up;
            }
        }
        open.bypass_down_bytes += moved.external_down;
        open.bypass_up_bytes += moved.external_up;
        closed
    }

    fn close_if_stale(&mut self, at_secs: i64) -> Option<BandwidthSample> {
        let opened_at = at_secs.div_euclid(STEP) * STEP;
        if self.open.as_ref().is_some_and(|open| open.at != opened_at) {
            return self.open.take();
        }
        None
    }
}

fn moved_since(previous: TransferredBytes, now: TransferredBytes) -> TransferredBytes {
    TransferredBytes {
        embedded_down: now.embedded_down.saturating_sub(previous.embedded_down),
        embedded_up: now.embedded_up.saturating_sub(previous.embedded_up),
        external_down: now.external_down.saturating_sub(previous.external_down),
        external_up: now.external_up.saturating_sub(previous.external_up),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn embedded(down: u64, up: u64) -> TransferredBytes {
        TransferredBytes {
            embedded_down: down,
            embedded_up: up,
            ..TransferredBytes::default()
        }
    }

    #[test]
    fn the_first_reading_of_a_process_only_seeds_the_baseline() {
        let mut meter = Meter::default();

        let closed = meter.read(0, embedded(9_000_000, 0), Seal::Held);

        assert_eq!(closed, None);
    }

    #[test]
    fn a_window_closes_when_the_clock_crosses_into_the_next_one() {
        let mut meter = Meter::default();
        meter.read(0, embedded(0, 0), Seal::Held);
        meter.read(5, embedded(1_000, 200), Seal::Held);

        let closed = meter.read(65, embedded(1_500, 300), Seal::Held).unwrap();

        assert_eq!(closed.at, 0);
        assert_eq!(closed.step_secs, STEP);
        assert_eq!(closed.sealed_down_bytes, 1_000);
        assert_eq!(closed.sealed_up_bytes, 200);
        assert_eq!(closed.sealed_secs, 5);
    }

    #[test]
    fn traffic_on_a_configured_bridge_that_is_not_sealed_is_recorded_apart() {
        let mut meter = Meter::default();
        meter.read(0, embedded(0, 0), Seal::Broken);
        meter.read(30, embedded(4_000, 0), Seal::Broken);

        let closed = meter.read(60, embedded(4_000, 0), Seal::Broken).unwrap();

        assert_eq!(closed.sealed_down_bytes, 0);
        assert_eq!(closed.unsealed_down_bytes, 4_000);
        assert_eq!(closed.unsealed_secs, 30);
    }

    #[test]
    fn a_broken_bridge_is_recorded_even_when_nothing_moved() {
        let mut meter = Meter::default();
        meter.read(0, embedded(0, 0), Seal::Broken);
        meter.read(30, embedded(0, 0), Seal::Broken);

        let closed = meter.read(60, embedded(0, 0), Seal::Broken).unwrap();

        assert_eq!(closed.unsealed_secs, 30);
        assert_eq!(closed.unsealed_down_bytes, 0);
    }

    #[test]
    fn an_idle_engine_with_no_bridge_opens_no_window_at_all() {
        let mut meter = Meter::default();
        meter.read(0, embedded(500, 0), Seal::NoBridge);
        meter.read(30, embedded(500, 0), Seal::NoBridge);

        let closed = meter.read(600, embedded(500, 0), Seal::NoBridge);

        assert_eq!(closed, None);
    }

    #[test]
    fn an_external_engine_never_counts_as_tunnelled_however_sealed_the_bridge_is() {
        let mut meter = Meter::default();
        meter.read(0, TransferredBytes::default(), Seal::Held);
        meter.read(
            30,
            TransferredBytes {
                embedded_down: 100,
                external_down: 900,
                ..TransferredBytes::default()
            },
            Seal::Held,
        );

        let closed = meter
            .read(60, TransferredBytes::default(), Seal::Held)
            .unwrap();

        assert_eq!(closed.sealed_down_bytes, 100);
        assert_eq!(closed.bypass_down_bytes, 900);
    }

    #[test]
    fn a_counter_that_went_backwards_credits_no_traffic() {
        let mut meter = Meter::default();
        meter.read(0, embedded(9_000, 0), Seal::Held);
        meter.read(30, embedded(10, 0), Seal::Held);

        let closed = meter.read(60, embedded(10, 0), Seal::Held);

        assert_eq!(closed, None);
    }

    #[test]
    fn a_long_gap_credits_at_most_two_windows_of_seal_time() {
        let mut meter = Meter::default();
        meter.read(0, embedded(0, 0), Seal::Held);
        meter.read(86_400, embedded(1_000, 0), Seal::Held);

        let closed = meter.read(86_500, embedded(1_000, 0), Seal::Held).unwrap();

        assert_eq!(closed.sealed_secs, MAX_GAP);
        assert_eq!(closed.sealed_down_bytes, 1_000);
    }
}
