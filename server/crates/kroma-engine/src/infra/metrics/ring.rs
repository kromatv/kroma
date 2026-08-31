use std::collections::HashMap;

use crate::process_started;

use super::snapshot::{Means, Series, Snapshot};
use super::{now_unix, HISTORY, SAMPLE_INTERVAL};

#[derive(Default)]
pub(super) struct Ring {
    series: Series,
    by_pid: HashMap<u32, f32>,
    current: Snapshot,
}

impl Ring {
    pub(super) fn push(&mut self, current: Snapshot, point: Means, by_pid: HashMap<u32, f32>) {
        self.series.push(point);
        if self.series.len() > HISTORY {
            self.series.drop_oldest();
        }
        self.by_pid = by_pid;
        self.current = current;
    }

    pub(super) fn live(&self) -> Snapshot {
        let step_secs = SAMPLE_INTERVAL.as_secs() as i64;
        Snapshot {
            uptime_secs: process_started().elapsed().as_secs(),
            sample_interval_ms: SAMPLE_INTERVAL.as_millis() as u64,
            step_secs,
            started_at: now_unix() - (self.series.len() as i64 - 1).max(0) * step_secs,
            means: self.means(),
            series: self.series.clone(),
            complete: true,
            ..self.current.clone()
        }
    }

    pub(super) fn process_cpu(&self, pid: u32) -> Option<f32> {
        self.by_pid.get(&pid).copied()
    }

    fn means(&self) -> Means {
        let n = self.series.len();
        if n == 0 {
            return Means::default();
        }
        let mean32 = |xs: &[f32]| xs.iter().sum::<f32>() / n as f32;
        let mean64 = |xs: &[f64]| xs.iter().sum::<f64>() / n as f64;
        Means {
            cpu_kroma: mean32(&self.series.cpu_kroma),
            cpu_system: mean32(&self.series.cpu_system),
            cpu_media: mean32(&self.series.cpu_media),
            ram_kroma: mean32(&self.series.ram_kroma),
            ram_system: mean32(&self.series.ram_system),
            bw_local: mean64(&self.series.bw_local),
            bw_remote: mean64(&self.series.bw_remote),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::metrics::Range;

    fn point(level: f32) -> Means {
        Means {
            cpu_kroma: level,
            cpu_system: level * 2.0,
            cpu_media: level / 2.0,
            ram_kroma: level,
            ram_system: level,
            bw_local: level as f64,
            bw_remote: level as f64 * 3.0,
        }
    }

    fn ring_of(levels: impl IntoIterator<Item = f32>) -> Ring {
        let mut ring = Ring::default();
        for level in levels {
            ring.push(Snapshot::default(), point(level), HashMap::new());
        }
        ring
    }

    #[test]
    fn the_live_window_reports_the_interval_the_sampler_really_runs_at() {
        let live = Ring::default().live();

        assert_eq!(live.sample_interval_ms, SAMPLE_INTERVAL.as_millis() as u64);
        assert_eq!(live.step_secs, 3);
        assert_eq!(live.range, Range::Live);
        assert!(live.complete);
    }

    #[test]
    fn the_ring_keeps_only_its_own_length() {
        let ring = ring_of((0..HISTORY + 20).map(|i| i as f32));

        let live = ring.live();

        assert_eq!(live.series.len(), HISTORY);
        assert_eq!(live.series.cpu_kroma[0], 20.0);
    }

    #[test]
    fn the_footer_means_the_ring_on_screen() {
        let ring = ring_of([10.0, 20.0, 60.0]);

        let live = ring.live();

        assert_eq!(live.means.cpu_kroma, 30.0);
        assert_eq!(live.means.bw_remote, 90.0);
    }

    #[test]
    fn one_childs_cost_can_be_read_back_by_its_pid() {
        let mut ring = Ring::default();

        ring.push(
            Snapshot::default(),
            Means::default(),
            HashMap::from([(4242, 87.5)]),
        );

        assert_eq!(ring.process_cpu(4242), Some(87.5));
        assert_eq!(ring.process_cpu(1), None);
    }

    #[test]
    fn the_media_share_is_kept_beside_the_tree_it_belongs_to() {
        let mut ring = Ring::default();

        ring.push(
            Snapshot {
                cpu_kroma: 62.0,
                cpu_media: 58.0,
                media_procs: 2,
                ..Snapshot::default()
            },
            point(58.0),
            HashMap::new(),
        );

        let live = ring.live();
        assert_eq!(live.cpu_media, 58.0);
        assert_eq!(live.media_procs, 2);
        assert_eq!(live.series.cpu_media, vec![29.0]);
    }
}
