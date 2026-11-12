use std::time::Duration;

const FIRST_WAIT: Duration = Duration::from_secs(5);
const LONGEST_WAIT: Duration = Duration::from_secs(300);
const STEADY_RUN: Duration = Duration::from_secs(60);

#[derive(Debug, Default)]
pub(crate) struct Backoff {
    quick_exits: u32,
}

impl Backoff {
    pub(crate) fn after(&mut self, ran: Duration) -> Duration {
        if ran >= STEADY_RUN {
            self.quick_exits = 0;
        }
        let wait = FIRST_WAIT
            .saturating_mul(2_u32.saturating_pow(self.quick_exits))
            .min(LONGEST_WAIT);
        self.quick_exits = self.quick_exits.saturating_add(1);
        wait
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secs(waits: &[Duration]) -> Vec<u64> {
        waits.iter().map(Duration::as_secs).collect()
    }

    #[test]
    fn a_bridge_that_keeps_dying_waits_twice_as_long_each_time_up_to_five_minutes() {
        let mut backoff = Backoff::default();

        let waits: Vec<Duration> = (0..9)
            .map(|_| backoff.after(Duration::from_secs(3)))
            .collect();

        assert_eq!(secs(&waits), [5, 10, 20, 40, 80, 160, 300, 300, 300]);
    }

    #[test]
    fn a_bridge_that_ran_steadily_is_restarted_after_the_first_wait_again() {
        let mut backoff = Backoff::default();
        for _ in 0..4 {
            backoff.after(Duration::from_secs(3));
        }

        let after_a_steady_run = backoff.after(STEADY_RUN);
        let after_the_next_quick_exit = backoff.after(Duration::from_secs(3));

        assert_eq!(after_a_steady_run, FIRST_WAIT);
        assert_eq!(after_the_next_quick_exit, FIRST_WAIT * 2);
    }

    #[test]
    fn the_wait_never_overflows_however_many_times_the_bridge_dies() {
        let mut backoff = Backoff {
            quick_exits: u32::MAX,
        };

        assert_eq!(backoff.after(Duration::ZERO), LONGEST_WAIT);
    }
}
