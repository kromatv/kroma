use std::time::Duration;

use wasmtime::{ResourceLimiter, StoreLimits, StoreLimitsBuilder};

/// What one instance may consume: each linear memory's ceiling, and the wall
/// time one call may run before the host interrupts it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub memory_bytes: usize,
    pub cpu_budget: Duration,
}

#[derive(Debug, thiserror::Error)]
#[error("memory grew past its ceiling")]
pub(crate) struct CeilingReached;

pub(crate) struct Ceiling {
    limits: StoreLimits,
}

impl Ceiling {
    pub(crate) fn new(memory_bytes: usize) -> Self {
        let limits = StoreLimitsBuilder::new().memory_size(memory_bytes).build();
        Self { limits }
    }
}

impl ResourceLimiter for Ceiling {
    fn memory_growing(
        &mut self,
        current: usize,
        desired: usize,
        maximum: Option<usize>,
    ) -> wasmtime::Result<bool> {
        if self.limits.memory_growing(current, desired, maximum)? {
            return Ok(true);
        }
        Err(CeilingReached.into())
    }

    fn table_growing(
        &mut self,
        current: usize,
        desired: usize,
        maximum: Option<usize>,
    ) -> wasmtime::Result<bool> {
        self.limits.table_growing(current, desired, maximum)
    }

    fn instances(&self) -> usize {
        self.limits.instances()
    }

    fn tables(&self) -> usize {
        self.limits.tables()
    }

    fn memories(&self) -> usize {
        self.limits.memories()
    }
}
