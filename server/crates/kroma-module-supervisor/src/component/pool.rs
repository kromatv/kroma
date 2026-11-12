use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use kroma_module_wire::{Role, ROLE_ENV};
use kroma_wasm_host::{Grant, Limits, ModuleComponent, ModuleInstance, Preopen, Request, Settings};
use tokio::sync::Semaphore;

use super::{database, files, lan, media, outside, programs};

const TICK_EVERY: Duration = Duration::from_millis(100);
const STOP_WAIT: Duration = Duration::from_secs(10);
const STOP_STEP: Duration = Duration::from_millis(10);
pub(crate) const WORKER_LIFETIME: Duration = Duration::from_secs(60);

pub(super) struct Parked {
    instance: ModuleInstance,
    programs: Arc<programs::InstancePrograms>,
    role: Role,
    since: Instant,
    running: bool,
}

impl Parked {
    fn used(mut self, running: bool) -> Self {
        self.since = Instant::now();
        self.running = running;
        self
    }
}

fn worth_dropping(running: bool, idle_for: Duration, lifetime: Duration) -> bool {
    !running && idle_for >= lifetime
}

/// The instances of one running component, and what they share.
pub(crate) struct Pool {
    pub(super) module: String,
    pub(super) component: ModuleComponent,
    pub(super) outside: Arc<outside::Outside>,
    pub(super) env: Vec<(String, String)>,
    pub(super) limits: Limits,
    pub(super) roots: Vec<Preopen>,
    pub(super) databases: Option<Arc<database::ModuleDatabases>>,
    pub(super) programs: Arc<programs::Programs>,
    pub(super) lan: Option<Arc<lan::ModuleLan>>,
    pub(super) media: Option<Arc<media::ModuleMedia>>,
    pub(super) files: Arc<files::ModuleFiles>,
    pub(super) idle: Mutex<Vec<Parked>>,
    pub(super) slots: Arc<Semaphore>,
    pub(super) capacity: AtomicU32,
    pub(super) instances: u32,
    pub(super) worker_lifetime: Duration,
    pub(super) port_token: String,
    pub(super) started_up: AtomicBool,
    pub(super) primary_up: AtomicBool,
    pub(super) awake: AtomicBool,
    pub(super) say: Arc<dyn Fn(&str) + Send + Sync>,
}

impl Pool {
    fn instance(&self) -> Result<Parked, String> {
        if self
            .primary_up
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            return self
                .primary()
                .inspect_err(|_| self.primary_up.store(false, Ordering::Release));
        }
        if let Some(parked) = self.idle_one() {
            return Ok(parked);
        }
        self.instantiate(Role::Worker)
    }

    fn idle_one(&self) -> Option<Parked> {
        let mut idle = self.idle.lock().unwrap_or_else(PoisonError::into_inner);
        let at = idle
            .iter()
            .position(|parked| parked.role == Role::Primary)
            .or_else(|| idle.len().checked_sub(1))?;
        Some(idle.remove(at))
    }

    fn primary(&self) -> Result<Parked, String> {
        let mut parked = self.instantiate(Role::Primary)?;
        if !self.started_up.load(Ordering::Acquire) {
            self.start_up(&mut parked.instance)?;
            self.started_up.store(true, Ordering::Release);
        }
        match parked.instance.tick() {
            Ok(running) => Ok(parked.used(running)),
            Err(error) => Err(self.lost(Role::Primary, &error)),
        }
    }

    fn instantiate(&self, role: Role) -> Result<Parked, String> {
        let programs = Arc::new(programs::InstancePrograms::new(self.programs.clone()));
        let mut env = self.env.clone();
        env.push((ROLE_ENV.to_string(), role.as_str().to_string()));
        let instance = self
            .component
            .instantiate(Grant {
                policy: self.outside.clone(),
                settings: Settings::default(),
                limits: self.limits,
                env,
                log: Some(self.say.clone()),
                preopens: self.roots.clone(),
                databases: self.databases.clone().map(|databases| databases as _),
                processes: Some(programs.clone()),
                lan: self.lan.clone().map(|lan| lan as _),
                files: Some(self.files.clone()),
                media: self.media.clone().map(|media| media as _),
            })
            .map_err(|error| error.to_string())?;
        Ok(Parked {
            instance,
            programs,
            role,
            since: Instant::now(),
            running: true,
        })
    }

    fn park(&self, parked: Parked) {
        self.idle.lock().unwrap_or_else(PoisonError::into_inner).push(parked);
    }

    fn lost(&self, role: Role, error: &kroma_wasm_host::HostError) -> String {
        if role == Role::Primary {
            self.primary_up.store(false, Ordering::Release);
        }
        let reason = error.to_string();
        tracing::error!(module = %self.module, %reason, "a component call failed");
        (self.say)(&format!("ERROR component stopped: {reason}"));
        reason
    }

    // A call that traps or runs past a limit costs that instance and what it
    // started, nothing else.
    pub(super) fn call(&self, request: &Request) -> Result<kroma_wasm_host::Response, String> {
        let mut parked = self.instance()?;
        self.awake.store(true, Ordering::Relaxed);
        match parked.instance.handle(request) {
            Ok(response) => {
                self.park(parked.used(true));
                Ok(response)
            }
            Err(error) => Err(self.lost(parked.role, &error)),
        }
    }

    // What a module left running only advances while it holds the CPU, so each
    // instance not answering a call gets a turn. One at a time, under one slot: a
    // call that arrives meanwhile finds another idle, so the pool never grows past
    // its slots. An instance with nothing left running costs nothing until the next
    // call wakes it.
    fn tick(&self) {
        let turns = self.idle.lock().unwrap_or_else(PoisonError::into_inner).len();
        let mut still_running = false;
        for _ in 0..turns {
            let next = {
                let mut idle = self.idle.lock().unwrap_or_else(PoisonError::into_inner);
                if idle.is_empty() {
                    break;
                }
                idle.remove(0)
            };
            let mut parked = next;
            match parked.instance.tick() {
                Ok(running) => {
                    still_running |= running;
                    if running {
                        parked.since = Instant::now();
                    }
                    parked.running = running;
                    self.park(parked);
                }
                Err(error) => {
                    self.lost(parked.role, &error);
                }
            }
        }
        if !still_running {
            self.awake.store(false, Ordering::Relaxed);
        }
    }

    // A module runs from the moment it starts, and what it does on enable cannot
    // wait for someone to call it: its jobs, its subscriptions, a tunnel.
    fn start_primary(&self) {
        if self.primary_up.load(Ordering::Acquire) {
            return;
        }
        match self.instance() {
            Ok(parked) => self.park(parked),
            Err(reason) => (self.say)(&format!("ERROR component did not start: {reason}")),
        }
    }

    fn reclaim(&self, now: Instant) {
        let spent: Vec<Parked> = {
            let mut idle = self.idle.lock().unwrap_or_else(PoisonError::into_inner);
            let (spent, kept) = std::mem::take(&mut *idle).into_iter().partition(|parked| {
                parked.role == Role::Worker
                    && worth_dropping(
                        parked.running || parked.programs.any_running(),
                        now.saturating_duration_since(parked.since),
                        self.worker_lifetime,
                    )
            });
            *idle = kept;
            spent
        };
        if !spent.is_empty() {
            tracing::debug!(module = %self.module, dropped = spent.len(), "idle instances dropped to free their memory");
        }
    }

    // Every slot is taken first, so no call and no tick still holds an instance
    // that would miss its `stop`, and the pool is closed so none starts after.
    pub(crate) fn shut_down(&self) {
        if let Some(media) = &self.media {
            media.stop();
        }
        let deadline = Instant::now() + STOP_WAIT;
        let held = loop {
            match self.slots.try_acquire_many(self.capacity.load(Ordering::Acquire)) {
                Ok(held) => break Some(held),
                Err(_) if Instant::now() < deadline => std::thread::sleep(STOP_STEP),
                Err(_) => break None,
            }
        };
        self.slots.close();
        drop(held);
        let waiting: Vec<Parked> =
            std::mem::take(&mut *self.idle.lock().unwrap_or_else(PoisonError::into_inner));
        for mut parked in waiting {
            let _ = parked.instance.stop();
        }
        self.programs.stop_all();
        if let Some(lan) = &self.lan {
            lan.withdraw_all();
        }
    }
}

pub(super) async fn with_a_slot<T: Send + 'static>(
    pool: &Arc<Pool>,
    work: impl FnOnce(&Pool) -> T + Send + 'static,
) -> Option<T> {
    let slot = pool.slots.clone().acquire_owned().await.ok()?;
    let pool = pool.clone();
    tokio::task::spawn_blocking(move || {
        let _slot = slot;
        work(&pool)
    })
    .await
    .ok()
}

pub(super) async fn tick_forever(pool: Arc<Pool>) {
    with_a_slot(&pool, Pool::start_primary).await;
    let mut every = tokio::time::interval(TICK_EVERY);
    every.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    while !pool.slots.is_closed() {
        every.tick().await;
        pool.reclaim(Instant::now());
        if !pool.awake.load(Ordering::Relaxed) || pool.slots.available_permits() == 0 {
            continue;
        }
        with_a_slot(&pool, Pool::tick).await;
    }
}

#[cfg(test)]
mod tests;
