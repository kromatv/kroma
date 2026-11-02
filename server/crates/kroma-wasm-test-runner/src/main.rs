//! Cargo's runner for `wasm32-wasip2`: `kroma-wasm-test-runner <test.wasm> [args...]`
//! compiles one test binary as a component on [`kroma_wasm_host::WasmHost`], the
//! linker every module gets, and runs each of its tests in an instance of its own.

mod grant;
mod offline;
mod outcome;
mod sql;
mod suite;

use std::process::ExitCode;

use anyhow::{bail, Context, Result};
use kroma_wasm_host::WasmHost;

const FAILED: u8 = 101;

fn main() -> ExitCode {
    match run(std::env::args().skip(1).collect()) {
        Ok(code) => ExitCode::from(u8::try_from(code).unwrap_or(FAILED)),
        Err(error) => {
            eprintln!("kroma-wasm-test-runner: {error:#}");
            ExitCode::from(FAILED)
        }
    }
}

fn run(args: Vec<String>) -> Result<i32> {
    let Some((wasm_path, harness_args)) = args.split_first() else {
        bail!("usage: kroma-wasm-test-runner <test.wasm> [args...]");
    };
    let wasm = std::fs::read(wasm_path).with_context(|| format!("read {wasm_path}"))?;
    let host = WasmHost::new().context("start the component host")?;
    let binary = host
        .compile_command(&wasm)
        .with_context(|| format!("compile {wasm_path}"))?;
    let suite = suite::Suite::new(&binary, wasm_path, harness_args);
    if suite::passes_through(harness_args) {
        return Ok(suite.pass_through());
    }
    suite.run_each()
}
