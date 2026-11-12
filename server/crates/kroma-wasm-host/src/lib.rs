//! Runs a module as a WebAssembly component that reaches nothing but what
//! [`WasmHost`] links into it: an empty WASI context, a [`NetPolicy`] that
//! decides every fetch, and the settings its [`Grant`] declares.

mod bindings;
mod capabilities;
mod command;
mod error;
mod host;
mod instance;
mod limits;
mod log;
mod media;
mod policy;
mod settings;
mod state;

pub use bindings::kroma::module::net::FetchRequest;
pub use bindings::kroma::module::types::{Header, Request, Response};
pub use capabilities::{
    AudioDecode, Command, Databases, Files, Lan, Media, Output, Preopen, Processes, Reply, SampleFormat, Service,
    SqlConnection, SqlFailure, SqlOutcome, SqlValue,
};
pub use command::CommandComponent;
pub use error::HostError;
pub use host::{ModuleComponent, Readied, WasmHost};
pub use instance::{Grant, ModuleInstance};
pub use limits::Limits;
pub use log::LogSink;
pub use policy::{FetchCall, FetchRecord, NetPolicy, Outcome, Verdict};
pub use settings::Settings;
