mod support;

use kroma_wasm_host::HostError;
use support::{probe, request, sandboxed, text, CPU_BUDGET, MEMORY_CEILING_BYTES};

fn past_the_ceiling() -> String {
    (MEMORY_CEILING_BYTES * 2).to_string()
}

#[test]
fn a_component_allocates_freely_below_its_memory_ceiling() {
    let mut module = sandboxed();
    let size = (MEMORY_CEILING_BYTES / 4).to_string();

    let response = probe(&mut module, "/memory", &size);

    assert_eq!(response.status, 200, "{}", text(&response));
}

#[test]
fn a_component_that_allocates_past_its_ceiling_stops_with_a_memory_error() {
    let mut module = sandboxed();

    let error = module
        .handle(&request("/memory", &past_the_ceiling()))
        .unwrap_err();

    assert!(
        matches!(error, HostError::MemoryCeiling { ceiling_bytes } if ceiling_bytes == MEMORY_CEILING_BYTES),
        "{error:?}"
    );
}

#[test]
fn a_component_that_loops_forever_stops_at_its_cpu_budget() {
    let mut module = sandboxed();

    let error = module.handle(&request("/spin", "")).unwrap_err();

    assert!(
        matches!(error, HostError::CpuBudget { budget } if budget == CPU_BUDGET),
        "{error:?}"
    );
}

#[test]
fn an_instance_stopped_by_a_limit_refuses_every_later_call() {
    let mut module = sandboxed();
    module.handle(&request("/spin", "")).unwrap_err();

    let error = module.handle(&request("/ping", "")).unwrap_err();

    assert!(matches!(error, HostError::Stopped), "{error:?}");
}

#[test]
fn the_host_serves_a_fresh_instance_after_one_passes_its_ceiling() {
    let mut stopped = sandboxed();
    stopped
        .handle(&request("/memory", &past_the_ceiling()))
        .unwrap_err();
    let mut fresh = sandboxed();

    let response = probe(&mut fresh, "/ping", "");

    assert_eq!((response.status, text(&response).as_str()), (200, "pong"));
}

#[test]
fn the_host_serves_a_fresh_instance_after_one_passes_its_cpu_budget() {
    let mut stopped = sandboxed();
    stopped.handle(&request("/spin", "")).unwrap_err();
    let mut fresh = sandboxed();

    let response = probe(&mut fresh, "/ping", "");

    assert_eq!((response.status, text(&response).as_str()), (200, "pong"));
}
