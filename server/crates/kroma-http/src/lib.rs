//! KROMA's two HTTP transports, split by who is on the other end.
//!
//! [`Fetch`] reaches the outside world -- Torznab indexers, Transmission and
//! qBittorrent RPC, VPN checks -- over the system `curl` binary. Deliberately
//! not streaming: every payload here fits in memory. Response headers are
//! captured via `dump-header` because some protocols carry state there
//! (Transmission's `X-Transmission-Session-Id` rides a 409 response), which is
//! also why requests never enable `fail`: callers read [`Response::status`]
//! instead of losing the body on HTTP errors. Options reach curl through a
//! config file on its stdin, never through argv. Every call passes through
//! the process's [`egress`] gate and sink, when they are installed.
//!
//! [`Loopback`] reaches a process KROMA started itself -- the core from a
//! module, a module from the core. It holds no transport of its own: a
//! [`Transport`] is chosen per URL.

pub mod address;
mod builder;
mod config;
mod curl;
pub mod egress;
mod fetch;
pub mod loopback;
mod multipart;
mod pin;
mod response;

pub use curl::curl_available;
pub use fetch::Fetch;
pub use loopback::{Loopback, Method, Request, Transport, MAX_BODY_BYTES};
pub use multipart::FormPart;
pub use response::Response;
