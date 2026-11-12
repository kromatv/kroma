use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use kroma_wasm_host::{Command as Asked, Output, Processes};

use super::Programs;

pub(in crate::component) struct InstancePrograms {
    programs: Arc<Programs>,
    started: Mutex<Vec<u64>>,
}

impl InstancePrograms {
    pub(in crate::component) fn new(programs: Arc<Programs>) -> Self {
        Self {
            programs,
            started: Mutex::new(Vec::new()),
        }
    }

    pub(in crate::component) fn any_running(&self) -> bool {
        let started = self.started.lock().unwrap_or_else(PoisonError::into_inner);
        !self.programs.running(&started).is_empty()
    }
}

impl Processes for InstancePrograms {
    fn ensure(&self, program: &str) -> Result<(), String> {
        self.programs.ensure(program)
    }

    fn spawn(&self, asked: Asked) -> Result<u64, String> {
        let child = self.programs.spawn(asked)?;
        let mut started = self.started.lock().unwrap_or_else(PoisonError::into_inner);
        let alive = self.programs.running(&started);
        started.retain(|id| alive.iter().any(|(running, _)| running == id));
        started.push(child);
        Ok(child)
    }

    fn wait(&self, child: u64, timeout: Duration) -> Result<Option<i32>, String> {
        self.programs.wait(child, timeout)
    }

    fn read(&self, child: u64, which: Output, max_bytes: u32) -> Result<Vec<u8>, String> {
        self.programs.read(child, which, max_bytes)
    }

    fn kill(&self, child: u64, force: bool) -> Result<(), String> {
        self.programs.kill(child, force)
    }
}

impl Drop for InstancePrograms {
    fn drop(&mut self) {
        let started = std::mem::take(
            self.started
                .get_mut()
                .unwrap_or_else(PoisonError::into_inner),
        );
        self.programs.stop(&started);
    }
}
