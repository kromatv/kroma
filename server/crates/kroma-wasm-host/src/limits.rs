use std::time::Duration;

use wasmtime::{ResourceLimiter, StoreLimits, StoreLimitsBuilder};

/// What one instance may consume: each linear memory's ceiling, and the CPU time
/// one call may spend before the host interrupts it. Time the call spends waiting,
/// on an import or a sleep, is not CPU time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    pub memory_bytes: usize,
    pub cpu_budget: Duration,
}

/// The CPU this thread has used. Compared across one call, which stays on its thread.
#[cfg(unix)]
pub(crate) fn thread_cpu_time() -> Duration {
    let mut now = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // SAFETY: clock_gettime writes only into `now`, which outlives the call.
    let read = unsafe { libc::clock_gettime(libc::CLOCK_THREAD_CPUTIME_ID, &mut now) };
    if read != 0 {
        return Duration::ZERO;
    }
    Duration::new(
        u64::try_from(now.tv_sec).unwrap_or(0),
        u32::try_from(now.tv_nsec).unwrap_or(0),
    )
}

#[cfg(windows)]
pub(crate) fn thread_cpu_time() -> Duration {
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::{GetCurrentThread, GetThreadTimes};

    let mut times = [FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    }; 4];
    let [creation, exit, kernel, user] = &mut times;
    // SAFETY: GetThreadTimes writes only into the four FILETIMEs, which outlive the
    // call, and GetCurrentThread is a pseudo-handle that is never closed.
    let read = unsafe { GetThreadTimes(GetCurrentThread(), creation, exit, kernel, user) };
    if read == 0 {
        return Duration::ZERO;
    }
    let hundreds_of_nanos = |time: &FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    Duration::from_nanos(
        hundreds_of_nanos(kernel)
            .saturating_add(hundreds_of_nanos(user))
            .saturating_mul(100),
    )
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn thread_cpu_time() -> Duration {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed()
}

#[derive(Debug, thiserror::Error)]
#[error("memory grew past its ceiling")]
pub(crate) struct CeilingReached;

pub(crate) struct Ceiling {
    limits: StoreLimits,
    pub(crate) largest: usize,
}

impl Ceiling {
    pub(crate) fn new(memory_bytes: usize) -> Self {
        let limits = StoreLimitsBuilder::new().memory_size(memory_bytes).build();
        Self { limits, largest: 0 }
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
            self.largest = self.largest.max(desired);
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
