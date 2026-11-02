use std::sync::Arc;

use wasmtime::component::Component;
use wasmtime_wasi::p2::bindings::sync::CommandPre;
use wasmtime_wasi::I32Exit;

use crate::host::EpochTicker;
use crate::instance::{begin_call, classify, limited_store};
use crate::state::State;
use crate::{Grant, HostError, WasmHost};

/// A compiled `wasi:cli/run` component, such as a test binary, linked against the
/// imports a module is, ready to run any number of times.
pub struct CommandComponent {
    pre: CommandPre<State>,
    _ticker: Arc<EpochTicker>,
}

impl WasmHost {
    /// [`Self::compile`] for a `wasi:cli/run` component: an import the host does
    /// not provide fails here rather than on the first run.
    pub fn compile_command(&self, wasm: &[u8]) -> Result<CommandComponent, HostError> {
        let component = Component::new(&self.engine, wasm).map_err(HostError::Compile)?;
        let pre = self
            .linker
            .instantiate_pre(&component)
            .and_then(CommandPre::new)
            .map_err(HostError::Instantiate)?;
        Ok(CommandComponent {
            pre,
            _ticker: Arc::clone(&self.ticker),
        })
    }
}

impl CommandComponent {
    /// Run a fresh instance to its end with `args` as its argv, ruled by `grant`
    /// as a module's instance is, its whole run counting as one call against the
    /// grant's limits. Answers the exit code it chose, and a trap as an error.
    pub fn run(&self, grant: Grant, args: &[String]) -> Result<i32, HostError> {
        let limits = grant.limits;
        let mut store = limited_store(self.pre.engine(), State::new(grant, args)?);
        begin_call(&mut store);
        let command = self
            .pre
            .instantiate(&mut store)
            .map_err(|error| classify(error, &limits, HostError::Instantiate))?;
        match command.wasi_cli_run().call_run(&mut store) {
            Ok(Ok(())) => Ok(0),
            Ok(Err(())) => Ok(1),
            Err(error) => match error.downcast_ref::<I32Exit>() {
                Some(exit) => Ok(exit.0),
                None => Err(classify(error, &limits, HostError::Trap)),
            },
        }
    }
}
