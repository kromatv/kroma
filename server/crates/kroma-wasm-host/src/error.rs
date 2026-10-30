use std::time::Duration;

/// Why the host could not load, start or run a module. Every failure of the
/// guest ends here: none of them panics or stops the host.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum HostError {
    #[error("the component did not compile")]
    Compile(#[source] wasmtime::Error),
    #[error("the host could not be built")]
    Link(#[source] wasmtime::Error),
    #[error("the component did not instantiate")]
    Instantiate(#[source] wasmtime::Error),
    #[error("the module grew past its memory ceiling of {ceiling_bytes} bytes")]
    MemoryCeiling { ceiling_bytes: usize },
    #[error("the module ran past its CPU budget of {budget:?}")]
    CpuBudget { budget: Duration },
    #[error("the module trapped")]
    Trap(#[source] wasmtime::Error),
    #[error("the instance stopped on an earlier error and takes no more calls")]
    Stopped,
}
