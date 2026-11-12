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
//! [`Transport`] is chosen per URL, loopback TCP for `http://127.0.0.1:<port>`
//! and a Unix socket for a URL built by [`loopback::unix_url`].

pub mod address;
mod builder;
#[cfg_attr(target_family = "wasm", allow(dead_code))]
mod config;
#[cfg(not(target_family = "wasm"))]
mod curl;
pub mod egress;
mod fetch;
pub mod loopback;
mod multipart;
#[cfg(not(target_family = "wasm"))]
mod pin;
mod response;

#[cfg(not(target_family = "wasm"))]
pub use curl::curl_available;
/// A component has no curl of its own: its host makes the call.
#[cfg(target_family = "wasm")]
pub fn curl_available() -> bool {
    true
}
#[cfg(target_family = "wasm")]
pub use fetch::guest::{set_guest_fetcher, GuestCall, GuestDownloader, GuestFetcher};
pub use fetch::Fetch;
pub use loopback::{Loopback, Method, Request, Transport, MAX_BODY_BYTES};
pub use multipart::FormPart;
pub use response::Response;
