use std::time::Duration;

use crate::bindings::kroma::module::{lan, media, process, sql};

pub use lan::{Reply, Service};
pub use media::{AudioDecode, SampleFormat};
pub use process::{Command, Output};
pub use sql::{Failure as SqlFailure, Outcome as SqlOutcome, Value as SqlValue};

/// One folder the module can reach, at the same path it has on the host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preopen {
    pub host: std::path::PathBuf,
    pub guest: String,
    pub writable: bool,
}

/// One connection a module asked for. It closes when dropped, so an instance
/// that stops takes its open transactions with it.
pub trait SqlConnection: Send {
    fn run(&mut self, statement: &str, params: &[SqlValue]) -> Result<SqlOutcome, SqlFailure>;
    fn batch(&mut self, statements: &str) -> Result<(), SqlFailure>;
    fn snapshot(&mut self, target: &str) -> Result<(), SqlFailure>;
}

/// The databases a module holds, decided on its behalf.
pub trait Databases: Send + Sync {
    fn open(&self, path: &str) -> Result<Box<dyn SqlConnection>, SqlFailure>;
}

/// The programs a module may start. Children belong to the module, not to one
/// instance, so a fresh instance can find what the last one started.
pub trait Processes: Send + Sync {
    fn ensure(&self, program: &str) -> Result<(), String>;
    fn spawn(&self, command: Command) -> Result<u64, String>;
    fn wait(&self, child: u64, timeout: Duration) -> Result<Option<i32>, String>;
    fn read(&self, child: u64, stream: Output, max_bytes: u32) -> Result<Vec<u8>, String>;
    fn kill(&self, child: u64, force: bool) -> Result<(), String>;
}

/// What a module may ask of its folders that WASI has no call for. The answer
/// covers only the folders it holds.
pub trait Files: Send + Sync {
    fn canonical(&self, path: &str) -> Option<String>;
    fn copy(&self, source: &str, destination: &str) -> Result<u64, String>;
}

/// What a module may ask of the core's media tools, on the files it holds.
pub trait Media: Send + Sync {
    fn decode_audio(&self, request: AudioDecode) -> Result<u64, String>;
}

/// What a module may ask of the local network without holding a socket.
pub trait Lan: Send + Sync {
    fn announce(&self, service: Service) -> Result<u64, String>;
    fn withdraw(&self, announcement: u64);
    fn search(&self, target: &str, wait: Duration) -> Result<Vec<Reply>, String>;
    fn addresses(&self) -> Vec<String>;
}
