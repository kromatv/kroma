//! Managed Cloudflare Tunnel connector.
//!
//! Optional and off by default. When the admin enables it and stores a tunnel
//! token, the server supervises a `cloudflared tunnel run` child (the token
//! reaches it through `TUNNEL_TOKEN`, never argv, which any local user reads
//! from `ps`) so a box with no existing tunnel gets a public HTTPS endpoint (e.g.
//! `https://kroma.example.com`) with no port-forwarding. Installs that already run
//! their own `cloudflared` leave this off and just set the public URL.
//!
//! Control model: a single **reconcile** loop continuously makes the running
//! connector match the persisted `remoteAccess` flag: it launches the child when
//! enabled (with a token) and kills it when disabled. Handlers only flip the
//! setting; they never block. The `cloudflared` binary is provided by the server
//! and downloaded on demand (see [`provision`]) inside the background launch, so
//! enabling never stalls the request on a multi-MB download.
//!
//! The connector must never outlive the module. Stopping this module (the admin
//! toggle, an uninstall, a server shutdown) SIGTERMs the sidecar, which runs
//! [`RemoteModule::on_disable`] → [`RemoteAccess::shutdown`]: the reconcile loop
//! is latched off and the child is killed before the process exits. A generation
//! that missed that window (SIGKILL, a crash) leaves an untracked `cloudflared`
//! still serving the tunnel, so the next start sweeps for one before reconciling.

#![allow(clippy::result_large_err)]

mod access;
mod module;
mod process;
mod provision;
mod routes;
mod supervise;
#[cfg(test)]
mod test_support;

pub use access::{RemoteAccess, RemoteStatus};
pub use module::{server_module, RemoteModule, MODULE_ID};
pub use routes::routes;

use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();
