use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
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

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    hex::encode(sha2::Sha256::digest(bytes))
}

fn file_sha256_hex(path: &Path) -> std::io::Result<String> {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    std::io::copy(&mut std::fs::File::open(path)?, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

fn keep(copy: &Path, stamp: &Path, expected: &str, machine_code: &[u8]) -> std::io::Result<()> {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    if let Some(folder) = copy.parent() {
        std::fs::create_dir_all(folder)?;
    }
    let mut partial = copy.as_os_str().to_owned();
    partial.push(format!(
        ".{}-{}.partial",
        std::process::id(),
        WRITES.fetch_add(1, Ordering::Relaxed)
    ));
    let partial = PathBuf::from(partial);
    let written = std::fs::write(&partial, machine_code).and_then(|()| std::fs::rename(&partial, copy));
    if written.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    written?;
    std::fs::write(stamp, format!("{expected}-{}", sha256_hex(machine_code)))
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
    /// `copy` where no module can write: it runs as native code. A copy whose bytes
    /// are not the ones recorded beside it is not loaded, and the component is
    /// compiled again.
    ///
    /// The component runs from `copy` mapped in place, so the caller replaces or
    /// deletes that file and never writes into it while the component lives.
    pub fn compile_keeping(
        &self,
        wasm: &[u8],
        copy: &Path,
        key: &str,
    ) -> Result<(ModuleComponent, Readied), HostError> {
        let stamp = copy.with_extension("stamp");
        let expected = self.stamp_for(key);
        let readied = match self.kept(copy, &stamp, &expected) {
            Kept::Loaded(component) => return Ok((self.linked(&component)?, Readied::FromCache)),
            Kept::Changed => Readied::CopyRefused,
            Kept::Absent => Readied::Compiled,
        };
        let machine_code = self.engine.precompile_component(wasm).map_err(HostError::Compile)?;
        let component = match keep(copy, &stamp, &expected, &machine_code) {
            Ok(()) => {
                drop(machine_code);
                // SAFETY: this engine compiled the file a moment ago, and it was
                // renamed into place whole, in a folder no module holds.
                unsafe { Component::deserialize_file(&self.engine, copy) }
            }
            Err(error) => {
                tracing::warn!(%error, "the compiled component was not kept");
                // SAFETY: `machine_code` was produced by this engine a moment ago.
                unsafe { Component::deserialize(&self.engine, &machine_code) }
            }
        }
        .map_err(HostError::Compile)?;
        Ok((self.linked(&component)?, readied))
    }

    fn kept(&self, copy: &Path, stamp: &Path, expected: &str) -> Kept {
        let recorded = std::fs::read_to_string(stamp)
            .ok()
            .and_then(|found| found.strip_prefix(&format!("{expected}-")).map(str::to_string));
        let (Some(recorded), Ok(actual)) = (recorded, file_sha256_hex(copy)) else {
            return Kept::Absent;
        };
        if actual != recorded {
            tracing::warn!(copy = %copy.display(), "a compiled copy is not the one recorded beside it");
            return Kept::Changed;
        }
        // SAFETY: this host wrote this file under this stamp, which names the
        // component, this engine's compatibility and the file's own sha256, in a
        // folder no module holds, and it only ever replaces the file by a rename.
        match unsafe { Component::deserialize_file(&self.engine, copy) } {
            Ok(component) => Kept::Loaded(component),
            Err(_) => Kept::Absent,
        }
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

/// How a component came to be ready: compiled now, read from an earlier compile,
/// or compiled again because that compile's copy was not the one recorded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Readied {
    Compiled,
    FromCache,
    CopyRefused,
}

enum Kept {
    Loaded(Component),
    Changed,
    Absent,
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
