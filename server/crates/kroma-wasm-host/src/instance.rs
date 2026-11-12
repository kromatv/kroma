use std::collections::VecDeque;
use std::sync::Arc;

use wasmtime::{Engine, Store, Trap};

use crate::bindings::Module;
use crate::host::{EpochTicker, ModuleComponent};
use crate::limits::{thread_cpu_time, CeilingReached};
use crate::state::State;
use crate::{FetchRecord, HostError, Limits, NetPolicy, Request, Response, Settings};

const TICKS_BETWEEN_CHECKS: u64 = 5;

/// Everything one instance is allowed.
pub struct Grant {
    pub policy: Arc<dyn NetPolicy>,
    pub settings: Settings,
    pub limits: Limits,
    /// The only environment it sees.
    pub env: Vec<(String, String)>,
    /// Where what it writes goes. Nowhere, when absent.
    pub log: Option<crate::LogSink>,
    /// The folders it can see. Nothing, when empty.
    pub preopens: Vec<crate::Preopen>,
    pub databases: Option<Arc<dyn crate::Databases>>,
    pub processes: Option<Arc<dyn crate::Processes>>,
    pub lan: Option<Arc<dyn crate::Lan>>,
    pub files: Option<Arc<dyn crate::Files>>,
    pub media: Option<Arc<dyn crate::Media>>,
}

/// A call that traps or runs past a limit stops the instance: later calls
/// return [`HostError::Stopped`], and a fresh one comes from the [`ModuleComponent`].
pub struct ModuleInstance {
    store: Store<State>,
    module: Module,
    limits: Limits,
    stopped: bool,
    _ticker: Arc<EpochTicker>,
}

pub(crate) fn limited_store(engine: &Engine, state: State) -> Store<State> {
    let mut store = Store::new(engine, state);
    store.limiter(|state| &mut state.ceiling);
    // The epoch only says when to look: what counts is the CPU this thread has
    // spent, so a call waiting on an import or a sleep spends nothing.
    store.epoch_deadline_callback(|store| {
        let state = store.data();
        let spent = thread_cpu_time().saturating_sub(state.cpu_at_start);
        if spent < state.cpu_budget {
            Ok(wasmtime::UpdateDeadline::Continue(TICKS_BETWEEN_CHECKS))
        } else {
            Err(Trap::Interrupt.into())
        }
    });
    store
}

impl ModuleComponent {
    pub fn instantiate(&self, grant: Grant) -> Result<ModuleInstance, HostError> {
        let limits = grant.limits;
        let state = State::new(grant, &[])?;
        let mut store = limited_store(self.pre.engine(), state);
        begin_call(&mut store);
        let module = self
            .pre
            .instantiate(&mut store)
            .map_err(|error| classify(error, &limits, HostError::Instantiate))?;
        Ok(ModuleInstance {
            store,
            module,
            limits,
            stopped: false,
            _ticker: Arc::clone(&self.ticker),
        })
    }
}

impl ModuleInstance {
    pub fn handle(&mut self, request: &Request) -> Result<Response, HostError> {
        if self.stopped {
            return Err(HostError::Stopped);
        }
        begin_call(&mut self.store);
        let route = self.module.kroma_module_route();
        route
            .call_handle(&mut self.store, request)
            .map_err(|error| {
                self.stopped = true;
                classify(error, &self.limits, HostError::Trap)
            })
    }

    /// Let what this instance's module left running advance, and answer whether
    /// anything is still running.
    pub fn tick(&mut self) -> Result<bool, HostError> {
        if self.stopped {
            return Err(HostError::Stopped);
        }
        begin_call(&mut self.store);
        let route = self.module.kroma_module_route();
        route.call_tick(&mut self.store).map_err(|error| {
            self.stopped = true;
            classify(error, &self.limits, HostError::Trap)
        })
    }

    /// Tell this instance's module it is stopping. It runs nothing after this.
    pub fn stop(&mut self) -> Result<(), HostError> {
        if self.stopped {
            return Err(HostError::Stopped);
        }
        self.stopped = true;
        begin_call(&mut self.store);
        let route = self.module.kroma_module_route();
        route
            .call_stop(&mut self.store)
            .map_err(|error| classify(error, &self.limits, HostError::Trap))
    }

    /// The size of this instance's largest linear memory. It never shrinks: what
    /// a module frees stays with the instance until the instance is dropped.
    pub fn memory_bytes(&self) -> usize {
        self.store.data().ceiling.largest
    }

    /// The last 256 `net.fetch` calls this instance made, allowed or blocked, in
    /// call order.
    pub fn fetches(&self) -> &VecDeque<FetchRecord> {
        &self.store.data().fetches
    }
}

pub(crate) fn begin_call(store: &mut Store<State>) {
    store.data_mut().cpu_at_start = thread_cpu_time();
    store.set_epoch_deadline(TICKS_BETWEEN_CHECKS);
}

pub(crate) fn classify(
    error: wasmtime::Error,
    limits: &Limits,
    otherwise: fn(wasmtime::Error) -> HostError,
) -> HostError {
    if error.downcast_ref::<CeilingReached>().is_some() {
        return HostError::MemoryCeiling {
            ceiling_bytes: limits.memory_bytes,
        };
    }
    if error.downcast_ref::<Trap>() == Some(&Trap::Interrupt) {
        return HostError::CpuBudget {
            budget: limits.cpu_budget,
        };
    }
    otherwise(error)
}
