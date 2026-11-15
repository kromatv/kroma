use std::time::{Duration, Instant};

use super::footprint::MIB;

const RESERVE_FLOOR: u64 = 256 * MIB;
const RESERVE_SHARE: u64 = 16;
const SAMPLE_EVERY: Duration = Duration::from_millis(250);
const STALE: Duration = Duration::from_secs(5);
const SWAPPING_PAGES_PER_S: f64 = 256.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Memory {
    pub(super) total: u64,
    pub(super) available: u64,
}

impl Memory {
    pub(super) fn reserve(self) -> u64 {
        (self.total / RESERVE_SHARE).max(RESERVE_FLOOR)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) enum Swap {
    Calm,
    Swapping(u64),
    #[default]
    Unmeasured,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Reading {
    pub(super) memory: Memory,
    pub(super) swap: Swap,
}

#[derive(Default)]
pub(super) struct SwapWatch {
    sampled: Option<(Instant, u64)>,
    verdict: Swap,
}

impl SwapWatch {
    pub(super) fn observe(&mut self, at: Instant, swapped_in: u64) -> Swap {
        if let Some((then, before)) = self.sampled {
            let window = at.saturating_duration_since(then);
            if window < SAMPLE_EVERY {
                return self.verdict;
            }
            self.verdict = match window > STALE {
                true => Swap::Unmeasured,
                false => rate(swapped_in.saturating_sub(before), window),
            };
        }
        self.sampled = Some((at, swapped_in));
        self.verdict
    }
}

fn rate(pages: u64, window: Duration) -> Swap {
    let per_s = pages as f64 / window.as_secs_f64();
    match per_s > SWAPPING_PAGES_PER_S {
        true => Swap::Swapping(per_s as u64),
        false => Swap::Calm,
    }
}

pub(super) fn read(watch: &mut SwapWatch, at: Instant) -> Option<Reading> {
    let memory = parse_meminfo(&std::fs::read_to_string("/proc/meminfo").ok()?)?;
    let swap = std::fs::read_to_string("/proc/vmstat")
        .ok()
        .and_then(|text| parse_swapped_in(&text))
        .map_or(Swap::Calm, |pages| watch.observe(at, pages));
    Some(Reading { memory, swap })
}

pub(super) fn parse_meminfo(text: &str) -> Option<Memory> {
    let kib = |name: &str| {
        text.lines().find_map(|line| {
            line.strip_prefix(name)?
                .strip_prefix(':')?
                .trim()
                .strip_suffix("kB")?
                .trim()
                .parse::<u64>()
                .ok()
        })
    };
    Some(Memory {
        total: kib("MemTotal")? * 1024,
        available: kib("MemAvailable")? * 1024,
    })
}

pub(super) fn parse_swapped_in(text: &str) -> Option<u64> {
    text.lines()
        .find_map(|line| line.strip_prefix("pswpin ")?.trim().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MEMINFO: &str = "MemTotal:        3866684 kB\nMemFree:          121556 kB\nMemAvailable:     448472 kB\nSwapTotal:       4419500 kB\n";

    #[test]
    fn reads_total_and_available_memory_in_bytes() {
        let memory = parse_meminfo(MEMINFO);

        assert_eq!(
            memory,
            Some(Memory {
                total: 3_866_684 * 1024,
                available: 448_472 * 1024,
            })
        );
    }

    #[test]
    fn a_kernel_that_does_not_estimate_available_memory_gives_no_reading() {
        let memory = parse_meminfo("MemTotal:        3866684 kB\nMemFree:          121556 kB\n");

        assert_eq!(memory, None);
    }

    #[test]
    fn reads_the_pages_swapped_in_since_boot() {
        let pages = parse_swapped_in("pgpgout 88\npswpin 12200482\npswpout 15917365\n");

        assert_eq!(pages, Some(12_200_482));
    }

    #[test]
    fn a_small_box_keeps_the_floor_and_a_large_one_a_sixteenth() {
        let small = Memory {
            total: 2048 * MIB,
            available: 0,
        };
        let large = Memory {
            total: 32 * 1024 * MIB,
            available: 0,
        };

        let reserves = [small.reserve(), large.reserve()];

        assert_eq!(reserves, [256 * MIB, 2048 * MIB]);
    }

    #[test]
    fn the_first_sample_cannot_tell_a_swapping_host_from_a_calm_one() {
        let mut watch = SwapWatch::default();

        let swap = watch.observe(Instant::now(), 12_200_482);

        assert_eq!(swap, Swap::Unmeasured);
    }

    #[test]
    fn a_thousand_pages_a_second_coming_back_in_is_swapping() {
        let mut watch = SwapWatch::default();
        let start = Instant::now();
        watch.observe(start, 12_200_482);

        let swap = watch.observe(start + Duration::from_secs(2), 12_202_482);

        assert_eq!(swap, Swap::Swapping(1000));
    }

    #[test]
    fn a_trickle_of_pages_coming_back_in_is_calm() {
        let mut watch = SwapWatch::default();
        let start = Instant::now();
        watch.observe(start, 500);

        let swap = watch.observe(start + Duration::from_secs(1), 520);

        assert_eq!(swap, Swap::Calm);
    }

    #[test]
    fn a_second_look_within_the_window_repeats_the_last_verdict() {
        let mut watch = SwapWatch::default();
        let start = Instant::now();
        watch.observe(start, 0);
        watch.observe(start + Duration::from_secs(1), 5_000);

        let swap = watch.observe(start + Duration::from_millis(1_100), 5_000);

        assert_eq!(swap, Swap::Swapping(5_000));
    }

    #[test]
    fn a_sample_from_long_ago_says_nothing_about_now() {
        let mut watch = SwapWatch::default();
        let start = Instant::now();
        watch.observe(start, 0);

        let swap = watch.observe(start + Duration::from_secs(3600), 10);

        assert_eq!(swap, Swap::Unmeasured);
    }
}
