use std::sync::PoisonError;
use std::time::Instant;

use super::{POLL, Programs, STOP_GRACE, State, signal};

impl Programs {
    pub(in crate::component) fn stop_all(&self) {
        let every: Vec<u64> = self
            .children
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .keys()
            .copied()
            .collect();
        self.stop(&every);
    }

    pub(super) fn stop(&self, ids: &[u64]) {
        let running = self.running(ids);
        if running.is_empty() {
            return;
        }
        for (_, pid) in &running {
            signal(*pid, libc::SIGTERM);
        }
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline && !self.running(ids).is_empty() {
            std::thread::sleep(POLL);
        }
        for (_, pid) in self.running(ids) {
            signal(pid, libc::SIGKILL);
        }
        let _ = self.running(ids);
    }

    pub(super) fn running(&self, ids: &[u64]) -> Vec<(u64, u32)> {
        let mut alive = Vec::new();
        let mut ended = Vec::new();
        {
            let mut children = self.children.lock().unwrap_or_else(PoisonError::into_inner);
            for id in ids {
                let Some(spawned) = children.get_mut(id) else {
                    continue;
                };
                let State::Running(child) = &mut spawned.state else {
                    continue;
                };
                match child.try_wait() {
                    Ok(Some(status)) => {
                        spawned.state = State::Ended(status.code().unwrap_or(-1));
                        ended.push(*id);
                    }
                    _ => alive.push((*id, spawned.pid)),
                }
            }
        }
        for id in ended {
            self.note_ended(id);
        }
        alive
    }
}

impl Drop for Programs {
    fn drop(&mut self) {
        self.stop_all();
    }
}
