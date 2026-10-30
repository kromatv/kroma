use std::sync::Arc;

use wasmtime::{Store, Trap};

use crate::bindings::Module;
use crate::host::{EpochTicker, ModuleComponent, EPOCH_TICK};
use crate::limits::CeilingReached;
use crate::state::State;
use crate::{FetchRecord, HostError, Limits, NetPolicy, Request, Response, Settings};

/// Everything one instance is allowed: where its fetches are decided, the
/// settings it declared, and what it may consume.
pub struct Grant {
    pub policy: Arc<dyn NetPolicy>,
    pub settings: Settings,
    pub limits: Limits,
}

/// One running module, in its own store. A call that traps or runs past a
/// limit stops the instance: later calls return [`HostError::Stopped`], and a
/// fresh instance comes from the [`ModuleComponent`] again.
pub struct ModuleInstance {
    store: Store<State>,
    module: Module,
    limits: Limits,
    stopped: bool,
    _ticker: Arc<EpochTicker>,
}

impl ModuleComponent {
    pub fn instantiate(&self, grant: Grant) -> Result<ModuleInstance, HostError> {
        let Grant {
            policy,
            settings,
            limits,
        } = grant;
        let state = State::new(policy, settings, limits.memory_bytes);
        let mut store = Store::new(self.pre.engine(), state);
        store.limiter(|state| &mut state.ceiling);
        store.epoch_deadline_trap();
        store.set_epoch_deadline(budget_ticks(&limits));
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
        self.store.set_epoch_deadline(budget_ticks(&self.limits));
        let route = self.module.kroma_module_route();
        route
            .call_handle(&mut self.store, request)
            .map_err(|error| {
                self.stopped = true;
                classify(error, &self.limits, HostError::Trap)
            })
    }

    /// Every `net.fetch` this instance made, allowed or blocked, in call order.
    pub fn fetches(&self) -> &[FetchRecord] {
        &self.store.data().fetches
    }
}

fn budget_ticks(limits: &Limits) -> u64 {
    let ticks = limits.cpu_budget.as_nanos().div_ceil(EPOCH_TICK.as_nanos());
    u64::try_from(ticks).unwrap_or(u64::MAX).max(1)
}

fn classify(
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
