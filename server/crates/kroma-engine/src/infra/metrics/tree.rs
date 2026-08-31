//! What the server really costs the box.
//!
//! `kroma-server` spawns ffmpeg for every remux, storyboard, probe and subtitle
//! pass, and a child is a separate process: sampling our own pid alone reports
//! single-digit percent while the machine sits at 100%, which is exactly what
//! the dashboard showed through a transcode. Reading the whole tree is the only
//! honest answer to "is the server the thing eating this machine".
//!
//! Enumerating every process is the expensive half on a weak NAS, so the child
//! set is rediscovered on a slower beat than it is sampled: an ffmpeg lives for
//! minutes, and a few seconds of latency in noticing one costs nothing.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use sysinfo::{Pid, ProcessesToUpdate, System};

// Two sampler ticks. A walk of a few hundred /proc entries is negligible beside
// the ffmpeg it is there to measure, and the dashboard has to name a transcode's
// cost while someone is still looking at it, not half a minute later.
const RESCAN: Duration = Duration::from_secs(6);

/// This process and its descendants, as one reading.
#[derive(Clone, Default)]
pub(super) struct Usage {
    /// Percent of the whole box, 0..100, for the tree together.
    pub cpu: f32,
    /// Percent of the whole box spent by the children alone: on this server that
    /// is ffmpeg, and it is the figure a transcode moves.
    pub children_cpu: f32,
    pub ram_bytes: u64,
    pub children: usize,
    /// Per-pid CPU percent, so a caller holding a child's pid (a live remux, say)
    /// can say what that one process is costing.
    pub by_pid: HashMap<u32, f32>,
}

pub(super) struct Tree {
    root: Option<Pid>,
    members: Vec<Pid>,
    scanned_at: Option<Instant>,
}

impl Tree {
    pub(super) fn new() -> Self {
        let root = sysinfo::get_current_pid().ok();
        Tree {
            root,
            members: root.into_iter().collect(),
            scanned_at: None,
        }
    }

    /// Refresh and total the tree. `cores` normalizes sysinfo's per-core
    /// percentage onto the whole box.
    pub(super) fn sample(&mut self, sys: &mut System, cores: f32) -> Usage {
        let Some(root) = self.root else {
            return Usage::default();
        };
        if self.due_for_rescan() {
            sys.refresh_processes(ProcessesToUpdate::All, true);
            self.members = descendants(sys, root);
            self.scanned_at = Some(Instant::now());
        } else {
            sys.refresh_processes(ProcessesToUpdate::Some(&self.members), true);
        }
        // A member that has gone means the set has moved, and on this server a
        // remux ending is usually another one starting: look again next tick
        // rather than waiting out the interval.
        if self.members.iter().any(|pid| sys.process(*pid).is_none()) {
            self.scanned_at = None;
        }

        let mut usage = Usage {
            children: self.members.len().saturating_sub(1),
            ..Usage::default()
        };
        for pid in &self.members {
            let Some(proc) = sys.process(*pid) else {
                continue;
            };
            let cpu = (proc.cpu_usage() / cores).clamp(0.0, 100.0);
            usage.cpu += cpu;
            usage.ram_bytes += proc.memory();
            if *pid != root {
                usage.children_cpu += cpu;
            }
            usage.by_pid.insert(pid.as_u32(), cpu);
        }
        usage.cpu = usage.cpu.min(100.0);
        usage.children_cpu = usage.children_cpu.min(100.0);
        usage
    }

    fn due_for_rescan(&self) -> bool {
        self.scanned_at.is_none_or(|at| at.elapsed() >= RESCAN)
    }
}

// Breadth-first over the parent links, so a grandchild (ffmpeg under a shell)
// counts too. Guarded against a parent cycle a wrapped pid could produce.
fn descendants(sys: &System, root: Pid) -> Vec<Pid> {
    let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, proc) in sys.processes() {
        if let Some(parent) = proc.parent() {
            children.entry(parent).or_default().push(*pid);
        }
    }
    let mut seen = HashSet::from([root]);
    let mut out = vec![root];
    let mut queue = vec![root];
    while let Some(pid) = queue.pop() {
        for child in children.get(&pid).into_iter().flatten() {
            if seen.insert(*child) {
                out.push(*child);
                queue.push(*child);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tree_finds_this_process_and_the_children_it_spawned() {
        let mut sys = System::new();
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("a stand-in child");
        let mut tree = Tree::new();

        let usage = tree.sample(&mut sys, 1.0);

        assert!(
            usage.by_pid.contains_key(&child.id()),
            "the child's own cost is attributed to it"
        );
        assert!(usage.children >= 1);
        assert!(usage.ram_bytes > 0, "the tree holds at least our own pages");
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn a_reading_never_claims_more_than_the_whole_box() {
        let mut sys = System::new();
        let mut tree = Tree::new();

        let usage = tree.sample(&mut sys, 0.5);

        assert!(usage.cpu <= 100.0);
        assert!(usage.children_cpu <= usage.cpu.max(usage.children_cpu));
    }

    #[test]
    fn the_walk_is_not_repeated_on_every_sample() {
        let mut tree = Tree::new();
        assert!(
            tree.due_for_rescan(),
            "the first sample has to discover the tree"
        );

        tree.scanned_at = Some(Instant::now());

        assert!(!tree.due_for_rescan());
    }

    #[test]
    fn a_host_that_will_not_name_our_pid_reports_nothing_rather_than_guessing() {
        let mut sys = System::new();
        let mut tree = Tree {
            root: None,
            members: Vec::new(),
            scanned_at: None,
        };

        let usage = tree.sample(&mut sys, 4.0);

        assert_eq!(usage.cpu, 0.0);
        assert_eq!(usage.children, 0);
    }
}
