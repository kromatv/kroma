use std::time::Instant;

use sysinfo::System;

use super::rollup::Rollup;
use super::snapshot::{Means, Snapshot};
use super::{bytes::mbps, now_unix, rollup, tree, Metrics, SAMPLE_INTERVAL};

pub(super) fn run(metrics: Metrics) {
    let mut sys = System::new();
    let cores = num_cpus_safe(&mut sys);
    let mut tree = tree::Tree::new();
    let (mut last_lan, mut last_wan) = metrics.bytes.read();
    let mut last_at = Instant::now();
    let mut rollup = Rollup::default();
    loop {
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let usage = tree.sample(&mut sys, cores);

        let cpu_system = sys.global_cpu_usage();
        let ram_total = sys.total_memory().max(1);
        let ram_used = sys.used_memory();
        let ram_system = (ram_used as f32 / ram_total as f32) * 100.0;
        let ram_kroma = (usage.ram_bytes as f32 / ram_total as f32) * 100.0;

        let (lan_now, wan_now) = metrics.bytes.read();
        let dt = last_at.elapsed().as_secs_f64();
        let (bw_local, bw_remote) = if dt > 0.0 {
            (
                mbps(lan_now.wrapping_sub(last_lan), dt),
                mbps(wan_now.wrapping_sub(last_wan), dt),
            )
        } else {
            (0.0, 0.0)
        };
        last_lan = lan_now;
        last_wan = wan_now;
        last_at = Instant::now();

        let point = Means {
            cpu_kroma: usage.cpu,
            cpu_system,
            cpu_media: usage.children_cpu,
            ram_kroma,
            ram_system,
            bw_local,
            bw_remote,
        };
        metrics.push(
            Snapshot {
                cpu_kroma: usage.cpu,
                cpu_system,
                cpu_media: usage.children_cpu,
                media_procs: usage.children,
                ram_kroma_bytes: usage.ram_bytes,
                ram_used_bytes: ram_used,
                ram_total_bytes: ram_total,
                bw_local_mbps: bw_local,
                bw_remote_mbps: bw_remote,
                cores: cores as usize,
                ..Snapshot::default()
            },
            point,
            usage.by_pid,
        );
        persist(&metrics, &mut rollup, point);

        std::thread::sleep(SAMPLE_INTERVAL);
    }
}

fn persist(metrics: &Metrics, rollup: &mut Rollup, point: Means) {
    let Some(closed) = rollup.add(now_unix(), point) else {
        return;
    };
    if let Err(e) = crate::db::record_metric_sample(&metrics.store, &closed) {
        tracing::warn!(error = %e, "metrics sample not stored");
        return;
    }
    if rollup::fold_due(closed.at) {
        if let Err(e) = rollup::fold(&metrics.store, closed.at) {
            tracing::warn!(error = %e, "metrics retention pass failed");
        }
    }
}

fn num_cpus_safe(sys: &mut System) -> f32 {
    sys.refresh_cpu_all();
    let n = sys.cpus().len();
    if n == 0 {
        1.0
    } else {
        n as f32
    }
}
