use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{Arc, MutexGuard, PoisonError};

use crate::infra::events::ServerEvent;
use crate::state::SharedState;

use super::run::run_job;
use super::{now_ms, JobKey, JobManager, RunHandle, Runner, TriggerError};

#[cfg(test)]
mod tests;

impl JobManager {
    /// Trigger a job now (manual or scheduled). Returns the new run id.
    pub fn trigger(
        self: &Arc<Self>,
        state: SharedState,
        job: JobKey,
        trigger: &'static str,
    ) -> std::result::Result<String, TriggerError> {
        let runner = if let Some(b) = self.jobs.get(&job) {
            Runner::Local(b.run)
        } else if let Some(r) = self.remote.read().unwrap().get(job.as_str()) {
            Runner::Remote(r.run.clone())
        } else {
            return Err(TriggerError::Unknown);
        };
        let key = job.as_str();

        // One run per key. Reserve the slot under the lock to avoid a race.
        let started_ms = now_ms();
        let n = self.counter.fetch_add(1, Ordering::Relaxed);
        let run_id = format!("{}-{started_ms}-{n}", key.replace('.', "_"));
        let handle = Arc::new(RunHandle::new(run_id.clone(), key.to_string()));
        {
            let mut running = self.running.write().unwrap();
            if running.contains_key(&job) {
                return Err(TriggerError::AlreadyRunning);
            }
            running.insert(job, handle.clone());
        }

        // Announce before the DB insert (on the worker thread below) so the UI
        // flips to "running" without waiting on it.
        state.events.publish(ServerEvent::JobStarted {
            key: key.to_string(),
            run_id: run_id.clone(),
        });

        let manager = self.clone();
        let returned_id = run_id.clone();
        tokio::task::spawn_blocking(move || {
            run_job(
                manager, state, runner, handle, run_id, key, trigger, job, started_ms,
            )
        });

        Ok(returned_id)
    }

    /// Runs `job` now, or once more after the run in progress, so that what
    /// changed while the job was running is not left unread. Any number of
    /// such requests during one run ask for one more run, not one each.
    pub fn trigger_after(
        self: &Arc<Self>,
        state: SharedState,
        job: JobKey,
        trigger: &'static str,
    ) -> std::result::Result<(), TriggerError> {
        self.asked_again().insert(job, trigger);
        match self.trigger(state, job, trigger) {
            Ok(_) => {
                self.asked_again().remove(&job);
                Ok(())
            }
            Err(TriggerError::AlreadyRunning) => Ok(()),
            Err(unknown) => {
                self.asked_again().remove(&job);
                Err(unknown)
            }
        }
    }

    /// Starts the run a [`trigger_after`](Self::trigger_after) asked for while
    /// `job` was running. Called once that run has left the running set.
    pub(super) fn run_again(self: &Arc<Self>, state: &SharedState, job: JobKey) {
        let asked = self.asked_again().remove(&job);
        if let Some(trigger) = asked {
            let _ = self.trigger(state.clone(), job, trigger);
        }
    }

    fn asked_again(&self) -> MutexGuard<'_, HashMap<JobKey, &'static str>> {
        self.again.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Requests cancellation of every running job; each observes its flag at the
    /// next poll tick, so poll [`running_count`](Self::running_count) for the drain.
    pub fn cancel_all(&self) {
        for handle in self.running.read().unwrap().values() {
            handle.request_cancel();
        }
    }

    pub fn running_count(&self) -> usize {
        self.running.read().unwrap().len()
    }

    /// Returns false if the job is not running.
    pub fn cancel(&self, job: JobKey) -> bool {
        if let Some(handle) = self.running.read().unwrap().get(&job) {
            handle.request_cancel();
            true
        } else {
            false
        }
    }
}
