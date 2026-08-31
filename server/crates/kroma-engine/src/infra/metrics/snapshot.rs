use serde::Serialize;

use super::range::Range;

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Means {
    pub cpu_kroma: f32,
    pub cpu_system: f32,
    pub cpu_media: f32,
    pub ram_kroma: f32,
    pub ram_system: f32,
    pub bw_local: f64,
    pub bw_remote: f64,
}

/// Time-series history (oldest → newest). Percentages are 0..100.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub cpu_kroma: Vec<f32>,
    pub cpu_system: Vec<f32>,
    pub cpu_media: Vec<f32>,
    pub ram_kroma: Vec<f32>,
    pub ram_system: Vec<f32>,
    pub bw_local: Vec<f64>,
    pub bw_remote: Vec<f64>,
}

impl Series {
    pub(super) fn push(&mut self, point: Means) {
        self.cpu_kroma.push(point.cpu_kroma);
        self.cpu_system.push(point.cpu_system);
        self.cpu_media.push(point.cpu_media);
        self.ram_kroma.push(point.ram_kroma);
        self.ram_system.push(point.ram_system);
        self.bw_local.push(point.bw_local);
        self.bw_remote.push(point.bw_remote);
    }

    pub(super) fn drop_oldest(&mut self) {
        self.cpu_kroma.remove(0);
        self.cpu_system.remove(0);
        self.cpu_media.remove(0);
        self.ram_kroma.remove(0);
        self.ram_system.remove(0);
        self.bw_local.remove(0);
        self.bw_remote.remove(0);
    }

    pub(super) fn len(&self) -> usize {
        self.cpu_kroma.len()
    }
}

/// A point-in-time metrics snapshot plus the history series over `range`.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// The whole process tree, not the server process alone.
    pub cpu_kroma: f32,
    pub cpu_system: f32,
    /// What the ffmpeg children alone are costing, out of `cpu_kroma`.
    pub cpu_media: f32,
    pub media_procs: usize,
    pub ram_kroma_bytes: u64,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub bw_local_mbps: f64,
    pub bw_remote_mbps: f64,
    pub uptime_secs: u64,
    pub cores: usize,
    pub sample_interval_ms: u64,
    pub series: Series,
    pub range: Range,
    pub started_at: i64,
    pub step_secs: i64,
    pub means: Means,
    /// False where the record does not cover the whole window, so a client says
    /// the server has not been running that long rather than drawing zeroes.
    pub complete: bool,
}
