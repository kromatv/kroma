//! Live scan / enrichment activity, exposed at `GET /api/status`.
//!
//! Complements the `/api/events` WebSocket (which streams deltas) with a
//! queryable *snapshot*, so a client that connects mid-scan can still show
//! current progress (a Plex-style "Activity" panel). Behind a `std::sync::RwLock`
//! because the enrichment workers are plain threads.

use std::sync::{Arc, RwLock};

use serde::Serialize;

/// A snapshot of what the server is doing.
#[derive(Debug, Clone, Serialize)]
pub struct Activity {
    /// `idle` | `scanning` | `enriching` | `ready`.
    pub phase: &'static str,
    pub scanning: bool,
    pub libraries: usize,
    pub shows: usize,
    pub items: usize,
    #[serde(rename = "enrichDone")]
    pub enrich_done: usize,
    #[serde(rename = "enrichTotal")]
    pub enrich_total: usize,
    /// Background per-file probing (phase 2) progress.
    #[serde(rename = "probeDone")]
    pub probe_done: usize,
    #[serde(rename = "probeTotal")]
    pub probe_total: usize,
    #[serde(rename = "lastScanAt")]
    pub last_scan_at: Option<String>,
}

impl Default for Activity {
    fn default() -> Self {
        Self {
            phase: "idle",
            scanning: false,
            libraries: 0,
            shows: 0,
            items: 0,
            enrich_done: 0,
            enrich_total: 0,
            probe_done: 0,
            probe_total: 0,
            last_scan_at: None,
        }
    }
}

/// Cheap-to-clone shared handle.
pub type Shared = Arc<RwLock<Activity>>;

pub fn new() -> Shared {
    Arc::new(RwLock::new(Activity::default()))
}

pub fn snapshot(a: &Shared) -> Activity {
    a.read().unwrap().clone()
}

pub fn scan_started(a: &Shared) {
    let mut g = a.write().unwrap();
    g.phase = "scanning";
    g.scanning = true;
}

pub fn scan_completed(a: &Shared, libraries: usize, shows: usize, items: usize, when: String) {
    let mut g = a.write().unwrap();
    g.scanning = false;
    g.libraries = libraries;
    g.shows = shows;
    g.items = items;
    g.last_scan_at = Some(when);
    g.phase = "ready";
}

pub fn enrich_started(a: &Shared, total: usize) {
    let mut g = a.write().unwrap();
    g.phase = if total > 0 { "enriching" } else { "ready" };
    g.enrich_total = total;
    g.enrich_done = 0;
}

pub fn enrich_progress(a: &Shared, done: usize) {
    a.write().unwrap().enrich_done = done;
}

pub fn enrich_completed(a: &Shared) {
    let mut g = a.write().unwrap();
    g.enrich_done = g.enrich_total;
    g.phase = "ready";
}

pub fn probe_started(a: &Shared, total: usize) {
    let mut g = a.write().unwrap();
    if total > 0 {
        g.phase = "probing";
    }
    g.probe_total = total;
    g.probe_done = 0;
}

pub fn probe_progress(a: &Shared, done: usize) {
    a.write().unwrap().probe_done = done;
}

pub fn probe_completed(a: &Shared) {
    let mut g = a.write().unwrap();
    g.probe_done = g.probe_total;
    if g.phase == "probing" {
        g.phase = "ready";
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_idle_with_nothing_counted() {
        // What `GET /api/status` answers on a server that has just booted.
        let a = new();
        let s = snapshot(&a);
        assert_eq!(s.phase, "idle");
        assert!(!s.scanning);
        assert_eq!((s.libraries, s.shows, s.items), (0, 0, 0));
        assert!(s.last_scan_at.is_none());
    }

    #[test]
    fn a_snapshot_is_a_copy_rather_than_a_view() {
        // The panel renders from it after the lock is released; a view would let
        // the numbers shift underneath the render.
        let a = new();
        let before = snapshot(&a);
        scan_started(&a);
        assert_eq!(before.phase, "idle");
        assert_eq!(snapshot(&a).phase, "scanning");
    }

    #[test]
    fn a_scan_reports_its_counts_and_when_it_finished() {
        let a = new();
        scan_started(&a);
        assert!(snapshot(&a).scanning);

        scan_completed(&a, 2, 10, 340, "2026-06-10T12:00:00Z".into());
        let s = snapshot(&a);
        assert!(!s.scanning);
        assert_eq!((s.libraries, s.shows, s.items), (2, 10, 340));
        assert_eq!(s.last_scan_at.as_deref(), Some("2026-06-10T12:00:00Z"));
        assert_eq!(s.phase, "ready");
    }

    #[test]
    fn enriching_nothing_goes_straight_to_ready() {
        // A scan that enriched everything already has a total of 0. Saying
        // "enriching" there is a progress bar the user watches at 0/0 forever.
        let a = new();
        enrich_started(&a, 0);
        assert_eq!(snapshot(&a).phase, "ready");
        assert_eq!(snapshot(&a).enrich_total, 0);
    }

    #[test]
    fn enriching_reports_progress_and_lands_exactly_on_the_total() {
        let a = new();
        enrich_started(&a, 40);
        assert_eq!(snapshot(&a).phase, "enriching");

        enrich_progress(&a, 12);
        assert_eq!(snapshot(&a).enrich_done, 12);
        // Still enriching: progress alone must not flip the phase.
        assert_eq!(snapshot(&a).phase, "enriching");

        enrich_completed(&a);
        let s = snapshot(&a);
        // Snapped to the total rather than left at the last reported number, so
        // the bar never finishes at 39/40.
        assert_eq!(s.enrich_done, s.enrich_total);
        assert_eq!(s.phase, "ready");
    }

    #[test]
    fn a_second_enrich_pass_resets_the_counter() {
        let a = new();
        enrich_started(&a, 10);
        enrich_progress(&a, 10);
        enrich_started(&a, 3);
        // Carrying 10 into a 3-item pass shows 10/3.
        assert_eq!(snapshot(&a).enrich_done, 0);
        assert_eq!(snapshot(&a).enrich_total, 3);
    }

    #[test]
    fn probing_nothing_leaves_the_phase_alone() {
        let a = new();
        scan_started(&a);
        probe_started(&a, 0);
        // Nothing to probe, so it must not announce a phase - least of all
        // overwrite the scan that is still running.
        assert_eq!(snapshot(&a).phase, "scanning");
    }

    #[test]
    fn probing_reports_progress_and_lands_on_the_total() {
        let a = new();
        probe_started(&a, 8);
        assert_eq!(snapshot(&a).phase, "probing");

        probe_progress(&a, 3);
        assert_eq!(snapshot(&a).probe_done, 3);

        probe_completed(&a);
        let s = snapshot(&a);
        assert_eq!(s.probe_done, s.probe_total);
        assert_eq!(s.phase, "ready");
    }

    #[test]
    fn finishing_a_probe_does_not_clobber_a_scan_that_started_meanwhile() {
        let a = new();
        probe_started(&a, 5);
        // Probing runs in the background, so a scan can begin before it ends.
        scan_started(&a);
        probe_completed(&a);

        // The phase is only reset when it is still OURS. Otherwise the panel
        // would report "ready" while a scan is visibly running.
        assert_eq!(snapshot(&a).phase, "scanning");
        assert_eq!(snapshot(&a).probe_done, 5);
    }

    #[test]
    fn the_handle_is_shared_rather_than_copied() {
        // The scan threads hold clones; a per-clone copy would leave the API
        // reading a snapshot nobody updates.
        let a = new();
        let worker = Arc::clone(&a);
        scan_started(&worker);
        assert_eq!(snapshot(&a).phase, "scanning");
    }
}
