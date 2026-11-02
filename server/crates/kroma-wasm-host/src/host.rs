use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
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
    pub(crate) engine: Engine,
    pub(crate) linker: Linker<State>,
    pub(crate) ticker: Arc<EpochTicker>,
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
        self.linked(&component)
    }

    /// [`Self::compile`], keeping the machine code at `copy` so the next start of
    /// the same `key` skips it. `key` names the component's bytes. The caller keeps
    /// `copy` where no module can write: it runs as native code.
    pub fn compile_keeping(
        &self,
        wasm: &[u8],
        copy: &Path,
        key: &str,
    ) -> Result<(ModuleComponent, Readied), HostError> {
        let stamp = copy.with_extension("stamp");
        let expected = self.stamp_for(key);
        if std::fs::read_to_string(&stamp).is_ok_and(|found| found == expected) {
            // SAFETY: this host wrote `copy` under this stamp, which names the
            // component and this engine's compatibility, in a folder no module holds.
            if let Ok(component) = unsafe { Component::deserialize_file(&self.engine, copy) } {
                return Ok((self.linked(&component)?, Readied::FromCache));
            }
        }
        let machine_code = self.engine.precompile_component(wasm).map_err(HostError::Compile)?;
        let kept = copy
            .parent()
            .map_or(Ok(()), std::fs::create_dir_all)
            .and_then(|()| std::fs::write(copy, &machine_code))
            .and_then(|()| std::fs::write(&stamp, &expected));
        if let Err(error) = kept {
            tracing::warn!(%error, "the compiled component was not kept");
        }
        // SAFETY: `machine_code` was produced by this engine a moment ago.
        let component = unsafe { Component::deserialize(&self.engine, &machine_code) }.map_err(HostError::Compile)?;
        Ok((self.linked(&component)?, Readied::Compiled))
    }

    fn stamp_for(&self, key: &str) -> String {
        let mut hasher = DefaultHasher::new();
        self.engine.precompile_compatibility_hash().hash(&mut hasher);
        format!("{key}-{:x}", hasher.finish())
    }

    fn linked(&self, component: &Component) -> Result<ModuleComponent, HostError> {
        let pre = self
            .linker
            .instantiate_pre(component)
            .map_err(HostError::Instantiate)?;
        let pre = ModulePre::new(pre).map_err(HostError::Instantiate)?;
        Ok(ModuleComponent {
            pre,
            ticker: Arc::clone(&self.ticker),
        })
    }
}

/// How a component came to be ready: compiled now, or read from an earlier compile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Readied {
    Compiled,
    FromCache,
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
