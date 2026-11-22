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

/// The transport a raw socket speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SocketProto {
    Tcp,
    Udp,
}

/// What a component does with a raw socket at one remote address: open a
/// connection to it, send it a datagram, or take a datagram it sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SocketUse {
    Connect,
    Send,
    Receive,
}

/// One use of a raw socket, with the last names this instance resolved to the
/// address through the host's own lookup, eight at most.
#[derive(Debug, Clone, Copy)]
pub struct SocketCall<'a> {
    pub proto: SocketProto,
    pub using: SocketUse,
    pub address: std::net::SocketAddr,
    pub names: &'a [String],
    /// Which resolution `names` came from: it changes whenever they do, and is
    /// never given twice in a process, so a ruling kept under it holds only for
    /// these names.
    pub generation: u64,
}

/// What a component may do with raw sockets, ruled on its behalf. A refusal
/// reaches the component as `access-denied`.
pub trait Sockets: Send + Sync {
    fn allows(&self, call: &SocketCall<'_>) -> bool;

    /// The addresses `name` resolves to, or `None` when this module may not
    /// look it up.
    fn resolve(&self, name: &str) -> Option<Vec<std::net::IpAddr>>;

    /// A datagram of `bytes` went to or came from `call.address`.
    fn carried(&self, _call: &SocketCall<'_>, _bytes: u64) {}
}

/// The raw sockets an instance may open: the transports its manifest declares,
/// every use of one ruled by `rules`.
#[derive(Clone)]
pub struct SocketGrant {
    pub tcp: bool,
    pub udp: bool,
    pub rules: std::sync::Arc<dyn Sockets>,
}
