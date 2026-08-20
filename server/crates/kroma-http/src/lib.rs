//! HTTP transport over the system `curl` binary, shared by the acquisition
//! stack (Torznab indexers, Transmission/qBittorrent RPC, VPN checks).
//!
//! Deliberately not streaming: every payload here fits in memory. Response
//! headers are captured via `dump-header` because some protocols carry state
//! there (Transmission's `X-Transmission-Session-Id` rides a 409 response),
//! which is also why requests never enable `fail`: callers read
//! [`Response::status`] instead of losing the body on HTTP errors. Options
//! reach curl through a config file on its stdin, never through argv.

mod config;
mod curl;
mod fetch;
mod response;

pub use fetch::Fetch;
pub use response::Response;
