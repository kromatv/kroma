//! Runs a module as a WebAssembly component that reaches nothing but what
//! [`WasmHost`] links into it: a WASI context holding only its [`Grant`]'s
//! folders and environment, a [`NetPolicy`] that decides every fetch, and raw
//! sockets only where the grant holds a [`SocketGrant`], each use ruled by its
//! [`Sockets`].

mod bindings;
mod capabilities;
mod command;
mod error;
mod host;
mod instance;
mod interface;
mod limits;
mod log;
mod media;
mod policy;
mod settings;
mod sockets;
mod state;

pub use bindings::kroma::module::net::FetchRequest;
pub use bindings::kroma::module::types::{Header, Request, Response};
pub use capabilities::{
    AudioDecode, Command, Databases, Files, Lan, Media, Output, Preopen, Processes, Reply, SampleFormat, Service,
    SocketCall, SocketGrant, SocketProto, SocketUse, Sockets, SqlConnection, SqlFailure, SqlOutcome, SqlValue,
};
pub use command::CommandComponent;
pub use error::HostError;
pub use host::{ModuleComponent, Readied, WasmHost};
pub use instance::{Grant, ModuleInstance};
pub use interface::imported_interfaces;
pub use limits::Limits;
pub use log::LogSink;
pub use policy::{FetchCall, FetchRecord, NetPolicy, Outcome, Verdict};
pub use settings::Settings;
