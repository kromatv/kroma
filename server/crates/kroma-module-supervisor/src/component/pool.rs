use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use axum::body::{to_bytes, Body};
use axum::extract::{Request as HttpRequest, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response as HttpResponse};
use kroma_wasm_host::{Grant, Header, Limits, ModuleComponent, ModuleInstance, Preopen, Request, Settings};
use tokio::sync::Semaphore;

use super::{database, files, lan, outside, programs};

const MAX_REQUEST_BYTES: usize = 64 * 1024 * 1024;
const TICK_EVERY: Duration = Duration::from_millis(100);
const STOP_WAIT: Duration = Duration::from_secs(10);
const STOP_STEP: Duration = Duration::from_millis(10);
const RECLAIM_AFTER: Duration = Duration::from_secs(300);
const RECLAIM_ABOVE_BYTES: usize = 64 * 1024 * 1024;

pub(super) struct Parked {
    instance: ModuleInstance,
    since: Instant,
    running: bool,
}

impl Parked {
    fn new(instance: ModuleInstance, running: bool) -> Self {
        Self {
            instance,
            since: Instant::now(),
            running,
        }
    }
}

fn worth_dropping(running: bool, idle_for: Duration, memory_bytes: usize) -> bool {
    !running && idle_for >= RECLAIM_AFTER && memory_bytes > RECLAIM_ABOVE_BYTES
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
    pub(super) files: Arc<files::ModuleFiles>,
    pub(super) idle: Mutex<Vec<Parked>>,
    pub(super) slots: Semaphore,
    pub(super) capacity: u32,
    pub(super) awake: AtomicBool,
    pub(super) say: Arc<dyn Fn(&str) + Send + Sync>,
}

impl Pool {
    fn instance(&self) -> Result<ModuleInstance, String> {
        if let Some(parked) = self.idle.lock().unwrap_or_else(PoisonError::into_inner).pop() {
            return Ok(parked.instance);
        }
        self.component
            .instantiate(Grant {
                policy: self.outside.clone(),
                settings: Settings::default(),
                limits: self.limits,
                env: self.env.clone(),
                log: Some(self.say.clone()),
                preopens: self.roots.clone(),
                databases: self.databases.clone().map(|databases| databases as _),
                processes: Some(self.programs.clone()),
                lan: self.lan.clone().map(|lan| lan as _),
                files: Some(self.files.clone()),
            })
            .map_err(|error| error.to_string())
    }

    fn lost(&self, error: &kroma_wasm_host::HostError) -> String {
        let reason = error.to_string();
        tracing::error!(module = %self.module, %reason, "a component call failed");
        (self.say)(&format!("ERROR component stopped: {reason}"));
        reason
    }

    // A call that traps or runs past a limit costs that instance and nothing else.
    fn call(&self, request: &Request) -> Result<kroma_wasm_host::Response, String> {
        let mut instance = self.instance()?;
        self.awake.store(true, Ordering::Relaxed);
        match instance.handle(request) {
            Ok(response) => {
                self.idle
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(Parked::new(instance, true));
                Ok(response)
            }
            Err(error) => Err(self.lost(&error)),
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
            let Parked {
                mut instance,
                since,
                ..
            } = next;
            match instance.tick() {
                Ok(running) => {
                    still_running |= running;
                    let since = if running { Instant::now() } else { since };
                    self.idle
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .push(Parked {
                            instance,
                            since,
                            running,
                        });
                }
                Err(error) => {
                    self.lost(&error);
                }
            }
        }
        if !still_running {
            self.awake.store(false, Ordering::Relaxed);
        }
    }

    // A process runs from the moment it starts, and what a module does on enable
    // cannot wait for someone to call it: its jobs, its subscriptions, a tunnel.
    fn start_one(&self) {
        match self.instance() {
            Ok(mut instance) => match instance.tick() {
                Ok(running) => self
                    .idle
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(Parked::new(instance, running)),
                Err(error) => {
                    self.lost(&error);
                }
            },
            Err(reason) => (self.say)(&format!("ERROR component did not start: {reason}")),
        }
    }

    fn reclaim(&self, now: Instant) {
        let spent: Vec<Parked> = {
            let mut idle = self.idle.lock().unwrap_or_else(PoisonError::into_inner);
            let (spent, kept) = std::mem::take(&mut *idle).into_iter().partition(|parked| {
                worth_dropping(
                    parked.running,
                    now.saturating_duration_since(parked.since),
                    parked.instance.memory_bytes(),
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
        let deadline = Instant::now() + STOP_WAIT;
        let held = loop {
            match self.slots.try_acquire_many(self.capacity) {
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

pub(super) async fn tick_forever(pool: Arc<Pool>) {
    if let Ok(_slot) = pool.slots.acquire().await {
        let first = pool.clone();
        let _ = tokio::task::spawn_blocking(move || first.start_one()).await;
    }
    let mut every = tokio::time::interval(TICK_EVERY);
    every.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    while !pool.slots.is_closed() {
        every.tick().await;
        if !pool.awake.load(Ordering::Relaxed) {
            pool.reclaim(Instant::now());
            continue;
        }
        if pool.slots.available_permits() == 0 {
            continue;
        }
        let Ok(_slot) = pool.slots.acquire().await else {
            return;
        };
        let turn = pool.clone();
        let _ = tokio::task::spawn_blocking(move || turn.tick()).await;
    }
}

pub(super) async fn answer(State(pool): State<Arc<Pool>>, request: HttpRequest) -> HttpResponse {
    let Ok(_slot) = pool.slots.acquire().await else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let (parts, body) = request.into_parts();
    let Ok(body) = to_bytes(body, MAX_REQUEST_BYTES).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    let call = Request {
        method: parts.method.to_string(),
        path: parts.uri.path_and_query().map_or_else(
            || parts.uri.path().to_string(),
            |path| path.as_str().to_string(),
        ),
        headers: parts
            .headers
            .iter()
            .filter_map(|(name, value)| {
                Some(Header {
                    name: name.as_str().to_string(),
                    value: value.to_str().ok()?.to_string(),
                })
            })
            .collect(),
        body: body.to_vec(),
    };
    let pool = pool.clone();
    let answered = tokio::task::spawn_blocking(move || pool.call(&call)).await;
    match answered {
        Ok(Ok(response)) => {
            let mut built = axum::http::Response::builder().status(response.status);
            for header in &response.headers {
                built = built.header(header.name.as_str(), header.value.as_str());
            }
            built
                .body(Body::from(response.body))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Ok(Err(reason)) => (StatusCode::BAD_GATEWAY, reason).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LARGE: usize = RECLAIM_ABOVE_BYTES + 1;

    #[test]
    fn a_large_instance_idle_long_enough_is_dropped() {
        assert!(worth_dropping(false, RECLAIM_AFTER, LARGE));
    }

    #[test]
    fn an_instance_with_work_still_running_is_kept() {
        assert!(!worth_dropping(true, RECLAIM_AFTER * 10, LARGE));
    }

    #[test]
    fn a_large_instance_used_recently_is_kept() {
        assert!(!worth_dropping(false, RECLAIM_AFTER / 2, LARGE));
    }

    #[test]
    fn a_small_instance_is_kept_however_long_it_idles() {
        assert!(!worth_dropping(false, RECLAIM_AFTER * 10, RECLAIM_ABOVE_BYTES));
    }
}
