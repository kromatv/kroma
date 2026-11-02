use std::path::PathBuf;
use std::process::Command;
use std::sync::PoisonError;

use super::{signal, Programs, State};

fn is_named(pid: u32, program: &str) -> bool {
    Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .is_ok_and(|out| String::from_utf8_lossy(&out.stdout).contains(program))
}

impl Programs {
    // What a server that died without stopping its modules left running. The file
    // lists every pid of this program, so a short run such as `--version` cannot
    // hide a long one.
    pub(super) fn reap_stale(&self, program: &str) -> Vec<u32> {
        let recorded = std::fs::read_to_string(self.pid_file(program)).unwrap_or_default();
        let children = self.children.lock().unwrap_or_else(PoisonError::into_inner);
        let ours: Vec<u32> = children
            .values()
            .filter(|spawned| matches!(spawned.state, State::Running(_)))
            .map(|spawned| spawned.pid)
            .collect();
        drop(children);
        let mut kept = Vec::new();
        for pid in recorded.lines().filter_map(|line| line.trim().parse::<u32>().ok()) {
            if ours.contains(&pid) {
                kept.push(pid);
            } else if is_named(pid, program) {
                tracing::warn!(module = %self.module, program, pid, "stopping what an earlier run left");
                signal(pid, libc::SIGKILL);
            }
        }
        kept
    }

    pub(super) fn pid_file(&self, program: &str) -> PathBuf {
        self.helpers_dir.join(format!("{program}.pid"))
    }

    pub(super) fn note_pids(&self, program: &str, pids: &[u32]) {
        let lines: String = pids.iter().map(|pid| format!("{pid}\n")).collect();
        let _ = std::fs::write(self.pid_file(program), lines);
    }

    /// Stop what an earlier server left of this module's helpers, before it starts.
    pub(in crate::component) fn reap_all_stale(&self) {
        for program in self.helpers.keys() {
            let kept = self.reap_stale(program);
            self.note_pids(program, &kept);
        }
    }
}
