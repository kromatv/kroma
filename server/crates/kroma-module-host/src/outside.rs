//! What a module asks of the machine beyond its routes: programs, the local
//! network, the core's media tools, and what WASI has no call for on files. A
//! component's runtime connects this to its host, which rules each call. Anywhere
//! else, in a test, it is the machine itself.

use std::sync::OnceLock;
use std::time::Duration;

use kroma_primitives::pcm::Pcm;

/// A program to start.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub cwd: Option<String>,
}

/// An audio track to decode, and where its PCM goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeSpec {
    pub source: String,
    pub track: u32,
    pub pcm: Pcm,
    pub destination: String,
}

/// A service to publish on the local network.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LanService {
    /// The DNS-SD type, such as `_kroma._tcp.local.`.
    pub kind: String,
    pub name: String,
    /// The `.local.` name it answers on.
    pub host: String,
    pub port: u16,
    pub properties: Vec<(String, String)>,
}

/// One answer to an SSDP search.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LanReply {
    /// The address the answer came from, not one it names.
    pub source: String,
    pub headers: Vec<(String, String)>,
}

/// The way out a component's runtime connects at start.
pub trait Outside: Send + Sync {
    fn ensure_program(&self, program: &str) -> Result<(), String>;
    fn spawn_program(&self, command: CommandSpec) -> Result<u64, String>;
    fn wait_program(&self, child: u64, timeout: Duration) -> Result<Option<i32>, String>;
    fn read_program(&self, child: u64, stderr: bool, max_bytes: u32) -> Result<Vec<u8>, String>;
    fn kill_program(&self, child: u64, force: bool) -> Result<(), String>;
    fn announce(&self, service: LanService) -> Result<u64, String>;
    fn withdraw(&self, announcement: u64);
    fn search(&self, target: &str, wait: Duration) -> Result<Vec<LanReply>, String>;
    fn addresses(&self) -> Vec<String>;
    fn canonical(&self, path: &str) -> Option<String>;
    fn copy(&self, source: &str, destination: &str) -> Result<u64, String>;
    fn decode_audio(&self, spec: DecodeSpec) -> Result<u64, String>;
}

static OUTSIDE: OnceLock<&'static dyn Outside> = OnceLock::new();

/// Connect this module to what stands outside it. The first one stays.
pub fn connect(outside: &'static dyn Outside) {
    let _ = OUTSIDE.set(outside);
}

#[cfg(target_family = "wasm")]
pub(crate) fn outside() -> Result<&'static dyn Outside, String> {
    OUTSIDE
        .get()
        .copied()
        .ok_or_else(|| "this component is not connected to its host yet".to_string())
}

#[cfg(not(target_family = "wasm"))]
pub(crate) fn outside() -> Result<&'static dyn Outside, String> {
    Ok(OUTSIDE.get().copied().unwrap_or(&crate::outside_native::THE_MACHINE))
}
