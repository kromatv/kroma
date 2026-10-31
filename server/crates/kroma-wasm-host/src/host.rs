use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use wasmtime::component::{Component, HasSelf, Linker};
use wasmtime::{Config, Engine};

use crate::bindings::{Module, ModulePre};
use crate::state::State;
use crate::HostError;

pub(crate) const EPOCH_TICK: Duration = Duration::from_millis(10);

/// The engine every module runs on, with WASI and the KROMA imports linked
/// once. Holding it keeps a thread ticking the epoch that CPU budgets count.
pub struct WasmHost {
    engine: Engine,
    linker: Linker<State>,
    ticker: Arc<EpochTicker>,
}

impl WasmHost {
    pub fn new() -> Result<Self, HostError> {
        let mut config = Config::new();
        config.epoch_interruption(true);
        let engine = Engine::new(&config).map_err(HostError::Link)?;
        let mut linker = Linker::new(&engine);
        wasmtime_wasi::p2::add_to_linker_sync(&mut linker).map_err(HostError::Link)?;
        Module::add_to_linker::<State, HasSelf<State>>(&mut linker, |state| state)
            .map_err(HostError::Link)?;
        let ticker = Arc::new(EpochTicker::start(engine.clone()));
        Ok(Self {
            engine,
            linker,
            ticker,
        })
    }

    /// Compiles a component and resolves its imports against the host's, so an
    /// import the host does not provide fails here rather than on first call.
    pub fn compile(&self, wasm: &[u8]) -> Result<ModuleComponent, HostError> {
        let component = Component::new(&self.engine, wasm).map_err(HostError::Compile)?;
        let pre = self
            .linker
            .instantiate_pre(&component)
            .map_err(HostError::Instantiate)?;
        let pre = ModulePre::new(pre).map_err(HostError::Instantiate)?;
        Ok(ModuleComponent {
            pre,
            ticker: Arc::clone(&self.ticker),
        })
    }
}

/// A compiled, linked component, ready to instantiate any number of times.
pub struct ModuleComponent {
    pub(crate) pre: ModulePre<State>,
    pub(crate) ticker: Arc<EpochTicker>,
}

pub(crate) struct EpochTicker {
    _stop: Sender<()>,
}

impl EpochTicker {
    fn start(engine: Engine) -> Self {
        let (stop, stopped) = mpsc::channel::<()>();
        thread::Builder::new()
            .name("kroma-wasm-epoch".into())
            .spawn(move || {
                while let Err(RecvTimeoutError::Timeout) = stopped.recv_timeout(EPOCH_TICK) {
                    engine.increment_epoch();
                }
            })
            .expect("spawn the epoch ticker thread");
        Self { _stop: stop }
    }
}
