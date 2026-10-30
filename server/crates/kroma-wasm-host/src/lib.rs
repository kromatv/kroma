//! Runs a module as a WebAssembly component inside the core: the spike for
//! RFC 480's "same isolation on every platform". A component reaches nothing
//! but what [`WasmHost`] links into it: WASI with an empty context, a network
//! import every call of which goes through a [`NetPolicy`], and the settings
//! its [`Grant`] declares.

mod bindings;
mod error;
mod host;
mod instance;
mod limits;
mod policy;
mod settings;
mod state;

pub use bindings::kroma::module::types::{Request, Response};
pub use error::HostError;
pub use host::{ModuleComponent, WasmHost};
pub use instance::{Grant, ModuleInstance};
pub use limits::Limits;
pub use policy::{FetchCall, FetchRecord, NetPolicy, Outcome, Verdict};
pub use settings::Settings;
